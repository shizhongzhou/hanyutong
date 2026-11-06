import contextlib
import importlib.util
import io
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import warnings

SCRIPT = Path(__file__).resolve().parents[1] / 'infra/yandex/deploy-translation.py'
SPEC = importlib.util.spec_from_file_location('ai_deploy', SCRIPT)
deploy = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(deploy)


class AIDeployTest(unittest.TestCase):
    def previous(self):
        return {'LIBRARY_SESSION_SECRET': 'reader-secret-' * 4, 'CUSTOM_VALUE': 'keep-this',
                'TRANSLATION_IDENTITY_SALT': 'old-translation-salt-' * 3, 'AI_IDENTITY_SALT': 'old-ai-salt-' * 4}

    def test_credentials_are_bounded_and_cannot_inject_cli_environment_fields(self):
        for key in ('sk-test-key', 'sk-' + 'a' * 4093):
            self.assertTrue(deploy.valid_api_key(key))
            self.assertTrue(deploy.valid_api_key(key, qwen=True))
        for key in (None, '', 'not-an-api-key', 'sk-', 'sk-' + 'a' * 4094, 'sk-a,AI_CHAT_ENABLED=true',
                    'sk-\rsecret', 'sk-\nsecret', 'sk-\tsecret', 'sk- secret', 'sk-\x00secret', 'sk-\x7fsecret', 'sk-密钥'):
            self.assertFalse(deploy.valid_api_key(key))
        self.assertFalse(deploy.valid_api_key('sk-sp-token-plan-key', qwen=True))

    def test_qwen_api_host_is_allowlisted_and_normalized_without_accepting_urls(self):
        hosts = ('dashscope.aliyuncs.com', 'dashscope-intl.aliyuncs.com',
                 'workspace-123.cn-beijing.maas.aliyuncs.com', 'workspace-123.ap-southeast-1.maas.aliyuncs.com')
        for host in hosts:
            self.assertEqual(deploy.normalize_qwen_api_host(host), 'https://' + host)
            self.assertEqual(deploy.normalize_qwen_api_host('https://' + host), 'https://' + host)
        for host in (None, '', 'http://dashscope.aliyuncs.com', 'https://dashscope.aliyuncs.com/', 'dashscope.aliyuncs.com:443',
                     'https://attacker@dashscope.aliyuncs.com', 'dashscope.aliyuncs.com.attacker.example',
                     'Dashscope.aliyuncs.com', 'trial.cn-beijing.maas.aliyuncs.com', 'token-plan.cn-beijing.maas.aliyuncs.com',
                     'workspace.us-east-1.maas.aliyuncs.com', 'workspace.ap-southeast-2.maas.aliyuncs.com',
                     'https://workspace.cn-beijing.maas.aliyuncs.com?key=secret', ' other.cn-beijing.maas.aliyuncs.com'):
            self.assertIsNone(deploy.normalize_qwen_api_host(host))

    def test_no_flags_do_not_prompt_or_replace_credentials_and_reader_secrets(self):
        with patch.object(deploy.getpass, 'getpass') as key_prompt, patch('builtins.input') as host_prompt:
            self.assertEqual(deploy.collect_credentials(deploy.parse_args([])), {})
        key_prompt.assert_not_called()
        host_prompt.assert_not_called()
        previous = {**self.previous(), 'DEEPSEEK_API_KEY': 'sk-existing-deepseek', 'DEEPSEEK_MODEL': 'deepseek-v4-flash',
                    'QWEN_API_KEY': 'sk-existing-qwen', 'QWEN_API_HOST': 'dashscope-intl.aliyuncs.com'}
        result = deploy.build_environment(previous, {})
        for name, value in previous.items():
            self.assertEqual(result[name], value)
        self.assertEqual(result['AI_CHAT_ENABLED'], 'true')
        self.assertEqual(result['AI_ASSESSMENT_ENABLED'], 'true')
        self.assertEqual(result['AI_FEEDBACK_ENABLED'], 'true')
        self.assertEqual(result['QWEN_TTS_ENABLED'], 'true')
        self.assertEqual(result['QWEN_ASR_ENABLED'], 'true')
        self.assertNotIn('AI_CHAT_ENABLED', previous)

    def test_missing_or_invalid_keys_disable_paid_external_providers_without_erasing_existing_values(self):
        for extra in ({}, {'DEEPSEEK_API_KEY': 'invalid'}, {'QWEN_API_KEY': 'sk-normal'},
                      {'QWEN_API_KEY': 'sk-sp-token-plan', 'QWEN_API_HOST': 'dashscope-intl.aliyuncs.com'},
                      {'QWEN_API_KEY': 'sk-normal', 'QWEN_API_HOST': 'https://attacker.example'}):
            result = deploy.build_environment({**self.previous(), **extra}, {})
            for name, value in extra.items():
                self.assertEqual(result[name], value)
            self.assertEqual(result['AI_CHAT_ENABLED'], 'false')
            self.assertEqual(result['AI_ASSESSMENT_ENABLED'], 'false')
            self.assertEqual(result['AI_FEEDBACK_ENABLED'], 'true')
            self.assertEqual(result['QWEN_TTS_ENABLED'], 'false')
            self.assertEqual(result['QWEN_ASR_ENABLED'], 'false')
        result = deploy.build_environment({**self.previous(), 'AI_CHAT_ENABLED': 'true', 'QWEN_TTS_ENABLED': 'true'}, {})
        self.assertEqual(result['AI_CHAT_ENABLED'], 'false')
        self.assertEqual(result['QWEN_TTS_ENABLED'], 'false')

    def test_configure_flags_only_replace_requested_credentials_and_never_print_values(self):
        keys = ['sk-new-deepseek-test', 'sk-new-qwen-test']
        captured = io.StringIO()
        with contextlib.redirect_stdout(captured), contextlib.redirect_stderr(captured), \
                patch.object(deploy.getpass, 'getpass', side_effect=keys) as prompt, \
                patch('builtins.input', return_value='workspace.cn-beijing.maas.aliyuncs.com'):
            credentials = deploy.collect_credentials(deploy.parse_args(['--configure-deepseek', '--configure-qwen']))
        self.assertEqual(credentials, {'DEEPSEEK_API_KEY': keys[0], 'QWEN_API_KEY': keys[1], 'QWEN_API_HOST': 'https://workspace.cn-beijing.maas.aliyuncs.com'})
        self.assertEqual(prompt.call_count, 2)
        for key in keys:
            self.assertNotIn(key, captured.getvalue())
            self.assertNotIn(key, str(prompt.call_args_list))
        previous = {**self.previous(), 'QWEN_API_KEY': 'sk-old-qwen', 'QWEN_API_HOST': 'dashscope.aliyuncs.com'}
        result = deploy.build_environment(previous, {'DEEPSEEK_API_KEY': keys[0]})
        self.assertEqual(result['QWEN_API_KEY'], previous['QWEN_API_KEY'])
        self.assertEqual(result['QWEN_API_HOST'], previous['QWEN_API_HOST'])

    def test_all_credentials_are_prompted_and_validated_before_even_reading_cloud_configuration(self):
        timeline = []
        def prompt_key(_prompt):
            timeline.append('credential')
            return 'sk-normal-test-key'
        def prompt_host(_prompt):
            timeline.append('host')
            return 'dashscope-intl.aliyuncs.com'
        def cloud(*_args, **_kwargs):
            timeline.append('cloud')
            raise RuntimeError('stop-test-after-first-cloud-read')
        with patch.object(deploy.getpass, 'getpass', side_effect=prompt_key), patch('builtins.input', side_effect=prompt_host), patch.object(deploy, 'yc', side_effect=cloud):
            with self.assertRaisesRegex(RuntimeError, 'stop-test'):
                deploy.main(['--configure-deepseek', '--configure-qwen'])
        self.assertEqual(timeline, ['credential', 'credential', 'host', 'cloud'])

    def test_invalid_entered_credentials_or_host_do_not_contact_cloud(self):
        for flags, key, host in [(['--configure-deepseek'], 'bad,key', ''), (['--configure-qwen'], 'sk-sp-plan', ''),
                                 (['--configure-qwen'], 'sk-normal-key', 'https://attacker.example')]:
            with patch.object(deploy.getpass, 'getpass', return_value=key), patch('builtins.input', return_value=host), patch.object(deploy, 'yc') as cloud:
                with self.assertRaises(RuntimeError) as error:
                    deploy.main(flags)
                cloud.assert_not_called()
                self.assertNotIn(key, str(error.exception))

    def test_getpass_echo_fallback_is_blocked_before_cloud_changes(self):
        def unsafe_prompt(_prompt):
            warnings.warn('Password input may be echoed.', deploy.getpass.GetPassWarning)
            return 'sk-must-not-be-entered'
        with patch.object(deploy.getpass, 'getpass', side_effect=unsafe_prompt), patch.object(deploy, 'yc') as cloud:
            with self.assertRaises(deploy.getpass.GetPassWarning):
                deploy.main(['--configure-deepseek'])
            cloud.assert_not_called()

    def test_budget_setup_preserves_salts_and_generates_only_missing_ones(self):
        previous = self.previous()
        with patch.object(deploy.secrets, 'token_hex', return_value='x' * 64) as generate:
            result = deploy.build_environment(previous, {})
            generate.assert_not_called()
        self.assertEqual(result['AI_BUDGET_BUCKET'], deploy.BUCKET)
        self.assertEqual(result['TRANSLATION_BUDGET_BUCKET'], deploy.BUCKET)
        self.assertEqual(result['YANDEX_FOLDER_ID'], deploy.FOLDER)
        self.assertEqual(result['AI_VISION_ENABLED'], 'true')
        self.assertEqual(result['TRANSLATION_ENABLED'], 'true')
        self.assertEqual(result['OCR_ENABLED'], 'true')
        self.assertEqual(result['DEEPSEEK_MODEL'], 'deepseek-flash')
        self.assertEqual(result['DEEPSEEK_ASSESSMENT_MODEL'], 'deepseek-v4-pro')
        self.assertEqual(result['AI_FEEDBACK_ENABLED'], 'true')
        previous.pop('AI_IDENTITY_SALT')
        with patch.object(deploy.secrets, 'token_hex', return_value='x' * 64) as generate:
            result = deploy.build_environment(previous, {})
            generate.assert_called_once_with(32)
        self.assertEqual(result['AI_IDENTITY_SALT'], 'x' * 64)
        self.assertEqual(result['TRANSLATION_IDENTITY_SALT'], previous['TRANSLATION_IDENTITY_SALT'])

    def test_invalid_existing_configuration_stops_before_any_cloud_mutation(self):
        for extra in ({'LIBRARY_SESSION_SECRET': 'short'}, {'AI_IDENTITY_SALT': 'short'}, {'CUSTOM_VALUE': 'comma,value'},
                      {'CUSTOM_VALUE': 'new\nline'}, {'CUSTOM_VALUE': 'carriage\rreturn'}, {'bad,key': 'value'}):
            previous = {**self.previous(), **extra}
            with patch.object(deploy, 'yc', side_effect=[[{'id': 'old-version'}], {'environment': previous}]) as cloud, patch.object(deploy, 'iam_token') as token:
                with self.assertRaises(RuntimeError):
                    deploy.main([])
                self.assertEqual(cloud.call_count, 2)
                token.assert_not_called()

    def test_build_environment_rejects_unvalidated_or_partial_credential_overrides(self):
        for credentials in ({'OTHER_SECRET': 'value'}, {'DEEPSEEK_API_KEY': 'invalid'}, {'QWEN_API_KEY': 'sk-normal'},
                            {'QWEN_API_HOST': 'dashscope.aliyuncs.com'}, {'QWEN_API_KEY': 'sk-sp-private', 'QWEN_API_HOST': 'dashscope.aliyuncs.com'}):
            with self.assertRaises(RuntimeError):
                deploy.build_environment(self.previous(), credentials)

    def test_unknown_pro_model_is_preserved_but_cannot_enable_assessment(self):
        previous = {**self.previous(), 'DEEPSEEK_API_KEY': 'sk-existing-deepseek', 'DEEPSEEK_ASSESSMENT_MODEL': 'deepseek-pro'}
        result = deploy.build_environment(previous, {})
        self.assertEqual(result['DEEPSEEK_ASSESSMENT_MODEL'], 'deepseek-pro')
        self.assertEqual(result['AI_ASSESSMENT_ENABLED'], 'false')
        self.assertEqual(result['AI_CHAT_ENABLED'], 'true')
        self.assertEqual(result['AI_FEEDBACK_ENABLED'], 'true')

    def test_existing_private_usage_bucket_capacity_is_updated_without_resetting_other_settings(self):
        old = {'folder_id': deploy.FOLDER, 'anonymous_access_flags': {'read': False, 'list': False},
               'max_size': '1048576', 'acl': {'grants': [{'permission': 'READ'}]}, 'lifecycle_rules': [{'id': 'keep-existing-rule'}]}
        updated = {**old, 'max_size': str(128 * 1024 * 1024)}
        with patch.object(deploy, 'yc', side_effect=[old, updated, updated]) as cloud:
            self.assertEqual(deploy.ensure_usage_bucket(), updated)
        self.assertEqual(cloud.call_args_list[1].args, ('storage', 'bucket', 'update', '--name', deploy.BUCKET, '--max-size', '134217728'))
        self.assertEqual(cloud.call_args_list[2].args, ('storage', 'bucket', 'get', '--name', deploy.BUCKET))
        self.assertEqual(old['max_size'], '1048576')
        self.assertEqual(updated['acl'], old['acl'])
        self.assertEqual(updated['lifecycle_rules'], old['lifecycle_rules'])
        with patch.object(deploy, 'yc', return_value=updated) as cloud:
            deploy.ensure_usage_bucket()
            self.assertEqual(cloud.call_count, 1)

    def test_new_usage_bucket_starts_with_the_same_128_mib_limit(self):
        created = {'folder_id': deploy.FOLDER, 'anonymous_access_flags': {}, 'max_size': str(deploy.USAGE_BUCKET_MAX_BYTES)}
        with patch.object(deploy, 'yc', side_effect=[None, created]) as cloud:
            self.assertEqual(deploy.ensure_usage_bucket(), created)
        args = cloud.call_args_list[1].args
        self.assertEqual(args[:3], ('storage', 'bucket', 'create'))
        self.assertEqual(args[args.index('--max-size') + 1], '134217728')
        self.assertEqual(cloud.call_count, 2)

    def test_capacity_update_requires_private_expected_bucket_and_confirmed_readback(self):
        for bucket in [{'folder_id': 'another-folder', 'max_size': '1048576'},
                       {'folder_id': deploy.FOLDER, 'anonymous_access_flags': {'read': True}, 'max_size': '1048576'}]:
            with patch.object(deploy, 'yc', return_value=bucket) as cloud:
                with self.assertRaises(RuntimeError):
                    deploy.ensure_usage_bucket()
                self.assertEqual(cloud.call_count, 1)
        old = {'folder_id': deploy.FOLDER, 'anonymous_access_flags': {}, 'max_size': '1048576'}
        with patch.object(deploy, 'yc', side_effect=[old, {}, old]):
            with self.assertRaisesRegex(RuntimeError, 'not confirmed'):
                deploy.ensure_usage_bucket()

    def test_complete_mock_deployment_grants_model_role_and_preserves_cloud_limits_without_logging_keys(self):
        previous = {**self.previous(), 'DEEPSEEK_API_KEY': 'sk-existing-deepseek-test',
                    'QWEN_API_KEY': 'sk-existing-qwen-test', 'QWEN_API_HOST': 'dashscope-intl.aliyuncs.com'}
        calls = []
        usage_bucket = {'folder_id': deploy.FOLDER, 'anonymous_access_flags': {}, 'max_size': '1048576'}
        def cloud(*args, **_kwargs):
            calls.append(args)
            if args[:4] == ('serverless', 'function', 'version', 'list'):
                return [{'id': 'old-version'}]
            if args[:4] == ('serverless', 'function', 'version', 'get'):
                return {'id': 'old-version', 'environment': previous}
            if args[:3] == ('storage', 'bucket', 'get'):
                return dict(usage_bucket)
            if args[:3] == ('storage', 'bucket', 'update'):
                usage_bucket['max_size'] = args[args.index('--max-size') + 1]
                return dict(usage_bucket)
            if args[:4] == ('serverless', 'function', 'version', 'create'):
                return {'id': 'new-version'}
            return {}
        responses = [404, 200, 412, 412, 200, 200]
        @contextlib.contextmanager
        def storage(_token, url, *_args, **_kwargs):
            status = responses.pop(0)
            if status != 200:
                raise deploy.urllib.error.HTTPError(url, status, 'test-status', {}, None)
            yield SimpleNamespace(headers={'ETag': '"test-etag"'}, read=lambda _size: b'verified')
        captured = io.StringIO()
        with contextlib.redirect_stdout(captured), contextlib.redirect_stderr(captured), \
                patch.object(deploy, 'yc', side_effect=cloud), patch.object(deploy, 'request', side_effect=storage), \
                patch.object(deploy, 'iam_token', return_value='test-iam'), \
                patch.object(deploy, 'remove_owned_usage_policy'), patch.object(deploy, 'grant_usage_bucket_access'):
            deploy.main([])
        roles = [args[args.index('--role') + 1] for args in calls if '--role' in args]
        self.assertEqual(roles, ['ai.translate.user', 'ai.vision.user', 'ai.languageModels.user'])
        self.assertEqual(usage_bucket['max_size'], '134217728')
        create = next(args for args in calls if args[:4] == ('serverless', 'function', 'version', 'create'))
        environment = dict(item.split('=', 1) for item in create[create.index('--environment') + 1].split(','))
        for name, value in previous.items():
            self.assertEqual(environment[name], value)
        self.assertEqual(environment['AI_CHAT_ENABLED'], 'true')
        self.assertEqual(environment['AI_ASSESSMENT_ENABLED'], 'true')
        self.assertEqual(environment['DEEPSEEK_ASSESSMENT_MODEL'], 'deepseek-v4-pro')
        self.assertEqual(environment['AI_FEEDBACK_ENABLED'], 'true')
        self.assertEqual(environment['AI_VISION_ENABLED'], 'true')
        self.assertEqual(environment['QWEN_TTS_ENABLED'], 'true')
        self.assertEqual(environment['QWEN_ASR_ENABLED'], 'true')
        for option, expected in [('--memory', '128m'), ('--execution-timeout', '90s'), ('--concurrency', '4'), ('--runtime', 'nodejs22')]:
            self.assertEqual(create[create.index(option) + 1], expected)
        scaling = next(args for args in calls if args[:3] == ('serverless', 'function', 'set-scaling-policy'))
        self.assertEqual(scaling[scaling.index('--zone-instances-limit') + 1], '1')
        self.assertEqual(scaling[scaling.index('--provisioned-instances-count') + 1], '0')
        self.assertEqual(calls[-1][:3], ('serverless', 'api-gateway', 'update'))
        for name in ('DEEPSEEK_API_KEY', 'QWEN_API_KEY', 'LIBRARY_SESSION_SECRET'):
            self.assertNotIn(previous[name], captured.getvalue())
        self.assertIn('AI and translation function version: new-version', captured.getvalue())


if __name__ == '__main__':
    unittest.main()

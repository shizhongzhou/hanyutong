"""Deploy from authenticated Yandex Cloud Shell; never print credentials or user input."""
import argparse
import getpass
import json
from pathlib import Path
import re
import secrets
import subprocess
import urllib.error
import urllib.request
import warnings
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
FOLDER = 'b1gsi4nj9mgt8alatjf9'
FUNCTION = 'd4echa2sl4p7hg71dle1'
SERVICE_ACCOUNT = 'ajee4et21v76el2nki70'
GATEWAY = 'd5du0ehkavrgcuf0765l'
BUCKET = 'hanyutong-dev-usage-b1gsi4nj'
USAGE_BUCKET_MAX_BYTES = 128 * 1024 * 1024


def valid_api_key(value, *, qwen=False):
    # These values enter the CLI's comma-delimited environment option. Never
    # accept delimiters, whitespace, control characters, or a Token Plan key.
    return (isinstance(value, str) and value.startswith('sk-')
            and 4 <= len(value) <= 4096
            and all(33 <= ord(char) <= 126 and char != ',' for char in value)
            and not (qwen and value.startswith('sk-sp')))


def normalize_qwen_api_host(value):
    # Keep this allowlist in sync with ai-speech.js. Paths, ports, user-info,
    # Token Plan hosts and arbitrary Alibaba subdomains are not API Hosts.
    if not isinstance(value, str) or not value or len(value) > 180:
        return None
    host = value[8:] if value.startswith('https://') else value
    if host != host.lower():
        return None
    if (host in ('dashscope.aliyuncs.com', 'dashscope-intl.aliyuncs.com')
            or (re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:cn-beijing|ap-southeast-1)\.maas\.aliyuncs\.com', host)
                and not host.startswith(('trial.', 'token-plan.')))):
        return 'https://' + host
    return None


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description='Deploy AI and translation services while preserving the existing reader configuration.')
    parser.add_argument('--configure-deepseek', action='store_true', help='Securely prompt for a DeepSeek API key before cloud changes.')
    parser.add_argument('--configure-qwen', action='store_true', help='Securely prompt for a normal Qwen API key and its Beijing/Singapore API Host.')
    return parser.parse_args(argv)


def collect_credentials(args):
    credentials = {}
    # getpass otherwise falls back to echoing stdin on an unsuitable terminal.
    # Stop instead: keys must never be echoed or supplied as command arguments.
    with warnings.catch_warnings():
        warnings.simplefilter('error', getpass.GetPassWarning)
        if args.configure_deepseek:
            key = getpass.getpass('DeepSeek API key (hidden): ')
            if not valid_api_key(key):
                raise RuntimeError('Invalid DeepSeek credential; no cloud changes were made')
            credentials['DEEPSEEK_API_KEY'] = key
        if args.configure_qwen:
            key = getpass.getpass('Normal Qwen API key, not a Token Plan key (hidden): ')
            if not valid_api_key(key, qwen=True):
                raise RuntimeError('Invalid or Token Plan Qwen credential; no cloud changes were made')
            host = normalize_qwen_api_host(input('Qwen API Host from the same Beijing/Singapore workspace: '))
            if not host:
                raise RuntimeError('Unsupported Qwen API Host; no cloud changes were made')
            credentials.update(QWEN_API_KEY=key, QWEN_API_HOST=host)
    return credentials


def build_environment(previous, credentials):
    environment = dict(previous)
    if len(environment.get('LIBRARY_SESSION_SECRET', '')) < 32:
        raise RuntimeError('Existing reader configuration unavailable; deployment stopped')
    if set(credentials) - {'DEEPSEEK_API_KEY', 'QWEN_API_KEY', 'QWEN_API_HOST'}:
        raise RuntimeError('Unsupported credential configuration; deployment stopped')
    if 'DEEPSEEK_API_KEY' in credentials and not valid_api_key(credentials['DEEPSEEK_API_KEY']):
        raise RuntimeError('Invalid DeepSeek credential; deployment stopped')
    if ('QWEN_API_KEY' in credentials or 'QWEN_API_HOST' in credentials) and (
            not valid_api_key(credentials.get('QWEN_API_KEY'), qwen=True)
            or not normalize_qwen_api_host(credentials.get('QWEN_API_HOST'))):
        raise RuntimeError('Invalid Qwen credential configuration; deployment stopped')
    environment.update(credentials)
    environment.update(TRANSLATION_ENABLED='true', OCR_ENABLED='true', TRANSLATION_BUDGET_BUCKET=BUCKET,
                       YANDEX_FOLDER_ID=FOLDER, AI_VISION_ENABLED='true', AI_BUDGET_BUCKET=BUCKET)
    for name in ('TRANSLATION_IDENTITY_SALT', 'AI_IDENTITY_SALT'):
        if name not in environment:
            environment[name] = secrets.token_hex(32)
        if not isinstance(environment[name], str) or len(environment[name]) < 32:
            raise RuntimeError('Existing usage identity configuration is invalid; deployment stopped')
    environment.setdefault('DEEPSEEK_MODEL', 'deepseek-flash')
    environment.setdefault('DEEPSEEK_ASSESSMENT_MODEL', 'deepseek-v4-pro')
    environment['AI_CHAT_ENABLED'] = 'true' if valid_api_key(environment.get('DEEPSEEK_API_KEY')) else 'false'
    environment['AI_ASSESSMENT_ENABLED'] = 'true' if (
        valid_api_key(environment.get('DEEPSEEK_API_KEY'))
        and environment['DEEPSEEK_ASSESSMENT_MODEL'] == 'deepseek-v4-pro') else 'false'
    # The dedicated private bucket and its atomic writes are verified below
    # before this environment is installed on the function.
    environment['AI_FEEDBACK_ENABLED'] = 'true'
    qwen_ready = valid_api_key(environment.get('QWEN_API_KEY'), qwen=True) and bool(normalize_qwen_api_host(environment.get('QWEN_API_HOST')))
    environment['QWEN_TTS_ENABLED'] = environment['QWEN_ASR_ENABLED'] = 'true' if qwen_ready else 'false'
    if any(not isinstance(name, str) or not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', name) for name in environment):
        raise RuntimeError('Environment requires structured deployment; stopped safely')
    if any(',' in str(value) or any(ord(char) < 32 or ord(char) == 127 for char in str(value)) for value in environment.values()):
        raise RuntimeError('Environment requires structured deployment; stopped safely')
    return environment


def yc(*args, optional=False):
    result = subprocess.run(['yc', *args, '--format', 'json'], capture_output=True, text=True)
    if result.returncode:
        if optional and ('not found' in result.stderr.lower() or 'notfound' in result.stderr.lower()):
            return None
        # Arguments/output can contain environment secrets. Do not include them.
        raise RuntimeError('Cloud operation failed: ' + ' '.join(args[:3]))
    return json.loads(result.stdout) if result.stdout.strip() else {}


def request(token, url, method='GET', body=None, headers=None):
    return urllib.request.urlopen(urllib.request.Request(url, data=body, method=method,
        headers={'Authorization': 'Bearer ' + token, **(headers or {})}), timeout=30)


def iam_token(service_account=None):
    args = ['yc', 'iam', 'create-token']
    if service_account:
        args.extend(['--impersonate-service-account-id', service_account])
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode or not result.stdout.strip():
        raise RuntimeError('Cannot obtain the required short-lived IAM token')
    return result.stdout.strip()


def remove_owned_usage_policy(token, base):
    # The old SA-only policy also blocked the deploying user's metadata access.
    # Remove only our exact two rules, before looking up bucket metadata. The
    # private, dedicated usage bucket is adequately scoped by its own ACL.
    if base != 'https://storage.yandexcloud.net/' + BUCKET:
        raise RuntimeError('Refusing to change another bucket policy')
    try:
        with request(token, base + '?policy') as response:
            data = response.read(32769)
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return
        raise RuntimeError('Cannot inspect usage bucket policy for repair') from None
    if len(data) > 32768:
        raise RuntimeError('Usage bucket policy is unexpectedly large')
    try:
        policy = json.loads(data)
    except (ValueError, UnicodeDecodeError):
        raise RuntimeError('Cannot parse usage bucket policy for repair') from None
    expected = {
        'HanyutongUsageObjects': (
            {'s3:GetObject', 's3:PutObject'},
            {'arn:aws:s3:::' + BUCKET + '/app-private/translation-budget/*'}),
        'HanyutongUsageList': ({'s3:ListBucket'}, {'arn:aws:s3:::' + BUCKET})
    }

    def values(value):
        if isinstance(value, str):
            return {value}
        if isinstance(value, list) and all(isinstance(item, str) for item in value):
            return set(value)
        return None

    if (not isinstance(policy, dict) or set(policy) - {'Version', 'Statement'}
            or policy.get('Version', '2012-10-17') != '2012-10-17'
            or not isinstance(policy.get('Statement'), list)
            or len(policy['Statement']) != 2):
        raise RuntimeError('Usage bucket has an unexpected policy; left unchanged')
    seen = set()
    for rule in policy['Statement']:
        if (not isinstance(rule, dict)
                or set(rule) != {'Sid', 'Effect', 'Principal', 'Action', 'Resource'}):
            raise RuntimeError('Usage bucket has an unexpected policy; left unchanged')
        sid = rule['Sid']
        if not isinstance(sid, str) or sid not in expected or sid in seen:
            raise RuntimeError('Usage bucket has an unexpected policy; left unchanged')
        principal = rule['Principal']
        if (rule['Effect'] != 'Allow' or not isinstance(principal, dict)
                or set(principal) != {'CanonicalUser'}
                or values(principal['CanonicalUser']) != {SERVICE_ACCOUNT}
                or values(rule['Action']) != expected[sid][0]
                or values(rule['Resource']) != expected[sid][1]):
            raise RuntimeError('Usage bucket has an unexpected policy; left unchanged')
        seen.add(sid)
    with request(token, base + '?policy', 'DELETE'):
        pass
    try:
        with request(token, base + '?policy'):
            raise RuntimeError('Usage bucket policy removal was not confirmed')
    except urllib.error.HTTPError as error:
        if error.code != 404:
            raise RuntimeError('Usage bucket policy removal was not confirmed') from None
    print('Removed only the previous deployment-owned usage bucket policy', flush=True)


def grant_usage_bucket_access(token, base):
    # S3 ACL updates replace the full document. Keep the existing Owner and all
    # grants intact; this grant applies only to the dedicated usage bucket.
    with request(token, base + '?acl') as response:
        data = response.read(131073)
    if len(data) > 131072:
        raise RuntimeError('Usage bucket ACL is unexpectedly large')
    try:
        acl = ET.fromstring(data)
    except ET.ParseError:
        raise RuntimeError('Cannot inspect usage bucket ACL') from None
    namespace = acl.tag.partition('}')[0] + '}' if acl.tag.startswith('{') else ''
    tag = lambda name: namespace + name
    owner = acl.find(tag('Owner'))
    grants = acl.find(tag('AccessControlList'))
    if acl.tag != tag('AccessControlPolicy') or owner is None or grants is None:
        raise RuntimeError('Usage bucket ACL has no verifiable owner or grants')
    existing = set()
    for grant in grants.findall(tag('Grant')):
        grantee = grant.find(tag('Grantee'))
        if grantee is None:
            raise RuntimeError('Usage bucket ACL has an invalid grant')
        if grantee.findtext(tag('URI')) in (
                'http://acs.amazonaws.com/groups/global/AllUsers',
                'http://acs.amazonaws.com/groups/global/AuthenticatedUsers'):
            raise RuntimeError('Usage bucket ACL grants public access')
        if grantee.findtext(tag('ID')) == SERVICE_ACCOUNT:
            existing.add(grant.findtext(tag('Permission')))
    missing = set() if 'FULL_CONTROL' in existing else {'READ', 'WRITE'} - existing
    if not missing:
        return
    if len(grants.findall(tag('Grant'))) + len(missing) > 100:
        raise RuntimeError('Usage bucket ACL has too many grants')
    ET.register_namespace('xsi', 'http://www.w3.org/2001/XMLSchema-instance')
    if namespace:
        ET.register_namespace('', namespace[1:-1])
    for permission in sorted(missing):
        grant = ET.SubElement(grants, tag('Grant'))
        grantee = ET.SubElement(grant, tag('Grantee'), {
            '{http://www.w3.org/2001/XMLSchema-instance}type': 'CanonicalUser'})
        ET.SubElement(grantee, tag('ID')).text = SERVICE_ACCOUNT
        ET.SubElement(grant, tag('Permission')).text = permission
    with request(token, base + '?acl', 'PUT', ET.tostring(acl, encoding='utf-8'),
                 {'Content-Type': 'application/xml'}):
        pass


def ensure_usage_bucket():
    bucket = yc('storage', 'bucket', 'get', '--name', BUCKET, optional=True)
    if bucket is None:
        bucket = yc('storage', 'bucket', 'create', '--name', BUCKET, '--folder-id', FOLDER,
                    '--max-size', str(USAGE_BUCKET_MAX_BYTES), '--default-storage-class', 'STANDARD')

    def check_private(value):
        if (not isinstance(value, dict) or value.get('folder_id') != FOLDER
                or any(value.get('anonymous_access_flags', {}).values())):
            raise RuntimeError('Usage bucket is not private in the expected folder')

    check_private(bucket)
    if str(bucket.get('max_size')) != str(USAGE_BUCKET_MAX_BYTES):
        # Change only the capacity field. Never replace ACLs, policies,
        # lifecycle rules or stored feedback while increasing this ceiling.
        yc('storage', 'bucket', 'update', '--name', BUCKET, '--max-size', str(USAGE_BUCKET_MAX_BYTES))
        bucket = yc('storage', 'bucket', 'get', '--name', BUCKET)
        check_private(bucket)
    if str(bucket.get('max_size')) != str(USAGE_BUCKET_MAX_BYTES):
        raise RuntimeError('Usage bucket capacity update was not confirmed')
    return bucket


def main(argv=None):
    # Collect and validate every supplied credential before any cloud operation.
    credentials = collect_credentials(parse_args(argv))
    versions = yc('serverless', 'function', 'version', 'list', '--function-id', FUNCTION, '--limit', '1')
    previous = yc('serverless', 'function', 'version', 'get', '--id', versions[0]['id'])
    environment = build_environment(previous.get('environment', {}), credentials)
    print('Previous function version:', previous['id'], flush=True)

    token = iam_token()
    base = 'https://storage.yandexcloud.net/' + BUCKET
    remove_owned_usage_policy(token, base)
    ensure_usage_bucket()

    grant_usage_bucket_access(token, base)

    # Verify storage really enforces both preconditions before enabling paid calls.
    # Probe as the function's actual service account, not the deploying user.
    usage_token = iam_token(SERVICE_ACCOUNT)
    probe = base + '/app-private/translation-budget/cas-probe-' + secrets.token_hex(8) + '.txt'
    try:
        with request(usage_token, probe):
            raise RuntimeError('Usage probe unexpectedly exists')
    except urllib.error.HTTPError as error:
        if error.code != 404:
            raise RuntimeError('Service account cannot read missing usage objects') from None
    with request(usage_token, probe, 'PUT', b'first', {'If-None-Match': '*'}) as response:
        etag = response.headers.get('ETag')
    if not etag:
        raise RuntimeError('Usage storage did not provide an object ETag')
    for condition in ({'If-None-Match': '*'}, {'If-Match': '"00000000000000000000000000000000"'}):
        try:
            with request(usage_token, probe, 'PUT', b'must-not-write', condition):
                raise RuntimeError('Object storage ignored a budget precondition')
        except urllib.error.HTTPError as error:
            if error.code != 412:
                raise RuntimeError('Cannot verify budget preconditions') from None
    with request(usage_token, probe, 'PUT', b'verified', {'If-Match': etag}):
        pass
    with request(usage_token, probe) as response:
        if response.read(9) != b'verified':
            raise RuntimeError('Service account cannot verify its usage writes')
    print('Private usage storage and atomic reservations verified', flush=True)

    for role in ('ai.translate.user', 'ai.vision.user', 'ai.languageModels.user'):
        yc('resource-manager', 'folder', 'add-access-binding', '--id', FOLDER,
           '--role', role, '--subject', 'serviceAccount:' + SERVICE_ACCOUNT)
    deployed = yc('serverless', 'function', 'version', 'create', '--function-id', FUNCTION,
        '--runtime', 'nodejs22', '--entrypoint', 'index.handler', '--memory', '128m',
        '--execution-timeout', '210s', '--concurrency', '4', '--service-account-id', SERVICE_ACCOUNT,
        '--source-path', str(ROOT / 'function'),
        '--environment', ','.join(key + '=' + str(value) for key, value in environment.items()))
    print('AI and translation function version:', deployed['id'], flush=True)
    yc('serverless', 'function', 'set-scaling-policy', '--id', FUNCTION, '--tag', '$latest',
       '--zone-instances-limit', '1', '--zone-requests-limit', '4', '--provisioned-instances-count', '0')
    yc('serverless', 'api-gateway', 'update', '--id', GATEWAY,
       '--execution-timeout', '300s', '--spec', str(ROOT / 'gateway.yaml'))
    print('AI and translation routes ready; existing reader secret preserved', flush=True)


if __name__ == '__main__':
    try:
        main()
    except (getpass.GetPassWarning, EOFError):
        raise SystemExit('A secure interactive terminal is required; deployment stopped') from None

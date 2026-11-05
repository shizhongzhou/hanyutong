"""Deploy from authenticated Yandex Cloud Shell; never print credentials or user input."""
import json
from pathlib import Path
import secrets
import subprocess
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent
FOLDER = 'b1gsi4nj9mgt8alatjf9'
FUNCTION = 'd4echa2sl4p7hg71dle1'
SERVICE_ACCOUNT = 'ajee4et21v76el2nki70'
GATEWAY = 'd5du0ehkavrgcuf0765l'
BUCKET = 'hanyutong-dev-usage-b1gsi4nj'


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


def main():
    versions = yc('serverless', 'function', 'version', 'list', '--function-id', FUNCTION, '--limit', '1')
    previous = yc('serverless', 'function', 'version', 'get', '--id', versions[0]['id'])
    environment = dict(previous.get('environment', {}))
    if len(environment.get('LIBRARY_SESSION_SECRET', '')) < 32:
        raise RuntimeError('Existing reader configuration unavailable; deployment stopped')
    print('Previous function version:', previous['id'], flush=True)

    bucket = yc('storage', 'bucket', 'get', '--name', BUCKET, optional=True)
    if bucket is None:
        bucket = yc('storage', 'bucket', 'create', '--name', BUCKET, '--folder-id', FOLDER,
                    '--max-size', '1048576', '--default-storage-class', 'STANDARD')
    if bucket.get('folder_id') != FOLDER or any(bucket.get('anonymous_access_flags', {}).values()):
        raise RuntimeError('Usage bucket is not private in the expected folder')

    token = subprocess.check_output(['yc', 'iam', 'create-token'], text=True).strip()
    base = 'https://storage.yandexcloud.net/' + BUCKET
    try:
        with request(token, base + '?policy') as response:
            policy = json.load(response)
    except urllib.error.HTTPError as error:
        if error.code != 404:
            raise RuntimeError('Cannot inspect usage bucket policy') from None
        policy = {'Version': '2012-10-17', 'Statement': []}
    owned = {'HanyutongUsageObjects', 'HanyutongUsageList'}
    policy['Statement'] = [item for item in policy.get('Statement', []) if item.get('Sid') not in owned] + [
        {'Sid': 'HanyutongUsageObjects', 'Effect': 'Allow', 'Principal': {'CanonicalUser': SERVICE_ACCOUNT},
         'Action': ['s3:GetObject', 's3:PutObject'], 'Resource': 'arn:aws:s3:::' + BUCKET + '/app-private/translation-budget/*'},
        {'Sid': 'HanyutongUsageList', 'Effect': 'Allow', 'Principal': {'CanonicalUser': SERVICE_ACCOUNT},
         'Action': 's3:ListBucket', 'Resource': 'arn:aws:s3:::' + BUCKET}
    ]
    with request(token, base + '?policy', 'PUT', json.dumps(policy).encode(), {'Content-Type': 'application/json'}):
        pass

    # Verify storage really enforces both preconditions before enabling paid calls.
    probe = base + '/app-private/translation-budget/cas-probe-' + secrets.token_hex(8) + '.txt'
    with request(token, probe, 'PUT', b'first', {'If-None-Match': '*'}) as response:
        etag = response.headers['ETag']
    for condition in ({'If-None-Match': '*'}, {'If-Match': '"00000000000000000000000000000000"'}):
        try:
            with request(token, probe, 'PUT', b'must-not-write', condition):
                raise RuntimeError('Object storage ignored a budget precondition')
        except urllib.error.HTTPError as error:
            if error.code != 412:
                raise RuntimeError('Cannot verify budget preconditions') from None
    with request(token, probe, 'PUT', b'verified', {'If-Match': etag}):
        pass
    print('Private usage storage and atomic reservations verified', flush=True)

    for role in ('ai.translate.user', 'ai.vision.user'):
        yc('resource-manager', 'folder', 'add-access-binding', '--id', FOLDER,
           '--role', role, '--subject', 'serviceAccount:' + SERVICE_ACCOUNT)
    environment.update(TRANSLATION_ENABLED='true', OCR_ENABLED='true', TRANSLATION_BUDGET_BUCKET=BUCKET)
    environment.setdefault('TRANSLATION_IDENTITY_SALT', secrets.token_hex(32))
    if any(',' in str(value) or '\n' in str(value) for value in environment.values()):
        raise RuntimeError('Environment requires structured deployment; stopped safely')
    deployed = yc('serverless', 'function', 'version', 'create', '--function-id', FUNCTION,
        '--runtime', 'nodejs22', '--entrypoint', 'index.handler', '--memory', '128m',
        '--execution-timeout', '60s', '--concurrency', '4', '--service-account-id', SERVICE_ACCOUNT,
        '--source-path', str(ROOT / 'function'),
        '--environment', ','.join(key + '=' + str(value) for key, value in environment.items()))
    print('Translation function version:', deployed['id'], flush=True)
    yc('serverless', 'function', 'set-scaling-policy', '--id', FUNCTION, '--tag', '$latest',
       '--zone-instances-limit', '1', '--zone-requests-limit', '4', '--provisioned-instances-count', '0')
    yc('serverless', 'api-gateway', 'update', '--id', GATEWAY, '--spec', str(ROOT / 'gateway.yaml'))
    print('Translation and photo routes ready; existing reader secret preserved', flush=True)


if __name__ == '__main__':
    main()

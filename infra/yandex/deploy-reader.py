"""Run in authenticated Cloud Shell. Keep the session secret out of logs and source."""
import json
import os
from pathlib import Path
import secrets
import subprocess
ROOT = Path(__file__).resolve().parent
SECRET = ROOT.parent / 'reader-session-secret'
if not SECRET.exists():
    fd = os.open(SECRET, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream: stream.write(secrets.token_hex(32))
result = subprocess.run(['yc','serverless','function','version','create',
    '--function-id','d4echa2sl4p7hg71dle1','--runtime','nodejs22','--entrypoint','index.handler',
    '--memory','128m','--execution-timeout','10s','--concurrency','4',
    '--service-account-id','ajee4et21v76el2nki70',
    '--source-path',str(ROOT/'function'),
    '--environment','LIBRARY_SESSION_SECRET='+SECRET.read_text().strip(),
    '--format','json'], capture_output=True, text=True)
if result.returncode:
    # Do not print command arguments or CLI output that could include environment values.
    raise RuntimeError('Function deployment failed; inspect the authenticated cloud console')
version = json.loads(result.stdout)
print('Reader function version:', version['id'])
subprocess.run(['yc','serverless','function','set-scaling-policy','--id','d4echa2sl4p7hg71dle1','--tag','$latest','--zone-instances-limit','1','--zone-requests-limit','4','--provisioned-instances-count','0','--format','json'],check=True,stdout=subprocess.DEVNULL)
subprocess.run(['yc','serverless','api-gateway','update','--id','d5du0ehkavrgcuf0765l','--spec',str(ROOT/'gateway.yaml'),'--format','json'],check=True,stdout=subprocess.DEVNULL)
print('Reader gateway ready')

"""Verify the private transfer archive, then install private reading copies."""
import base64
import hashlib
import io
import json
from pathlib import Path
import subprocess
import urllib.request
import zipfile
ROOT=Path(__file__).resolve().parent
bucket='https://storage.yandexcloud.net/hanyutong-dev-media-b1gsi4nj/'
auth={'Authorization':'Bearer '+subprocess.check_output(['yc','iam','create-token'],text=True).strip()}
with urllib.request.urlopen(urllib.request.Request(bucket+'library/previews/reading-copies.zip',headers=auth),timeout=90) as response:
    data=response.read()
assert hashlib.sha256(data).hexdigest()=='213693d46f79bdaa4fcff700cd234183276117c0ae64e9fd1a3f76cdab94fc25'
previews=json.loads((ROOT/'previews.json').read_text())
with zipfile.ZipFile(io.BytesIO(data)) as archive:
    assert len(archive.namelist())==len(previews)==34
    for view in previews.values():
        data=archive.read(Path(view['key']).name)
        assert len(data)==view['size'] and hashlib.sha256(data).hexdigest()==view['sha256']
        headers={**auth,'Content-Type':'application/pdf','Content-MD5':base64.b64encode(hashlib.md5(data).digest()).decode(),'x-amz-acl':'private','x-amz-meta-sha256':view['sha256']}
        with urllib.request.urlopen(urllib.request.Request(bucket+view['key'],data=data,headers=headers,method='PUT'),timeout=60) as response:
            assert response.status==200
print('Installed 34 verified private reading copies')

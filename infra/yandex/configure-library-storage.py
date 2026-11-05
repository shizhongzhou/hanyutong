"""Run in authenticated Cloud Shell: make verified teaching objects private to the reader."""
import base64
import concurrent.futures
import hashlib
import json
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
BUCKET = 'https://storage.yandexcloud.net/hanyutong-dev-media-b1gsi4nj'
READER = 'ajee4et21v76el2nki70'
TOKEN = subprocess.check_output(['yc', 'iam', 'create-token'], text=True).strip()
AUTH = {'Authorization': 'Bearer ' + TOKEN}
NS = 'http://s3.amazonaws.com/doc/2006-03-01/'
XSI = 'http://www.w3.org/2001/XMLSchema-instance'
ET.register_namespace('', NS)
ET.register_namespace('xsi', XSI)

def request(url, method='GET', data=None, headers=None):
    return urllib.request.urlopen(urllib.request.Request(url, data=data, headers={**AUTH, **(headers or {})}, method=method), timeout=40)

def restrict(file):
    import re
    if not re.fullmatch(r'library/(road-to-success|previews)/[a-f0-9]{64}\.(pdf|mp3|doc|pptx?)', file['key']):
        raise ValueError('Unexpected resource key')
    url = BUCKET + '/' + file['key']
    with request(url, 'HEAD') as response:
        if int(response.headers['Content-Length']) != file['size']:
            raise ValueError('Size verification failed')
        # Browser-uploaded previews have an MD5 ETag; originals have SHA-256 metadata.
        if file.get('md5'):
            if response.headers.get('ETag', '').strip('"') != file['md5']:
                raise ValueError('Preview checksum mismatch')
        elif response.headers.get('x-amz-meta-sha256') != file['sha256']:
            raise ValueError('Original checksum mismatch')
    with request(url + '?acl') as response:
        acl = ET.fromstring(response.read())
    grants = acl.find('{'+NS+'}AccessControlList')
    if grants is None:
        grants = ET.SubElement(acl, '{'+NS+'}AccessControlList')
    # Revoke anonymous/authenticated-public grants only. Preserve existing named owners.
    for grant in list(grants):
        grantee = grant.find('{'+NS+'}Grantee')
        if grantee is not None and (grantee.find('{'+NS+'}URI') is not None or grantee.findtext('{'+NS+'}ID') == READER):
            grants.remove(grant)
    grant = ET.SubElement(grants, '{'+NS+'}Grant')
    grantee = ET.SubElement(grant, '{'+NS+'}Grantee', {'{'+XSI+'}type':'CanonicalUser'})
    ET.SubElement(grantee, '{'+NS+'}ID').text = READER
    ET.SubElement(grant, '{'+NS+'}Permission').text = 'READ'
    body = ET.tostring(acl, encoding='utf-8', xml_declaration=True)
    with request(url + '?acl', 'PUT', body, {'Content-Type':'application/xml', 'Content-MD5':base64.b64encode(hashlib.md5(body).digest()).decode()}):
        pass
    try:
        with urllib.request.urlopen(urllib.request.Request(url, method='HEAD'), timeout=30):
            raise ValueError('Anonymous access still enabled')
    except urllib.error.HTTPError as error:
        if error.code != 403:
            raise
    return file['key']

def retry(file):
    for attempt in range(4):
        try:
            return restrict(file)
        except (urllib.error.URLError, TimeoutError):
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)

if __name__ == '__main__':
    catalog = json.loads((ROOT / 'function/catalog.json').read_text())
    files = catalog['files'] + [f['preview'] for f in catalog['files'] if f.get('preview')]
    # Verify every preview was uploaded before changing access to any original.
    for file in files[catalog['totalFiles']:]:
        with request(BUCKET + '/' + file['key'], 'HEAD') as response:
            assert int(response.headers['Content-Length']) == file['size']
            assert response.headers.get('ETag', '').strip('"') == file['md5']
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for index, key in enumerate(pool.map(retry, files), 1):
            if index % 25 == 0: print('Private objects verified:', index, flush=True)
    print('All', len(files), 'objects private; reader service account has READ only.', flush=True)

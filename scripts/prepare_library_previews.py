#!/usr/bin/env python3
"""Convert checksummed Office originals to private PDF reading copies (requires LibreOffice)."""
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import subprocess
import urllib.request
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'work'
SOURCE = WORK / 'office-sources'
PDFS = WORK / 'previews'
SOURCE.mkdir(parents=True, exist_ok=True)
PDFS.mkdir(parents=True, exist_ok=True)
files = [f for f in json.loads((ROOT / 'infra/yandex/function/catalog.json').read_text())['files'] if f['kind'] in ('document', 'slides')]

def obtain(f):
    path = SOURCE / Path(f['key']).name
    if not path.exists():
        headers = {'Authorization': 'Bearer ' + os.environ['YC_IAM_TOKEN']} if os.environ.get('YC_IAM_TOKEN') else {}
        with urllib.request.urlopen(urllib.request.Request('https://storage.yandexcloud.net/hanyutong-dev-media-b1gsi4nj/' + f['key'], headers=headers), timeout=120) as response:
            path.write_bytes(response.read())
    data = path.read_bytes()
    assert len(data) == f['size'] and hashlib.sha256(data).hexdigest() == f['sha256'], f['id']
    return str(path)

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    paths = list(pool.map(obtain, files))
print('Verified Office originals:', len(paths), flush=True)
subprocess.run(['soffice', '--headless', '--convert-to', 'pdf', '--outdir', str(PDFS), *paths], check=True)
previews = {}
for f in files:
    path = PDFS / (Path(f['key']).stem + '.pdf')
    data = path.read_bytes()
    pages = len(PdfReader(path).pages)
    assert data.startswith(b'%PDF-') and pages > 0
    previews[f['id']] = {'key': 'library/previews/' + path.name, 'size': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'md5': hashlib.md5(data).hexdigest(), 'pages': pages}
(ROOT / 'infra/yandex/previews.json').write_text(json.dumps(previews, ensure_ascii=False, indent=2) + '\n')
print('Prepared', len(previews), 'reading copies;', sum(f['size'] for f in previews.values()), 'bytes')

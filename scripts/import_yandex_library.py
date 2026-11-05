#!/usr/bin/env python3
"""Copy a pinned public Disk inventory into Object Storage, verifying every byte.

Run inside authenticated Yandex Cloud Shell. No static access keys are created.
An interrupted import is resumable: matching objects are checked and skipped.
"""
import argparse
import base64
import concurrent.futures
import hashlib
import json
import pathlib
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request


def object_key(item):
    digest = item['sha256']
    if len(digest) != 64 or any(c not in '0123456789abcdef' for c in digest):
        raise ValueError('Missing or invalid source SHA-256')
    ext = pathlib.Path(item['name']).suffix.lower()
    if ext not in {'.pdf', '.mp3', '.doc', '.ppt', '.pptx'}:
        raise ValueError('Unexpected file type')
    return 'library/road-to-success/' + digest + ext


def transfer(item, source, bucket, token):
    target = 'https://storage.yandexcloud.net/' + bucket + '/' + object_key(item)
    auth = {'Authorization': 'Bearer ' + token}
    try:
        with urllib.request.urlopen(urllib.request.Request(target, headers=auth, method='HEAD'), timeout=30) as r:
            if (int(r.headers['Content-Length']) == item['size'] and
                    r.headers.get('x-amz-meta-sha256') == item['sha256'] and
                    r.headers.get('ETag', '').strip('"') == item['md5']):
                return 'verified-existing'
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
    link = 'https://cloud-api.yandex.net/v1/disk/public/resources/download?' + urllib.parse.urlencode({'public_key': source, 'path': item['path']})
    with urllib.request.urlopen(link, timeout=45) as r:
        download = json.load(r)['href']
    if urllib.parse.urlparse(download).scheme != 'https':
        raise ValueError('Download must use HTTPS')
    with tempfile.TemporaryFile() as body:
        sha = hashlib.sha256()
        md5 = hashlib.md5()
        size = 0
        with urllib.request.urlopen(download, timeout=120) as r:
            while chunk := r.read(1024 * 1024):
                size += len(chunk)
                if size > item['size']:
                    raise ValueError('Source size increased')
                sha.update(chunk)
                md5.update(chunk)
                body.write(chunk)
        if size != item['size'] or sha.hexdigest() != item['sha256'] or md5.hexdigest() != item['md5']:
            raise ValueError('Source checksum mismatch')
        headers = dict(auth, **{
            'Content-Length': str(size),
            'Content-Type': item['mime_type'],
            'Content-MD5': base64.b64encode(md5.digest()).decode(),
            'x-amz-meta-sha256': sha.hexdigest(),
            'Cache-Control': 'public, max-age=31536000, immutable',
            'Content-Disposition': 'inline' if item['name'].lower().endswith(('.pdf', '.mp3')) else 'attachment',
            # Only verified teaching files from the pinned inventory are public.
            'x-amz-acl': 'private',
        })
        body.seek(0)
        with urllib.request.urlopen(urllib.request.Request(target, data=body, headers=headers, method='PUT'), timeout=180) as r:
            if r.headers.get('ETag', '').strip('"') != md5.hexdigest():
                raise ValueError('Uploaded object checksum mismatch')
        with urllib.request.urlopen(urllib.request.Request(target, headers=auth, method='HEAD'), timeout=30) as r:
            if int(r.headers['Content-Length']) != size or r.headers.get('x-amz-meta-sha256') != sha.hexdigest():
                raise ValueError('Uploaded metadata verification failed')
    return 'copied'


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--inventory', required=True)
    p.add_argument('--bucket', required=True)
    p.add_argument('--report', default='import-report.json')
    p.add_argument('--workers', type=int, default=3)
    p.add_argument('--deferred', help='JSON file containing source paths to skip')
    a = p.parse_args()
    inventory = json.loads(pathlib.Path(a.inventory).read_text())
    if a.deferred:
        deferred = set(json.loads(pathlib.Path(a.deferred).read_text())['paths'])
        inventory['files'] = [f for f in inventory['files'] if f['path'] not in deferred]
    # The token remains only in this process and is never printed or saved.
    token = subprocess.check_output(['yc', 'iam', 'create-token'], text=True).strip()
    def run(item):
        for attempt in range(5):
            try:
                return {'path': item['path'], 'key': object_key(item), 'bytes': item['size'], 'sha256': item['sha256'], 'status': transfer(item, inventory['source'], a.bucket, token)}
            except Exception as exc:
                if attempt == 4:
                    return {'path': item['path'], 'status': 'failed', 'error': type(exc).__name__ + (': HTTP ' + str(exc.code) if isinstance(exc, urllib.error.HTTPError) else ': import verification or network error')}
                time.sleep(min(2 ** attempt, 16))
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(a.workers, 4))) as pool:
        futures = [pool.submit(run, f) for f in inventory['files']]
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            results.append(result)
            pathlib.Path(a.report).write_text(json.dumps(results, ensure_ascii=False, indent=2))
            if len(results) % 10 == 0 or result['status'] == 'failed':
                print(json.dumps({'finished': len(results), 'total': len(futures), 'failed': sum(x['status'] == 'failed' for x in results), 'verified_bytes': sum(x.get('bytes', 0) for x in results)}, ensure_ascii=False), flush=True)
    failed = sum(x['status'] == 'failed' for x in results)
    print(json.dumps({'complete': not failed, 'files': len(results), 'failed': failed, 'bytes': sum(x.get('bytes', 0) for x in results)}, ensure_ascii=False), flush=True)
    raise SystemExit(1 if failed else 0)


if __name__ == '__main__':
    main()

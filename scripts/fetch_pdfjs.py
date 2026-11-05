#!/usr/bin/env python3
"""Download Mozilla PDF.js from npm with its pinned SHA-512 integrity."""
import base64
import hashlib
import io
import pathlib
import tarfile
import urllib.request

VERSION = '6.5.438'
INTEGRITY = 'vg8Pw1x+AFKy4AMDvhuWl5cOYV8d698UoEANoFFhc79hqXDnZQqnOXoxw3HG907WHOg1JYOvLhP756boddFxpA=='
root = pathlib.Path(__file__).resolve().parents[1] / 'web/vendor/pdfjs'
url = f'https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-{VERSION}.tgz'
data = urllib.request.urlopen(url, timeout=90).read()
assert base64.b64encode(hashlib.sha512(data).digest()).decode() == INTEGRITY, 'PDF.js checksum mismatch'
with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
    for member in archive:
        if not member.isfile():
            continue
        path = pathlib.PurePosixPath(member.name)
        if path.parts[0] != 'package' or '..' in path.parts:
            raise ValueError('Unsafe package path')
        relative = str(path.relative_to('package'))
        if relative in {'legacy/build/pdf.min.mjs', 'legacy/build/pdf.worker.min.mjs', 'LICENSE'} or relative.startswith(('cmaps/', 'standard_fonts/', 'wasm/')):
            target = root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.extractfile(member).read())
print('Verified Mozilla PDF.js', VERSION)

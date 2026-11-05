#!/usr/bin/env python3
"""Fetch pinned public dictionary snapshots; reject any unexpected content."""
import hashlib
import json
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[1]
cache = root / '.dictionary-cache'
cache.mkdir(exist_ok=True)
sources = json.loads((root / 'dictionary-sources.json').read_text())
for name, source in sources.items():
    dest = cache / source['filename']
    def valid():
        return dest.exists() and hashlib.file_digest(dest.open('rb'), 'sha256').hexdigest() == source['sha256']
    if not valid():
        # Retry resumable downloads if the large archive connection is interrupted.
        partial = dest.with_suffix(dest.suffix + '.part')
        for attempt in range(4):
            result = subprocess.run(['curl', '--fail', '--location', '--silent', '--show-error',
                '--connect-timeout', '30', '--max-time', '600', '--continue-at', '-',
                '--output', str(partial), source['url']])
            if result.returncode == 0:
                partial.replace(dest)
                break
        if not valid():
            raise SystemExit(f'{name}: source missing or SHA-256 mismatch; refusing to publish changed dictionary data')
    print(f'Verified {name}: {dest.name}', flush=True)

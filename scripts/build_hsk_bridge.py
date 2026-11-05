#!/usr/bin/env python3
"""Build a compact, reproducible bridge from the old course into one HSK course.

The official vocabulary files remain unchanged. Legacy Russian definitions are
retained by references to the existing source files. Nonmatching readings and
headwords become supplemental cards at their former teaching stage, not new
official syllabus entries. A legacy row maps to exactly one progress target.
"""
import argparse
import collections
import hashlib
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPECTED = {'exact': 4672, 'senses': 24, 'reading': 106, 'extra': 189}


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def normalized_pinyin(value):
    # Deliberately retain tones, neutral tones, and alternative-reading syntax.
    value = unicodedata.normalize('NFC', value.casefold()).replace('u:', 'ü')
    return re.sub(r'[\s’\'-]', '', value)


def make_bridge(root):
    source_config = read_json(root / 'hsk3-sources.json')
    official_path = root / 'web/data/hsk3/manifest.json'
    manifest = read_json(official_path)
    if manifest['source']['sha256'] != source_config['source']['sha256']:
        raise ValueError('Official syllabus source has changed; re-audit the bridge first')
    official = []
    for level in manifest['levels']:
        for shard in level['files']:
            path = official_path.parent / shard['file']
            if sha256(path) != shard['sha256']:
                raise ValueError(f'Official shard has changed: {path.name}')
            official.extend(read_json(path))
    if [word['number'] for word in official] != list(range(1, 11001)):
        raise ValueError('Expected the complete official 11000-row syllabus')
    by_hanzi = collections.defaultdict(list)
    for word in official:
        by_hanzi[word['hz']].append(word)
    rows, old_sources = [], []
    kind_counts, supplement_counts = collections.Counter(), collections.Counter()
    pinned_legacy = {entry['file']: entry['sha256'] for entry in source_config['russian']['legacyFiles']}
    for legacy_level in range(1, 7):
        filename = f'web/data/hsk{legacy_level}.json'
        path = root / filename
        source_hash = sha256(path)
        if source_hash != pinned_legacy[filename]:
            raise ValueError(f'Legacy source has changed: {filename}')
        words = read_json(path)
        old_sources.append({'level': legacy_level, 'file': filename, 'sha256': source_hash, 'count': len(words)})
        for legacy_index, (hanzi, pinyin, _russian, _pos) in enumerate(words):
            candidates = by_hanzi.get(hanzi, [])
            exact = [word for word in candidates if normalized_pinyin(word['py']) == normalized_pinyin(pinyin)]
            kind = 'exact' if len(exact) == 1 else 'senses' if exact else 'reading' if candidates else 'extra'
            numbers = sorted(word['number'] for word in exact or candidates)
            rows.append([hanzi, legacy_level, legacy_index, kind, numbers])
            kind_counts[kind] += 1
            if kind in ('reading', 'extra'):
                supplement_counts[str(legacy_level)] += 1
    if dict(kind_counts) != EXPECTED or len(rows) != 4991 or len({row[0] for row in rows}) != 4991:
        raise ValueError(f'Legacy matching has changed; review the migration before rebuilding: {dict(kind_counts)}')
    levels, cumulative = [], 0
    for level in manifest['levels']:
        supplement_count = supplement_counts[level['id']]
        total = level['count'] + supplement_count
        cumulative += total
        levels.append({'id': level['id'], 'officialCount': level['count'],
                       'supplementCount': supplement_count, 'totalCount': total,
                       'cumulativeCount': cumulative})
    return {
        'schema': 1,
        'version': 'hsk-unified-2026-11-05',
        'columns': ['hz', 'legacyLevel', 'legacyIndex', 'kind', 'officialNumbers'],
        'officialSource': {'file': 'web/data/hsk3/manifest.json', 'version': manifest['version'],
                           'sha256': sha256(official_path), 'count': len(official)},
        'oldSourceFiles': old_sources,
        'counts': {'legacy': len(rows), 'official': len(official), **EXPECTED,
                   'supplement': sum(supplement_counts.values()), 'total': cumulative},
        'levels': levels,
        'policy': {
            'legacyIndexBase': 0,
            'exactAndSensesPrimary': 'first-official-number',
            'supplementKinds': ['reading', 'extra'],
            'supplementId': 'hsk3-extra-{legacyLevel}-{legacyIndexPlusOne:04d}',
            'supplementStage': 'former-teaching-stage-not-official-HSK-placement',
            'keepOriginalProgressBackup': True,
            'overwriteExistingProgress': False,
            'copyMasteryToAllSenses': False,
        },
        'rows': rows,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--output', type=Path, default=ROOT / 'web/data/hsk3/legacy-bridge.json')
    args = parser.parse_args()
    bridge = make_bridge(args.root)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(bridge, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(json.dumps({'counts': bridge['counts'], 'bytes': args.output.stat().st_size}, ensure_ascii=False))


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Rebuild the complete, pinned HSK 3.0 exam vocabulary and Russian glosses.

The official PDF is the source of every numbered vocabulary row. Its SHA-256
must match hsk3-sources.json. Install pypdf to extract the tables; dictionary
shards are generated separately by build_dictionary.py. Nothing is translated
by machine, and a missing Russian definition fails the build.

Example:
  python3 scripts/build_hsk3_vocab.py --pdf work/hsk3/syllabus-2025-11.pdf
"""
import argparse
import collections
import gzip
import hashlib
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUSSIAN = re.compile(r'[а-яё]', re.I)
LEVEL_LABEL = re.compile(r'[1-6](?:（(?:[1-6]|7-9)）)*|7-9')


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def split_entries(entries, target_bytes, max_bytes):
    """Bound JSON transfer size in UTF-8 bytes without splitting an entry."""
    if not 0 < target_bytes <= max_bytes:
        raise ValueError('Invalid shard byte limits')
    chunk, size = [], 3  # JSON brackets and the final newline.
    for entry in entries:
        entry_size = len(json.dumps(entry, ensure_ascii=False, separators=(',', ':')).encode('utf-8'))
        if entry_size + 3 > max_bytes:
            raise ValueError(f'Entry {entry["id"]} exceeds the maximum shard size')
        if chunk and size + entry_size + 1 > target_bytes:
            yield chunk
            chunk, size = [], 3
        size += entry_size + (1 if chunk else 0)
        chunk.append(entry)
    if chunk:
        yield chunk


def normalize_pinyin(value):
    # Keep tones: 背 bēi and 背 bèi must not inherit each other's legacy gloss.
    value = unicodedata.normalize('NFC', value.casefold()).replace('u:', 'ü')
    return re.sub(r'[\s’\'-]', '', value)


def parse_official_rows(pages, expected):
    """Parse the five PDF columns, allowing an empty part-of-speech column."""
    rows = []
    for page_number, text in enumerate(pages, 1):
        for line in text.splitlines():
            fields = re.split(r'\s{2,}', line.strip())
            if (len(fields) not in (4, 5) or not fields[0].isdigit()
                    or not LEVEL_LABEL.fullmatch(fields[1])):
                continue
            number, level_label, label, pinyin, *pos = fields
            level = level_label.split('（')[0]
            rows.append({
                'id': f'hsk3-{int(number):05d}',
                'number': int(number),
                'level': level,
                'hz': re.sub(r'\d+$', '', label),
                'py': pinyin,
                'pos': pos[0] if pos else '',
                'officialLabel': label,
                'levelLabel': level_label,
                'additionalLevels': re.findall(r'（([^）]+)）', level_label),
                'sourcePage': page_number,
            })
    if [row['number'] for row in rows] != list(range(1, expected['totalEntries'] + 1)):
        raise ValueError('Official vocabulary rows must have every serial number exactly once, in order')
    counts = dict(collections.Counter(row['level'] for row in rows))
    if counts != expected['expectedIncrementalCounts']:
        raise ValueError(f'Unexpected official level counts: {counts}')
    return rows


class Dictionary:
    """Resolve exact Chinese headwords through the app's pinned BKRS index."""
    def __init__(self, root, expected):
        self.root = root
        manifest = read_json(root / 'manifest.json')
        if (manifest['version'] != expected['dictionaryVersion']
                or manifest['source']['sha256'] != expected['dictionarySourceSha256']):
            raise ValueError('Dictionary snapshot does not match hsk3-sources.json')
        self.chunk_size = manifest['chunkSize']
        self.indexes = {}
        self.chunks = {}

    def lookup(self, headword):
        prefix = f'{ord(headword[0]):x}'
        if prefix not in self.indexes:
            path = self.root / 'zh' / f'{prefix}.json.gz'
            self.indexes[prefix] = dict(json.loads(gzip.decompress(path.read_bytes()))) if path.exists() else {}
        entry_id = self.indexes[prefix].get(headword)
        if entry_id is None:
            return None, None
        chunk = entry_id // self.chunk_size
        if chunk not in self.chunks:
            path = self.root / 'entries' / f'{chunk}.json.gz'
            self.chunks[chunk] = json.loads(gzip.decompress(path.read_bytes()))
        record = self.chunks[chunk][entry_id % self.chunk_size]
        if record[0] != headword:
            raise ValueError(f'Dictionary index mismatch for {headword}')
        return entry_id, record


def add_russian(rows, dictionary, legacy):
    counts = collections.Counter()
    missing = []
    for row in rows:
        dictionary_id, record = dictionary.lookup(row['hz'])
        # The old HSK list does not distinguish the new numbered homograph senses.
        # A complete dictionary headword is safer than its old, narrower gloss.
        legacy_match = None
        if row['officialLabel'] == row['hz']:
            legacy_match = next((item for item in legacy.get(row['hz'], [])
                                 if normalize_pinyin(item[1]) == normalize_pinyin(row['py'])), None)
        if legacy_match and RUSSIAN.search(legacy_match[2]):
            row['ru'], row['ruSource'] = legacy_match[2], 'existing-hsk'
        elif record and RUSSIAN.search(record[2]):
            row['ru'], row['ruSource'] = record[2], 'bkrs'
        else:
            missing.append(row['officialLabel'])
            continue
        row['ruScope'] = 'headword'
        if dictionary_id is not None:
            row['dictionaryId'] = dictionary_id
        counts[row['ruSource']] += 1
    if missing:
        raise ValueError(f'Missing Russian definitions ({len(missing)}): {missing}')
    return dict(counts)


def build(args):
    config = read_json(args.sources)
    if sha256(args.pdf) != config['source']['sha256']:
        raise ValueError('Official PDF SHA-256 does not match hsk3-sources.json')
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise SystemExit('Install pypdf to rebuild the vocabulary from the pinned official PDF.') from exc
    reader = PdfReader(args.pdf)
    rows = parse_official_rows((page.extract_text(extraction_mode='layout') for page in reader.pages), config)
    legacy = collections.defaultdict(list)
    for item in config['russian']['legacyFiles']:
        path = ROOT / item['file']
        if sha256(path) != item['sha256']:
            raise ValueError(f'Legacy Russian snapshot changed: {path}')
        for record in read_json(path):
            legacy[record[0]].append(record)
    counts = add_russian(rows, Dictionary(args.dictionary, config['russian']), legacy)
    levels, generated = [], set()
    target_bytes, max_bytes = config['sharding']['targetBytes'], config['sharding']['maxBytes']
    for level in config['levelOrder']:
        entries = [row for row in rows if row['level'] == level]
        files = []
        for part, chunk in enumerate(split_entries(entries, target_bytes, max_bytes), 1):
            filename = f'vocabulary-{level}-{part:02d}.json'
            path = args.output / filename
            write_json(path, chunk)
            size = path.stat().st_size
            if size > max_bytes:
                raise ValueError(f'Shard {filename} exceeds the maximum size')
            files.append({
                'file': filename, 'sha256': sha256(path), 'count': len(chunk),
                'firstNumber': chunk[0]['number'], 'lastNumber': chunk[-1]['number'],
                'bytes': size,
            })
            generated.add(filename)
        levels.append({
            'id': level,
            'label': f'HSK {level.replace("-", "–")}',
            'count': len(entries),
            'cumulativeCount': config['expectedCumulativeCounts'][level],
            'files': files,
            'firstNumber': entries[0]['number'],
            'lastNumber': entries[-1]['number'],
        })
    manifest = {
        'schema': 1,
        'version': config['version'],
        'totalEntries': len(rows),
        'levels': levels,
        'shards': {'targetBytes': target_bytes, 'maxBytes': max_bytes, 'count': len(generated)},
        'source': config['source'],
        'russian': {
            'matched': len(rows),
            'missing': 0,
            'sources': counts,
            'dictionaryVersion': config['russian']['dictionaryVersion'],
            'dictionaryUrl': config['russian']['dictionarySourceUrl'],
            'definitionScope': 'headword',
        },
        'jointAdvancedBand': '7-9',
        'numberedHomographEntries': sum(row['officialLabel'] != row['hz'] for row in rows),
    }
    write_json(args.output / 'manifest.json', manifest)
    # Remove only obsolete outputs owned by this builder, leaving exam data intact.
    for path in args.output.glob('vocabulary-*.json'):
        if path.name not in generated and re.fullmatch(r'vocabulary-(?:[1-6]|7-9)(?:-\d{2})?\.json', path.name):
            path.unlink()
    print(json.dumps({'total': len(rows), 'levels': config['expectedIncrementalCounts'],
                      'russian': counts, 'shards': len(generated)}, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pdf', type=Path, required=True)
    parser.add_argument('--sources', type=Path, default=ROOT / 'hsk3-sources.json')
    parser.add_argument('--dictionary', type=Path, default=ROOT / 'web/data/dictionary')
    parser.add_argument('--output', type=Path, default=ROOT / 'web/data/hsk3')
    build(parser.parse_args())


if __name__ == '__main__':
    main()

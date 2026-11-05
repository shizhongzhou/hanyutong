#!/usr/bin/env python3
"""Build offline, independently compressed dictionary shards using only stdlib.

Usage: python3 scripts/build_dictionary.py --bkrs ../dabkrs_261105.gz
       --unihan ../Unihan-17.0.0.zip --scratch ../dictionary-build.sqlite
Input snapshots are deliberately outside the repository. Never scrape entry pages.
"""
import argparse
import collections
import gzip
import hashlib
import html
import itertools
import json
import re
import sqlite3
import unicodedata
import zipfile
from pathlib import Path

HAN = re.compile(r'[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\U00020000-\U0003347f]')
RUS = re.compile('[а-яё]', re.I)
TAGS = re.compile(r'\[/?(?:m\d*|i|b|p|c(?: [^\]]*)?|ref(?: [^\]]*)?|ex|\*|u|s|com|trn|!trs|lang(?: [^\]]*)?)\]')
CHUNK = 1024

def plain_dsl(text):
    text = re.sub(r'\[/?m\d*\]', '\n', text)
    text = TAGS.sub('', text).replace('\\[', '[').replace('\\]', ']')
    return '\n'.join(x.strip() for x in html.unescape(text).splitlines() if x.strip())

def parse_article(raw):
    examples = [plain_dsl(x) for x in re.findall(r'\[ex\](.*?)\[/ex\]', raw, re.S)]
    # Keep all source content in the definition; examples also have a separate view.
    return plain_dsl(raw), list(dict.fromkeys(x for x in examples if RUS.search(x)))

def pinyin(text):
    text = re.sub('[üǖǘǚǜ]', 'v', text.lower().replace('u:', 'v'))
    text = unicodedata.normalize('NFD', text)
    return re.sub('[^a-zv]', '', ''.join(c for c in text if not unicodedata.combining(c)))

def blocks(path):
    with gzip.open(path, 'rt', encoding='utf-8-sig') as f:
        block = []
        for line in f:
            if line.strip():
                block.append(line.rstrip('\r\n'))
            elif block:
                if not block[0].startswith('#'):
                    yield block
                block = []
        if block and not block[0].startswith('#'):
            yield block

def digest(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(1024 * 1024), b''):
            h.update(b)
    return h.hexdigest()

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--bkrs', type=Path, required=True)
    p.add_argument('--unihan', type=Path, required=True)
    p.add_argument('--scratch', type=Path, required=True)
    p.add_argument('--output', type=Path, default=Path('web/data/dictionary'))
    a = p.parse_args()
    if a.scratch.exists():
        raise SystemExit('Use a new scratch database path (existing files are never overwritten).')
    out = a.output
    out.mkdir(parents=True, exist_ok=True)
    files = {}
    def write(path, obj):
        data = json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode()
        packed = gzip.compress(data, compresslevel=9, mtime=0)
        dest = out / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(packed)
        files[path] = {'bytes': len(packed), 'sha256': hashlib.sha256(packed).hexdigest()}

    db = sqlite3.connect(a.scratch)
    db.executescript('PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA temp_store=FILE;'
                     'CREATE TABLE entries(hz TEXT PRIMARY KEY, py TEXT, ru TEXT, ex TEXT);'
                     'CREATE TABLE terms(kind TEXT, prefix TEXT, term TEXT, id INTEGER);')
    raw_count = skipped = duplicates = 0
    for b in blocks(a.bkrs):
        raw_count += 1
        # Rare records contain literal newlines or an extra Chinese alias line.
        start = 2 if len(b) == 3 else next((n for n, line in enumerate(b) if re.search(r'\[m\d*\]', line)), None)
        if start is None or start < 2:
            raise ValueError(f'Unexpected BKRS record {raw_count}: {b[:1]}')
        hz, py = b[0].strip(), b[start - 1].strip()
        if py == '_':
            py = ''
        raw = '\n'.join(b[start:])
        ru, ex = parse_article(raw)
        if start > 2:
            ru += '\nВариант в источнике: ' + ' '.join(x.strip() for x in b[1:start - 1])
        if not HAN.search(hz) or not RUS.search(ru):
            skipped += 1
            continue
        try:
            db.execute('INSERT INTO entries VALUES(?,?,?,?)', (hz, py, ru, json.dumps(ex, ensure_ascii=False)))
        except sqlite3.IntegrityError:
            duplicates += 1
            old = db.execute('SELECT py,ru,ex FROM entries WHERE hz=?', (hz,)).fetchone()
            db.execute('UPDATE entries SET py=?,ru=?,ex=? WHERE hz=?',
                       (' / '.join(dict.fromkeys(x for x in [old[0], py] if x)),
                        '\n'.join(dict.fromkeys([old[1], ru])),
                        json.dumps(list(dict.fromkeys(json.loads(old[2]) + ex)), ensure_ascii=False), hz))
        if raw_count % 500000 == 0:
            db.commit()
            print(f'Parsed {raw_count:,} source records', flush=True)
    db.commit()
    print('Building records and search indexes…', flush=True)
    zh = collections.defaultdict(list)
    batch, terms = [], []
    count = characters = with_examples = with_pinyin = 0
    for i, (hz, py, ru, ex) in enumerate(db.execute('SELECT hz,py,ru,ex FROM entries ORDER BY length(hz),hz')):
        examples = json.loads(ex)
        batch.append([hz, py, ru, examples])
        zh[f'{ord(hz[0]):x}'].append([hz, i])
        characters += len(hz) == 1 and bool(HAN.fullmatch(hz))
        with_examples += bool(examples)
        with_pinyin += bool(py)
        for word in sorted(set(re.findall('[а-яё]{3,}', ru.lower().replace('ё', 'е')))):
            terms.append(('ru', word[:3], word, i))
        for reading in set(pinyin(x) for x in re.split(r'[/,;；、]', py)):
            if reading:
                terms.append(('py', reading[:2], reading, i))
        if len(terms) >= 50000:
            db.executemany('INSERT INTO terms VALUES(?,?,?,?)', terms)
            terms = []
        if len(batch) == CHUNK:
            write(f'entries/{i // CHUNK}.json.gz', batch)
            batch = []
        count = i + 1
    if batch:
        write(f'entries/{(count - 1) // CHUNK}.json.gz', batch)
    if terms:
        db.executemany('INSERT INTO terms VALUES(?,?,?,?)', terms)
    db.commit()
    for key, rows in zh.items():
        write(f'zh/{key}.json.gz', rows)
    del zh
    print(f'{count:,} entries saved; sorting reverse indexes…', flush=True)
    indexes = {'ru': {}, 'py': {}}
    cursor = db.execute('SELECT kind,prefix,term,id FROM terms ORDER BY kind,prefix,term,id')
    for (kind, prefix), group in itertools.groupby(cursor, lambda r: r[:2]):
        mapping = {}
        for term, rows in itertools.groupby(group, lambda r: r[2]):
            mapping[term] = [r[3] for r in rows]
        path = f'{kind}/' + '-'.join(f'{ord(c):x}' for c in prefix) + '.json.gz'
        write(path, mapping)
        indexes[kind][prefix] = path
    print('Building character metadata…', flush=True)
    chars = collections.defaultdict(dict)
    wanted = {'kMandarin': 'py', 'kTotalStrokes': 'strokes', 'kRSUnicode': 'radical',
              'kSimplifiedVariant': 'simplified', 'kTraditionalVariant': 'traditional'}
    with zipfile.ZipFile(a.unihan) as z:
        for name in ['Unihan_IRGSources.txt', 'Unihan_Readings.txt', 'Unihan_Variants.txt']:
            for line in z.read(name).decode().splitlines():
                if not line or line.startswith('#'):
                    continue
                cp, prop, value = line.split('\t', 2)
                if prop in wanted:
                    c = chr(int(cp[2:], 16))
                    if prop.endswith('Variant'):
                        value = ''.join(chr(int(x, 16)) for x in re.findall(r'U\+([A-F0-9]+)', value))
                    chars[c][wanted[prop]] = value
    char_groups = collections.defaultdict(dict)
    for c, value in chars.items():
        char_groups[f'{ord(c) >> 8:x}'][c] = value
    for key, value in char_groups.items():
        write(f'chars/{key}.json.gz', value)
    strokes = ''.join(sorted(p.stem for p in Path('web/strokes').glob('*.json')))
    manifest = {
        'schema': 1, 'version': 'bkrs-2026-11-05-unihan-17', 'chunkSize': CHUNK,
        'entries': count, 'charactersWithRussian': characters, 'entriesWithExamples': with_examples,
        'entriesWithPinyin': with_pinyin, 'characterMetadata': len(chars),
        'sourceRecords': raw_count, 'excludedNonChineseOrNoRussian': skipped, 'mergedDuplicates': duplicates,
        'source': {'name': '大БКРС', 'url': 'https://bkrs.info/p47',
                   'download': 'https://bkrs.info/downloads/daily/dabkrs_261105.gz',
                   'sha256': digest(a.bkrs), 'date': '2026-11-05'},
        'unihan': {'version': '17.0.0', 'url': 'https://www.unicode.org/Public/17.0.0/ucd/Unihan.zip',
                   'sha256': digest(a.unihan), 'license': 'Unicode-3.0'},
        'indexes': indexes, 'strokeCharacters': strokes, 'files': files,
        'compressedBytes': sum(f['bytes'] for f in files.values()),
    }
    (out / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(json.dumps({k: v for k, v in manifest.items() if k not in ['indexes', 'files', 'strokeCharacters']}, ensure_ascii=False, indent=2), flush=True)
    db.close()

if __name__ == '__main__':
    main()

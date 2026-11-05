#!/usr/bin/env python3
"""Build the Russian book shelf from the pinned, checksummed source inventory."""
import hashlib
import json
import pathlib
import re
from import_yandex_library import object_key

ROOT = pathlib.Path(__file__).resolve().parents[1]
TITLES = [
    'Вводный курс', 'Начальный курс · 1', 'Начальный курс · 2',
    'Базовый курс · 1', 'Базовый курс · 2',
    'Продолжение базового курса · 1', 'Продолжение базового курса · 2', 'Продолжение базового курса · 3',
    'Аудирование и речь · базовый уровень 1', 'Аудирование и речь · базовый уровень 2',
    'Чтение и письмо · базовый уровень 1–2',
    'Переход к среднему уровню · 1', 'Переход к среднему уровню · 2',
    'Аудирование и речь · переход к среднему уровню',
    'Средний уровень · 1', 'Средний уровень · 2', 'Аудирование и речь · средний уровень',
    'Переход к продвинутому уровню · 1', 'Переход к продвинутому уровню · 2',
    'Продвинутый уровень · 1', 'Продвинутый уровень · 2',
]


def readable_name(name):
    try:
        fixed = name.encode('cp866').decode('gbk')
        count = lambda s: len(re.findall(r'[\u3400-\u9fff]', s))
        return fixed if count(fixed) > count(name) else name
    except UnicodeError:
        return name


def build():
    source = json.loads((ROOT / 'infra/yandex/source-inventory.json').read_text())
    deferred = set(json.loads((ROOT / 'infra/yandex/deferred-files.json').read_text())['paths'])
    preview_path = ROOT / 'infra/yandex/previews.json'
    previews = json.loads(preview_path.read_text()) if preview_path.exists() else {}
    alignment_path = ROOT / 'infra/yandex/audio-alignment.json'
    alignment = json.loads(alignment_path.read_text()) if alignment_path.exists() else {}
    chapters = json.loads((ROOT / 'infra/yandex/lesson-pages.json').read_text())
    books, files = {}, []
    removed = []
    for item in source['files']:
        if item['path'] in deferred:
            continue
        if pathlib.Path(item['name']).suffix.lower() == '.doc':
            removed.append(item['path'])
            continue
        parts = item['path'].strip('/').split('/')
        number = int(parts[0][:2])
        book_id = 'rts-%02d' % number
        book = books.setdefault(book_id, {'id': book_id, 'number': number, 'title': TITLES[number - 1], 'originalTitle': parts[0], 'fileCount': 0, 'bytes': 0, 'counts': {}})
        ext = pathlib.Path(item['name']).suffix.lower()
        kind = {'.pdf': 'pdf', '.mp3': 'audio', '.doc': 'document', '.ppt': 'slides', '.pptx': 'slides'}[ext]
        file = {'id': 'rts-' + hashlib.sha256(item['path'].encode()).hexdigest()[:24], 'bookId': book_id,
                'name': readable_name(item['name']), 'group': ' / '.join(readable_name(p) for p in parts[1:-1]),
                'kind': kind, 'size': item['size'], 'type': item['mime_type'], 'sha256': item['sha256'], 'key': object_key(item)}
        lesson = re.search(r'第\s*0*(\d+)\s*课', file['name'])
        file['lesson'] = int(lesson[1]) if lesson else None
        if kind == 'audio':
            track = re.search(r'^(?:Track\s*)?0*(\d+)', file['name'], re.I)
            if not track and not lesson:
                track = re.search(r'[-_]0*(\d+)\.mp3$', file['name'], re.I)
            file['track'] = int(track[1]) if track else file['lesson']
            if not lesson and number in (12, 13, 15, 16, 18, 20):
                file['lesson'] = file['track']
        if file['id'] in alignment:
            file.update(alignment[file['id']])
        if file['lesson'] and 'unit' not in file:
            file.update(unit='lesson-' + str(file['lesson']), section='Урок ' + str(file['lesson']))
        preview = previews.get(file['id'])
        if preview:
            file['preview'] = preview
        file['viewSize'] = preview['size'] if preview else (file['size'] if kind in ('pdf', 'audio') else 0)
        files.append(file)
        book['fileCount'] += 1
        book['bytes'] += item['size']
        book['counts'][kind] = book['counts'].get(kind, 0) + 1
    assert len(set(f['id'] for f in files)) == len(files)
    for book_id, book in books.items():
        book['units'] = chapters.get(book_id, {}).get('units', [])
    catalog = {'version': 2, 'collection': 'road-to-success', 'title': 'Путь к успеху · 成功之路',
               'source': source['source'], 'updated': '2026-11-05', 'totalFiles': len(files),
               'sourceTotalFiles': len(source['files']), 'deferredFiles': len(deferred),
               'removedFiles': len(removed),
               'totalBytes': sum(f['size'] for f in files), 'books': sorted(books.values(), key=lambda b: b['number']), 'files': files}
    (ROOT / 'infra/yandex/function/catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, separators=(',', ':')) + '\n')
    public = {k: v for k, v in catalog.items() if k != 'source'}
    public['files'] = [{k: v for k, v in f.items() if k not in ('key', 'sha256', 'preview')} for f in files]
    (ROOT / 'web/data/library-catalog.json').write_text(json.dumps(public, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'{len(books)} books, {len(files)} files, {catalog["totalBytes"]} bytes')


if __name__ == '__main__':
    build()

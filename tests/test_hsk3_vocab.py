import collections
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'web/data/hsk3'
SPEC = importlib.util.spec_from_file_location('build_hsk3_vocab', ROOT / 'scripts/build_hsk3_vocab.py')
BUILD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILD)


class OfficialVocabularyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads((DATA / 'manifest.json').read_text())
        cls.config = json.loads((ROOT / 'hsk3-sources.json').read_text())
        cls.entries = []
        cls.by_level = {}
        for level in cls.manifest['levels']:
            records = []
            for shard in level['files']:
                records.extend(json.loads((DATA / shard['file']).read_text()))
            cls.by_level[level['id']] = records
            cls.entries.extend(records)
        cls.by_number = {entry['number']: entry for entry in cls.entries}

    def test_complete_official_serials_and_level_boundaries(self):
        self.assertEqual([entry['number'] for entry in self.entries], list(range(1, 11001)))
        self.assertEqual(len({entry['id'] for entry in self.entries}), 11000)
        self.assertEqual({key: len(value) for key, value in self.by_level.items()},
                         {'1': 300, '2': 200, '3': 500, '4': 1000, '5': 1600, '6': 1800, '7-9': 5600})
        # First/last entries independently checked against the official PDF tables.
        anchors = {1: '爱', 300: '做饭', 301: '啊', 500: '左边', 501: '阿姨',
                   1000: '做客', 1001: '啊', 2000: '做梦', 2001: '哎', 3600: '作出',
                   3601: '岸', 5400: '罪', 5401: '哀求', 11000: '做主'}
        for number, word in anchors.items():
            self.assertEqual(self.by_number[number]['hz'], word)
        self.assertNotIn('7', self.by_level)
        self.assertNotIn('8', self.by_level)
        self.assertNotIn('9', self.by_level)

    def test_manifest_checksums_and_cumulative_counts(self):
        total = 0
        for level in self.manifest['levels']:
            for shard in level['files']:
                data = (DATA / shard['file']).read_bytes()
                self.assertEqual(hashlib.sha256(data).hexdigest(), shard['sha256'])
                self.assertEqual(len(data), shard['bytes'])
                entries = json.loads(data)
                self.assertEqual(len(entries), shard['count'])
                self.assertEqual(entries[0]['number'], shard['firstNumber'])
                self.assertEqual(entries[-1]['number'], shard['lastNumber'])
            entries = self.by_level[level['id']]
            self.assertTrue(all(entry['level'] == level['id'] for entry in entries))
            total += len(entries)
            self.assertEqual(level['cumulativeCount'], total)
            self.assertEqual(level['firstNumber'], entries[0]['number'])
            self.assertEqual(level['lastNumber'], entries[-1]['number'])
        self.assertEqual(total, self.manifest['totalEntries'])
        self.assertEqual(self.manifest['source']['sha256'], self.config['source']['sha256'])

    def test_shards_are_bounded_and_have_no_obsolete_large_files(self):
        expected_files = set()
        for level in self.manifest['levels']:
            for part, shard in enumerate(level['files'], 1):
                self.assertEqual(shard['file'], f'vocabulary-{level["id"]}-{part:02d}.json')
                self.assertLessEqual(shard['bytes'], 240 * 1024)
                self.assertLessEqual(shard['bytes'], self.config['sharding']['maxBytes'])
                expected_files.add(shard['file'])
        self.assertEqual({path.name for path in DATA.glob('vocabulary-*.json')}, expected_files)
        self.assertEqual(len(expected_files), self.manifest['shards']['count'])

    def test_sharding_counts_multibyte_text_without_splitting_words(self):
        records = [{'id': 'a', 'ru': '漢字русский' * 5}, {'id': 'b', 'ru': '字' * 50}]
        parts = list(BUILD.split_entries(records, 180, 200))
        self.assertEqual(parts, [[records[0]], [records[1]]])
        self.assertTrue(all(len(json.dumps(part, ensure_ascii=False, separators=(',', ':')).encode('utf-8')) + 1 <= 200 for part in parts))
        with self.assertRaisesRegex(ValueError, 'exceeds the maximum'):
            list(BUILD.split_entries([{'id': 'large', 'ru': '字' * 100}], 180, 200))

    def test_official_readings_senses_and_annotations_are_preserved(self):
        self.assertEqual(self.by_number[181]['py'], 'shéi/shuí')
        self.assertEqual(self.by_number[301]['py'], 'a')
        self.assertEqual(self.by_number[1001]['py'], 'ā')
        self.assertEqual(self.by_number[7]['levelLabel'], '1（4）')
        self.assertEqual(self.by_number[7]['additionalLevels'], ['4'])
        self.assertEqual(self.by_number[7]['pos'], '数、（副）')
        self.assertEqual([self.by_number[number]['officialLabel'] for number in (6568, 6569)], ['粉丝1', '粉丝2'])
        self.assertEqual(self.by_number[6568]['hz'], self.by_number[6569]['hz'])
        self.assertNotEqual(self.by_number[6568]['id'], self.by_number[6569]['id'])
        self.assertEqual(sum(entry['officialLabel'] != entry['hz'] for entry in self.entries), 82)
        self.assertTrue(all(1 <= entry['sourcePage'] <= 406 for entry in self.entries))

    def test_every_entry_has_sourced_russian_and_original_chinese(self):
        counts = collections.Counter()
        for entry in self.entries:
            self.assertRegex(entry['hz'], r'[\u3400-\u9fff]')
            self.assertTrue(entry['py'])
            self.assertRegex(entry['ru'], '[а-яёА-ЯЁ]')
            self.assertIn(entry['ruSource'], {'existing-hsk', 'bkrs'})
            self.assertEqual(entry['ruScope'], 'headword')
            self.assertIsInstance(entry['dictionaryId'], int)
            counts[entry['ruSource']] += 1
        self.assertEqual(dict(counts), self.manifest['russian']['sources'])
        self.assertEqual(self.manifest['russian']['matched'], 11000)
        self.assertEqual(self.manifest['russian']['missing'], 0)
        # These differ in tone/sense from the old HSK entry; reusing that gloss is wrong.
        for number in (583, 1020, 2472, 2657):
            self.assertEqual(self.by_number[number]['ruSource'], 'bkrs')
        self.assertTrue(all(entry['ruSource'] == 'bkrs' for entry in self.entries
                            if re.search(r'\d$', entry['officialLabel'])))

    def test_parser_rejects_missing_official_rows(self):
        with self.assertRaisesRegex(ValueError, 'every serial number'):
            BUILD.parse_official_rows(['1  1  爱  ài  动'], self.config)

    def test_import_fails_instead_of_inventing_translation(self):
        class EmptyDictionary:
            def lookup(self, headword):
                return None, None
        entry = {'officialLabel': '爱', 'hz': '爱', 'py': 'ài'}
        with self.assertRaisesRegex(ValueError, 'Missing Russian definitions'):
            BUILD.add_russian([entry], EmptyDictionary(), {})


if __name__ == '__main__':
    unittest.main()

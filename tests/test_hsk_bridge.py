import collections
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / 'web/data/hsk3/legacy-bridge.json'
SPEC = importlib.util.spec_from_file_location('build_hsk_bridge', ROOT / 'scripts/build_hsk_bridge.py')
BUILD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILD)


class UnifiedHSKBridgeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bridge = json.loads(PATH.read_text())
        cls.rows = cls.bridge['rows']
        cls.old = {level: json.loads((ROOT / f'web/data/hsk{level}.json').read_text()) for level in range(1, 7)}
        manifest = json.loads((ROOT / 'web/data/hsk3/manifest.json').read_text())
        official = [word for level in manifest['levels'] for shard in level['files']
                    for word in json.loads((ROOT / 'web/data/hsk3' / shard['file']).read_text())]
        cls.official = {word['number']: word for word in official}
        cls.by_hanzi = {row[0]: row for row in cls.rows}

    def test_every_legacy_word_and_definition_remains_addressable(self):
        self.assertEqual(len(self.rows), 4991)
        self.assertEqual(len(self.by_hanzi), 4991)
        expected = [(level, index) for level in range(1, 7) for index in range(len(self.old[level]))]
        self.assertEqual([(row[1], row[2]) for row in self.rows], expected)
        for hanzi, level, index, kind, candidates in self.rows:
            old_word = self.old[level][index]
            self.assertEqual(old_word[0], hanzi)
            # Preserve source content exactly, including its existing "SMS" gloss.
            # The official vocabulary independently requires Russian coverage.
            self.assertTrue(old_word[2].strip())
            for number in candidates:
                self.assertEqual(self.official[number]['hz'], hanzi)
            self.assertEqual(candidates, sorted(candidates))
            if kind in ('exact', 'senses'):
                self.assertEqual(len(candidates) == 1, kind == 'exact')
                self.assertTrue(all(BUILD.normalized_pinyin(self.official[number]['py']) == BUILD.normalized_pinyin(old_word[1]) for number in candidates))
            elif kind == 'reading':
                self.assertTrue(candidates)
                self.assertTrue(all(BUILD.normalized_pinyin(self.official[number]['py']) != BUILD.normalized_pinyin(old_word[1]) for number in candidates))
            else:
                self.assertEqual(kind, 'extra')
                self.assertFalse(candidates)

    def test_one_course_contains_all_official_and_supplemental_cards(self):
        counts = collections.Counter(row[3] for row in self.rows)
        self.assertEqual(dict(counts), {'exact': 4672, 'senses': 24, 'reading': 106, 'extra': 189})
        supplemental = [row for row in self.rows if row[3] in ('reading', 'extra')]
        self.assertEqual(len(supplemental), 295)
        ids = {f'hsk3-{number:05d}' for number in self.official}
        ids.update(f'hsk3-extra-{row[1]}-{row[2] + 1:04d}' for row in supplemental)
        self.assertEqual(len(ids), 11295)
        self.assertEqual(self.bridge['counts']['total'], 11295)
        self.assertEqual([level['supplementCount'] for level in self.bridge['levels']], [9, 7, 24, 27, 52, 176, 0])
        cumulative = 0
        for level in self.bridge['levels']:
            self.assertEqual(level['totalCount'], level['officialCount'] + level['supplementCount'])
            cumulative += level['totalCount']
            self.assertEqual(level['cumulativeCount'], cumulative)
        self.assertEqual([level['id'] for level in self.bridge['levels']], ['1', '2', '3', '4', '5', '6', '7-9'])

    def test_progress_targets_do_not_spread_mastery_to_different_senses(self):
        for hanzi, _level, _index, kind, candidates in self.rows:
            if kind == 'senses':
                self.assertGreater(len(candidates), 1)
                primary = candidates[0]
                self.assertEqual(primary, min(candidates))
                self.assertEqual(self.official[primary]['hz'], hanzi)
        self.assertEqual(self.by_hanzi['和'][3:], ['senses', [78, 7030]])
        self.assertEqual(self.by_hanzi['喂'][3:], ['senses', [218, 3198]])
        self.assertEqual(self.by_hanzi['盛'][3], 'reading')
        self.assertEqual(self.by_hanzi['谁'][3], 'reading')
        self.assertEqual(self.by_hanzi['北京'][3], 'extra')
        self.assertFalse(self.bridge['policy']['copyMasteryToAllSenses'])
        self.assertFalse(self.bridge['policy']['overwriteExistingProgress'])
        self.assertTrue(self.bridge['policy']['keepOriginalProgressBackup'])

    def test_all_sources_are_pinned_and_output_reproduces_exactly(self):
        for source in self.bridge['oldSourceFiles']:
            data = (ROOT / source['file']).read_bytes()
            self.assertEqual(hashlib.sha256(data).hexdigest(), source['sha256'])
            self.assertEqual(len(json.loads(data)), source['count'])
        official = self.bridge['officialSource']
        self.assertEqual(hashlib.sha256((ROOT / official['file']).read_bytes()).hexdigest(), official['sha256'])
        rebuilt = json.dumps(BUILD.make_bridge(ROOT), ensure_ascii=False, separators=(',', ':')) + '\n'
        self.assertEqual(rebuilt.encode('utf-8'), PATH.read_bytes())
        self.assertLess(PATH.stat().st_size, 200 * 1024)


if __name__ == '__main__':
    unittest.main()

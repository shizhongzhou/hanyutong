import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('builder', Path(__file__).parents[1] / 'scripts/build_dictionary.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

class ImportTests(unittest.TestCase):
    def test_preserves_long_definition_and_examples(self):
        raw = '[m1]1) удобно; подходящий момент[/m][m1][*][ex]你方便吗？ Тебе удобно?[/ex][/*][/m]'
        text, examples = builder.parse_article(raw)
        self.assertEqual(text, '1) удобно; подходящий момент\n你方便吗？ Тебе удобно?')
        self.assertEqual(examples, ['你方便吗？ Тебе удобно?'])

    def test_does_not_delete_literal_square_brackets(self):
        self.assertEqual(builder.plain_dsl('[m1]вид [A] или [редкий][/m]'), 'вид [A] или [редкий]')

    def test_umlaut_and_tones(self):
        for query in ['lǜ', 'lü4', 'lv4', 'lu:4']:
            self.assertEqual(builder.pinyin(query), 'lv')
        self.assertEqual(builder.pinyin('nǐ hǎo'), 'nihao')

    def test_supplementary_han(self):
        self.assertIsNotNone(builder.HAN.fullmatch('𠀀'))

if __name__ == '__main__':
    unittest.main()

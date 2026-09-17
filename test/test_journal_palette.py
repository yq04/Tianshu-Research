import unittest
import sys
from pathlib import Path

# Add figure directory to sys.path
figure_dir = Path(__file__).resolve().parent.parent / 'figure'
sys.path.insert(0, str(figure_dir))

from journal_palette import journal_palette, hex_colors, get_palette

class TestJournalPalette(unittest.TestCase):
    def test_accent_id_1(self):
        hexes = hex_colors(1)
        self.assertEqual(len(hexes), 8)
        self.assertEqual(hexes[0], '#7FC97F')
        self.assertEqual(hexes[5], '#F0027F')

    def test_roles_and_aliases(self):
        cb = hex_colors('colorblind')
        self.assertEqual(len(cb), 8)
        self.assertEqual(cb[0], '#E69F00')

        viridis = hex_colors('viridis')
        self.assertEqual(len(viridis), 11)

    def test_rgb_float_values(self):
        rgb = journal_palette(1)
        self.assertEqual(len(rgb), 8)
        for r, g, b in rgb:
            self.assertTrue(0.0 <= r <= 1.0)
            self.assertTrue(0.0 <= g <= 1.0)
            self.assertTrue(0.0 <= b <= 1.0)

    def test_alias_get_palette(self):
        self.assertEqual(get_palette(1), journal_palette(1))

    def test_map_interpolation(self):
        mapped = journal_palette(66, map_n=32)
        self.assertEqual(len(mapped), 32)

    def test_type_and_range_validation(self):
        with self.assertRaises(TypeError):
            journal_palette(True)
        with self.assertRaises(TypeError):
            journal_palette(1, map_n=True)
        with self.assertRaises(TypeError):
            journal_palette(1.5)
        with self.assertRaises(TypeError):
            journal_palette(1, map_n=32.5)
        with self.assertRaises(ValueError):
            journal_palette(0)
        with self.assertRaises(ValueError):
            journal_palette(101)
        with self.assertRaises(ValueError):
            journal_palette(1, map_n=1)
        with self.assertRaises(ValueError):
            journal_palette(1, map_n=300)

if __name__ == '__main__':
    unittest.main()

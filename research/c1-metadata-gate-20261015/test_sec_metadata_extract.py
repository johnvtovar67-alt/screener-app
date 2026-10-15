import tempfile
import unittest
from pathlib import Path
import sec_metadata_extract as parser

class SourceBoundaryTests(unittest.TestCase):
    def test_overlapping_views_cannot_hide_source_conflict(self):
        with self.assertRaisesRegex(ValueError, 'Conflicting'):
            parser.collect_lines(['L0: Common Stocks', 'L0: Different stock'])

    def test_missing_viewport_fails(self):
        with self.assertRaisesRegex(ValueError, 'Incomplete'):
            parser.collect_lines(['L0: start\nL2: end'])

    def test_identical_overlap_is_safe(self):
        self.assertEqual(parser.collect_lines(['L0: start\nL1: end', 'L1: end']), {0:'start',1:'end'})

    def test_cash_and_collateral_are_excluded_and_classes_remain_separate(self):
        source = ['THE TECHNOLOGY SELECT SECTOR SPDR FUND', 'COMMON STOCKS']
        expected = ['Issuer Class A', 'Issuer Class C'] + [f'Issuer_{n}' for n in range(501)]
        for name in expected:
            source.extend([name, '', '* * *', '', ' | 1 | $2'])
        source.extend(['TOTAL COMMON STOCKS','SHORT-TERM INVESTMENTS',
          'Cash Collateral Fund', '', '* * *', '', ' | 1 | $2'])
        rows = parser.extract(dict(enumerate(source)), True)
        self.assertEqual([r['name'] for r in rows], expected)
        self.assertNotIn('Cash Collateral Fund', {r['name'] for r in rows})
        self.assertEqual(rows[0]['gics_sector'], 'Information Technology')

    def test_duplicate_security_fails_even_if_row_count_looks_complete(self):
        source=['Common Stocks  | Shares  | Value']
        for n in range(503):
            source.extend(['Duplicate Issuer', '* * *', ' | 1 | 2'])
        source.append('Total Common Stocks')
        with self.assertRaisesRegex(ValueError, 'Duplicate equity'):
            parser.extract(dict(enumerate(source)), False)

if __name__ == '__main__':
    unittest.main()

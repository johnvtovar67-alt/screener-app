"""Synthetic structural validation; no network or licensed fixtures."""
import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('c1_acquire',Path(__file__).with_name('acquire.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class AcquisitionTests(unittest.TestCase):
    def test_calendar_known_closures_and_annual_counts(self):
        ds=m.sessions()
        self.assertEqual([sum(d.startswith(str(y)) for d in ds) for y in range(2019,2025)],[252,253,252,251,250,252])
        for d in ['2020-04-10','2022-06-20','2024-07-04','2024-11-28']:
            self.assertNotIn(d,ds)
        self.assertIn('2021-12-31',ds)
    def test_adjusted_schema_is_required_and_raw_is_not_substituted(self):
        good=dict(symbol='TEST',date='2020-01-02',adjOpen=100,adjHigh=101,adjLow=99,adjClose=100,volume=10)
        self.assertEqual(m.normalize([good],'TEST')[0]['close'],100)
        for bad in [dict(good,symbol='OTHER'),dict(good,adjLow=102),dict(good,adjClose=float('nan'))]:
            with self.assertRaises(m.DataFailure):m.normalize([bad],'TEST')
        with self.assertRaises(m.DataFailure):m.normalize([good,good],'TEST')
        with self.assertRaises(m.DataFailure):m.normalize([dict(symbol='TEST',date='2020-01-02',open=100,high=101,low=99,close=100,volume=10)],'TEST')
if __name__=='__main__':unittest.main()

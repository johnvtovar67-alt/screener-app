import math
import unittest
import common

def series(n=400):
    rows=[];p=100
    for i in range(n):
        p*=1+(.003 if i%2 else -.002)
        rows.append(dict(date='synthetic',open=p,high=p*1.01,low=p*.99,close=p))
    return rows

class CausalTests(unittest.TestCase):
    def test_shock_cannot_inflate_its_own_denominator(self):
        rows=series();old=common.sigma(rows,100)
        for j in range(96,101):rows[j]['close']*=.5
        self.assertEqual(common.sigma(rows,100),old)
        self.assertTrue(common.signal(rows,100)['V'])
    def test_future_mutation_does_not_change_signal(self):
        rows=series();before=common.signal(rows,100)
        for row in rows[101:]:row['close']*=.001
        self.assertEqual(common.signal(rows,100),before)
    def test_missing_or_zero_sigma_unavailable(self):
        rows=[dict(open=100,high=100,low=100,close=100) for _ in range(50)]
        self.assertIsNone(common.signal(rows,30)['V'])
        self.assertFalse(common.signal(rows,30)['H'])
        rows[10]=None
        self.assertIsNone(common.sigma(rows,30))
    def test_forward_next_open_and_period_censor(self):
        rows=series();rows[101]['open']=200
        self.assertAlmostEqual(common.forward(rows,100,399)['f5'],common.pct(rows[106]['close'],200))
        self.assertIsNone(common.forward(rows,100,110)['f21'])
    def test_no_compressed_missing_window(self):
        rows=series();rows[103]=None
        self.assertIsNone(common.forward(rows,100,399)['f5'])
        self.assertEqual(common.forward(rows,100,399)['f5_status'],'censored_missing')

if __name__=='__main__':unittest.main()

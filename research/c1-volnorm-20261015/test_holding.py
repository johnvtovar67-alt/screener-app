"""Synthetic tests: no market inputs or network required."""
import copy
import datetime
import math
import unittest

from common import signal
from holding import build_holdings


def fixture(length=180):
    start = datetime.date(2020, 1, 1)
    dates = [(start + datetime.timedelta(days=i)).isoformat() for i in range(length)]
    rows = [{"date": day, "open": 100.0, "high": 101.0, "low": 99.0,
             "close": 100.0, "volume": 1000} for day in dates]
    features = [{"H": False, "V": False, "context": True,
                 "regime": "test", "risk_group": "high", "sigma": 1.0,
                 "r5": 0.0, "z": 0.0, "slow": 1.0, "fast": 1.0} for _ in dates]
    period = {"name": "synthetic", "start": dates[0], "end": dates[0], "outcome_end": dates[-1]}
    return rows, features, dates, period


class HoldingTests(unittest.TestCase):
    def build(self, rows, features, dates, period):
        return build_holdings("TEST", rows, features, dates, period, "test-sector")[0]

    def test_next_open_execution_and_paired_nontrigger_zero(self):
        rows, features, dates, period = fixture()
        quiet = self.build(rows, features, dates, period)
        self.assertTrue(quiet["complete"])
        self.assertFalse(quiet["H_trigger"])
        self.assertFalse(quiet["V_trigger"])
        self.assertEqual(quiet["delta_vh"], 0)
        self.assertEqual(quiet["delta_h_ref"], 0)
        self.assertEqual(quiet["delta_v_ref"], 0)
        features[5]["H"] = True
        features[7]["V"] = True
        rows[5]["close"] = 70.0
        rows[6]["open"] = 90.0
        rows[8]["open"] = 80.0
        lot = self.build(rows, features, dates, period)
        self.assertEqual((lot["H_age"], lot["V_age"]), (5, 7))
        self.assertEqual(lot["matched_timing"], 2)
        self.assertAlmostEqual(lot["return_h"], -10.108)
        self.assertAlmostEqual(lot["return_v"], -20.096)
        self.assertAlmostEqual(lot["delta_vh"], -9.988)

    def test_unavailable_sigma_censors_instead_of_no_v_signal(self):
        rows, features, dates, period = fixture()
        features[20]["V"] = None
        lot = self.build(rows, features, dates, period)
        self.assertFalse(lot["complete"])
        self.assertEqual(lot["status"], "censored_signal_inputs")
        self.assertIsNone(lot["V_trigger"])
        self.assertIsNone(lot["delta_vh"])

    def test_future_peak_cannot_change_signal_giveback(self):
        rows, features, dates, period = fixture()
        rows[2]["close"] = 125.0
        rows[5]["close"] = 110.0
        features[5]["H"] = features[5]["V"] = True
        before = self.build(rows, features, dates, period)
        rows[30]["close"] = 10000.0
        after = self.build(rows, features, dates, period)
        self.assertAlmostEqual(before["H_giveback_pp"], 15.0)
        self.assertAlmostEqual(before["H_giveback_fraction"], 0.6)
        self.assertEqual(before["H_giveback_pp"], after["H_giveback_pp"])
        self.assertEqual(before["V_age"], after["V_age"])

    def test_missing_full_path_or_terminal_is_censored(self):
        rows, features, dates, period = fixture()
        rows[40] = None
        lot = self.build(rows, features, dates, period)
        self.assertEqual(lot["status"], "censored_path")
        self.assertIsNone(lot["return_ref"])
        rows, features, dates, period = fixture()
        period["outcome_end"] = dates[62]
        self.assertEqual(self.build(rows, features, dates, period)["status"], "censored_terminal")

    def test_first_valid_breach_only_and_age_boundaries(self):
        rows, features, dates, period = fixture()
        features[4]["H"] = True  # below minimum holding age
        features[6]["H"] = True
        features[8]["H"] = True
        features[62]["V"] = True
        lot = self.build(rows, features, dates, period)
        self.assertEqual((lot["H_age"], lot["V_age"]), (6, 62))
        self.assertEqual(lot["V_execution_age"], 63)

    def test_signal_sigma_and_predicate_ignore_future_rows(self):
        rows, features, dates, period = fixture()
        for i, row in enumerate(rows):
            row["close"] = 100.0 * (1.0 + 0.002 * math.sin(i))
        rows[35]["close"] = 85.0
        before = signal(rows, 35)
        changed = copy.deepcopy(rows)
        for i in range(36, len(changed)):
            changed[i]["close"] = 10000.0 + i
        after = signal(changed, 35)
        self.assertEqual(before, after)
        self.assertIsNotNone(before["sigma"])
        self.assertTrue(before["V"])

    def test_open_entry_context_uses_prior_close_not_entry_close(self):
        rows, features, dates, period = fixture()
        # April1 is the first second-quarter session in this synthetic calendar.
        entry = dates.index("2020-04-01")
        period["start"] = period["end"] = dates[entry]
        features[entry - 1]["context"] = False
        features[entry]["context"] = True
        lot = self.build(rows, features, dates, period)
        self.assertFalse(lot["context"])
        self.assertFalse(lot["entry_context"])
        features[entry]["context"] = None
        self.assertFalse(self.build(rows, features, dates, period)["entry_context"])


if __name__ == "__main__":
    unittest.main()

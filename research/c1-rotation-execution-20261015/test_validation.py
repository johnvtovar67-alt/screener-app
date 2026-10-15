"""Synthetic-only tests: endpoint units, action timing, and missingness."""
import tempfile
import unittest
from pathlib import Path

import validation as v


def row(date="2025-01-02", prefix="adj", symbol="TEST", price=100, volume=1000):
    return {"symbol": symbol, "date": date,
            **{(prefix + key.title() if prefix else key): price + offset
               for key, offset in (("open", 0), ("high", 2), ("low", -2), ("close", 1))},
            "volume": volume}


def bar(close, volume=1000):
    return {"open": close, "high": close, "low": close, "close": close, "volume": volume}


class ValidationTests(unittest.TestCase):
    def test_calendar_warmup_and_special_closure(self):
        dates = v.sessions()
        self.assertEqual(len(dates), 316)
        self.assertEqual(sum(d < "2025-01-02" for d in dates), 253)
        self.assertEqual(len(v.sessions("2025-01-02", "2025-04-03")), 63)
        self.assertNotIn("2025-01-09", dates)

    def test_endpoint_not_adj_prefix_determines_unit(self):
        nominal = v.normalize([row()], "TEST", "historical-price-eod/non-split-adjusted")
        self.assertEqual(nominal["2025-01-02"]["close"], 101)
        with self.assertRaises(v.ValidationFailure):
            v.normalize([row()], "TEST", "historical-price-eod/full")
        full = v.normalize([row(prefix="")], "TEST", "historical-price-eod/full")
        self.assertEqual(full, nominal)

    def test_reject_duplicate_wrong_symbol_geometry_and_nonfinite(self):
        good = row()
        for rows in ([good, good], [row(symbol="OTHER")], [dict(good, adjLow=102)], [dict(good, volume=float("nan"))]):
            with self.assertRaises(v.ValidationFailure):
                v.normalize(rows, "TEST", "historical-price-eod/dividend-adjusted")

    def test_missing_internal_date_is_not_imputed(self):
        bars = v.normalize([row("2025-01-02"), row("2025-01-06")], "TEST", "historical-price-eod/dividend-adjusted", "2025-01-02", "2025-01-06")
        report = v.coverage(bars, "2025-01-02", "2025-01-06")
        self.assertFalse(report["calendar_complete"])
        self.assertEqual(report["internal_missing"], ["2025-01-03"])

    def test_future_split_does_not_change_nominal_held_shares_during_window(self):
        actions = [{"symbol": "TEST", "date": "2025-06-10", "numerator": 15, "denominator": 1}]
        self.assertEqual(v.split_factor("2025-01-02", actions, "TEST"), 15)
        self.assertEqual(v.split_factor("2025-06-10", actions, "TEST"), 1)
        # The future action explains current-vintage prices; it is not an
        # in-window cash/share event in a nominal portfolio ledger.
        nominal = {"2025-01-02": bar(1500, 100)}
        full = {"2025-01-02": bar(100, 1500)}
        adjusted = {"2025-01-02": bar(90, 1500)}
        report = v.compare_price_views(full, nominal, adjusted, actions, "TEST")
        self.assertTrue(report["split_action_ratio_within_0_3pct"])
        self.assertEqual(report["volume_relationship"], "full_volume_equals_nominal_times_split_factor")
        self.assertEqual(report["dividend_adjusted_vs_full_volume_mismatches"], 0)
        self.assertEqual(report["asof_current_bar_volume_vs_nominal_mismatches_at_1e_5"], 0)

    def test_ex_date_split_already_in_new_unit(self):
        actions = [{"symbol": "TEST", "date": "2024-06-10", "numerator": 10, "denominator": 1}]
        self.assertEqual(v.split_factor("2024-06-07", actions, "TEST"), 10)
        self.assertEqual(v.split_factor("2024-06-10", actions, "TEST"), 1)

    def test_announced_future_split_not_applied_to_current_vintage(self):
        actions = [{"symbol": "TEST", "date": "2026-11-10", "numerator": 2, "denominator": 1}]
        self.assertEqual(v.split_factor("2025-01-02", actions, "TEST", "2026-10-15"), 1)

    def test_volume_relation_must_be_measured(self):
        f = {"2025-01-02": bar(100, 1000)}
        n = {"2025-01-02": bar(200, 1000)}
        a = {"2025-01-02": bar(90, 1000)}
        self.assertEqual(v.compare_price_views(f, n, a)["volume_relationship"], "identical_between_full_and_nominal")
        n["2025-01-02"]["volume"] = 333
        self.assertEqual(v.compare_price_views(f, n, a)["volume_relationship"], "unresolved_or_mixed")
        a["2025-01-02"]["volume"] = 999
        report = v.compare_price_views(f, n, a)
        self.assertEqual(report["dividend_adjusted_vs_full_volume_mismatches"], 1)
        self.assertEqual(report["asof_current_bar_volume_vs_nominal_mismatches_at_1e_5"], 1)

    def test_dividend_ex_date_not_payment_or_declaration_date(self):
        full = {"2025-01-02": bar(100), "2025-01-03": bar(99)}
        adjusted = {"2025-01-02": bar(99), "2025-01-03": bar(99)}
        rows = [{"symbol": "TEST", "date": "2025-01-03", "paymentDate": "2025-01-10", "declarationDate": "2024-12-10", "adjDividend": 1}]
        report = v.dividend_consistency(full, adjusted, rows, "TEST")
        self.assertEqual(report["events_tested"], 1)
        self.assertTrue(report["all_tested_factors_within_5bps"])
        self.assertEqual(report["events"][0]["date"], "2025-01-03")

    def test_cash_return_and_backward_adjustment_are_not_forced_equal(self):
        full = {"2025-01-02": bar(100), "2025-01-03": bar(101)}
        adjusted = {"2025-01-02": bar(99), "2025-01-03": bar(101)}
        report = v.dividend_consistency(full, adjusted, [{"symbol": "TEST", "date": "2025-01-03", "adjDividend": 1}], "TEST")
        self.assertAlmostEqual(report["events"][0]["factor_residual"], 0)
        self.assertNotEqual(report["events"][0]["adjusted_return_minus_cash_return"], 0)

    def test_private_writer_does_not_overwrite(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "result.json"
            v.write_private(path, {"synthetic": True})
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(FileExistsError):
                v.write_private(path, {})

    def test_universe_action_subset_does_not_generalize_worldwide_gaps(self):
        rows = [{"symbol": "A", "date": "2025-03-12", "paymentDate": "2025-03-20", "declarationDate": "2025-02-01", "recordDate": ""},
                {"symbol": "FOREIGN", "date": "2025-03-12", "paymentDate": "", "declarationDate": "", "recordDate": ""}]
        result = v.universe_action_subset(rows, [{"symbol": "A"}, {"symbol": "B"}])
        self.assertEqual(result["matching_rows"], 1)
        self.assertEqual(result["missing_dates"]["paymentDate"], 0)
        self.assertEqual(result["missing_dates"]["recordDate"], 1)
        self.assertTrue(result["limited_to_acquired_calendar_window"])


if __name__ == "__main__":
    unittest.main()

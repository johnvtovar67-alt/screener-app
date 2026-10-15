"""Synthetic causal/timing tests only; no licensed market data or I/O."""
import copy
import importlib.util
import math
import unittest
import json
from datetime import date, timedelta
from pathlib import Path

spec = importlib.util.spec_from_file_location("c1_fresh_analyze", Path(__file__).with_name("analyze.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def bar(close=100.0, opening=None):
    opening = close if opening is None else opening
    return {"open": opening, "high": max(opening, close), "low": min(opening, close), "close": close}


class AnalyzerTests(unittest.TestCase):
    def test_skip_windows_exclude_latest_observations(self):
        rows = [bar(100 + i) for i in range(150)]
        original_slow = module._factor(rows, 140, 100, 20)
        original_fast = module._factor(rows, 140, 55, 5)
        rows[140] = bar(10)
        self.assertEqual(module._factor(rows, 140, 100, 20), original_slow)
        self.assertEqual(module._factor(rows, 140, 55, 5), original_fast)
        self.assertLess(module._factor(rows, 140, 100, 0), 0)
        self.assertLess(module._factor(rows, 140, 55, 0), 0)

    def test_H_uses_completed_close_then_next_open(self):
        rows = [bar() for _ in range(230)]
        entry = 120
        rows[entry + 5] = bar(92)
        rows[entry + 6] = bar(91, 87)
        result = module._lot(rows, entry, "H", len(rows) - 1)
        self.assertTrue(result["triggered"])
        self.assertEqual(result["signal_age_sessions"], 5)
        self.assertEqual(result["execution_age_sessions"], 6)
        self.assertAlmostEqual(result["net_exit_return_pct"], (87 * .9988 / 100 - 1) * 100)
        changed_future = copy.deepcopy(rows)
        for i in range(entry + 7, len(rows)):
            changed_future[i] = bar(500)
        changed = module._lot(changed_future, entry, "H", len(rows) - 1)
        self.assertEqual(result["signal_age_sessions"], changed["signal_age_sessions"])
        self.assertEqual(result["net_exit_return_pct"], changed["net_exit_return_pct"])
        self.assertNotEqual(result["forward21_return_pct"], changed["forward21_return_pct"])

    def test_P_latches_before_age5_and_exits_below_basis(self):
        rows = [bar() for _ in range(230)]
        entry = 120
        rows[entry + 1] = bar(113)
        rows[entry + 2] = bar(112)
        rows[entry + 3] = bar(111)
        rows[entry + 4] = bar(110)
        rows[entry + 5] = bar(99)
        result = module._lot(rows, entry, "P", len(rows) - 1)
        self.assertTrue(result["triggered"])
        self.assertEqual(result["signal_age_sessions"], 5)
        self.assertLess(result["signal_gain_pct"], 0)
        self.assertAlmostEqual(result["signal_giveback_pp"], 14)

    def test_P_uses_close_peak_not_intraday_high(self):
        rows = [bar() for _ in range(230)]
        entry = 120
        rows[entry + 1]["high"] = 150
        rows[entry + 5] = bar(95)
        result = module._lot(rows, entry, "P", len(rows) - 1)
        self.assertFalse(result["triggered"])

    def test_P_triggers_at_zero_current_gain(self):
        rows = [bar() for _ in range(230)]
        entry = 120
        for age in range(1, 5):
            rows[entry + age] = bar(113)
        result = module._lot(rows, entry, "P", len(rows) - 1)
        self.assertTrue(result["triggered"])
        self.assertEqual(result["signal_age_sessions"], 5)
        self.assertEqual(result["signal_gain_pct"], 0)

    def test_no_same_close_sale_at_reference_terminal(self):
        rows = [bar() for _ in range(230)]
        entry = 120
        rows[entry + 63] = bar(80)
        result = module._lot(rows, entry, "H", len(rows) - 1)
        self.assertFalse(result["triggered"])

    def test_missing_session_is_not_compressed_or_imputed(self):
        rows = [bar(100 + i) for i in range(230)]
        rows[55] = None
        self.assertIsNone(module._factor(rows, 120, 100, 20))
        response = module._response(rows, 120, 100, 20, len(rows) - 1)
        self.assertEqual(response["status"], "censored_missing")
        self.assertNotIn("latency_sessions", response)

    def test_future_horizons_censored_and_proxies_separate(self):
        rows = [bar() for _ in range(190)]
        entry = 120
        rows[entry + 5] = bar(92)
        rows[entry + 6] = bar(93, 90)
        result = module._lot(rows, entry, "H", len(rows) - 1)
        self.assertEqual(result["forward63_status"], "observed")
        self.assertTrue(result["recovered_preexit_peak_within21"])
        self.assertTrue(result["positive_forward21"])
        rows = rows[:-1]
        result = module._lot(rows, entry, "H", len(rows) - 1)
        self.assertEqual(result["forward63_status"], "censored_end")
        self.assertNotIn("forward63_return_pct", result)

    def test_positive_factor_nonresponse_is_not_zero_latency(self):
        rows = [bar(100 + i) for i in range(230)]
        result = module._response(rows, 120, 100, 20, len(rows) - 1)
        self.assertEqual(result["status"], "no_response_within63")
        self.assertNotIn("latency_sessions", result)

    def test_response_zero_is_allowed_when_already_nonpositive(self):
        rows = [bar(400 - i) for i in range(230)]
        result = module._response(rows, 120, 100, 20, len(rows) - 1)
        self.assertEqual(result["latency_sessions"], 0)
        self.assertTrue(result["already_nonpositive"])

    def test_factor_response_forward_uses_next_open_and_censors(self):
        rows = [bar(400 - i) for i in range(190)]
        rows[121] = bar(279, 250)
        response = module._response(rows, 120, 100, 20, len(rows) - 1)
        self.assertEqual(response["latency_sessions"], 0)
        self.assertAlmostEqual(response["forward5_return_pct"], (rows[126]["close"] / 250 - 1) * 100)
        self.assertEqual(response["forward63_status"], "observed")
        shortened = module._response(rows[:180], 120, 100, 20, 179)
        self.assertEqual(shortened["forward63_status"], "censored_end")

    def test_all_complete_schedule_retains_reference_when_no_trigger(self):
        rows = [bar() for _ in range(230)]
        no_trigger = module._lot(rows, 120, "H", len(rows) - 1)
        triggered_rows = copy.deepcopy(rows)
        triggered_rows[125] = bar(92)
        trigger = module._lot(triggered_rows, 120, "H", len(rows) - 1)
        aggregate = module._lot_aggregate([no_trigger, trigger])
        all_lots = aggregate["all_complete_lots_same_fixed_entry_schedule"]
        self.assertEqual(all_lots["lots"], 2)
        self.assertEqual(all_lots["difference_in_net_adjusted_return_pp"]["n"], 2)
        self.assertAlmostEqual(all_lots["difference_in_adjusted_sale_proxy_pct"]["mean"], trigger["exit_vs_reference_proceeds_pct"] / 2)

    def test_full_aggregate_pipeline_and_prior_year_volatility(self):
        # Weekday-only synthetic calendar; not an exchange calendar assertion.
        days = []
        current = date(2019, 1, 1)
        while current <= date(2024, 12, 31):
            if current.weekday() < 5:
                days.append(current.isoformat())
            current += timedelta(days=1)
        data = {}
        for symbol_index, symbol in enumerate(("SPY",) + module.SECURITIES):
            data[symbol] = []
            price = 100.0
            for i, day in enumerate(days):
                price *= 1 + .0002 + .0002 * (symbol_index + 1) * math.sin(i)
                data[symbol].append({"date": day, **bar(price)})
        result = module.analyze(data)
        self.assertEqual(result["coverage"]["scheduled_quarters"], 19)
        lots = result["quarterly_fixed_entry_lots"]["all"]
        self.assertEqual(lots["H"]["scheduled_lots"], 152)
        self.assertEqual(lots["H"]["complete_lots"], lots["P"]["complete_lots"])
        self.assertEqual(result["paired_raw_factor_observations"]["all"]["paired_symbol_dates"], result["coverage"]["balanced_factor_dates"] * 8)
        serialized = json.dumps(result, allow_nan=False)
        self.assertNotIn('"open":', serialized)
        self.assertNotIn('"close":', serialized)
        self.assertNotIn('"date":', serialized)
        future = copy.deepcopy(data)
        for symbol in module.SECURITIES:
            for b in future[symbol]:
                if b["date"] >= "2020-01-01":
                    b.update(bar(b["close"] * 2))
        altered = module.analyze(future)
        self.assertEqual(result["volatility_strata"], altered["volatility_strata"])
        sentinel = module.analyze({s: data[s] for s in ("SPY", "NVDA", "PG")}, securities=("NVDA", "PG"))
        self.assertEqual(sentinel["securities"], ["NVDA", "PG"])
        self.assertEqual(sentinel["default_design_securities"], list(module.SECURITIES))
        self.assertEqual(sentinel["quarterly_fixed_entry_lots"]["all"]["H"]["scheduled_lots"], 38)
        self.assertEqual(sentinel["paired_raw_factor_observations"]["all"]["paired_symbol_dates"], sentinel["coverage"]["balanced_factor_dates"] * 2)
        self.assertEqual(set(sentinel["volatility_strata"]["security_classification"]), {"NVDA", "PG"})
        self.assertEqual(module.SECURITIES, ("AAPL", "MSFT", "NVDA", "TSLA", "JPM", "XOM", "PG", "JNJ"))

    def test_subset_must_remain_inside_original_design(self):
        for subset in ((), ("NVDA", "NVDA"), ("SPY",), ("DELL",)):
            with self.assertRaises(ValueError):
                module.analyze({}, securities=subset)


if __name__ == "__main__":
    unittest.main()

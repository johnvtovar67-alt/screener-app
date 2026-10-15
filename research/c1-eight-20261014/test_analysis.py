"""Synthetic-only verification; no network, licensed inputs or data persistence."""
import copy
import importlib.util
import json
import math
import statistics
import unittest
from datetime import date, timedelta
from pathlib import Path

spec = importlib.util.spec_from_file_location("c1_eight_analysis", Path(__file__).with_name("analysis.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def bar(close=100.0, opening=None):
    opening = close if opening is None else opening
    return {"open": opening, "close": close, "high": max(close, opening), "low": min(close, opening)}


def series(n=400):
    price = 100.0
    result = []
    for i in range(n):
        price *= 1 + .004 * math.sin(i / 2) + .0002
        result.append(bar(price))
    return result


def panel():
    # Weekday-only calendar is synthetic, never an NYSE calendar assertion.
    days, day = [], date(2019, 1, 1)
    while day <= date(2024, 12, 31):
        if day.weekday() < 5:
            days.append(day.isoformat())
        day += timedelta(days=1)
    result = {}
    for j, symbol in enumerate(("SPY",) + module.SECURITIES):
        price = 100.0
        bars = []
        for i, day in enumerate(days):
            change = .0004 + (.002 + j * .001) * math.sin(i / 4)
            # Prespecified artificial shocks create both responsive and
            # unmatched factor cases and several independent quarterly lots.
            if j and i > 260 and i % (70 + j) == 0:
                change -= .10
            price *= 1 + change
            bars.append({"date": day, **bar(price)})
        result[symbol] = bars
    return result


class AnalyzerTests(unittest.TestCase):
    def test_sigma_exact_return_count_and_five_session_lag(self):
        rows = series()
        expected = statistics.stdev(module.base._pct(rows[i]["close"], rows[i - 1]["close"]) for i in range(96, 116))
        sigma = module._sigma(rows, 120)
        self.assertAlmostEqual(sigma, expected)
        changed = copy.deepcopy(rows)
        for i in range(116, len(rows)):
            changed[i] = bar(10000 + i)
        self.assertEqual(sigma, module._sigma(changed, 120))
        changed[115] = bar(777)
        self.assertNotEqual(sigma, module._sigma(changed, 120))

    def test_zero_and_missing_sigma_retain_raw_outcomes(self):
        rows = [bar() for _ in range(300)]
        self.assertIsNone(module._sigma(rows, 120))
        rows[100] = None
        self.assertIsNone(module._sigma(rows, 120))
        forward = module._normal_forward({"forward21_status": "observed", "forward21_return_pct": 3}, None)
        self.assertEqual(forward["forward21_return_pct"], 3)
        self.assertNotIn("forward21_risk_normalized", forward)

    def test_normalization_has_no_clipping_and_uses_known_sigma(self):
        outcome = {"forward21_status": "observed", "forward21_return_pct": 500.0}
        module._normal_forward(outcome, .1)
        self.assertAlmostEqual(outcome["forward21_risk_normalized"], 500 / (.1 * math.sqrt(21)))

    def test_regime_features_are_strictly_prior(self):
        rows = series()
        original = module._regime(rows, 150, .25)
        changed = copy.deepcopy(rows)
        for i in range(150, len(rows)):
            changed[i] = bar(9999 + i)
        self.assertEqual(original, module._regime(changed, 150, .25))
        # Date 149 is allowed; make its prior-return sign negative.
        changed[149] = bar(1)
        self.assertTrue(module._regime(changed, 150, .25).startswith("negative63"))

    def test_onset_forward_and_risk_use_next_open(self):
        rows = series()
        onset = 140
        rows[onset] = bar(90)
        rows[onset + 1] = bar(95, 80)
        event = module._event(rows, onset, len(rows) - 1)
        expected = module.base._pct(rows[onset + 22]["close"], 80)
        self.assertAlmostEqual(event["onset_forward"]["forward21_return_pct"], expected)
        self.assertAlmostEqual(event["onset_forward"]["forward21_risk_normalized"], expected / (module._sigma(rows, onset) * math.sqrt(21)))

    def test_base_trigger_decisions_and_timing_are_unchanged(self):
        rows = series()
        for i in range(126, 180):
            rows[i] = bar(80)
        event = module._event(rows, 130, len(rows) - 1)
        for name, window in module.base.FACTORS.items():
            preserved = module.base._response(rows, 130, *window, len(rows) - 1)
            for key, value in preserved.items():
                self.assertEqual(event["factors"][name][key], value)
        # We invoke, rather than copy or reimplement, the preserved lot function.
        self.assertEqual(module.base.COST, .0012)
        self.assertEqual(module.base.FACTORS, {
            "champion_slow": (100, 20), "champion_fast": (55, 5),
            "F_slow": (100, 0), "F_fast": (55, 0)})

    def test_joint_status_and_restricted_latency_include_unmatched(self):
        def response(status, latency=None):
            result = {"status": status, "already_nonpositive": False}
            if latency is not None:
                result["latency_sessions"] = latency
                for h in (5, 21, 63):
                    result[f"forward{h}_status"] = "censored_end"
            return result
        events = []
        for c, f in ((response("responded", 20), response("responded", 2)),
                     (response("no_response_within63"), response("responded", 3)),
                     (response("responded", 4), response("no_response_within63")),
                     (response("no_response_within63"), response("no_response_within63"))):
            events.append({"onset_return5_pct": -8, "onset_shock_risk_normalized": -2,
                           "onset_forward": {}, "factors": {"champion_slow": c, "F_slow": f, "champion_fast": c, "F_fast": f}})
        aggregate = module._events_aggregate(events)
        pair = aggregate["pairs"]["slow"]
        self.assertEqual(pair["both_responded"], 1)
        self.assertEqual(pair["F_only_responded"], 1)
        self.assertEqual(pair["champion_only_responded"], 1)
        self.assertEqual(pair["neither_responded"], 1)
        self.assertEqual(pair["both_observed63"], 4)
        self.assertEqual(pair["matched_F_minus_champion_latency"]["mean"], -18)
        self.assertEqual(pair["all_observed_F_minus_champion_restricted_latency"]["mean"], (-18 - 60 + 59) / 4)
        self.assertEqual(aggregate["factors"]["F_slow"]["restricted_latency_nonresponse_imputed63"], 2)

    def test_bootstrap_constant_metric_and_common_draw_reproducibility(self):
        quarters = [f"2020Q{q}" for q in (1, 2, 3, 4)]
        draws = module._bootstrap_draws(quarters, 100)
        self.assertEqual(draws, module._bootstrap_draws(quarters, 100))
        self.assertTrue(all(sum(weights) == 4 for weights in draws))
        metric = module._bootstrap_metric([(q, 7.0) for q in quarters], quarters, draws)
        self.assertEqual(metric["ci95_percentile"], [7.0, 7.0])
        self.assertEqual(metric["valid_replicates"], 100)
        self.assertTrue(metric["low_coverage"])

    def test_censored_response_not_imputed_to_nonresponse(self):
        rows = series(160)
        event = module._event(rows, 140, len(rows) - 1)
        for name in module.base.FACTORS:
            event["factors"][name] = {"status": "censored_end", "already_nonpositive": False}
        aggregate = module._events_aggregate([event])
        self.assertEqual(aggregate["pairs"]["fast"]["both_observed63"], 0)
        self.assertEqual(aggregate["factors"]["F_fast"]["restricted_latency63_sessions"]["n"], 0)

    @classmethod
    def setUpClass(cls):
        cls.data = panel()
        # CI mathematics is separately verified; keep this full-panel structural
        # and parity test quick without substituting licensed data.
        cls.result = module.analyze(cls.data, bootstrap_replicates=20)
        cls.preserved = module.base.analyze(cls.data)

    def test_full_eight_counts_and_base_parity(self):
        result, preserved = self.result, self.preserved
        self.assertTrue(result["full_eight_security_panel"])
        self.assertEqual(result["securities"], list(module.SECURITIES))
        self.assertEqual(result["coverage"]["scheduled_quarters"], 19)
        self.assertEqual(result["overall"]["deterioration"]["onsets"], preserved["deterioration_onset_response"]["all"]["onsets"])
        for method in ("H", "P"):
            actual = result["overall"]["lots_entry_classification"][method]
            prior = preserved["quarterly_fixed_entry_lots"]["all"][method]
            self.assertEqual(actual["scheduled_lots"], 152)
            self.assertEqual(actual["triggered_lots"], prior["triggered_lots"])
            self.assertEqual(actual["all_complete_lots_same_fixed_entry_schedule"], prior["all_complete_lots_same_fixed_entry_schedule"])
        for name in module.base.FACTORS:
            actual = result["overall"]["deterioration"]["factors"][name]
            prior = preserved["deterioration_onset_response"]["all"]["factors"][name]
            self.assertEqual(actual["status_counts"], prior["status_counts"])
            self.assertEqual(actual["metrics_responders"]["latency_sessions"], prior["response_metrics_including_already_nonpositive"]["latency_sessions"])

    def test_all_partition_counts_and_leave_one_out(self):
        result = self.result
        overall = result["overall"]["deterioration"]["onsets"]
        for key in ("by_security", "by_calendar_year", "by_causal_spy_regime", "by_frozen2019_volatility"):
            self.assertEqual(sum(group["deterioration"]["onsets"] for group in result[key].values()), overall)
        for s in module.SECURITIES:
            self.assertEqual(result["leave_one_security_out"][s]["deterioration"]["onsets"], overall - result["by_security"][s]["deterioration"]["onsets"])
            self.assertEqual(result["by_security"][s]["lots_entry_classification"]["H"]["scheduled_lots"], 19)

    def test_excluding_nvda_tsla_uses_original_groups_and_common_bootstrap(self):
        result = self.result
        excluded = result["excluding_nvda_tsla"]
        removed_events = sum(result["by_security"][symbol]["deterioration"]["onsets"] for symbol in ("NVDA", "TSLA"))
        self.assertEqual(excluded["deterioration"]["onsets"], result["overall"]["deterioration"]["onsets"] - removed_events)
        for method in ("H", "P"):
            self.assertEqual(excluded["lots_entry_classification"][method]["scheduled_lots"], 19 * 6)
        for name, metric in excluded["uncertainty"].items():
            self.assertEqual(metric["requested_replicates"], result["bootstrap"]["replicates"])
            self.assertLessEqual(metric["valid_replicates"], result["bootstrap"]["replicates"])
        # The extra sensitivity group is sliced from full-panel records; the
        # single frozen-formation object is preserved rather than recomputed.
        self.assertEqual(result["volatility_strata"], self.preserved["volatility_strata"])

    def test_equal_security_macro_average_and_horizon_uncertainty(self):
        result = self.result
        for name in ("onset_forward5_pct", "champion_fast_response_forward21_pct", "F_slow_response_forward63_risk_normalized", "H_trigger_forward63_pct", "P_all_lot_difference_pp"):
            means = [group["uncertainty"][name]["mean"] for group in result["by_security"].values()]
            means = [value for value in means if value is not None]
            influence = result["equal_security_and_influence"][name]
            self.assertEqual(influence["securities_with_observations"], len(means))
            if means:
                self.assertAlmostEqual(influence["equal_security_mean"], statistics.mean(means))
            for group in result["by_security"].values():
                metric = group["uncertainty"][name]
                self.assertLessEqual(metric["valid_replicates"], 20)
                self.assertIn("low_coverage", metric)

    def test_signal_group_counts_and_no_row_level_prices(self):
        result = self.result
        for method in ("H", "P"):
            expected = result["overall"]["lots_entry_classification"][method]["triggered_lots"]
            for key in ("trigger_outcomes_by_signal_calendar_year", "trigger_outcomes_by_signal_spy_regime"):
                self.assertEqual(sum(group[method]["triggered_lots"] for group in result[key].values()), expected)
        serialized = json.dumps(result, allow_nan=False)
        for forbidden in ('"open":', '"close":', '"date":', '"index":', '"symbol":', '"signal_quarter":'):
            self.assertNotIn(forbidden, serialized)

    def test_formation_is_not_changed_by_evaluation_future(self):
        data = copy.deepcopy(self.data)
        dates, rows = module.base._normalize(data)
        spy = data["SPY"]
        cutoff = module._regime_setup(dates, spy)
        original_groups = module.base._volatility_strata(dates, rows)[1]
        for symbol in ("SPY",) + module.SECURITIES:
            for row in data[symbol]:
                if row["date"] >= "2020-01-01":
                    row.update(bar(row["close"] * 7))
        changed_dates, changed_rows = module.base._normalize(data)
        self.assertEqual(cutoff, module._regime_setup(changed_dates, data["SPY"]))
        self.assertEqual(original_groups, module.base._volatility_strata(changed_dates, changed_rows)[1])

    def test_invalid_selection_and_bootstrap_are_rejected(self):
        for securities in ((), ("DELL",), ("NVDA", "NVDA")):
            with self.assertRaises(ValueError):
                module.analyze({}, securities=securities)
        for replicates in (0, -1, True):
            with self.assertRaises(ValueError):
                module.analyze({}, bootstrap_replicates=replicates)


if __name__ == "__main__":
    unittest.main()

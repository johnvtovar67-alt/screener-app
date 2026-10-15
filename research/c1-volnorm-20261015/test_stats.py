"""Synthetic-only statistics tests; no licensed observations or network."""
import copy
import importlib.util
import json
import math
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("c1_volnorm_stats", Path(__file__).with_name("stats.py"))
stats = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(stats)

PERIODS = [{"name": "validation", "start": "2010-01-04", "end": "2011-09-30", "outcome_end": "2011-12-31"}]


def record(kind="entry", symbol="A", quarter="2010Q1", **fields):
    return {"type": kind, "symbol": symbol, "period": "validation", "quarter": quarter,
            "sector": "synthetic", "regime": "negative_high", "risk_group": "low", **fields}


class StatisticsTests(unittest.TestCase):
    def test_quarters_include_empty_and_partial_endpoint_quarters(self):
        self.assertEqual(stats.quarters_between("2010-02-11", "2011-07-01"),
                         ["2010Q1", "2010Q2", "2010Q3", "2010Q4", "2011Q1", "2011Q2", "2011Q3"])
        with self.assertRaises(ValueError):
            stats.quarters_between("2011-07-01", "2010-01-01")

    def test_common_draws_circular_pairs_seed_and_fixed_length(self):
        quarters = ["a", "b", "c", "d", "e"]
        draws = stats.bootstrap_draws(quarters, 50)
        self.assertEqual(draws, stats.bootstrap_draws(quarters, 50))
        self.assertTrue(all(sum(weights) == 5 and len(weights) == 5 for weights in draws))
        self.assertTrue(any(weights[0] == 0 for weights in draws))

    def test_empty_quarters_are_retained_and_zero_denominator_draws_disclosed(self):
        rows = [record(e21=3, e63=4, H=True, V=False, breakdown21=False)]
        result = stats.summarize(rows, PERIODS, ["A"], replicates=300)
        ci = result["periods"]["validation"]["overall"]["uncertainty"]["entry_e21"]
        self.assertEqual(ci["quarter_count"], 7)
        self.assertEqual(ci["nonempty_quarters"], 1)
        self.assertLess(ci["valid_replicates"], 300)
        self.assertGreater(ci["valid_replicates"], 0)
        self.assertEqual(ci["ci95_percentile"], [3, 3])
        self.assertTrue(ci["low_coverage"])

    def test_classification_on_common_labelled_subset(self):
        rows = [record(H=True, V=True, breakdown21=True),
                record(H=True, V=False, breakdown21=False),
                record(H=False, V=True, breakdown21=True),
                record(H=False, V=False, breakdown21=False),
                record(H=True, V=True, breakdown21=None)]
        c = stats.summarize_group(rows)["entry"]["classification"]
        self.assertEqual(c["labelled_opportunities"], 4)
        self.assertEqual((c["H"]["tp"], c["H"]["fp"], c["H"]["fn"], c["H"]["tn"]), (1, 1, 1, 1))
        self.assertEqual(c["V"]["precision"], 1)
        self.assertEqual(c["V_minus_H"], {"precision": .5, "recall": .5, "false_positive_rate": -.5})

    def test_precision_difference_bootstrap_uses_ratio_not_mean_daily_rates(self):
        rows = [record(H=True, V=True, breakdown21=True)] * 9
        rows += [record(H=True, V=False, breakdown21=False)]
        rows += [record(quarter="2010Q2", H=True, V=True, breakdown21=False)]
        result = stats.summarize(rows, PERIODS, ["A"], replicates=100)
        ci = result["periods"]["validation"]["overall"]["uncertainty"]["entry_precision_delta"]
        self.assertAlmostEqual(ci["H"], 9 / 11)
        self.assertAlmostEqual(ci["V"], 9 / 10)
        self.assertAlmostEqual(ci["mean"], 9 / 10 - 9 / 11)

    def test_missing_label_does_not_become_negative_and_no_signal_precision_unavailable(self):
        rows = [record(H=True, V=False, breakdown21=None), record(H=True, V=False, breakdown21=True)]
        result = stats.summarize(rows, PERIODS, ["A"], replicates=30)
        group = result["periods"]["validation"]["overall"]
        self.assertEqual(group["entry"]["classification"]["labelled_opportunities"], 1)
        self.assertIsNone(group["entry"]["classification"]["V"]["precision"])
        interval = group["uncertainty"]["entry_precision_delta"]
        self.assertEqual(interval["valid_replicates"], 0)
        self.assertIsNone(interval["mean"])
        self.assertEqual(interval["ci95_percentile"], [None, None])

    def test_censored_holdings_excluded_from_economic_endpoint(self):
        rows = [record("holding", complete=True, delta_vh=2, delta_h_ref=1, delta_v_ref=3,
                       H_trigger=True, V_trigger=False),
                record("holding", complete=False, status="censored_end", delta_vh=999)]
        result = stats.summarize(rows, PERIODS, ["A"], replicates=50)
        g = result["periods"]["validation"]["overall"]
        self.assertEqual(g["holding"]["complete"], 1)
        self.assertEqual(g["holding"]["incomplete"], 1)
        self.assertEqual(g["holding"]["economics_complete"]["delta_vh"]["mean"], 2)
        self.assertEqual(g["uncertainty"]["holding_delta_vh"]["n"], 1)
        self.assertEqual(g["uncertainty"]["holding_delta_vh"]["mean"], 2)

    def test_equal_security_differs_from_observation_weighted_mean(self):
        rows = [record("holding", "A", complete=True, delta_vh=2)] * 9
        rows += [record("holding", "B", complete=True, delta_vh=-2)]
        result = stats.summarize(rows, PERIODS, ["A", "B"], replicates=100)["periods"]["validation"]
        self.assertAlmostEqual(result["overall"]["uncertainty"]["holding_delta_vh"]["mean"], 1.6)
        self.assertEqual(result["equal_security"]["holding_delta_vh"]["mean"], 0)
        self.assertEqual(result["equal_security"]["holding_delta_vh"]["security_count"], 2)

    def test_positive_context_and_exclusion_do_not_reclassify_risk_tags(self):
        rows = [record(symbol="NVDA", e21=9, context=True, risk_group="high"),
                record(symbol="TSLA", e21=3, context=False, risk_group="high"),
                record(symbol="A", e21=-2, context=True, risk_group="low")]
        result = stats.summarize(rows, PERIODS, ["NVDA", "TSLA", "A"], replicates=20)["periods"]["validation"]
        self.assertEqual(result["entry_positive_context"]["by_type"]["entry"]["numeric"]["e21"]["mean"], 3.5)
        self.assertEqual(result["excluding_nvda_tsla"]["by_type"]["entry"]["numeric"]["e21"]["mean"], -2)
        self.assertEqual(result["risk_groups"]["high"]["counts"]["entry"], 2)
        self.assertEqual(result["leave_one_security_out"]["A"]["counts"]["entry"], 2)

    def test_numeric_bool_and_statuses_separate_and_no_observation_paths_returned(self):
        rows = [record(date="2010-02-11", index=17, path=[999, 998], H=True, V=False,
                       e21=2, f21=None, f5=float("nan"), f63=float("inf"),
                       H_status="observed", gain_fraction=.5)]
        original = copy.deepcopy(rows)
        result = stats.summarize(rows, PERIODS, ["A"], replicates=10)
        aggregate = result["periods"]["validation"]["overall"]["by_type"]["entry"]
        self.assertNotIn("H", aggregate["numeric"])
        self.assertEqual(aggregate["boolean"]["H"]["true"], 1)
        self.assertNotIn("index", aggregate["numeric"])
        self.assertNotIn("f5", aggregate["numeric"])
        self.assertEqual(aggregate["status_counts"], {"H_status": {"observed": 1}})
        encoded = json.dumps(result, allow_nan=False)
        self.assertNotIn("2010-02-11", encoded)
        self.assertNotIn("999", encoded)
        self.assertEqual(rows[0]["path"], original[0]["path"])

    def test_periods_do_not_share_estimates_or_bootstrap_pool(self):
        periods = PERIODS + [{"name": "development", "start": "2020-01-01", "end": "2020-09-30", "outcome_end": "2020-12-31"}]
        rows = [record(e21=2), {**record(e21=-20, quarter="2020Q1"), "period": "development"}]
        result = stats.summarize(rows, periods, ["A"], replicates=20)
        self.assertEqual(result["periods"]["validation"]["overall"]["uncertainty"]["entry_e21"]["mean"], 2)
        self.assertEqual(result["periods"]["development"]["overall"]["uncertainty"]["entry_e21"]["mean"], -20)
        self.assertNotIn("uncertainty", result["pooled_descriptive"])

    def test_invalid_type_symbol_period_and_quarter_fail(self):
        for changed in ({"type": "mystery"}, {"symbol": "UNKNOWN"}, {"period": "outside"}, {"quarter": "2009Q4"}):
            with self.assertRaises(ValueError):
                stats.summarize([{**record(), **changed}], PERIODS, ["A"], replicates=1)

    def test_episode_nonresponses_separate_from_matched(self):
        rows = [record("episode", H0=False, V0=True, H_status="observed", V_status="observed", matched_delta=-3, capped_delta=-3),
                record("episode", H0=True, V0=False, H_status="observed", V_status="no_response", matched_delta=None, capped_delta=61),
                record("episode", H0=True, V0=True, H_status="censored_end", V_status="observed", matched_delta=None, capped_delta=None)]
        group = stats.summarize_group(rows)
        self.assertEqual(group["episode"]["response_timing_counts"], {"V_earlier": 1, "same": 0, "V_later": 0})
        self.assertEqual(group["by_type"]["episode"]["numeric"]["capped_delta"]["n"], 2)
        self.assertEqual(group["by_type"]["episode"]["numeric"]["matched_delta"]["n"], 1)

    def test_entry_forward_outcomes_keep_flag_cohorts_and_disagreements_separate(self):
        rows = [record(H=True, V=False, f5=-4, f21=2, recovery21=True),
                record(H=False, V=True, f5=6, f21=-8, recovery21=False),
                record(H=True, V=True, f5=2, f21=-2, recovery21=False),
                record(H=False, V=False, f5=40, f21=30, recovery21=True)]
        entry = stats.summarize_group(rows)["entry"]
        self.assertEqual(entry["signal_outcomes"]["H"]["numeric"]["f5"]["mean"], -1)
        self.assertEqual(entry["signal_outcomes"]["V"]["numeric"]["f5"]["mean"], 4)
        self.assertEqual(entry["disagreement_outcomes"]["V_only"]["numeric"]["f21"]["mean"], -8)
        self.assertEqual(entry["disagreement_outcomes"]["neither"]["n"], 1)

    def test_classifier_coverage_uses_conditional_not_total_denominator(self):
        rows = [record(H=i == 0, V=i < 2, breakdown21=True, recovery21=False)
                for i in range(100)]
        interval = stats.summarize(rows, PERIODS, ["A"], replicates=20)["periods"]["validation"]["overall"]["uncertainty"]["entry_precision_delta"]
        self.assertEqual(interval["n"], 100)
        self.assertEqual(interval["H_denominator"], 1)
        self.assertEqual(interval["V_denominator"], 2)
        self.assertTrue(interval["low_coverage"])


if __name__ == "__main__":
    unittest.main()

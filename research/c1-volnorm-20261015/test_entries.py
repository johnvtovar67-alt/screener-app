"""Synthetic tests of calendar pairing, censoring, and causal episode clocks."""
import unittest
from datetime import date, timedelta
from unittest.mock import patch

import entries
import stats


def sessions(n, first="2020-01-06"):
    days, cursor = [], date.fromisoformat(first)
    while len(days) < n:
        if cursor.weekday() < 5:
            days.append(cursor.isoformat())
        cursor += timedelta(days=1)
    return days


def setup(n=100):
    dates = sessions(n)
    rows = [{"date": day, "open": 100.0, "close": 100.0} for day in dates]
    features = [{"H": False, "V": False, "slow": 1.0, "fast": 1.0,
                 "z": -1.0, "sigma": 1.0, "r5": -3.0,
                 "context": True, "regime": "test", "risk_group": "low"} for _ in dates]
    period = {"name": "test", "start": dates[0], "end": dates[-1], "outcome_end": dates[-1]}
    return rows, features, dates, period


def fake_tag(symbol, t, dates, features, period, sector):
    return {"symbol": symbol, "index": t, "period": period["name"],
            "quarter": "2020Q1", "sector": sector,
            "regime": features[t]["regime"], "risk_group": features[t]["risk_group"]}


def fake_forward(rows, t, limit, peak=None):
    return {"f5": 2.0, "f21": 10.0, "f63": -5.0,
            "recovery21": False, "mae21": -4.0, "mfe21": 12.0}


class EntryEpisodeTests(unittest.TestCase):
    def setUp(self):
        self.tag = patch.object(entries, "tag", side_effect=fake_tag)
        self.forward = patch.object(entries, "forward", side_effect=fake_forward)
        self.tag.start()
        self.mock_forward = self.forward.start()
        self.addCleanup(self.tag.stop)
        self.addCleanup(self.forward.stop)

    def test_weekly_calendar_handles_holiday_and_filters_after_week_selection(self):
        rows, f, dates, p = setup(10)
        # Remove the first Friday as though it were a calendar closure.  The
        # following week's Friday exists but is beyond the decision boundary.
        for seq in (rows, f, dates):
            del seq[4]
        p["end"] = dates[7]  # second Thursday
        out = entries.build_entries("SYN", rows, f, dates, p, "sector")
        self.assertEqual([r["index"] for r in out], [3])

    def test_entry_cash_effects_are_paired_on_same_opportunities(self):
        rows, f, dates, p = setup(15)
        f[4]["V"] = True
        f[9]["H"] = True
        f[14]["V"] = f[14]["H"] = True
        out = entries.build_entries("SYN", rows, f, dates, p, "sector")
        self.assertEqual([r["e21"] for r in out], [-10.0, 10.0, 0.0])
        self.assertEqual([r["e63"] for r in out], [5.0, -5.0, 0.0])
        self.assertEqual(out[0]["h21"], 0)
        self.assertEqual(out[0]["v21"], -10)
        self.assertEqual(out[2]["h21"], out[2]["v21"])

    def test_missing_predicate_drops_both_entry_arms(self):
        rows, f, dates, p = setup(15)
        f[4]["V"] = None
        f[9]["H"] = None
        f[14]["context"] = None
        out = entries.build_entries("SYN", rows, f, dates, p, "sector")
        self.assertEqual([r["index"] for r in out], [14])
        self.assertIsNone(out[0]["context"])

    def test_censored_return_is_not_a_zero_cash_effect_or_false_label(self):
        rows, f, dates, p = setup(5)
        f[4]["V"] = True
        self.mock_forward.side_effect = lambda *args: {"f21": None, "f63": None, "recovery21": None}
        out = entries.build_entries("SYN", rows, f, dates, p, "sector")[0]
        for key in ("e21", "e63", "h21", "v21", "breakdown21", "positive21", "correction21"):
            self.assertIsNone(out[key])

    def test_proxy_labels_require_joint_observation_and_are_prespecified(self):
        self.assertEqual(entries._labels({"f21": -1, "recovery21": False}),
                         {"correction21": False, "breakdown21": True, "positive21": False, "ambiguous21": False})
        self.assertTrue(entries._labels({"f21": -1, "recovery21": True})["correction21"])
        self.assertTrue(entries._labels({"f21": 1, "recovery21": False})["ambiguous21"])
        self.assertIsNone(entries._labels({"f21": -1, "recovery21": None})["breakdown21"])

    def test_union_clock_and_independent_native_counts_differ(self):
        rows, f, dates, p = setup(90)
        p["end"] = dates[24]
        f[0]["V"] = True
        f[8]["H"] = True
        f[21]["V"] = True
        f[24]["H"] = True
        out = entries.build_episodes("SYN", rows, f, dates, p, "sector")
        self.assertEqual([r["index"] for r in out], [0, 21])
        self.assertEqual(out[0]["V_latency"], 0)
        self.assertEqual(out[0]["H_latency"], 8)
        self.assertEqual(out[0]["matched_delta"], -8)
        counts = entries.native_counts("SYN", rows, f, dates, p, "sector")
        self.assertEqual((counts["counts_H"], counts["counts_V"], counts["counts_union"]), (1, 2, 2))

    def test_matched_observed_and_complete_nonresponse_are_distinct(self):
        rows, f, dates, p = setup(100)
        p["end"] = dates[0]
        f[0]["V"] = True
        out = entries.build_episodes("SYN", rows, f, dates, p, "sector")[0]
        self.assertEqual(out["H_status"], "no_response")
        self.assertIsNone(out["H_latency"])
        self.assertEqual(out["H_capped_latency"], 63)
        self.assertIsNone(out["matched_delta"])
        self.assertEqual(out["capped_delta"], -63)
        self.assertIsNone(out["H_f21"])

    def test_missing_before_later_trigger_never_becomes_observed_response(self):
        rows, f, dates, p = setup(100)
        p["end"] = dates[0]
        f[0]["V"] = True
        f[3]["H"] = None
        f[5]["H"] = True
        out = entries.build_episodes("SYN", rows, f, dates, p, "sector")[0]
        self.assertEqual(out["H_status"], "censored_missing")
        self.assertIsNone(out["H_latency"])
        self.assertIsNone(out["H_capped_latency"])
        self.assertIsNone(out["capped_delta"])

    def test_end_censoring_is_not_complete_nonresponse(self):
        rows, f, dates, p = setup(100)
        p["end"] = dates[0]
        p["outcome_end"] = dates[62]
        f[0]["V"] = True
        out = entries.build_episodes("SYN", rows, f, dates, p, "sector")[0]
        self.assertEqual(out["H_status"], "censored_end")
        self.assertIsNone(out["H_capped_latency"])
        self.assertIsNone(out["capped_delta"])

    def test_matched_episode_timing_reaches_real_aggregate_consumer(self):
        rows, f, dates, p = setup(100)
        p["end"] = dates[0]
        f[0]["V"] = True
        f[8]["H"] = True
        records = entries.build_episodes("SYN", rows, f, dates, p, "sector")
        result = stats.summarize_group(records, ["2020Q1"], [(1,)])
        interval = result["uncertainty"]["episode_matched_delta"]
        self.assertEqual(interval["n"], 1)
        self.assertEqual(interval["mean"], -8)
        self.assertEqual(result["episode"]["response_timing_counts"]["V_earlier"], 1)

    def test_champion_reference_latency_zero_and_price_decline(self):
        rows, f, dates, p = setup(100)
        p["start"] = p["end"] = dates[20]
        f[20]["V"] = True
        f[20]["slow"] = -1
        f[24]["fast"] = -1
        rows[24]["close"] = 90
        out = entries.build_episodes("SYN", rows, f, dates, p, "sector")[0]
        self.assertEqual(out["slow_latency"], 0)
        self.assertEqual(out["fast_latency"], 4)
        self.assertAlmostEqual(out["fast_decline_onset_pct"], 10)
        self.assertAlmostEqual(out["fast_decline_peak_pct"], 10)
        self.assertIn(24, [call.args[1] for call in self.mock_forward.call_args_list])

    def test_later_outcome_changes_do_not_select_entry_flags_or_dates(self):
        rows, f, dates, p = setup(70)
        p["end"] = dates[4]
        f[4]["V"] = True
        before = entries.build_entries("SYN", rows, f, dates, p, "sector")
        rows[30]["close"] = 1
        self.mock_forward.side_effect = lambda *args: {"f21": -99, "f63": -99, "recovery21": False}
        after = entries.build_entries("SYN", rows, f, dates, p, "sector")
        self.assertEqual([(r["index"], r["H"], r["V"]) for r in before],
                         [(r["index"], r["H"], r["V"]) for r in after])
        self.assertNotEqual(before[0]["e21"], after[0]["e21"])


if __name__ == "__main__":
    unittest.main()

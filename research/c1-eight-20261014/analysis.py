#!/usr/bin/env python3
"""Pure aggregate extension of the preserved fresh C1 signal study.

No network, file output, threshold fitting, market-data logging, or production
imports. The sole source import is the unchanged sibling v1 analyzer. Input bars
and row/event records remain ephemeral. Returned values contain aggregates only.

Risk normalization does NOT introduce a trigger or implement a volatility-adjusted
Challenger. Sigma is sample SD (percentage units) of 20 daily simple returns,
ending FIVE sessions before the relevant event/signal. Divide R5 by sigma*sqrt(5)
and each h-session forward price change by sigma_known_at_signal*sqrt(h), without
clipping. These are descriptive normalized outcomes, not Gaussian z statistics.

Calendar-year blocks are fixed. SPY regimes use information through t-1: sign of
63-session return crossed with trailing20 daily-return SD above/below the median
of complete 2019 rolling20 estimates (ties low). Onsets are grouped at onset;
entire-schedule lot effects at entry; triggered outcomes separately at signal.

Intervals are exploratory 95% percentile circular moving-block bootstrap:
19 common quarter clusters, blocks of two quarters, 2,000 draws, seed 20261014.
Common quarter draws retain contemporaneous cross-security dependence. They do
not make this purposive survivor sample representative or eliminate overlapping
outcome dependence beyond the two-quarter block. Low-coverage strata are flagged.
"""
from __future__ import annotations

import importlib.util
import math
import random
import statistics
from collections import Counter, defaultdict
from pathlib import Path

_SOURCE = Path(__file__).resolve().parent.parent / "c1-fresh-20261014" / "analyze.py"
_SPEC = importlib.util.spec_from_file_location("c1_preserved_fresh_analyzer", _SOURCE)
base = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(base)

SECURITIES = base.SECURITIES
HORIZONS = (5, 21, 63)
OBSERVED_STATUSES = ("responded", "no_response_within63")
BOOTSTRAP_REPLICATES = 2000
BOOTSTRAP_SEED = 20261014
BOOTSTRAP_BLOCK_QUARTERS = 2
_summary = base._summary


def _quarter(day):
    return f"{day[:4]}Q{(int(day[5:7]) - 1) // 3 + 1}"


def _sigma(rows, t, lag=5, allow_zero=False):
    """20 daily simple returns in percent, ending t-lag; missing/zero -> None."""
    end = t - lag
    if not base._complete(rows, end - 20, end):
        return None
    returns = [base._pct(rows[j]["close"], rows[j - 1]["close"]) for j in range(end - 19, end + 1)]
    sigma = statistics.stdev(returns)
    return sigma if math.isfinite(sigma) and (sigma > 0 or allow_zero) else None


def _regime_setup(dates, spy):
    training = [_sigma(spy, i, lag=0, allow_zero=True) for i, d in enumerate(dates)
                if d.startswith("2019-") and i >= 20 and dates[i - 20].startswith("2019-")]
    training = [v for v in training if v is not None]
    return statistics.median(training) if training else None


def _regime(spy, t, cutoff):
    prior = t - 1
    ret = base._factor(spy, prior, 63)
    sigma = _sigma(spy, prior, lag=0, allow_zero=True)
    if cutoff is None or ret is None or sigma is None:
        return "unclassified"
    return ("nonnegative63" if ret >= 0 else "negative63") + "_" + ("highvol20" if sigma > cutoff else "lowvol20")


def _tag(symbol, i, dates, spy, cutoff):
    return {"symbol": symbol, "index": i, "quarter": _quarter(dates[i]),
            "year": dates[i][:4], "regime": _regime(spy, i, cutoff)}


def _normal_forward(outcome, sigma):
    outcome["risk_sigma_available"] = sigma is not None
    for h in HORIZONS:
        if sigma is not None and outcome.get(f"forward{h}_status") == "observed":
            outcome[f"forward{h}_risk_normalized"] = outcome[f"forward{h}_return_pct"] / (sigma * math.sqrt(h))
    return outcome


def _recovery(outcome, rows, execution, peak):
    if outcome.get("forward21_status") == "observed":
        outcome["recovered_fixed_peak_within21"] = any(rows[t]["close"] >= peak - 1e-10 for t in range(execution + 1, execution + 22))
        outcome["positive_forward21"] = outcome["forward21_return_pct"] > 0
    return outcome


def _event(rows, onset, last):
    sigma = _sigma(rows, onset)
    ret5 = base._factor(rows, onset, 5)
    peak = max(rows[i]["close"] for i in range(onset - 19, onset + 1))
    forward = _normal_forward(base._forward(rows, onset + 1, last), sigma)
    _recovery(forward, rows, onset + 1, peak)
    result = {"onset_return5_pct": ret5, "risk_sigma_available": sigma is not None,
              "onset_shock_risk_normalized": ret5 / (sigma * math.sqrt(5)) if sigma else None,
              "onset_forward": forward, "factors": {}}
    for name, window in base.FACTORS.items():
        response = base._response(rows, onset, *window, last)
        if response["status"] == "responded":
            signal = onset + response["latency_sessions"]
            _normal_forward(response, _sigma(rows, signal))
            _recovery(response, rows, signal + 1, peak)
        result["factors"][name] = response
    return result


def _forward_aggregate(records):
    return {str(h): {
        "status_counts": dict(Counter(r.get(f"forward{h}_status", "unavailable") for r in records)),
        "return_pct": _summary(r.get(f"forward{h}_return_pct") for r in records),
        "risk_normalized_return": _summary(r.get(f"forward{h}_risk_normalized") for r in records)} for h in HORIZONS}


def _proxy_aggregate(records, key="recovered_fixed_peak_within21"):
    observed = [r for r in records if r.get("forward21_status") == "observed"]
    recovered = [r for r in observed if key in r]
    positive = [r for r in observed if "positive_forward21" in r]
    return {"observed21": len(observed), "recovery_observations": len(recovered),
            "recovered_count": sum(r[key] for r in recovered),
            "recovered_rate": sum(r[key] for r in recovered) / len(recovered) if recovered else None,
            "positive21_count": sum(r["positive_forward21"] for r in positive),
            "positive21_rate": sum(r["positive_forward21"] for r in positive) / len(positive) if positive else None,
            "both_count": sum(r[key] and r.get("positive_forward21", False) for r in recovered)}


def _events_aggregate(events):
    result = {"onsets": len(events),
              "onset_return5_pct": _summary(r["onset_return5_pct"] for r in events),
              "onset_shock_risk_normalized": _summary(r["onset_shock_risk_normalized"] for r in events),
              "onset_forward_next_open": _forward_aggregate([r["onset_forward"] for r in events]),
              "onset_recovery_fixed_trailing20_peak": _proxy_aggregate([r["onset_forward"] for r in events]),
              "factors": {}, "pairs": {}}
    for name in base.FACTORS:
        all_records = [r["factors"][name] for r in events]
        observed = [r for r in all_records if r["status"] in OBSERVED_STATUSES]
        responded = [r for r in all_records if r["status"] == "responded"]
        result["factors"][name] = {
            "status_counts": dict(Counter(r["status"] for r in all_records)),
            "response_probability_denominator": len(observed),
            "response_probability": len(responded) / len(observed) if observed else None,
            "already_nonpositive_at_onset": sum(r.get("already_nonpositive", False) for r in all_records),
            "metrics_responders": {k: _summary(r.get(k) for r in responded) for k in (
                "latency_sessions", "decline_from_onset_pct", "price_change_from_onset_pct", "drawdown_from_onset_trailing20_peak_pct")},
            "restricted_latency63_sessions": _summary(r["latency_sessions"] if r["status"] == "responded" else 63 for r in observed),
            "restricted_latency_nonresponse_imputed63": sum(r["status"] == "no_response_within63" for r in observed),
            "forward_after_response_next_open": _forward_aggregate(responded),
            "recovery_fixed_onset_trailing20_peak": _proxy_aggregate(responded)}
    for speed in ("slow", "fast"):
        cs, fs = "champion_" + speed, "F_" + speed
        pairs = [(r["factors"][cs], r["factors"][fs]) for r in events]
        matched = [(c, f) for c, f in pairs if c["status"] == f["status"] == "responded"]
        observed = [(c, f) for c, f in pairs if c["status"] in OBSERVED_STATUSES and f["status"] in OBSERVED_STATUSES]
        result["pairs"][speed] = {
            "joint_status_counts": dict(Counter(c["status"] + " | " + f["status"] for c, f in pairs)),
            "both_responded": len(matched), "both_observed63": len(observed),
            "F_only_responded": sum(f["status"] == "responded" and c["status"] == "no_response_within63" for c, f in pairs),
            "champion_only_responded": sum(c["status"] == "responded" and f["status"] == "no_response_within63" for c, f in pairs),
            "neither_responded": sum(c["status"] == f["status"] == "no_response_within63" for c, f in pairs),
            "F_earlier": sum(f["latency_sessions"] < c["latency_sessions"] for c, f in matched),
            "same_session": sum(f["latency_sessions"] == c["latency_sessions"] for c, f in matched),
            "F_later": sum(f["latency_sessions"] > c["latency_sessions"] for c, f in matched),
            "matched_F_minus_champion_latency": _summary(f["latency_sessions"] - c["latency_sessions"] for c, f in matched),
            "all_observed_F_minus_champion_restricted_latency": _summary(
                (f.get("latency_sessions", 63) - c.get("latency_sessions", 63)) for c, f in observed),
            "F_minus_champion_response_probability": _summary(
                int(f["status"] == "responded") - int(c["status"] == "responded") for c, f in observed)}
    return result


def _lots_aggregate(lots):
    result = base._lot_aggregate(lots)
    complete = [r for r in lots if r["status"] == "complete"]
    triggered = [r for r in complete if r["triggered"]]
    result["forward_after_triggered_next_open_exit_risk"] = _forward_aggregate(triggered)
    result["recovery_preexit_peak"] = _proxy_aggregate(triggered, "recovered_preexit_peak_within21")
    result["all_lot_equal_weight_difference_pp"] = _summary(
        r.get("net_exit_return_pct", r["reference_net_return_pct"]) - r["reference_net_return_pct"] for r in complete)
    return result


def _quantile(values, probability):
    if not values:
        return None
    values = sorted(values)
    index = (len(values) - 1) * probability
    low, high = math.floor(index), math.ceil(index)
    return values[low] + (values[high] - values[low]) * (index - low)


def _bootstrap_draws(quarters, replicates=BOOTSTRAP_REPLICATES):
    """Same draw weights used by every security/subgroup/outcome."""
    rng = random.Random(BOOTSTRAP_SEED)
    n = len(quarters)
    result = []
    for _ in range(replicates):
        drawn = []
        while len(drawn) < n:
            start = rng.randrange(n)
            drawn.extend((start + j) % n for j in range(BOOTSTRAP_BLOCK_QUARTERS))
        counts = Counter(drawn[:n])
        result.append([counts[j] for j in range(n)])
    return result


def _bootstrap_metric(observations, quarters, draws):
    """Observations are ephemeral (quarter, scalar) sufficient statistics."""
    indexes = {q: i for i, q in enumerate(quarters)}
    sums, counts = [0.0] * len(quarters), [0] * len(quarters)
    values = []
    for quarter, value in observations:
        if value is None or not math.isfinite(value):
            continue
        j = indexes[quarter]
        sums[j] += value
        counts[j] += 1
        values.append(value)
    samples = []
    for weights in draws:
        denominator = sum(w * n for w, n in zip(weights, counts))
        if denominator:
            samples.append(sum(w * s for w, s in zip(weights, sums)) / denominator)
    occupied = sum(n > 0 for n in counts)
    return {"n": len(values), "mean": statistics.mean(values) if values else None,
            "median": statistics.median(values) if values else None,
            "ci95_percentile": [_quantile(samples, .025), _quantile(samples, .975)],
            "nonempty_quarters": occupied, "valid_replicates": len(samples),
            "requested_replicates": len(draws), "low_coverage": len(values) < 20 or occupied < 8}


def _uncertainty(events, lots, quarters, draws):
    metrics = defaultdict(list)
    for r in events:
        q = r["quarter"]
        forward = r["onset_forward"]
        for horizon in HORIZONS:
            metrics[f"onset_forward{horizon}_pct"].append((q, forward.get(f"forward{horizon}_return_pct")))
            metrics[f"onset_forward{horizon}_risk_normalized"].append((q, forward.get(f"forward{horizon}_risk_normalized")))
        for name in base.FACTORS:
            response = r["factors"][name]
            if response["status"] == "responded":
                # Factor response outcomes are clustered by onset quarter, to
                # retain the original common shock cluster across factor clocks.
                for horizon in HORIZONS:
                    metrics[f"{name}_response_forward{horizon}_pct"].append((q, response.get(f"forward{horizon}_return_pct")))
                    metrics[f"{name}_response_forward{horizon}_risk_normalized"].append((q, response.get(f"forward{horizon}_risk_normalized")))
        for speed in ("slow", "fast"):
            c, f = r["factors"]["champion_" + speed], r["factors"]["F_" + speed]
            if c["status"] == f["status"] == "responded":
                metrics[speed + "_matched_F_minus_champion_latency"].append((q, f["latency_sessions"] - c["latency_sessions"]))
            if c["status"] in OBSERVED_STATUSES and f["status"] in OBSERVED_STATUSES:
                metrics[speed + "_all_observed_F_minus_champion_restricted_latency"].append((q, f.get("latency_sessions", 63) - c.get("latency_sessions", 63)))
                metrics[speed + "_F_minus_champion_response_probability"].append((q, int(f["status"] == "responded") - int(c["status"] == "responded")))
    for method in ("H", "P"):
        for r in lots[method]:
            if r["status"] != "complete":
                continue
            q = r["quarter"]
            difference = r.get("net_exit_return_pct", r["reference_net_return_pct"]) - r["reference_net_return_pct"]
            metrics[method + "_all_lot_difference_pp"].append((q, difference))
            if r["triggered"]:
                # Signal outcomes retain their actual signal quarter, even where
                # this subgroup was selected using entry-year/entry-regime tags.
                sq = r["signal_quarter"]
                for horizon in HORIZONS:
                    metrics[f"{method}_trigger_forward{horizon}_pct"].append((sq, r.get(f"forward{horizon}_return_pct")))
                    metrics[f"{method}_trigger_forward{horizon}_risk_normalized"].append((sq, r.get(f"forward{horizon}_risk_normalized")))
                if r.get("forward21_status") == "observed":
                    metrics[method + "_trigger_recovery_rate"].append((sq, float(r["recovered_preexit_peak_within21"])))
    required = [f"onset_forward{horizon}_{suffix}" for horizon in HORIZONS for suffix in ("pct", "risk_normalized")]
    required += [f"{name}_response_forward{horizon}_{suffix}" for name in base.FACTORS for horizon in HORIZONS for suffix in ("pct", "risk_normalized")]
    required += [f"{method}_trigger_forward{horizon}_{suffix}" for method in ("H", "P") for horizon in HORIZONS for suffix in ("pct", "risk_normalized")]
    required += [f"{speed}_{suffix}" for speed in ("slow", "fast") for suffix in (
        "matched_F_minus_champion_latency", "all_observed_F_minus_champion_restricted_latency", "F_minus_champion_response_probability")]
    required += [f"{method}_{suffix}" for method in ("H", "P") for suffix in (
        "all_lot_difference_pp", "trigger_forward21_pct", "trigger_forward21_risk_normalized", "trigger_recovery_rate")]
    return {name: _bootstrap_metric(metrics[name], quarters, draws) for name in required}


def _aggregate(events, lots, quarters, draws):
    return {"deterioration": _events_aggregate(events),
            "lots_entry_classification": {m: _lots_aggregate(lots[m]) for m in ("H", "P")},
            "uncertainty": _uncertainty(events, lots, quarters, draws)}


def _subset(events, lots, predicate):
    return [r for r in events if predicate(r)], {m: [r for r in lots[m] if predicate(r)] for m in ("H", "P")}


def analyze(data, securities=SECURITIES, bootstrap_replicates=BOOTSTRAP_REPLICATES):
    """Return aggregate-only research results; no licensed inputs are persisted.

    Default is the fixed full-eight panel. Explicit original-design subsets exist
    solely for synthetic tests/diagnostic failure reporting. Production expansion
    should require all eight upstream. bootstrap_replicates is a test/runtime
    parameter; authorized numerical reports MUST use the default 2,000.
    """
    securities = tuple(securities)
    if not securities or len(set(securities)) != len(securities) or any(s not in SECURITIES for s in securities):
        raise ValueError("Expected a unique nonempty subset of the original eight securities")
    if not isinstance(bootstrap_replicates, int) or isinstance(bootstrap_replicates, bool) or bootstrap_replicates < 1:
        raise ValueError("bootstrap_replicates must be positive")
    dates, rows = base._normalize(data, securities)
    spy_map = {r["date"]: r for r in data["SPY"]}
    spy = [spy_map[d] for d in dates]
    evaluation = [i for i, d in enumerate(dates) if base.START <= d <= base.END]
    last = len(dates) - 1
    groups, volatility = base._volatility_strata(dates, rows, securities)
    cutoff = _regime_setup(dates, spy)
    entries, seen = [], set()
    for i in evaluation:
        q = _quarter(dates[i])
        if q not in seen:
            seen.add(q)
            entries.append(i)
    quarters = [_quarter(dates[i]) for i in entries]
    draws = _bootstrap_draws(quarters, bootstrap_replicates)
    events, lots = [], {"H": [], "P": []}
    coverage = Counter()
    for symbol in securities:
        series = rows[symbol]
        previous_onset = -10**9
        for i in evaluation:
            ret5 = base._factor(series, i, 5)
            if ret5 is None:
                coverage["unavailable_event_detection_symbol_dates"] += 1
                continue
            if ret5 > -7 + 1e-10 or i - previous_onset < 21:
                continue
            if not base._complete(series, i - 120, i):
                coverage["event_onsets_excluded_missing_paired_warmup"] += 1
                continue
            previous_onset = i
            record = _event(series, i, last)
            record.update(_tag(symbol, i, dates, spy, cutoff))
            record["volatility_group"] = groups[symbol]
            events.append(record)
        for entry in entries:
            for method in ("H", "P"):
                record = base._lot(series, entry, method, last)
                record.update(_tag(symbol, entry, dates, spy, cutoff))
                record["volatility_group"] = groups[symbol]
                if record["status"] == "complete" and record["triggered"]:
                    signal = entry + record["signal_age_sessions"]
                    _normal_forward(record, _sigma(series, signal))
                    record["signal_year"] = dates[signal][:4]
                    record["signal_quarter"] = _quarter(dates[signal])
                    record["signal_regime"] = _regime(spy, signal, cutoff)
                lots[method].append(record)
    def aggregate_selected(predicate):
        return _aggregate(*_subset(events, lots, predicate), quarters, draws)
    years = sorted({dates[i][:4] for i in evaluation})
    regimes = ("negative63_highvol20", "negative63_lowvol20", "nonnegative63_highvol20", "nonnegative63_lowvol20", "unclassified")
    result = {
        "contract": "c1-eight-fresh-signal-diagnostic-v1",
        "classification": "developmental partial research; raw factors and independent hypothetical exits; no portfolio alpha or implemented volatility-adjusted Challenger",
        "securities": list(securities), "full_eight_security_panel": securities == SECURITIES,
        "evaluation_start": base.START, "evaluation_end": base.END,
        "warmup_start": base.DATA_START, "observation_end": base.DATA_END,
        "coverage": {"calendar_sessions": len(dates), "evaluation_sessions": len(evaluation),
                     "scheduled_quarters": len(entries), **dict(coverage)},
        "volatility_strata": volatility,
        "normalization": {"sigma": "sample SD in percentage units of 20 daily simple returns ending 5 sessions before event/signal",
            "shock": "R5/(sigma*sqrt(5))", "forward": "forward_h_pct/(sigma_known_at_signal*sqrt(h))",
            "clipping": "none", "zero_or_missing_sigma": "normalized outcome unavailable; raw outcome retained",
            "interpretation": "descriptive scale units; no new trigger, rank, or rule; not a statistical z test"},
        "regimes": {"formation": "2019 only: median complete SPY rolling20 daily-return sample SD",
            "causal_features": "SPY 63-session return sign and rolling20 SD at t-1; nonnegative return ties up, volatility ties low",
            "event_assignment": "onset", "all_lot_assignment": "entry", "trigger_outcome_assignment": "signal",
            "year_blocks": years, "labels": list(regimes), "formation_available": cutoff is not None},
        "bootstrap": {"method": "circular moving-block common-quarter cluster percentile bootstrap",
            "block_quarters": BOOTSTRAP_BLOCK_QUARTERS, "replicates": bootstrap_replicates,
            "seed": BOOTSTRAP_SEED, "confidence": .95, "calendar_quarters": len(quarters),
            "same_quarter_draws_for_every_security_and_metric": True,
            "low_coverage": "fewer than 20 observations or 8 nonempty quarters",
            "limitations": "descriptive intervals; purposive eight-survivor developmental panel; 19 quarters; overlap and long-memory dependence remain; no multiplicity correction"},
        "overall": _aggregate(events, lots, quarters, draws),
        "by_security": {s: aggregate_selected(lambda r, s=s: r["symbol"] == s) for s in securities},
        "by_calendar_year": {y: aggregate_selected(lambda r, y=y: r["year"] == y) for y in years},
        "by_causal_spy_regime": {g: aggregate_selected(lambda r, g=g: r["regime"] == g) for g in regimes},
        "by_frozen2019_volatility": {g: aggregate_selected(lambda r, g=g: r["volatility_group"] == g) for g in sorted(set(groups.values()))},
        "leave_one_security_out": {s: aggregate_selected(lambda r, s=s: r["symbol"] != s) for s in securities},
        "trigger_outcomes_by_signal_calendar_year": {}, "trigger_outcomes_by_signal_spy_regime": {},
        "equal_security_and_influence": {},
        "limitations": [
            "Champion/F observations are exact raw factor zero-crossings; authoritative full-universe C1 ranks and trading actions are not calculated.",
            "Deterioration onsets, factor responses and quarterly lots overlap; counts are not independent trials.",
            "Eight current surviving securities were selected before acquisition; survivorship, selection and current-provider adjustment-vintage bias remain.",
            "Historical SPY regime and frozen 2019 groups are descriptive classifications, not randomized regimes or new rules.",
            "Risk normalization changes outcome measurement only; fixed -7 percent deterioration and H trigger remain unadjusted.",
            "Restricted latency uses 63 for observed nonresponse; censoring is excluded and explicitly counted, not treated as nonresponse.",
            "Forward returns use next-session adjusted open to close h sessions later; dividend-adjusted proxies are not literal executable fills.",
            "Every 5/21/63-session forward outcome has separate observed/missing/end-censor counts; late factor response63 outcomes can be censored without changing the frozen evaluation end.",
            "Factor response cohorts and response dates differ; their forward means are not paired causal estimates of rule quality.",
            "H/P giveback fractions use each trigger's observed prior lot peak; the age63 reference has a different longer observed path and peak.",
            "Recovery and positive-forward-return counts are distinct false-exit proxies, not validated counterfactual trading mistakes.",
            "H/P omit ranks, hard stops, replacement, cash opportunity cost, reinvestment and account seed; all-lot differences are not portfolio returns.",
            "Giveback fractions above one mean prior positive gains became losses; absent positive prior peaks have no fractional giveback.",
            "No optimization, winning-rule selection, production changes or frozen 48-Challenger protocol change.",
            "Market-data authenticity, request/retention permissions and provider-vintage hashes are upstream acquisition responsibilities."]}
    for key, field, labels in (("trigger_outcomes_by_signal_calendar_year", "signal_year", years),
                               ("trigger_outcomes_by_signal_spy_regime", "signal_regime", regimes)):
        for label in labels:
            result[key][label] = {}
            for method in ("H", "P"):
                records = [r for r in lots[method] if r.get("triggered") and r.get(field) == label]
                result[key][label][method] = {"triggered_lots": len(records),
                    "forward_next_open": _forward_aggregate(records),
                    "recovery_preexit_peak": _proxy_aggregate(records, "recovered_preexit_peak_within21"),
                    "signal_giveback_fraction": _summary(r.get("signal_giveback_fraction") for r in records),
                    "signal_drawdown_from_trailing20_peak_pct": _summary(r.get("signal_drawdown_from_trailing20_peak_pct") for r in records)}
    for name, overall_metric in result["overall"]["uncertainty"].items():
        security_values = [result["by_security"][symbol]["uncertainty"][name]["mean"] for symbol in securities]
        security_values = [value for value in security_values if value is not None]
        loo_values = [result["leave_one_security_out"][symbol]["uncertainty"][name]["mean"] for symbol in securities]
        loo_values = [value for value in loo_values if value is not None]
        pooled = overall_metric["mean"]
        result["equal_security_and_influence"][name] = {
            "pooled_observation_weighted_mean": pooled,
            "equal_security_mean": statistics.mean(security_values) if security_values else None,
            "equal_security_median": statistics.median(security_values) if security_values else None,
            "securities_with_observations": len(security_values),
            "security_mean_positive_count": sum(value > 0 for value in security_values),
            "security_mean_negative_count": sum(value < 0 for value in security_values),
            "security_mean_zero_count": sum(value == 0 for value in security_values),
            "leave_one_security_out_pooled_mean_range": [min(loo_values), max(loo_values)] if loo_values else [None, None],
            "leave_one_security_out_positive_count": sum(value > 0 for value in loo_values),
            "leave_one_security_out_negative_count": sum(value < 0 for value in loo_values),
            "leave_one_security_out_zero_count": sum(value == 0 for value in loo_values),
            "leave_one_security_out_sign_change_count": sum((value > 0) != (pooled > 0) for value in loo_values if value != 0 and pooled not in (None, 0)),
            "interpretation": "Macro-average gives every security with an observed metric equal weight; it is not a portfolio return. Macro-average interval not estimated; per-security and pooled block intervals are supplied separately."}
    return result

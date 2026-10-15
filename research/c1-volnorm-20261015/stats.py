"""Aggregate-only statistics for the prespecified volatility-normalized study.

Pure Python, no network or file output. Input flat event records are ephemeral.
No event rows, session dates, source observations or path values are returned.
Shared circular two-quarter draws preserve zero-event quarters and contemporaneous
cross-security dependence. Intervals are exploratory temporal uncertainty only.
"""
from __future__ import annotations

import math
import random
import statistics
from collections import Counter, defaultdict
from datetime import date

SEED = 20261015
TYPES = ("entry", "holding", "episode")
TAG_KEYS = frozenset(("type", "symbol", "period", "quarter", "sector", "regime",
                      "risk_group", "year", "date", "day", "index", "entry_date",
                      "signal_date", "onset_date", "path"))
PRIMARY_MEANS = (("holding_delta_vh", "holding", "delta_vh"),
                 ("holding_delta_h_ref", "holding", "delta_h_ref"),
                 ("holding_delta_v_ref", "holding", "delta_v_ref"),
                 ("entry_e21", "entry", "e21"), ("entry_e63", "entry", "e63"),
                 ("episode_matched_delta", "episode", "matched_delta"),
                 ("episode_capped_delta", "episode", "capped_delta"))


def _number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _summary(values):
    values = [v for v in values if _number(v)]
    return {"n": len(values), "mean": statistics.mean(values) if values else None,
            "median": statistics.median(values) if values else None,
            "min": min(values) if values else None, "max": max(values) if values else None}


def _boolean(values):
    values = [v for v in values if isinstance(v, bool)]
    return {"observed": len(values), "true": sum(values), "false": len(values) - sum(values),
            "rate": sum(values) / len(values) if values else None}


def _quantile(values, p):
    if not values:
        return None
    values = sorted(values)
    x = (len(values) - 1) * p
    lo, hi = math.floor(x), math.ceil(x)
    return values[lo] + (values[hi] - values[lo]) * (x - lo)


def quarters_between(start, end):
    """All decision-interval quarters, including quarters with zero observations."""
    first, last = date.fromisoformat(start), date.fromisoformat(end)
    a = first.year * 4 + (first.month - 1) // 3
    b = last.year * 4 + (last.month - 1) // 3
    if b < a:
        raise ValueError("Reversed decision period")
    return [f"{q // 4}Q{q % 4 + 1}" for q in range(a, b + 1)]


def bootstrap_draws(quarters, replicates=2000):
    if replicates < 0 or not isinstance(replicates, int):
        raise ValueError("Invalid bootstrap replicate count")
    n = len(quarters)
    if not n:
        return []
    rng = random.Random(SEED)
    draws = []
    for _ in range(replicates):
        sampled = []
        while len(sampled) < n:
            start = rng.randrange(n)
            sampled.extend((start, (start + 1) % n))
        counts = Counter(sampled[:n])
        draws.append(tuple(counts[i] for i in range(n)))
    return draws


def _complete(row):
    return row["complete"] is True if "complete" in row else row.get("status") == "complete"


def _type_rows(records):
    grouped = {kind: [] for kind in TYPES}
    for row in records:
        grouped[row["type"]].append(row)
    return grouped


def _flat_aggregate(rows):
    """Discover flat metrics, excluding identifiers; retain no source strings."""
    keys = sorted(set().union(*(row.keys() for row in rows))) if rows else []
    numeric, boolean, statuses = {}, {}, {}
    for key in keys:
        if key in TAG_KEYS:
            continue
        values = [row.get(key) for row in rows]
        if any(isinstance(v, bool) for v in values):
            boolean[key] = _boolean(values)
        elif any(_number(v) for v in values):
            numeric[key] = _summary(values)
        elif key == "status" or key.endswith("_status"):
            statuses[key] = dict(sorted(Counter(v for v in values if isinstance(v, str)).items()))
    return {"n": len(rows), "numeric": numeric, "boolean": boolean, "status_counts": statuses}


def _classification(entries):
    labelled = [r for r in entries if isinstance(r.get("breakdown21"), bool)
                and isinstance(r.get("H"), bool) and isinstance(r.get("V"), bool)]
    result = {"labelled_opportunities": len(labelled),
              "breakdowns": sum(r["breakdown21"] for r in labelled),
              "nonbreakdowns": sum(not r["breakdown21"] for r in labelled),
              "label_note": "Independent breakdown21 proxy; nonbreakdowns include corrections and ambiguous outcomes"}
    for method in ("H", "V"):
        tp = sum(r[method] and r["breakdown21"] for r in labelled)
        fp = sum(r[method] and not r["breakdown21"] for r in labelled)
        fn = sum(not r[method] and r["breakdown21"] for r in labelled)
        tn = sum(not r[method] and not r["breakdown21"] for r in labelled)
        signals = [r for r in entries if r.get(method) is True]
        result[method] = {"tp": tp, "fp": fp, "fn": fn, "tn": tn,
                          "precision": tp / (tp + fp) if tp + fp else None,
                          "recall": tp / (tp + fn) if tp + fn else None,
                          "false_positive_rate": fp / (fp + tn) if fp + tn else None,
                          "recovery21_on_signals": _boolean(r.get("recovery21") for r in signals),
                          "positive21_on_signals": _boolean(r.get("positive21") for r in signals)}
    result["V_minus_H"] = {key: result["V"][key] - result["H"][key]
                           if result["V"][key] is not None and result["H"][key] is not None else None
                           for key in ("precision", "recall", "false_positive_rate")}
    return result


def _agreement(rows, h="H", v="V"):
    available = [r for r in rows if isinstance(r.get(h), bool) and isinstance(r.get(v), bool)]
    return {"available": len(available),
            "both": sum(r[h] and r[v] for r in available),
            "H_only": sum(r[h] and not r[v] for r in available),
            "V_only": sum(r[v] and not r[h] for r in available),
            "neither": sum(not r[h] and not r[v] for r in available)}


def _joint(rows, h, v):
    return dict(sorted(Counter(f"{r.get(h, 'unavailable')} | {r.get(v, 'unavailable')}" for r in rows).items()))


def _trigger_summary(holdings, method):
    triggered = [r for r in holdings if r.get(method + "_trigger") is True]
    keys = sorted({key for r in triggered for key in r if key.startswith(method + "_")})
    return {"triggered": len(triggered),
            "numeric": {key: _summary(r.get(key) for r in triggered) for key in keys
                        if any(_number(r.get(key)) for r in triggered)},
            "boolean": {key: _boolean(r.get(key) for r in triggered) for key in keys
                        if any(isinstance(r.get(key), bool) for r in triggered)}}


def _quarter_vectors(observations, quarters):
    positions = {q: i for i, q in enumerate(quarters)}
    sums, counts = [0.0] * len(quarters), [0] * len(quarters)
    values = []
    for row, value in observations:
        if not _number(value):
            continue
        if row["quarter"] not in positions:
            raise ValueError("Observation outside decision quarter grid")
        i = positions[row["quarter"]]
        sums[i] += value
        counts[i] += 1
        values.append(value)
    return sums, counts, values


def _ratio_samples(sums, counts, draws):
    samples = []
    for weights in draws:
        n = sum(w * c for w, c in zip(weights, counts))
        samples.append(sum(w * s for w, s in zip(weights, sums)) / n if n else None)
    return samples


def _interval(values, samples, counts, draws, quarters):
    finite = [v for v in samples if _number(v)]
    n = len(values)
    occupied = sum(c > 0 for c in counts)
    return {**_summary(values), "ci95_percentile": [_quantile(finite, .025), _quantile(finite, .975)],
            "requested_replicates": len(draws), "valid_replicates": len(finite),
            "quarter_count": len(quarters), "nonempty_quarters": occupied,
            "low_coverage": n < 20 or occupied < 8,
            "scope": "exploratory common-quarter temporal interval"}


def _mean_interval(observations, quarters, draws):
    sums, counts, values = _quarter_vectors(observations, quarters)
    return _interval(values, _ratio_samples(sums, counts, draws), counts, draws, quarters)


def _classifier_interval(entries, quarters, draws, metric):
    labelled = [r for r in entries if isinstance(r.get("breakdown21"), bool)
                and isinstance(r.get("H"), bool) and isinstance(r.get("V"), bool)]
    samples = {}
    observed = {}
    all_counts = None
    denominators, occupied_by_method = {}, {}
    for method in ("H", "V"):
        if metric == "precision":
            denom = lambda r: r[method]
            numerator = lambda r: r["breakdown21"]
        elif metric == "recall":
            denom = lambda r: r["breakdown21"]
            numerator = lambda r: r[method]
        elif metric == "false_positive_rate":
            denom = lambda r: not r["breakdown21"]
            numerator = lambda r: r[method]
        else:
            raise ValueError(metric)
        eligible = [r for r in labelled if denom(r)]
        sums, counts, values = _quarter_vectors(((r, float(numerator(r))) for r in eligible), quarters)
        samples[method] = _ratio_samples(sums, counts, draws)
        observed[method] = statistics.mean(values) if values else None
        denominators[method] = len(values)
        occupied_by_method[method] = sum(c > 0 for c in counts)
        if all_counts is None:
            all_counts = counts
        else:
            all_counts = [a + b for a, b in zip(all_counts, counts)]
    delta = observed["V"] - observed["H"] if None not in observed.values() else None
    diffs = [v - h if v is not None and h is not None else None
             for h, v in zip(samples["H"], samples["V"])]
    interval = _interval([], diffs, all_counts, draws, quarters)
    interval.update({"n": len(labelled), "mean": delta, "median": None,
                     "min": None, "max": None, "H": observed["H"], "V": observed["V"],
                     "H_denominator": denominators["H"], "V_denominator": denominators["V"],
                     "H_nonempty_quarters": occupied_by_method["H"],
                     "V_nonempty_quarters": occupied_by_method["V"],
                     "low_coverage": min(denominators.values()) < 20 or min(occupied_by_method.values()) < 8,
                     "unit": "rate difference V minus H"})
    return interval


def _false_alarm_interval(entries, quarters, draws, field):
    """Conditional signal-rate differences; identical source opportunity set."""
    samples, rates, combined = {}, {}, [0] * len(quarters)
    denominators, occupied = {}, {}
    for method in ("H", "V"):
        eligible = [r for r in entries if r.get(method) is True and isinstance(r.get(field), bool)]
        sums, counts, values = _quarter_vectors(((r, float(r[field])) for r in eligible), quarters)
        samples[method] = _ratio_samples(sums, counts, draws)
        rates[method] = statistics.mean(values) if values else None
        denominators[method] = len(values)
        occupied[method] = sum(c > 0 for c in counts)
        combined = [a + b for a, b in zip(combined, counts)]
    diffs = [v - h if v is not None and h is not None else None
             for h, v in zip(samples["H"], samples["V"])]
    result = _interval([], diffs, combined, draws, quarters)
    result.update({"n": sum(isinstance(r.get(field), bool) for r in entries),
                   "mean": rates["V"] - rates["H"] if None not in rates.values() else None,
                   "H_denominator": denominators["H"], "V_denominator": denominators["V"],
                   "H_nonempty_quarters": occupied["H"], "V_nonempty_quarters": occupied["V"],
                   "low_coverage": min(denominators.values()) < 20 or min(occupied.values()) < 8,
                   "H": rates["H"], "V": rates["V"], "unit": "conditional rate difference V minus H"})
    return result


def summarize_group(records, quarters=None, draws=None):
    """Aggregate one fixed scope; optional common draws add primary intervals."""
    grouped = _type_rows(records)
    entries, holdings, episodes = (grouped[k] for k in TYPES)
    complete = [r for r in holdings if _complete(r)]
    result = {"counts": {kind: len(rows) for kind, rows in grouped.items()},
              "by_type": {kind: _flat_aggregate(rows) for kind, rows in grouped.items()},
              "entry": {"agreement": _agreement(entries), "classification": _classification(entries),
                        "signal_outcomes": {method: _flat_aggregate([r for r in entries if r.get(method) is True])
                                            for method in ("H", "V")},
                        "disagreement_outcomes": {label: _flat_aggregate([r for r in entries if
                            r.get("H") is h and r.get("V") is v])
                            for label, h, v in (("H_only", True, False), ("V_only", False, True),
                                                ("both", True, True), ("neither", False, False))}},
              "holding": {"scheduled": len(holdings), "complete": len(complete),
                          "incomplete": len(holdings) - len(complete),
                          "agreement_complete": _agreement(complete, "H_trigger", "V_trigger"),
                          "H": _trigger_summary(complete, "H"), "V": _trigger_summary(complete, "V"),
                          "economics_complete": {key: _summary(r.get(key) for r in complete)
                                                 for key in ("delta_vh", "delta_h_ref", "delta_v_ref",
                                                             "return_h", "return_v", "return_ref")},
                          "V_beats_H": sum(r.get("delta_vh", 0) > 1e-12 for r in complete),
                          "H_beats_V": sum(r.get("delta_vh", 0) < -1e-12 for r in complete),
                          "same_economics": sum(_number(r.get("delta_vh")) and abs(r["delta_vh"]) <= 1e-12 for r in complete)},
              "episode": {"onset_agreement": _agreement(episodes, "H0", "V0"),
                          "joint_status_counts": _joint(episodes, "H_status", "V_status"),
                          "response_timing_counts": {"V_earlier": sum(_number(r.get("matched_delta")) and r["matched_delta"] < 0 for r in episodes),
                                                     "same": sum(_number(r.get("matched_delta")) and r["matched_delta"] == 0 for r in episodes),
                                                     "V_later": sum(_number(r.get("matched_delta")) and r["matched_delta"] > 0 for r in episodes)}}}
    if quarters is not None and draws is not None:
        primary_rows = {"entry": entries, "holding": complete, "episode": episodes}
        result["uncertainty"] = {name: _mean_interval(((r, r.get(field)) for r in primary_rows[kind]), quarters, draws)
                                 for name, kind, field in PRIMARY_MEANS}
        for metric in ("precision", "recall", "false_positive_rate"):
            result["uncertainty"]["entry_" + metric + "_delta"] = _classifier_interval(entries, quarters, draws, metric)
        for field in ("recovery21", "positive21"):
            result["uncertainty"]["entry_signal_" + field + "_delta"] = _false_alarm_interval(entries, quarters, draws, field)
    else:
        result["uncertainty_status"] = "descriptive only; no pooled or subgroup interval calculated"
    return result


def _equal_security(records, symbols, quarters, draws):
    grouped = _type_rows(records)
    output = {}
    for name, kind, field in PRIMARY_MEANS:
        by_symbol = {}
        sampled = {}
        for symbol in symbols:
            eligible = [r for r in grouped[kind] if r["symbol"] == symbol
                        and (kind != "holding" or _complete(r))]
            sums, counts, values = _quarter_vectors(((r, r.get(field)) for r in eligible), quarters)
            if values:
                by_symbol[symbol] = statistics.mean(values)
                sampled[symbol] = _ratio_samples(sums, counts, draws)
        macro_samples = []
        for i in range(len(draws)):
            values = [sampled[s][i] for s in by_symbol]
            # A draw must observe every symbol defining this fixed macro estimand.
            macro_samples.append(statistics.mean(values) if values and None not in values else None)
        valid = [v for v in macro_samples if _number(v)]
        output[name] = {"security_count": len(by_symbol), "per_security_means": by_symbol,
                        "mean": statistics.mean(by_symbol.values()) if by_symbol else None,
                        "ci95_percentile": [_quantile(valid, .025), _quantile(valid, .975)],
                        "valid_replicates": len(valid), "requested_replicates": len(draws),
                        "scope": "equal observed-security means; common-quarter draws require every defining security",
                        "low_coverage": len(by_symbol) < 8 or len(quarters) < 8}
    return output


def _period_definition(periods):
    if isinstance(periods, dict):
        return [dict(value, name=key) for key, value in periods.items()]
    return list(periods)


def summarize(records, periods, symbols, replicates=2000):
    """Return permitted private aggregates; never return ephemeral input rows.

    Periods are a list of {name,start,end,outcome_end} dictionaries, or a mapping
    name -> equivalent metadata. No across-period uncertainty is calculated.
    Subgroup quarters are identical to the full period, including empty cells.
    """
    records = list(records)
    periods = _period_definition(periods)
    names = [p["name"] for p in periods]
    if len(set(names)) != len(names):
        raise ValueError("Duplicate period name")
    if any(r.get("type") not in TYPES or r.get("period") not in names for r in records):
        raise ValueError("Unknown record type or period")
    if any(r.get("symbol") not in symbols for r in records):
        raise ValueError("Unknown security")
    result = {"schema_version": "c1-volnorm-aggregate-v1", "methodology": {
        "bootstrap": "circular two-quarter common blocks within each fixed decision interval",
        "seed": SEED, "replicates": replicates, "zero_event_quarters_retained": True,
        "interval_scope": "exploratory temporal uncertainty, purposive securities, no multiplicity adjustment",
        "pooled_scope": "descriptive only; development and validation remain separate",
        "subgroup_scope": "original tags retained; no regrouping after exclusions",
        "primary_economics_unit": "percentage points, paired identical-entry hypothetical lots"},
        "periods": {}, "pooled_descriptive": summarize_group(records)}
    for period in periods:
        selected = [r for r in records if r["period"] == period["name"]]
        quarters = quarters_between(period["start"], period["end"])
        draws = bootstrap_draws(quarters, replicates)
        if any(r.get("quarter") not in quarters for r in selected):
            raise ValueError("Observation outside decision interval")
        group = {"definition": {key: period[key] for key in ("name", "start", "end", "outcome_end") if key in period},
                 "quarters": quarters, "overall": summarize_group(selected, quarters, draws),
                 "per_security": {s: summarize_group([r for r in selected if r["symbol"] == s], quarters, draws) for s in symbols},
                 "equal_security": _equal_security(selected, symbols, quarters, draws),
                 "entry_positive_context": summarize_group([r for r in selected if r["type"] == "entry" and r.get("context") is True], quarters, draws),
                 "leave_one_security_out": {s: summarize_group([r for r in selected if r["symbol"] != s], quarters, draws) for s in symbols},
                 "excluding_nvda_tsla": summarize_group([r for r in selected if r["symbol"] not in ("NVDA", "TSLA")], quarters, draws)}
        for key, output_key in (("sector", "sectors"), ("regime", "regimes"), ("risk_group", "risk_groups")):
            labels = sorted({str(r.get(key, "unclassified")) for r in selected})
            group[output_key] = {label: summarize_group([r for r in selected if str(r.get(key, "unclassified")) == label], quarters, draws) for label in labels}
        years = sorted({q[:4] for q in quarters})
        group["years"] = {year: summarize_group([r for r in selected if r["quarter"].startswith(year)], quarters, draws) for year in years}
        result["periods"][period["name"]] = group
    return result

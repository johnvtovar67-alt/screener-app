"""Pure, paired entry diagnostics and symmetric deterioration episodes.

All returned records are ephemeral inputs to aggregate summaries, not public
artifacts.  No network, output, threshold fitting, or production imports.
Calendar opportunity selection uses the supplied common SPY session calendar;
security gaps never compress time or move an opportunity to an earlier day.
"""
from __future__ import annotations

from bisect import bisect_left, bisect_right
from datetime import date

from common import complete, forward, pct, tag


def _bounds(dates, period):
    return (bisect_left(dates, period["start"]),
            bisect_right(dates, period["end"]) - 1,
            bisect_right(dates, period["outcome_end"]) - 1)


def _peak(rows, t):
    return max(row["close"] for row in rows[t - 19:t + 1]) if complete(rows, t - 19, t) else None


def _known(features, t):
    return (0 <= t < len(features) and features[t] is not None
            and features[t].get("H") is not None and features[t].get("V") is not None)


def _weekly_last(dates):
    """Last calendar session in each ISO week, before any period filtering."""
    weeks = {}
    for t, day in enumerate(dates):
        iso = date.fromisoformat(day).isocalendar()
        weeks[(iso.year, iso.week)] = t
    return sorted(weeks.values())


def _labels(outcome):
    # Recovery and forward return have a common observed denominator.  An
    # incomplete path is not a non-recovery, breakdown, or false alarm.
    if outcome.get("f21") is None or outcome.get("recovery21") is None:
        return {"correction21": None, "breakdown21": None,
                "positive21": None, "ambiguous21": None}
    recovery = bool(outcome["recovery21"])
    breakdown = outcome["f21"] < 0 and not recovery
    return {"correction21": recovery, "breakdown21": breakdown,
            "positive21": outcome["f21"] > 0,
            "ambiguous21": not (recovery or breakdown)}


def build_entries(symbol, rows, features, dates, period, sector):
    """No-veto/H/V decisions on identical, prespecified weekly opportunities."""
    start, end, limit = _bounds(dates, period)
    records = []
    for t in _weekly_last(dates):
        if t < start or t > end or not _known(features, t):
            continue
        f = features[t]
        h, v = bool(f["H"]), bool(f["V"])
        out = forward(rows, t, limit, _peak(rows, t))
        record = dict(tag(symbol, t, dates, features, period, sector))
        record.update({"type": "entry", "H": h, "V": v,
                       "context": f.get("context"), "z": f.get("z"),
                       "sigma": f.get("sigma"), "r5": f.get("r5")})
        record.update(out)
        record.update(_labels(out))
        for horizon in (21, 63):
            ret = out.get(f"f{horizon}")
            # Cash has zero return, with no replacement or deferred purchase.
            # The common denominator is retained even when neither arm vetoes.
            record[f"h{horizon}"] = -ret * h if ret is not None else None
            record[f"v{horizon}"] = -ret * v if ret is not None else None
            record[f"e{horizon}"] = -ret * (int(v) - int(h)) if ret is not None else None
        records.append(record)
    return records


def _response(rows, features, onset, limit, method):
    """First breach; a missing earlier observation cannot be skipped."""
    stop = min(onset + 63, limit, len(features) - 1, len(rows) - 1)
    for t in range(onset, stop + 1):
        if rows[t] is None or features[t] is None:
            return {"status": "censored_missing", "latency": None,
                    "capped_latency": None}, None
        value = features[t].get(method)
        if value is None:
            return {"status": "censored_missing", "latency": None,
                    "capped_latency": None}, None
        breached = bool(value) if method in ("H", "V") else value <= 0
        if breached:
            latency = t - onset
            return {"status": "observed", "latency": latency,
                    "capped_latency": latency}, t
    if stop == onset + 63:
        return {"status": "no_response", "latency": None,
                "capped_latency": 63}, None
    return {"status": "censored_end", "latency": None,
            "capped_latency": None}, None


def build_episodes(symbol, rows, features, dates, period, sector):
    """Union-first episodes avoid choosing either candidate's trigger clock."""
    start, end, limit = _bounds(dates, period)
    previous = None
    records = []
    for onset in range(start, end + 1):
        if not _known(features, onset):
            continue
        f = features[onset]
        if not (f["H"] or f["V"]):
            continue
        if previous is not None and onset - previous < 21:
            continue
        previous = onset
        peak = _peak(rows, onset)
        record = dict(tag(symbol, onset, dates, features, period, sector))
        record.update({"type": "episode", "H0": bool(f["H"]), "V0": bool(f["V"]),
                       "context": f.get("context"), "z": f.get("z"),
                       "sigma": f.get("sigma"), "r5": f.get("r5")})
        out = forward(rows, onset, limit, peak)
        record.update(out)
        record.update(_labels(out))
        for method in ("H", "V", "slow", "fast"):
            result, response = _response(rows, features, onset, limit, method)
            record.update({f"{method}_{key}": value for key, value in result.items()})
            if response is not None:
                response_peak = _peak(rows, response)
                result_out = forward(rows, response, limit, response_peak)
                result_out.update(_labels(result_out))
                record.update({f"{method}_{key}": value for key, value in result_out.items()})
                record[f"{method}_decline_onset_pct"] = max(0.0, -pct(rows[response]["close"], rows[onset]["close"]))
                record[f"{method}_decline_peak_pct"] = max(0.0, -pct(rows[response]["close"], peak)) if peak is not None else None
            else:
                # All records expose these denominators explicitly.
                for key in ("f5", "f21", "f63", "risk_f5", "risk_f21", "risk_f63",
                            "recovery21", "breakdown21", "correction21", "positive21",
                            "ambiguous21", "mae21", "mfe21", "decline_onset_pct", "decline_peak_pct"):
                    record[f"{method}_{key}"] = None
        record["matched_delta"] = (record["V_latency"] - record["H_latency"]
                                   if record["H_status"] == record["V_status"] == "observed" else None)
        record["capped_delta"] = (record["V_capped_latency"] - record["H_capped_latency"]
                                  if record["V_capped_latency"] is not None and record["H_capped_latency"] is not None else None)
        records.append(record)
    return records


def native_counts(symbol, rows, features, dates, period, sector):
    """Independent native clocks retained beside symmetric union episodes."""
    start, end, _ = _bounds(dates, period)
    result = {"symbol": symbol, "period": period["name"], "sector": sector,
              "eligible_dates": 0, "counts_H": 0, "counts_V": 0, "counts_union": 0}
    previous = {"H": None, "V": None, "union": None}
    for t in range(start, end + 1):
        if not _known(features, t):
            continue
        result["eligible_dates"] += 1
        f = features[t]
        for method, active in (("H", f["H"]), ("V", f["V"]), ("union", f["H"] or f["V"])):
            if active and (previous[method] is None or t - previous[method] >= 21):
                previous[method] = t
                result[f"counts_{method}"] += 1
    return result

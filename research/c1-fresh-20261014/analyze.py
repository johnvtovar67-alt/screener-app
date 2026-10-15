#!/usr/bin/env python3
"""Prespecified fresh-data signal and fixed-entry exit diagnostic; no portfolio replay.

``analyze(data, securities=SECURITIES)`` accepts symbol -> ascending normalized
adjusted OHLC dictionaries. An explicit subset supports a prespecified bounded
sentinel comparison; the default eight-security design is unchanged. A smaller
panel is disclosed in output and is not a substitute for the full sample.
It performs no I/O, downloads, account access, threshold fitting or price publication.
The returned object contains aggregate statistics, censoring counts and coarse 2019
volatility strata only. All row-level calculations stay in caller memory.

Calendar: supplied, verified SPY sessions, 2019-01-01..2024-12-31. Decisions:
2020-01-02..2024-09-30. Every return window requires every intervening SPY session;
missing observations are unavailable, never compressed or forward filled.

Champion factors are R(100,20), R(55,5); F factors R(100,0), R(55,0), where
R(L,k)=100*(close[t-k]/close[t-k-L]-1). No percentile or rank surrogate is used.
Paired rolling statistics use identical symbol/date observations. Deterioration
onsets require R(5,0)<=-7% and at least 21 SPY-session intervals since the last
onset. Response is the first nonpositive factor from onset through onset+63,
including already nonpositive factors. Missing intervening factors censor first
response timing. A full 63-session nonresponse is distinct from right censoring.
Price damage uses onset close and the fixed trailing 20-close peak at onset.
Declines/drawdowns are floored at zero; signed onset-to-response change is separate.

Dividend-adjusted OHLC is a total-return-style price series. Its historical open
is a hypothetical adjusted-price basis, not a literal executable traded fill.
Dividends are implicit in the adjustment; explicit share/dividend cash accounting
is unavailable. All open/close sale and proceeds comparisons below are adjusted-
price proxies, not executable fills or actual realizable proceeds.

Lots enter at the available adjusted open of the first SPY session of each
calendar quarter within the decision period, identically scheduled for every
security in the selected panel. Entry age is zero. The no-signal reference sells at age 63 close.
H triggers on the first age>=5 completed close with R(5,0)<=-7%. P latches a
completed-close peak gain>=12% since entry, then triggers at age>=5 when current
gain<=half that peak gain, even below basis. P uses the hypothetical entry open
as basis, not an actual-account basis. Decisions at ages5..62 can execute at the
next session open through age63; reference liquidation then takes priority.
Hypothetical next-open and reference close sales both incur 12 bps adverse sell
cost. Entry has no modeled cost. No reinvestment, reentry, ranking, hard stops,
portfolio breaker, cash/position sizing or execution affordability is modeled.
These are marginal trigger diagnostics, not the complete H/P or Champion policy.

Forward h-session adjusted underlying return is
100*(close[exit_session+h]/open[exit_session]-1), h in {5,21,63}, without fee
subtraction. For a factor response, exit_session=response_session+1 supplies the
same next-open adjusted-price proxy; no position or sale is implied. A recovery proxy is a
close at or above the preexit completed-close peak during sessions e+1..e+21;
positive 21-session forward return is reported separately and jointly. Neither
is a validated false-exit label. Missing horizons are censored. Giveback is peak
completed-close gain minus gain at signal/net exit, in percentage points; the
fraction divides by a positive peak gain. Reference peak includes age63 close.

Volatility groups are frozen from 2019 sample standard deviation of daily simple
returns. Every 2019 SPY close must exist for a security to receive a stratum.
The cross-security median is the fixed cutoff; ties go to the lower group.
Descriptive aggregates across overlapping lots/events are not independent tests.
"""
from __future__ import annotations

import math
import statistics
from collections import Counter
from datetime import date as calendar_date

SECURITIES = ("AAPL", "MSFT", "NVDA", "TSLA", "JPM", "XOM", "PG", "JNJ")
START = "2020-01-02"
END = "2024-09-30"
DATA_START = "2019-01-01"
DATA_END = "2024-12-31"
COST = 0.0012
FACTORS = {
    "champion_slow": (100, 20),
    "champion_fast": (55, 5),
    "F_slow": (100, 0),
    "F_fast": (55, 0),
}


def _summary(values):
    values = [float(v) for v in values if v is not None and math.isfinite(v)]
    return {"n": len(values), "mean": statistics.mean(values) if values else None,
            "median": statistics.median(values) if values else None}


def _pct(current, prior):
    return 100.0 * (current / prior - 1.0)


def _complete(rows, start, end):
    return start >= 0 and end < len(rows) and all(rows[i] is not None for i in range(start, end + 1))


def _factor(rows, t, length, skip=0):
    # Whole-window continuity prevents silently changing a session-based lookback.
    if not _complete(rows, t - skip - length, t):
        return None
    return _pct(rows[t - skip]["close"], rows[t - skip - length]["close"])


def _normalize(data, securities=SECURITIES):
    missing = [s for s in ("SPY",) + securities if s not in data]
    if missing:
        raise ValueError("Missing required symbols: " + ", ".join(missing))
    normalized = {}
    for symbol in ("SPY",) + securities:
        by_date = {}
        previous = ""
        for bar in data[symbol]:
            date = bar.get("date")
            if not isinstance(date, str) or len(date) != 10 or date <= previous:
                raise ValueError(f"Unordered/duplicate/invalid dates for {symbol}")
            try:
                if calendar_date.fromisoformat(date).isoformat() != date:
                    raise ValueError
            except ValueError:
                raise ValueError(f"Invalid date for {symbol}") from None
            previous = date
            if not DATA_START <= date <= DATA_END:
                continue
            row = {"date": date}
            for key in ("open", "high", "low", "close"):
                value = bar.get(key)
                if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
                    raise ValueError(f"Invalid OHLC value for {symbol}")
                row[key] = float(value)
            if row["high"] < max(row["open"], row["close"]) - 1e-8 or row["low"] > min(row["open"], row["close"]) + 1e-8 or row["low"] > row["high"]:
                raise ValueError(f"Invalid OHLC ordering for {symbol}")
            by_date[date] = row
        normalized[symbol] = by_date
    dates = sorted(normalized["SPY"])
    if not dates or not any(START <= d <= END for d in dates):
        raise ValueError("SPY calendar lacks evaluation observations")
    calendar = set(dates)
    for symbol in securities:
        if set(normalized[symbol]) - calendar:
            raise ValueError(f"Security has observations outside SPY calendar: {symbol}")
    rows = {s: [normalized[s].get(d) for d in dates] for s in securities}
    return dates, rows


def _volatility_strata(dates, rows, securities=SECURITIES):
    indexes = [i for i, d in enumerate(dates) if "2019-01-01" <= d <= "2019-12-31"]
    sigmas = {}
    for symbol in securities:
        series = rows[symbol]
        if len(indexes) < 2 or not _complete(series, indexes[0], indexes[-1]):
            continue
        returns = [series[i]["close"] / series[i - 1]["close"] - 1 for i in indexes[1:]]
        sigmas[symbol] = statistics.stdev(returns) if len(returns) > 1 else 0.0
    cutoff = statistics.median(sigmas.values()) if sigmas else None
    groups = {s: ("unclassified" if s not in sigmas else "low_2019_volatility" if sigmas[s] <= cutoff else "high_2019_volatility") for s in securities}
    # The cutoff and individual volatility estimates are deliberately not published.
    return groups, {"formation_year": 2019, "measure": "sample SD of daily simple returns",
                    "split": "cross-security median; ties low; complete 2019 calendar required",
                    "security_classification": groups, "group_counts": dict(Counter(groups.values()))}


def _forward(rows, execution, last):
    result = {}
    for horizon in (5, 21, 63):
        end = execution + horizon
        key = f"forward{horizon}"
        if end > last:
            result[key + "_status"] = "censored_end"
        elif not _complete(rows, execution, end):
            result[key + "_status"] = "censored_missing"
        else:
            result[key + "_status"] = "observed"
            result[key + "_return_pct"] = _pct(rows[end]["close"], rows[execution]["open"])
    return result


def _response(rows, onset, length, skip, last):
    end = min(onset + 63, last)
    initial = _factor(rows, onset, length, skip)
    if initial is None:
        return {"status": "censored_missing", "already_nonpositive": False}
    for t in range(onset, end + 1):
        value = _factor(rows, t, length, skip)
        if value is None:
            return {"status": "censored_missing", "already_nonpositive": initial <= 0}
        if value <= 0:
            peak = max(rows[i]["close"] for i in range(onset - 19, onset + 1))
            return {"status": "responded", "already_nonpositive": t == onset,
                    "latency_sessions": t - onset,
                    "price_change_from_onset_pct": _pct(rows[t]["close"], rows[onset]["close"]),
                    "decline_from_onset_pct": max(0.0, -_pct(rows[t]["close"], rows[onset]["close"])),
                    "drawdown_from_onset_trailing20_peak_pct": max(0.0, 100 * (1 - rows[t]["close"] / peak)),
                    **_forward(rows, t + 1, last)}
    return {"status": "no_response_within63" if end == onset + 63 else "censored_end",
            "already_nonpositive": False}


def _lot(rows, entry, method, last):
    """Internal ephemeral metrics only; no dates, symbols or prices are returned."""
    terminal = entry + 63
    if terminal > last:
        return {"status": "censored_reference_end"}
    if not _complete(rows, entry, terminal):
        return {"status": "censored_missing_lot_path"}
    basis = rows[entry]["open"]
    peak_gain = -math.inf
    armed = False
    trigger = None
    for t in range(entry, terminal):
        gain = _pct(rows[t]["close"], basis)
        peak_gain = max(peak_gain, gain)
        armed = armed or peak_gain >= 12.0 - 1e-10
        age = t - entry
        if age < 5:
            continue
        if method == "H":
            hit = _factor(rows, t, 5) <= -7.0 + 1e-10
        else:
            hit = armed and gain <= 0.5 * peak_gain + 1e-10
        if hit:
            trigger = t
            break
    reference_net = rows[terminal]["close"] * (1 - COST)
    reference_peak = max(_pct(rows[t]["close"], basis) for t in range(entry, terminal + 1))
    result = {"status": "complete", "triggered": trigger is not None,
              "reference_net_return_pct": _pct(reference_net, basis),
              "reference_giveback_pp": max(0.0, reference_peak) - _pct(reference_net, basis),
              "reference_positive_close_peak": reference_peak > 0}
    if reference_peak > 0:
        result["reference_giveback_fraction"] = result["reference_giveback_pp"] / reference_peak
    if trigger is None:
        return result
    execution = trigger + 1
    exit_open = rows[execution]["open"]
    exit_net = exit_open * (1 - COST)
    signal_gain = _pct(rows[trigger]["close"], basis)
    observed_peak = max(rows[t]["close"] for t in range(entry, trigger + 1))
    last_peak_session = max(t for t in range(entry, trigger + 1) if rows[t]["close"] == observed_peak)
    observed_peak_gain = _pct(observed_peak, basis)
    result.update({"signal_age_sessions": trigger - entry,
                   "execution_age_sessions": execution - entry,
                   "sessions_from_last_completed_close_peak_to_signal": trigger - last_peak_session,
                   "released_sessions_until_reference": terminal - execution,
                   "signal_gain_pct": signal_gain,
                   "net_exit_return_pct": _pct(exit_net, basis),
                   "exit_vs_reference_proceeds_pct": _pct(exit_net, reference_net),
                   "signal_giveback_pp": max(0.0, observed_peak_gain) - signal_gain,
                   "exit_giveback_pp": max(0.0, observed_peak_gain) - _pct(exit_net, basis),
                   "positive_preexit_close_peak": observed_peak_gain > 0})
    if _complete(rows, trigger - 19, trigger):
        trailing_peak = max(rows[t]["close"] for t in range(trigger - 19, trigger + 1))
        result["signal_drawdown_from_trailing20_peak_pct"] = 100 * (1 - rows[trigger]["close"] / trailing_peak)
    if observed_peak_gain > 0:
        result["signal_giveback_fraction"] = result["signal_giveback_pp"] / observed_peak_gain
        result["exit_giveback_fraction"] = result["exit_giveback_pp"] / observed_peak_gain
    result.update(_forward(rows, execution, last))
    if result["forward21_status"] == "observed":
        recovered = any(rows[t]["close"] >= observed_peak - 1e-10 for t in range(execution + 1, execution + 22))
        positive = result["forward21_return_pct"] > 0
        result["recovered_preexit_peak_within21"] = recovered
        result["positive_forward21"] = positive
        result["both_recovered_and_positive21"] = recovered and positive
    return result


def _event_aggregate(records):
    output = {}
    for name in FACTORS:
        values = [r[name] for r in records]
        responded = [r for r in values if r["status"] == "responded"]
        delayed = [r for r in responded if not r["already_nonpositive"]]
        output[name] = {"events": len(values), "status_counts": dict(Counter(r["status"] for r in values)),
                        "already_nonpositive_at_onset": sum(r["already_nonpositive"] for r in values),
                        "response_metrics_including_already_nonpositive": {
                            k: _summary(r.get(k) for r in responded) for k in
                            ("latency_sessions", "price_change_from_onset_pct", "decline_from_onset_pct", "drawdown_from_onset_trailing20_peak_pct")},
                        "latency_when_positive_at_onset_and_later_responding": _summary(r["latency_sessions"] for r in delayed)}
        output[name]["forward_after_response_next_open_proxy"] = {str(h): {
            "status_counts": dict(Counter(r[f"forward{h}_status"] for r in responded)),
            "adjusted_underlying_return_pct": _summary(r.get(f"forward{h}_return_pct") for r in responded)} for h in (5, 21, 63)}
    pairs = {}
    for speed in ("slow", "fast"):
        matched = [r for r in records if r["champion_" + speed]["status"] == r["F_" + speed]["status"] == "responded"]
        pairs[speed] = {"both_responded": len(matched),
                        "F_minus_champion_latency_sessions": _summary(r["F_" + speed]["latency_sessions"] - r["champion_" + speed]["latency_sessions"] for r in matched),
                        "F_earlier_count": sum(r["F_" + speed]["latency_sessions"] < r["champion_" + speed]["latency_sessions"] for r in matched),
                        "F_later_count": sum(r["F_" + speed]["latency_sessions"] > r["champion_" + speed]["latency_sessions"] for r in matched),
                        "same_response_session_count": sum(r["F_" + speed]["latency_sessions"] == r["champion_" + speed]["latency_sessions"] for r in matched)}
    return {"onsets": len(records), "factors": output, "paired_response": pairs}


def _lot_aggregate(records):
    complete = [r for r in records if r["status"] == "complete"]
    triggered = [r for r in complete if r["triggered"]]
    output = {"scheduled_lots": len(records), "status_counts": dict(Counter(r["status"] for r in records)),
              "complete_lots": len(complete), "triggered_lots": len(triggered),
              "trigger_frequency_of_complete_lots": len(triggered) / len(complete) if complete else None,
              "positive_preexit_close_peak_lots": sum(r.get("positive_preexit_close_peak", False) for r in triggered),
              "metrics_on_triggered_lots": {k: _summary(r.get(k) for r in triggered) for k in
                  ("signal_age_sessions", "execution_age_sessions", "sessions_from_last_completed_close_peak_to_signal", "released_sessions_until_reference",
                   "signal_gain_pct", "net_exit_return_pct", "exit_vs_reference_proceeds_pct",
                   "signal_drawdown_from_trailing20_peak_pct", "signal_giveback_pp", "exit_giveback_pp",
                   "signal_giveback_fraction", "exit_giveback_fraction")},
              "reference_metrics_all_complete_lots": {k: _summary(r.get(k) for r in complete) for k in
                  ("reference_net_return_pct", "reference_giveback_pp", "reference_giveback_fraction")},
              "higher_net_proceeds_than_scheduled_reference": sum(r["exit_vs_reference_proceeds_pct"] > 0 for r in triggered),
              "lower_net_proceeds_than_scheduled_reference": sum(r["exit_vs_reference_proceeds_pct"] < 0 for r in triggered)}
    output["forward_after_triggered_next_open_exit"] = {str(h): {
        "status_counts": dict(Counter(r[f"forward{h}_status"] for r in triggered)),
        "adjusted_underlying_return_pct": _summary(r.get(f"forward{h}_return_pct") for r in triggered)} for h in (5, 21, 63)}
    output["all_complete_lots_same_fixed_entry_schedule"] = {
        "lots": len(complete),
        "hypothetical_marginal_rule_net_adjusted_return_pct": _summary(r.get("net_exit_return_pct", r["reference_net_return_pct"]) for r in complete),
        "reference_net_adjusted_return_pct": _summary(r["reference_net_return_pct"] for r in complete),
        "difference_in_net_adjusted_return_pp": _summary(r.get("net_exit_return_pct", r["reference_net_return_pct"]) - r["reference_net_return_pct"] for r in complete),
        "difference_in_adjusted_sale_proxy_pct": _summary(r.get("exit_vs_reference_proceeds_pct", 0.0) for r in complete),
        "interpretation": "Equal-lot descriptive statistics; triggered lots use next-open proxy, all others retain scheduled age63 close; no capital weights or portfolio accounting."}
    observed = [r for r in triggered if r["forward21_status"] == "observed"]
    output["false_exit_proxies"] = {"observed_21session_horizons": len(observed),
        "regained_preexit_close_peak_within21": sum(r["recovered_preexit_peak_within21"] for r in observed),
        "positive_open_to_forward21close": sum(r["positive_forward21"] for r in observed),
        "both": sum(r["both_recovered_and_positive21"] for r in observed)}
    return output


def analyze(data, securities=SECURITIES):
    """Return only privacy-safe aggregates; do not log or persist input bars."""
    securities = tuple(securities)
    if not securities or len(set(securities)) != len(securities) or any(s not in SECURITIES for s in securities):
        raise ValueError("Selected securities must be a nonempty unique subset of the original eight-security design")
    dates, rows = _normalize(data, securities)
    evaluation = [i for i, d in enumerate(dates) if START <= d <= END]
    last = len(dates) - 1
    groups, volatility = _volatility_strata(dates, rows, securities)
    group_names = ("all", "low_2019_volatility", "high_2019_volatility", "unclassified")
    rolling = {g: [] for g in group_names}
    event_records = {g: [] for g in group_names}
    lot_records = {g: {m: [] for m in ("H", "P")} for g in group_names}
    coverage = Counter()
    quarter_entries = []
    seen = set()
    for i in evaluation:
        quarter = (dates[i][:4], (int(dates[i][5:7]) - 1) // 3)
        if quarter not in seen:
            quarter_entries.append(i)
            seen.add(quarter)
    # Every selected security must have all four factors to enter paired statistics.
    # This preserves an identical date/security panel and exposes every exclusion.
    for i in evaluation:
        factors = {s: {name: _factor(rows[s], i, *window) for name, window in FACTORS.items()} for s in securities}
        if not all(v is not None for r in factors.values() for v in r.values()):
            coverage["excluded_unbalanced_factor_dates"] += 1
            continue
        coverage["balanced_factor_dates"] += 1
        for s in securities:
            for g in ("all", groups[s]):
                rolling[g].append(factors[s])
    for symbol in securities:
        series = rows[symbol]
        previous_onset = -10**9
        for i in evaluation:
            ret5 = _factor(series, i, 5)
            if ret5 is None:
                coverage["unavailable_event_detection_symbol_dates"] += 1
                continue
            if ret5 > -7 + 1e-10 or i - previous_onset < 21:
                continue
            if not _complete(series, i - 120, i):
                coverage["event_onsets_excluded_missing_paired_warmup"] += 1
                continue
            previous_onset = i
            record = {name: _response(series, i, *window, last) for name, window in FACTORS.items()}
            for g in ("all", groups[symbol]):
                event_records[g].append(record)
        for entry in quarter_entries:
            for method in ("H", "P"):
                record = _lot(series, entry, method, last)
                for g in ("all", groups[symbol]):
                    lot_records[g][method].append(record)
    rolling_output = {}
    for group, records in rolling.items():
        rolling_output[group] = {"paired_symbol_dates": len(records),
            "adjusted_underlying_return_factor_pct": {name: _summary(r[name] for r in records) for name in FACTORS},
            "F_minus_champion_return_pp": {speed: _summary(r["F_" + speed] - r["champion_" + speed] for r in records) for speed in ("slow", "fast")},
            "sign_disagreement_counts": {speed: {
                "F_nonpositive_champion_positive": sum(r["F_" + speed] <= 0 < r["champion_" + speed] for r in records),
                "champion_nonpositive_F_positive": sum(r["champion_" + speed] <= 0 < r["F_" + speed] for r in records)} for speed in ("slow", "fast")}}
    result = {"contract": "c1-fresh-bounded-signal-diagnostic-v1",
        "classification": "partial research; raw factors and fixed-entry marginal exit triggers; no portfolio returns",
        "evaluation_start": START, "evaluation_end": END, "warmup_start": DATA_START,
        "maximum_observation_end": DATA_END, "securities": list(securities),
        "default_design_securities": list(SECURITIES),
        "panel_scope": "full prespecified eight-security panel" if securities == SECURITIES else "explicit bounded subset; not the full eight-security study",
        "calendar": "supplied verified SPY sessions", "sell_slippage_bps": 12,
        "price_basis": "dividend-adjusted OHLC; hypothetical adjusted-open basis; sale/proceeds metrics are adjusted-price proxies, not literal executable fills",
        "dividends": "implicit in adjusted series; explicit share/dividend cash accounting unavailable",
        "coverage": {"calendar_sessions": len(dates), "evaluation_sessions": len(evaluation),
                     "scheduled_quarters": len(quarter_entries), **dict(coverage)},
        "volatility_strata": volatility,
        "paired_raw_factor_observations": rolling_output,
        "deterioration_onset_response": {g: _event_aggregate(event_records[g]) for g in group_names},
        "quarterly_fixed_entry_lots": {g: {m: _lot_aggregate(lot_records[g][m]) for m in ("H", "P")} for g in group_names},
        "limitations": [
            "No authoritative cross-sectional ranks or source-compatible Champion/F exits; raw factor responsiveness only.",
            "Quarterly entry open is a hypothetical lot basis, not an actual account fill or a source-qualified entry.",
            "Dividend-adjusted historical OHLC supports adjusted-price proxies; literal traded fills and explicit dividend/share cash accounting are absent.",
            "H/P are independent marginal triggers; hard stops and every other production exit are excluded.",
            "No portfolio accounting, reinvestment, replacement queue, reentries, cash opportunity cost or strategy returns.",
            "Future prices are used only for explicitly labeled outcomes; decisions and volatility strata use prior observations.",
            "Events and lots overlap across time/securities; no independent-observation or inferential significance claim.",
            "No threshold fitting, DELL selection, winning-rule selection, or frozen 48-Challenger modification.",
            "Normalized price adjustment authenticity, historical membership and license permissions are upstream acquisition checks."]}
    return result

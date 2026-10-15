"""Paired hypothetical Swing lots; pure calculations, no network or persistence.

Quarterly adjusted-open entries are shared by H, V and the scheduled reference.
This module invents no rank-based C1 exit.  All records are ephemeral derived
observations; neither fills nor source price levels are returned.
"""
from __future__ import annotations

from bisect import bisect_right

from common import complete, forward, pct, tag


SALE_COST = 0.0012
FIRST_SIGNAL_AGE = 5
LAST_SIGNAL_AGE = 62
REFERENCE_AGE = 63
_FORWARD_FIELDS = ("f5", "f21", "f63", "risk_f5", "risk_f21", "risk_f63",
                   "recovery21", "breakdown21", "positive21", "mae21", "mfe21")
_MAIN_FIELDS = ("delta_vh", "delta_h_ref", "delta_v_ref", "return_h", "return_v", "return_ref",
                "matched_timing")
_ARM_FIELDS = ("trigger", "age", "execution_age", "giveback_pp", "giveback_fraction",
               "signal_gain", "peak_gain", "better_ref", "worse_ref") + _FORWARD_FIELDS


def _first_quarter_sessions(dates):
    """First actual SPY session per calendar quarter, before period filtering."""
    previous = None
    for t, day in enumerate(dates):
        quarter = (day[:4], (int(day[5:7]) - 1) // 3)
        if quarter != previous:
            yield t
            previous = quarter


def _empty(symbol, t, dates, features, period, sector):
    record = tag(symbol, t, dates, features, period, sector)
    # Entry is an OPEN.  Only prior-close raw factors may label its formation
    # context; current-session closes never influence this diagnostic stratum.
    feature = (features[t - 1] or {}) if t > 0 else {}
    record.update(type="holding", complete=False, status="censored_terminal",
                  context=feature.get("context"), entry_context=feature.get("context"))
    for field in _MAIN_FIELDS:
        record[field] = None
    for arm in ("H", "V"):
        record[arm + "_status"] = "censored"
        for field in _ARM_FIELDS:
            record[arm + "_" + field] = None
    return record


def build_holdings(symbol, rows, features, dates, perioddict, sector):
    """Return identical-entry paired lots, including explicit censored records.

    Required period keys are name/start/end/outcome_end, all ISO dates except
    name.  context/entry_context use prior-close raw factors and are diagnostic,
    not entry gates. rows/features share the uncompressed SPY session index. A lot needs
    the full age0..63 path and both signal predicates at every age5..62.  Thus an
    unavailable V input is never counted as a nontrigger or a control-arm zero.
    """
    limit = bisect_right(dates, perioddict["outcome_end"]) - 1
    records = []
    for entry in _first_quarter_sessions(dates):
        if not perioddict["start"] <= dates[entry] <= perioddict["end"]:
            continue
        record = _empty(symbol, entry, dates, features, perioddict, sector)
        records.append(record)
        terminal = entry + REFERENCE_AGE
        if terminal > limit or terminal >= len(rows):
            continue
        if not complete(rows, entry, terminal):
            record["status"] = "censored_path"
            continue
        if any(features[t] is None or features[t].get(arm) is None
               for t in range(entry + FIRST_SIGNAL_AGE, entry + LAST_SIGNAL_AGE + 1)
               for arm in ("H", "V")):
            record["status"] = "censored_signal_inputs"
            continue
        entry_price = rows[entry]["open"]
        reference = pct(rows[terminal]["close"] * (1 - SALE_COST), entry_price)
        record.update(complete=True, status="complete", return_ref=reference)
        for arm in ("H", "V"):
            signal = next((t for t in range(entry + FIRST_SIGNAL_AGE, entry + LAST_SIGNAL_AGE + 1)
                           if features[t][arm]), None)
            prefix = arm + "_"
            record[prefix + "trigger"] = signal is not None
            record[prefix + "status"] = "triggered" if signal is not None else "no_trigger"
            arm_return = reference
            if signal is not None:
                age = signal - entry
                execution = signal + 1
                arm_return = pct(rows[execution]["open"] * (1 - SALE_COST), entry_price)
                peak = max(rows[t]["close"] for t in range(entry, signal + 1))
                peak_gain = pct(peak, entry_price)
                signal_gain = pct(rows[signal]["close"], entry_price)
                giveback = peak_gain - signal_gain
                record.update({prefix + "age": age, prefix + "execution_age": age + 1,
                               prefix + "signal_gain": signal_gain,
                               prefix + "peak_gain": peak_gain,
                               prefix + "giveback_pp": giveback,
                               prefix + "giveback_fraction": giveback / peak_gain if peak_gain > 0 else None})
                outcomes = forward(rows, signal, limit, peak=peak)
                record.update({prefix + field: outcomes.get(field) for field in _FORWARD_FIELDS})
            delta = arm_return - reference
            record["return_" + arm.lower()] = arm_return
            record["delta_" + arm.lower() + "_ref"] = delta
            record[prefix + "better_ref"] = delta > 0
            record[prefix + "worse_ref"] = delta < 0
        record["delta_vh"] = record["return_v"] - record["return_h"]
        if record["H_trigger"] and record["V_trigger"]:
            record["matched_timing"] = record["V_age"] - record["H_age"]
    return records

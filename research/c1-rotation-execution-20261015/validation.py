#!/usr/bin/env python3
"""Offline, private-only unit checks for the bounded FMP sentinel acquisition.

This module makes no network calls. Endpoint names, not the misleading ``adj``
field prefix alone, determine units. Numeric diagnostics remain private. Passing
these checks does not supply a ranking universe or certify portfolio economics.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import os
from pathlib import Path
import statistics

FROM, TO = "2023-12-29", "2025-04-03"
PRICE_PREFIX = "historical-price-eod/"
PRICE_KINDS = {"full", "dividend-adjusted", "non-split-adjusted"}
OHLC = ("open", "high", "low", "close")


class ValidationFailure(ValueError):
    pass


def _easter(y):
    a = y % 19; b = y // 100; c = y % 100; d = b // 4; e = b % 4
    f = (b + 8) // 25; g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30; i = c // 4; k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7; m = (a + 11 * h + 22 * l) // 451
    n = h + l - 7 * m + 114
    return dt.date(y, n // 31, n % 31 + 1)


def _nth(y, m, weekday, n):
    first = dt.date(y, m, 1)
    return first + dt.timedelta(days=(weekday - first.weekday()) % 7 + 7 * (n - 1))


def _observed(date):
    return date + dt.timedelta(days=1 if date.weekday() == 6 else -1 if date.weekday() == 5 else 0)


def sessions(lo=FROM, hi=TO):
    """NYSE sessions, including the explicitly documented Carter closure."""
    first, last = dt.date.fromisoformat(lo), dt.date.fromisoformat(hi)
    holidays = {dt.date(2025, 1, 9)}
    for y in range(first.year, last.year + 1):
        ny = dt.date(y, 1, 1)
        holidays.add(ny + dt.timedelta(days=1) if ny.weekday() == 6 else ny)
        holidays.update([
            _nth(y, 1, 0, 3), _nth(y, 2, 0, 3), _easter(y) - dt.timedelta(days=2),
            max(dt.date(y, 5, x) for x in range(25, 32) if dt.date(y, 5, x).weekday() == 0),
            _observed(dt.date(y, 7, 4)), _nth(y, 9, 0, 1),
            _nth(y, 11, 3, 4), _observed(dt.date(y, 12, 25)),
        ])
        if y >= 2022:
            holidays.add(_observed(dt.date(y, 6, 19)))
    result = []
    day = first
    while day <= last:
        if day.weekday() < 5 and day not in holidays:
            result.append(day.isoformat())
        day += dt.timedelta(days=1)
    return result


def _date(value):
    if not isinstance(value, str) or len(value) != 10:
        raise ValidationFailure("Invalid ISO session date")
    try:
        dt.date.fromisoformat(value)
    except ValueError:
        raise ValidationFailure("Invalid ISO session date") from None
    return value


def _number(value, *, positive=False):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValidationFailure("Nonnumeric unit value")
    value = float(value)
    if not math.isfinite(value) or value < 0 or (positive and value == 0):
        raise ValidationFailure("Nonfinite or invalid unit value")
    return value


def normalize(rows, symbol, endpoint, lo=FROM, hi=TO):
    kind = endpoint.removeprefix(PRICE_PREFIX)
    if not endpoint.startswith(PRICE_PREFIX) or kind not in PRICE_KINDS:
        raise ValidationFailure("Unknown price endpoint")
    if not isinstance(rows, list) or not rows:
        raise ValidationFailure("Nonempty price array required")
    bars = {}
    for row in rows:
        if not isinstance(row, dict) or row.get("symbol") != symbol:
            raise ValidationFailure("Wrong security in price response")
        date = _date(row.get("date"))
        if date in bars or not lo <= date <= hi:
            raise ValidationFailure("Duplicate or out-of-bound date")
        fields = {k: k if kind == "full" else "adj" + k.title() for k in OHLC}
        try:
            bar = {k: _number(row[v], positive=True) for k, v in fields.items()}
            bar["volume"] = _number(row["volume"])
        except KeyError:
            raise ValidationFailure("Endpoint-specific OHLCV schema missing") from None
        tolerance = 1e-7
        if (bar["low"] > min(bar["open"], bar["close"]) + tolerance or
                bar["high"] < max(bar["open"], bar["close"]) - tolerance or
                bar["high"] < bar["low"]):
            raise ValidationFailure("OHLC geometry failed")
        bars[date] = {"date": date, **bar}
    return dict(sorted(bars.items()))


def coverage(bars, lo=FROM, hi=TO):
    expected = sessions(lo, hi)
    got = set(bars)
    missing = sorted(set(expected) - got)
    first, last = min(got), max(got)
    return {
        "rows": len(bars), "expected_sessions": len(expected), "first": first, "last": last,
        "extra_dates": sorted(got - set(expected)), "missing_dates": missing,
        "leading_missing": [d for d in missing if d < first],
        "internal_missing": [d for d in missing if first < d < last],
        "trailing_missing": [d for d in missing if d > last],
        "calendar_complete": not missing and got == set(expected),
        "leading_gap_is_not_automatically_an_ipo": True,
        "warmup_rows_before_2025": sum(d < "2025-01-02" for d in got),
        "evaluation_rows": sum("2025-01-02" <= d <= TO for d in got),
    }


def _stats(values):
    return {"n": len(values), "min": min(values), "median": statistics.median(values),
            "max": max(values)} if values else {"n": 0}


def split_factor(date, rows, symbol, as_of=None):
    """Current-vintage split scale; event date is already in the new unit."""
    factor = 1.0
    seen = set()
    for row in rows:
        if row.get("symbol") != symbol:
            continue
        event = _date(row.get("date"))
        if as_of is not None and event > as_of:
            # Announced future splits do not establish today's adjusted unit.
            continue
        numerator = _number(row.get("numerator"), positive=True)
        denominator = _number(row.get("denominator"), positive=True)
        key = event, numerator, denominator
        if key in seen:
            raise ValidationFailure("Duplicate split action")
        seen.add(key)
        if event > date:
            factor *= numerator / denominator
    return factor


def compare_price_views(full, nominal, adjusted, split_rows=(), symbol=None, as_of=None):
    """Report empirical unit relationships without inventing missing actions."""
    dates = sorted(set(full) & set(nominal) & set(adjusted))
    if not dates:
        raise ValidationFailure("Price views have no common dates")
    split_ratios, price_errors, factor_spreads, volume_ratios = [], [], [], []
    adjusted_full_volume_mismatches = 0
    normalized_current_volume_mismatches = 0
    factors = {}
    expected_errors = []
    for date in dates:
        f, n, a = full[date], nominal[date], adjusted[date]
        split = n["close"] / f["close"]
        dividend = a["close"] / f["close"]
        split_ratios.append(split)
        factors[date] = dividend
        adjusted_full_volume_mismatches += a["volume"] != f["volume"]
        normalized_current_volume_mismatches += abs(a["volume"] / split - n["volume"]) > 1e-5
        for key in OHLC:
            price_errors.append(abs(n[key] / f[key] / split - 1))
            factor_spreads.append(abs(a[key] / f[key] / dividend - 1))
            if symbol is not None and split_rows:
                expected = split_factor(date, split_rows, symbol, as_of)
                expected_errors.append(abs(n[key] / f[key] / expected - 1))
        if f["volume"] > 0 and n["volume"] > 0:
            volume_ratios.append((date, f["volume"] / n["volume"], split))
    # Rounding tolerance is deliberately diagnostic, not an alteration of prices.
    volume_raw_errors = [abs(v - 1) for _, v, _ in volume_ratios]
    volume_scaled_errors = [abs(v / s - 1) for _, v, s in volume_ratios]
    raw_match = bool(volume_raw_errors) and max(volume_raw_errors) < 0.001
    scaled_match = bool(volume_scaled_errors) and max(volume_scaled_errors) < 0.001
    if raw_match and scaled_match:
        volume_mode = "identical_and_no_distinguishing_split_scale"
    elif raw_match:
        volume_mode = "identical_between_full_and_nominal"
    elif scaled_match:
        volume_mode = "full_volume_equals_nominal_times_split_factor"
    else:
        volume_mode = "unresolved_or_mixed"
    jumps = []
    for prior, date in zip(dates, dates[1:]):
        relative = factors[date] / factors[prior] - 1
        if abs(relative) > 0.0005:
            jumps.append({"date": date, "relative_factor_change": relative})
    return {
        "matched_dates": len(dates), "same_dates_all_three": set(full) == set(nominal) == set(adjusted),
        "nominal_to_full_close_scale": _stats(split_ratios),
        "nominal_full_within_day_ratio_spread": _stats(price_errors),
        "adjusted_full_within_day_ratio_spread": _stats(factor_spreads),
        "within_day_common_factor_0_3pct": max(price_errors + factor_spreads) <= 0.003,
        "split_action_expected_price_ratio_error": _stats(expected_errors),
        "split_action_ratio_tested": bool(expected_errors),
        "split_action_ratio_within_0_3pct": max(expected_errors) <= 0.003 if expected_errors else None,
        "volume_relationship": volume_mode,
        "dividend_adjusted_vs_full_volume_mismatches": adjusted_full_volume_mismatches,
        "asof_current_bar_volume_vs_nominal_mismatches_at_1e_5": normalized_current_volume_mismatches,
        "asof_volume_divisor": "nominal_close_t / full_close_t; separate from dividend-adjusted price rebasing",
        "volume_full_to_nominal_ratio": _stats([v for _, v, _ in volume_ratios]),
        "volume_raw_mode_error": _stats(volume_raw_errors),
        "volume_split_scaled_mode_error": _stats(volume_scaled_errors),
        "adjusted_factor_jumps_above_5bps": jumps,
        "internal_relationship_is_not_independent_exchange_volume_certification": True,
    }


def dividend_consistency(full, adjusted, rows, symbol):
    """Ex-date diagnostics in split-adjusted units; do not assert TR identity.

    A backward dividend adjustment and a simple cash-dividend holding return
    need not be numerically identical. Both are measured rather than equated.
    """
    amounts = {}
    dates = sorted(set(full) & set(adjusted))
    for row in rows:
        if row.get("symbol") != symbol:
            continue
        date = _date(row.get("date"))
        if date not in full:
            continue
        amount = _number(row.get("adjDividend"))
        amounts[date] = amounts.get(date, 0) + amount
    tested = []
    unmatched = []
    for prior, date in zip(dates, dates[1:]):
        previous, current = full[prior]["close"], full[date]["close"]
        q = (adjusted[date]["close"] / current) / (adjusted[prior]["close"] / previous)
        amount = amounts.get(date, 0)
        if amount and amount >= previous:
            raise ValidationFailure("Dividend is not a valid ordinary backward-adjustment amount")
        expected = previous / (previous - amount)
        adjusted_return = adjusted[date]["close"] / adjusted[prior]["close"] - 1
        cash_return = (current + amount) / previous - 1
        if amount:
            tested.append({"date": date,
                           "factor_change": q, "expected_backward_factor_change": expected,
                           "factor_residual": q - expected,
                           "adjusted_return_minus_cash_return": adjusted_return - cash_return})
        elif abs(q - 1) > 0.0005:
            unmatched.append({"date": date, "factor_change": q})
    return {"events_tested": len(tested), "events": tested,
            "unmatched_factor_jumps_above_5bps": unmatched,
            "all_tested_factors_within_5bps": bool(tested) and all(abs(x["factor_residual"]) <= 0.0005 for x in tested),
            "cash_total_return_and_backward_adjustment_are_distinct": True,
            "action_calendar_completeness_not_inferred": True}


def _entries(journal):
    for key in ("requests", "entries", "calls"):
        if isinstance(journal.get(key), list):
            return journal[key]
    raise ValidationFailure("Journal request array missing")


def _response_path(root, record, ordinal):
    for key in ("response_file", "file", "local_path", "path", "response_path"):
        value = record.get(key)
        if isinstance(value, str):
            candidate = Path(value)
            return candidate if candidate.is_absolute() else root / candidate
    index = record.get("request_id", record.get("index", record.get("number", ordinal)))
    if isinstance(index, int):
        return root / f"response-{index:02d}.json"
    return root / f"response-{ordinal:02d}.json"


def action_coverage(rows, endpoint, params):
    dates = [_date(row.get("date")) for row in rows]
    identities = [(row.get("symbol"), date) for row, date in zip(rows, dates)]
    dated_fields = ("declarationDate", "recordDate", "paymentDate")
    result = {"endpoint": endpoint, "rows": len(rows),
              "first": min(dates) if dates else None, "last": max(dates) if dates else None,
              "duplicate_symbol_dates": len(identities) - len(set(identities)),
              "missing_symbol_rows": sum(not isinstance(s, str) or not s for s, _ in identities),
              "date_field_means_ex_date_for_dividends": endpoint.startswith("dividends"),
              "completeness_not_certified_by_success_or_below_page_cap": True}
    if "from" in params and "to" in params:
        result["out_of_range_rows"] = sum(not params["from"] <= date <= params["to"] for date in dates)
    if endpoint == "dividends-calendar":
        result["at_documented_4000_row_cap"] = len(rows) >= 4000
    if endpoint.startswith("dividends"):
        result["missing_dates"] = {key: sum(not row.get(key) for row in rows) for key in dated_fields}
        # Missing or malformed availability/payment dates cannot be silently
        # repaired using the ex-date. They are a downstream accounting gap.
        result["malformed_dates"] = {}
        for key in dated_fields:
            malformed = 0
            for row in rows:
                if row.get(key):
                    try:
                        _date(row[key])
                    except ValidationFailure:
                        malformed += 1
            result["malformed_dates"][key] = malformed
    return result


def universe_action_subset(rows, identity_rows):
    universe = {row["symbol"].replace(".", "-") for row in identity_rows}
    matched = [row for row in rows if row.get("symbol") in universe]
    return {"universe_security_count": len(universe),
            "matching_securities": len({row["symbol"] for row in matched}),
            "matching_rows": len(matched),
            "missing_dates": {key: sum(not row.get(key) for row in matched)
                              for key in ("declarationDate", "recordDate", "paymentDate")},
            "missing_or_post_ex_declaration_dates": sum(not row.get("declarationDate") or row["declarationDate"] > row["date"] for row in matched),
            "duplicate_symbol_dates": len(matched) - len({(row["symbol"], row["date"]) for row in matched}),
            "limited_to_acquired_calendar_window": True,
            "original_roster_membership_intervals_not_checked_here": True}


def validate_journal(path, identity_rows=None):
    path = Path(path)
    journal = json.loads(path.read_text())
    prices, series, actions, loaded, action_reports, vintages = {}, [], {}, [], [], {}
    for ordinal, record in enumerate(_entries(journal), 1):
        endpoint, params = record.get("endpoint", ""), record.get("params", {})
        if record.get("status") != 200:
            continue
        payload_path = _response_path(path.parent, record, ordinal)
        raw = payload_path.read_bytes()
        declared_hash = record.get("sha256")
        if declared_hash and hashlib.sha256(raw).hexdigest() != declared_hash:
            raise ValidationFailure("Response checksum mismatch")
        rows = json.loads(raw)
        loaded.append({"request": ordinal, "rows": len(rows) if isinstance(rows, list) else None})
        if endpoint.startswith(PRICE_PREFIX):
            bars = normalize(rows, params["symbol"], endpoint, params.get("from", FROM), params.get("to", TO))
            report = {"request": ordinal, "symbol": params["symbol"], "endpoint": endpoint,
                      **coverage(bars, params.get("from", FROM), params.get("to", TO))}
            series.append(report)
            key = params["symbol"], endpoint.removeprefix(PRICE_PREFIX)
            if key not in prices or len(bars) > len(prices[key]):
                prices[key] = bars
                vintage = record.get("source_vintage_utc", record.get("started_utc", ""))[:10]
                if vintage:
                    vintages[key] = _date(vintage)
        elif endpoint in {"dividends", "dividends-calendar", "splits", "splits-calendar"}:
            if not isinstance(rows, list):
                raise ValidationFailure("Action response is not an array")
            actions.setdefault(endpoint, []).extend(rows)
            action_reports.append({"request": ordinal, **action_coverage(rows, endpoint, params)})
    comparisons = {}
    for symbol in sorted({key[0] for key in prices}):
        views = {kind: prices[(symbol, kind)] for kind in PRICE_KINDS if (symbol, kind) in prices}
        if set(views) == PRICE_KINDS:
            # Company history can include post-evaluation splits. A calendar
            # limited to the evaluation period cannot establish that scale.
            splits = [r for r in actions.get("splits", []) if r.get("symbol") == symbol]
            comparisons[symbol] = compare_price_views(views["full"], views["non-split-adjusted"], views["dividend-adjusted"], splits, symbol, vintages.get((symbol, "full")))
            dividends = [r for r in actions.get("dividends", []) if r.get("symbol") == symbol]
            if dividends:
                comparisons[symbol]["dividend_consistency"] = dividend_consistency(views["full"], views["dividend-adjusted"], dividends, symbol)
    overlap = []
    for ordinal, record in enumerate(_entries(journal), 1):
        endpoint, params = record.get("endpoint", ""), record.get("params", {})
        if record.get("status") == 200 and endpoint.startswith(PRICE_PREFIX):
            bars = normalize(json.loads(_response_path(path.parent, record, ordinal).read_text()), params["symbol"], endpoint, params.get("from", FROM), params.get("to", TO))
            base = prices[(params["symbol"], endpoint.removeprefix(PRICE_PREFIX))]
            if len(bars) < len(base):
                overlap.append({"request": ordinal, "rows": len(bars), "normalized_overlap_identical": all(base.get(d) == b for d, b in bars.items())})
    result = {"scope": "private sentinel unit qualification; no ranking universe or portfolio backtest",
            "expected_full_sessions": len(sessions()), "expected_evaluation_sessions": len(sessions("2025-01-02", TO)),
            "loaded": loaded, "series": series, "comparisons": comparisons, "overlap": overlap,
            "action_coverage": action_reports,
            "all_acquired_price_series_calendar_complete": all(s["calendar_complete"] for s in series),
            "all_overlaps_identical": all(r["normalized_overlap_identical"] for r in overlap),
            "documented_vs_empirical": "Endpoint intent comes from public FMP docs; numeric relationships are current-vintage internal tests only."}
    if identity_rows is not None:
        result["universe_dividend_calendar_subset"] = universe_action_subset(actions.get("dividends-calendar", []), identity_rows)
    return result


def write_private(path, value):
    path = Path(path).resolve()
    checkout = Path(__file__).resolve().parents[2]
    if path.is_relative_to(checkout):
        raise ValidationFailure("Numeric report must remain outside the Git checkout")
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as stream:
        json.dump(value, stream, indent=2, allow_nan=False)
        stream.write("\n")
        stream.flush(); os.fsync(stream.fileno())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--journal", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--identities", help="Optional private JSON containing identity_rows for the complete metadata universe")
    args = parser.parse_args()
    identity_rows = json.loads(Path(args.identities).read_text())["identity_rows"] if args.identities else None
    report = validate_journal(args.journal, identity_rows)
    write_private(args.output, report)
    print(json.dumps({"offline_validation": "complete", "price_series": len(report["series"]),
                      "three_view_securities": len(report["comparisons"]),
                      "calendar_complete": report["all_acquired_price_series_calendar_complete"],
                      "overlap_identical": report["all_overlaps_identical"]}))


if __name__ == "__main__":
    main()

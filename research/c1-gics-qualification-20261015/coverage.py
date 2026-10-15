"""Offline metadata gate. Evidence verification is an explicit human audit assertion.

No market data or network calls. Interval ends are inclusive. A late document can
corroborate facts, but cannot be their cited contemporaneous source. Snapshots do
not certify uninterrupted membership, sector or identity coverage.
"""
import argparse
import json
import os
from datetime import date, datetime
from pathlib import Path

GICS = {"Communication Services", "Consumer Discretionary", "Consumer Staples",
        "Energy", "Financials", "Health Care", "Industrials",
        "Information Technology", "Materials", "Real Estate", "Utilities"}
LEDGERS = {
    "membership": {"official_index_history", "official_membership_ledger"},
    "sectors": {"official_sector_history", "official_classification_ledger"},
    "identities": {"official_security_history", "official_identity_ledger"},
}

def day(value):
    try:
        return date.fromisoformat(value) if isinstance(value, str) else None
    except ValueError:
        return None

def instant(value):
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo is not None else None
    except (ValueError, AttributeError, TypeError):
        return None

def validate(manifest):
    """Return deterministic failures; never infer facts from a missing interval.

    `sources` maps IDs to URL, published_at, kind, verified and authoritative.
    `calendar` contains dates/closes/source_id/verified. `decisions` contains date/at/
    eligible_security_ids, optional rankable_security_ids/held_risk_security_ids.
    Nonrankable members require verified insufficient-history exclusions with a
    conservative session upper bound below the pinned compiler minimum of 20.
    Each fact interval has security_id, valid_from,
    valid_to, known_at, source_id and verified. Sector rows add gics_sector;
    identity rows add issuer_id/share_class/ticker. `coverage` requires a complete
    full_sp500 authoritative_ledger interval for each fact kind on every date.
    """
    failures = []
    counts = {"decisions": 0, "member_dates": 0, "union_securities": 0}
    def fail(code, **detail):
        failures.append({"code": code, **detail})

    if not isinstance(manifest, dict):
        return {"passed": False, "failures": [{"code": "manifest_not_object"}], "counts": counts}
    sources = manifest.get("sources", {})
    if not isinstance(sources, dict):
        sources = {}
        fail("sources_not_object")
    def source(row, label, ledger_kind=None):
        ref = row.get("source_id")
        src = sources.get(ref) if isinstance(ref, str) else None
        if not isinstance(src, dict) or not src.get("url") or src.get("verified") is not True:
            fail("unverified_source", item=label)
            return None
        if ledger_kind and (src.get("authoritative") is not True or src.get("kind") not in LEDGERS[ledger_kind]):
            fail("non_authoritative_continuity", item=label, kind=ledger_kind)
            return None
        if instant(src.get("published_at")) is None:
            fail("invalid_source_availability", item=label)
            return None
        return src
    period = manifest.get("period", {})
    if not isinstance(period, dict):
        period = {}
    start, end = day(period.get("from")), day(period.get("through"))
    if start is None or end is None or start > end:
        fail("invalid_period")
        return {"passed": False, "failures": failures, "counts": counts}
    calendar = manifest.get("calendar", {})
    if not isinstance(calendar, dict):
        calendar = {}
    dates = calendar.get("dates", [])
    if (not isinstance(dates, list) or not dates or any(day(x) is None for x in dates)
            or len(set(dates)) != len(dates) or dates != sorted(dates)
            or any(not start <= day(x) <= end for x in dates)):
        fail("invalid_calendar")
        dates = []
    cal_source = source(calendar if isinstance(calendar, dict) else {}, "calendar")
    if calendar.get("verified") is not True or not cal_source or cal_source.get("kind") != "official_session_calendar":
        fail("unverified_calendar")
    closes = calendar.get("closes", {})
    if not isinstance(closes, dict) or any(instant(closes.get(d)) is None for d in dates):
        fail("invalid_calendar_closes")
        closes = {}
    prepared = {}
    for kind in (*LEDGERS, "coverage", "exclusions"):
        rows = manifest.get(kind, [])
        prepared[kind] = []
        if not isinstance(rows, list):
            fail("intervals_not_list", kind=kind)
            continue
        for number, row in enumerate(rows):
            label = f"{kind}[{number}]"
            if not isinstance(row, dict):
                fail("interval_not_object", item=label)
                continue
            lo, hi = day(row.get("valid_from")), day(row.get("valid_to"))
            if lo is None or hi is None or lo > hi:
                fail("invalid_interval", item=label)
                continue
            if row.get("verified") is not True:
                fail("unverified_fact", item=label)
            if kind == "coverage":
                target = row.get("kind")
                if not isinstance(target, str) or target not in LEDGERS:
                    fail("invalid_coverage_kind", item=label)
                    continue
                src = source(row, label, target)
                if row.get("scope") != "full_sp500" or row.get("basis") != "authoritative_ledger" or row.get("complete") is not True:
                    fail("incomplete_coverage", item=label)
                    src = None
                prepared[kind].append((row, lo, hi, src))
                continue
            sid = row.get("security_id")
            if not isinstance(sid, str) or not sid.strip():
                fail("missing_security_id", item=label)
                continue
            src = source(row, label)
            known = instant(row.get("known_at"))
            if known is None or (src and known < instant(src["published_at"])):
                fail("invalid_fact_availability", item=label)
            if kind == "sectors" and (not isinstance(row.get("gics_sector"), str) or row["gics_sector"] not in GICS):
                fail("invalid_gics_sector", item=label)
            if kind == "identities" and any(not isinstance(row.get(k), str) or not row[k].strip() for k in ("issuer_id", "share_class", "ticker")):
                fail("incomplete_identity", item=label)
            prepared[kind].append((row, lo, hi, known))
    decisions = manifest.get("decisions", [])
    if not isinstance(decisions, list):
        decisions = []
        fail("decisions_not_list")
    declared = [r.get("date") for r in decisions if isinstance(r, dict)]
    if declared != dates:
        fail("decision_calendar_mismatch")
    union = set()
    for decision in decisions:
        if not isinstance(decision, dict):
            fail("decision_not_object")
            continue
        when, close = day(decision.get("date")), instant(decision.get("at"))
        if when is None or close is None or close.date() != when or close != instant(closes.get(decision.get("date"))):
            fail("invalid_decision_clock", date=decision.get("date"))
            continue
        counts["decisions"] += 1
        for kind in LEDGERS:
            covered = [r for r, lo, hi, src in prepared["coverage"] if r.get("kind") == kind and lo <= when <= hi and src]
            if not covered:
                fail("continuity_gap", kind=kind, date=str(when))
        active = {}
        for row, lo, hi, known in prepared["membership"]:
            if lo <= when <= hi:
                sid = row.get("security_id")
                active.setdefault(sid, []).append((row, known))
        expected = decision.get("eligible_security_ids", [])
        if not isinstance(expected, list) or any(not isinstance(s, str) or not s for s in expected):
            fail("invalid_eligible_ids", date=str(when))
            expected = []
        if not active or not expected:
            fail("empty_rank_universe", date=str(when))
        if len(expected) != len(set(expected)) or set(expected) != set(active):
            fail("eligible_membership_mismatch", date=str(when))
        rankable = decision.get("rankable_security_ids", expected)
        held = decision.get("held_risk_security_ids", [])
        for label, values in (("rankable", rankable), ("held_risk", held)):
            if not isinstance(values, list) or any(not isinstance(s, str) or not s for s in values) or len(values) != len(set(values)):
                fail("invalid_rank_scope", scope=label, date=str(when))
                if label == "rankable": rankable = []
                else: held = []
        if not set(rankable) <= set(active):
            fail("rankable_nonmember", date=str(when))
        for sid in set(active) - set(rankable):
            proof = [(r, known) for r, lo, hi, known in prepared["exclusions"] if r.get("security_id") == sid and lo <= when <= hi]
            good = False
            if len(proof) == 1:
                row, known = proof[0]
                first, listed = day(row.get("first_possible_trade_date")), day(row.get("earliest_regular_listed_date"))
                bound, required = row.get("max_available_sessions"), row.get("required_sessions")
                origin = source({"source_id": row.get("no_inherited_history_source_id")}, "history-origin:" + sid)
                if first and listed and first <= listed and first <= when:
                    weeks, extra = divmod((when - first).days + 1, 7)
                    weekdays = weeks * 5 + sum((first.weekday() + n) % 7 < 5 for n in range(extra))
                    good = (row.get("verified") is True and row.get("reason") == "source_insufficient_history"
                            and row.get("source_rule") == "compiler_minimum_history_rows" and required == 20
                            and type(bound) is int and weekdays <= bound < required
                            and row.get("no_inherited_history") is True and known is not None and known <= close
                            and origin is not None and instant(origin["published_at"]) <= known)
            if not good:
                fail("unproven_rank_exclusion", date=str(when), security_id=sid)
        identity_keys, tickers = set(), set()
        for sid in sorted(set(active) | set(held)):
            members = active.get(sid, [])
            union.add(sid)
            counts["member_dates"] += int(sid in active)
            if sid in active and len(members) != 1:
                fail("membership_overlap", date=str(when), security_id=sid)
            facts = {"membership": members}
            required_kinds = ("sectors", "identities") if sid in set(rankable) | set(held) else ("identities",)
            for kind in required_kinds:
                facts[kind] = [(r, known) for r, lo, hi, known in prepared[kind] if r.get("security_id") == sid and lo <= when <= hi]
                if len(facts[kind]) != 1:
                    fail("fact_gap_or_overlap", kind=kind, date=str(when), security_id=sid)
            for kind, entries in facts.items():
                if any(known is None or known > close for _, known in entries):
                    fail("lookahead_fact", kind=kind, date=str(when), security_id=sid)
            if len(facts["identities"]) == 1 and all(isinstance(facts["identities"][0][0].get(k), str) for k in ("issuer_id", "share_class", "ticker")):
                identity = facts["identities"][0][0]
                key = (identity.get("issuer_id"), identity.get("share_class"))
                ticker = identity.get("ticker")
                if key in identity_keys or ticker in tickers:
                    fail("identity_class_collision", date=str(when), security_id=sid)
                identity_keys.add(key)
                tickers.add(ticker)
    counts["union_securities"] = len(union)
    return {"passed": not failures, "failures": failures, "counts": counts}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = validate(json.loads(args.manifest.read_text()))
    with os.fdopen(os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as handle:
        json.dump(report, handle, indent=2)
        handle.write("\n")
    print(json.dumps({"passed": report["passed"], "failure_count": len(report["failures"]), "counts": report["counts"]}))
    raise SystemExit(0 if report["passed"] else 2)


if __name__ == "__main__":
    main()

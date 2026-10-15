"""Research-only dated constituent normalization; no network or production writes.

This validates provider structure, not the truth or completeness of a feed. The
single provider date is only an effective date where independently qualified.
The historical feed has known examples with differently dated event legs, so a
successful parser must never be represented as global date certification.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
import argparse
import csv
import datetime as dt
import json
import os
from pathlib import Path
import re


@dataclass(frozen=True, order=True)
class Event:
    effective_date: str
    action: str
    symbol: str


def symbol(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Z0-9][A-Z0-9.\-]*", value):
        raise ValueError("Invalid security-line symbol")
    return value


def parse_row(row):
    """Split explicitly typed provider rows; removal symbol is never an addition.

    Both date fields must agree. Neither is treated as announcement availability.
    A production-compatible mapping requires separately evidenced ticker lineage.
    """
    day = dt.date.fromisoformat(row["date"]).isoformat()
    english_day = dt.datetime.strptime(row["dateAdded"], "%B %d, %Y").date().isoformat()
    if day != english_day:
        raise ValueError("Provider date and dateAdded disagree")
    kind = row["changeType"]
    add = row.get("addedTicker") or ""
    remove = row.get("removedTicker") or ""
    add_name = row.get("addedSecurity") or ""
    remove_name = row.get("removedSecurity") or ""
    if kind == "removal":
        if add or add_name or not remove or not remove_name or row["symbol"] != remove:
            raise ValueError("Inconsistent removal-only fields")
        return (Event(day, "remove", symbol(remove)),)
    if kind == "addition":
        if not add or not add_name or remove or remove_name or row["symbol"] != add:
            raise ValueError("Inconsistent addition-only fields")
        return (Event(day, "add", symbol(add)),)
    if kind == "replacement":
        if not add or not remove or not add_name or not remove_name or row["symbol"] != add:
            raise ValueError("Inconsistent replacement fields")
        return (Event(day, "add", symbol(add)), Event(day, "remove", symbol(remove)))
    raise ValueError("Unknown changeType; no inferred fallback")


def normalize(rows):
    events = []
    seen = set()
    for row in rows:
        for event in parse_row(row):
            if event in seen:
                raise ValueError("Duplicate constituent action requires review")
            seen.add(event)
            events.append(event)
    return tuple(sorted(events))


def apply_day(roster, events, reverse=False):
    """Apply whole effective-date batches atomically, including rollover no-ops."""
    events = tuple(events)
    if len({e.effective_date for e in events}) > 1:
        raise ValueError("A batch must have one effective date")
    if len(set(events)) != len(events):
        raise ValueError("Duplicate action")
    if any(e.action not in ("add", "remove") for e in events):
        raise ValueError("Invalid action")
    adds = {e.symbol for e in events if e.action == "add"}
    removes = {e.symbol for e in events if e.action == "remove"}
    if reverse:
        adds, removes = removes, adds
    before = set(roster)
    if (removes - before) or ((adds - removes) & before):
        raise ValueError("Anchor/events inconsistent: absent removal or existing addition")
    return frozenset((before - removes) | adds)


def reconstruct(anchor, anchor_date, events, target_date):
    """Roster valid at target close from anchor valid at anchor close.

    Verified effective-before-open actions enter that session's roster. The
    close-to-close interval is (earlier_date, later_date], in either direction.
    This is valid-on reconstruction, not a claim about provider publication time.
    """
    for value in (anchor_date, target_date):
        dt.date.fromisoformat(value)
    if len(set(anchor)) != len(anchor):
        raise ValueError("Duplicate anchor security line")
    roster = frozenset(symbol(s) for s in anchor)
    by_date = defaultdict(list)
    for event in events:
        if min(anchor_date, target_date) < event.effective_date <= max(anchor_date, target_date):
            by_date[event.effective_date].append(event)
    reverse = target_date < anchor_date
    for day in sorted(by_date, reverse=reverse):
        roster = apply_day(roster, by_date[day], reverse=reverse)
    return roster


def compare_spelling(value):
    """Only explicit, independently recognizable class-punctuation aliases."""
    return {"BRK-B": "BRK.B", "BF-B": "BF.B"}.get(value, value)


def save_private(path, payload):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(payload, f, indent=2, allow_nan=False)
        f.write("\n")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--mode", choices=("current-anchor-rewind", "public-baseline-forward"), default="current-anchor-rewind")
    p.add_argument("--private-dir", type=Path, required=True)
    p.add_argument("--public-baseline", type=Path, required=True)
    p.add_argument("--public-terminal", type=Path)
    p.add_argument("--baseline-observed-at", default="2024-12-27T00:38:18Z")
    p.add_argument("--terminal-observed-at")
    p.add_argument("--anchor-date", default="2026-10-15")
    p.add_argument("--out", type=Path, required=True)
    a = p.parse_args()
    history = json.loads((a.private_dir / "response-02.json").read_text())
    if a.mode == "public-baseline-forward":
        if a.public_terminal is None or a.terminal_observed_at is None:
            p.error("public-baseline-forward requires terminal snapshot and observation date")
        rows = [r for r in history if "2024-12-31" < r["date"] <= "2025-04-03"]
        with a.public_baseline.open(newline="") as f:
            base_rows = list(csv.DictReader(f))
        with a.public_terminal.open(newline="") as f:
            terminal_rows = list(csv.DictReader(f))
        payload = public_baseline_forward(base_rows, terminal_rows, rows,
                                          a.baseline_observed_at, a.terminal_observed_at)
        save_private(a.out, payload)
        print(json.dumps({k: payload[k] for k in ("baseline_count", "terminal_count", "terminal_snapshot_count", "candidate_only", "snapshot_only", "roundtrip_agreement")}))
        return
    current = json.loads((a.private_dir / "response-01.json").read_text())
    # Only the exact reconstruction span is qualified, never the whole feed.
    rows = [r for r in history if "2024-12-31" < r["date"] <= a.anchor_date]
    events = normalize(rows)
    anchor = [r["symbol"] for r in current]
    baseline = reconstruct(anchor, a.anchor_date, events, "2024-12-31")
    terminal = reconstruct(baseline, "2024-12-31", events, "2025-04-03")
    reverse_terminal = reconstruct(anchor, a.anchor_date, events, "2025-04-03")
    if terminal != reverse_terminal:
        raise ValueError("Forward/reverse terminal disagreement")
    with a.public_baseline.open(newline="") as f:
        public = {r["Symbol"] for r in csv.DictReader(f)}
    comparison = {compare_spelling(s) for s in baseline}
    payload = {
        "status": "candidate_reconstruction_only_requires_independent_metadata_truth",
        "anchor_date": a.anchor_date,
        "anchor_count": len(anchor),
        "reconstruction_rows": len(rows),
        "action_count": len(events),
        "baseline_count": len(baseline),
        "terminal_count": len(terminal),
        "forward_reverse_agreement": terminal == reverse_terminal,
        "baseline": sorted(baseline),
        "terminal": sorted(terminal),
        "sample_events": [e.__dict__ for e in events if e.effective_date <= "2025-04-03"],
        "public_baseline_count": len(public),
        "public_only": sorted(public - comparison),
        "fmp_only": sorted(comparison - public),
        "warnings": [
            "Row pairings are not economic pairs; compare daily sets.",
            "A current ticker may backfill historical identity; join verified lineage separately.",
            "No sector truth is inferred from successful membership reconstruction.",
            "Matching roster counts and algebraic reversibility are necessary but not sufficient.",
        ],
    }
    save_private(a.out, payload)
    print(json.dumps({k: payload[k] for k in ("anchor_count", "reconstruction_rows", "action_count", "baseline_count", "terminal_count", "forward_reverse_agreement", "public_baseline_count", "public_only", "fmp_only")}))


def public_baseline_forward(base_rows, terminal_rows, target_rows,
                            baseline_observed_at, terminal_observed_at):
    """Reproduce a scoped candidate without projecting current merger identities.

    Dates of observable snapshots are distinct from index effective dates. This
    comparison does not fill an observation gap or certify missing sector history.
    Input datasets remain separate, are independently described, and are not
    spliced into a retrospectively claimed provider vintage.
    """
    baseline = [r["Symbol"] for r in base_rows]
    terminal_snapshot = [r["Symbol"] for r in terminal_rows]
    if len(set(terminal_snapshot)) != len(terminal_snapshot):
        raise ValueError("Duplicate terminal snapshot line")
    events = normalize(target_rows)
    terminal = reconstruct(baseline, "2024-12-31", events, "2025-04-03")
    roundtrip = reconstruct(terminal, "2025-04-03", events, "2024-12-31")
    source = "https://press.spglobal.com/2025-03-07-DoorDash%2C-TKO-Group-Holdings%2C-Williams-Sonoma-and-Expand-Energy-Set-to-Join-S-P-500-Others-to-Join-S-P-100%2C-S-P-MidCap-400-and-S-P-SmallCap-600"
    # Independent primary announcement facts, not current-profile backfills.
    primary_adds = {"DASH": "Consumer Discretionary", "EXE": "Energy",
                    "TKO": "Communication Services", "WSM": "Consumer Discretionary"}
    target_adds = {e.symbol for e in events if e.action == "add"}
    target_removes = {e.symbol for e in events if e.action == "remove"}
    if target_adds != set(primary_adds) or target_removes != {"BWA", "CE", "FMC", "TFX"} or {e.effective_date for e in events} != {"2025-03-24"}:
        raise ValueError("Provider target events differ from qualified primary announcement")
    sample = [{"valid_date": "2025-03-24", "symbol": s, "is_member": s in terminal,
               "sector": sector, "taxonomy": "GICS", "sector_source": source,
               "announced_date": "2025-03-07", "effective_clock": "prior_to_open",
               "scope": "primary_dated_event_fact_only_not_full_sector_manifest"}
              for s, sector in sorted(primary_adds.items())]
    return {
        "status": "scoped_candidate_matches_independent_snapshots_not_full_metadata_go",
        "baseline_observed_at": baseline_observed_at,
        "terminal_snapshot_observed_at": terminal_observed_at,
        "baseline_date_target": "2024-12-31", "terminal_date_target": "2025-04-03",
        "baseline_count": len(baseline), "terminal_count": len(terminal),
        "terminal_snapshot_count": len(terminal_snapshot),
        "candidate_only": sorted(terminal - set(terminal_snapshot)),
        "snapshot_only": sorted(set(terminal_snapshot) - terminal),
        "roundtrip_agreement": roundtrip == set(baseline),
        "baseline": sorted(baseline), "terminal": sorted(terminal),
        "events": [e.__dict__ for e in events], "dated_roster_sector_sample": sample,
        "unresolved": [
            "A December27 observation alone does not prove December31 coverage; reconcile independent December31 primary anchor and all intervening events.",
            "A March26 observation is not the actual March24 effective timestamp and alone does not prove coverage through April3.",
            "No complete continuous historical sector manifest or equivalence to C1 FMP taxonomy is inferred.",
            "Current-anchor missing ticker/merger transitions are not silently aliased or mixed into this candidate.",
        ],
    }


if __name__ == "__main__":
    main()

"""Offline metadata qualification receipt. Licensed details are private outputs.

No network calls. Input vintage is preserved; outputs fail if already present.
This audit does not turn snapshots, CIKs, or a passing parser into source truth.
"""
import argparse
import collections
import csv
import json
import os
from pathlib import Path

from membership import compare_spelling, normalize


def save(path, value):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(value, f, indent=2, allow_nan=False)
        f.write("\n")


def audit(root, baseline_path):
    def response(n):
        return json.loads((root / f"response-{n:02d}.json").read_text())
    budget = json.loads((root / "budget.json").read_text())
    if len(budget["calls"]) > 25 or not all(c["status"] == 200 for c in budget["calls"]):
        raise ValueError("Request budget/status qualification failed")
    if budget["market_price_calls"] != 0:
        raise ValueError("Metadata-only boundary failed")
    current, history, attempted_asof, aliases = map(response, (1, 2, 3, 4))
    target_rows = [r for r in history if "2024-12-31" < r["date"] <= "2025-04-03"]
    target_events = normalize(target_rows)
    with baseline_path.open(newline="") as f:
        baseline = list(csv.DictReader(f))
    symbols = {r["Symbol"] for r in baseline}
    union = symbols | {e.symbol for e in target_events}
    target_aliases = [r for r in aliases if "2024-12-31" < r["date"] <= "2025-04-03"]
    counts = collections.Counter(r["CIK"] for r in baseline)
    current_by_symbol = {compare_spelling(r["symbol"]): r for r in current}
    # Diagnostic only: differently dated FMP/GICS classifications cannot establish
    # an actual historical change or certify a taxonomy crosswalk.
    labels = {"Technology": "Information Technology", "Consumer Cyclical": "Consumer Discretionary",
              "Consumer Defensive": "Consumer Staples", "Financial Services": "Financials",
              "Healthcare": "Health Care", "Basic Materials": "Materials"}
    overlap = [(r, current_by_symbol[r["Symbol"]]) for r in baseline if r["Symbol"] in current_by_symbol]
    differences = [{"symbol": a["Symbol"], "dated_gics": a["GICS Sector"], "current_fmp": b["sector"]}
                   for a, b in overlap if a["GICS Sector"] != labels.get(b["sector"], b["sector"])]
    profiles = [response(i)[0] for i in range(5, 9)]
    return {
        "verdict": "NO_GO_FOR_FULL_ACQUISITION",
        "requests_used": len(budget["calls"]), "request_cap": 25,
        "response_bytes": budget["response_bytes"], "price_history_requests": 0,
        "provider_vintage_utc": budget["calls"][0]["utc"],
        "asof_query_identical_to_current": current == attempted_asof,
        "history_rows": len(history), "history_types": dict(collections.Counter(r["changeType"] for r in history)),
        "target_provider_rows": len(target_rows), "target_actions": [e.__dict__ for e in target_events],
        "symbol_change_date_range": [min(r["date"] for r in aliases), max(r["date"] for r in aliases)],
        "symbol_change_rows_outside_requested_interval": len(aliases) - len(target_aliases),
        "target_symbol_change_rows": len(target_aliases),
        "target_relevant_symbol_changes": [r for r in target_aliases if compare_spelling(r["oldSymbol"]) in union or compare_spelling(r["newSymbol"]) in union],
        "baseline_source_rows": len(baseline), "baseline_source_issuer_ciks": len(counts),
        "distinct_share_class_groups": {cik: [r["Symbol"] for r in baseline if r["CIK"] == cik]
                                        for cik, n in counts.items() if n > 1},
        "profile_identity_sample": profiles,
        "classification_diagnostic": {"overlap": len(overlap), "differences": differences,
            "warning": "Different dates and taxonomies confounded; not measured historical reclassifications."},
        "gates": {"target_change_effective_date": True, "removal_only_parser": True,
                  "complete_dec31_roster_certified": False, "whole_span_identity_certified": False,
                  "historical_fmp_sector_intervals_certified": False},
        "original_frozen_archive_accessed": False,
    }


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--private-dir", required=True, type=Path)
    p.add_argument("--public-baseline", required=True, type=Path)
    p.add_argument("--out", required=True, type=Path)
    a = p.parse_args()
    result = audit(a.private_dir, a.public_baseline)
    save(a.out, result)
    print(json.dumps({k: result[k] for k in ("verdict", "requests_used", "request_cap", "response_bytes", "price_history_requests", "gates")}))

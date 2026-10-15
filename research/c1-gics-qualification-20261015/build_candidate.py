"""Reproduce the current INCOMPLETE regular-member candidate, without network.

This diagnostic intentionally marks proposed continuous intervals unverified.
It does not turn dated observations into a history or fill the spin-off gaps.
Its input is the private prior qualification packet; no inputs are in Git.
"""
import argparse
import csv
from datetime import date, datetime, time, timedelta, timezone
import json
import os
from pathlib import Path
from zoneinfo import ZoneInfo

START, END = date(2024, 12, 31), date(2025, 4, 3)
CLOSED = {date(2025, 1, 1), date(2025, 1, 9), date(2025, 1, 20), date(2025, 2, 17)}
ADDITIONS = {"DASH": "Consumer Discretionary", "EXE": "Energy",
             "TKO": "Communication Services", "WSM": "Consumer Discretionary"}
BASE_URL = "https://github.com/datasets/s-and-p-500-companies/tree/f455575f4e89aebf51dab5c91a470b41b68a4234"
EVENT_URL = "https://press.spglobal.com/2025-03-07-DoorDash,-TKO-Group-Holdings,-Williams-Sonoma-and-Expand-Energy-Set-to-Join-S-P-500-Others-to-Join-S-P-100,-S-P-MidCap-400-and-S-P-SmallCap-600"
CAL_URL = "https://www.nyse.com/publicdocs/ICE_NYSE_2025_Yearly_Trading_Calendar.pdf"


def build(candidate, baseline):
    sectors = {row["Symbol"]: row["GICS Sector"] for row in baseline} | ADDITIONS
    days = [START + timedelta(days=n) for n in range((END - START).days + 1)]
    days = [d.isoformat() for d in days if d.weekday() < 5 and d not in CLOSED]
    closes = {d: datetime.combine(date.fromisoformat(d), time(16), ZoneInfo("America/New_York")).astimezone(timezone.utc).isoformat() for d in days}
    sources = {"baseline": dict(url=BASE_URL, published_at="2024-12-27T00:38:18Z", kind="dated_snapshot", verified=True, authoritative=False),
               "march": dict(url=EVENT_URL, published_at="2025-03-08T05:00:00Z", kind="official_announcement", verified=True, authoritative=True),
               "calendar": dict(url=CAL_URL, published_at="2024-12-31T05:00:00Z", kind="official_session_calendar", verified=True, authoritative=True,
                 supplement_url="https://ir.theice.com/press/news-details/2024/The-New-York-Stock-Exchange-Will-Close-Markets-on-January-9-to-Honor-the-Passing-of-Former-President-Jimmy-Carter-on-National-Day-of-Mourning/default.aspx")}
    result = dict(status="UNVERIFIED_INTERVAL_CANDIDATE_NOT_FULL_ROSTER", period={"from": str(START), "through": str(END)},
                  sources=sources, calendar=dict(dates=days, closes=closes, source_id="calendar", verified=True),
                  decisions=[], membership=[], sectors=[], identities=[], coverage=[],
                  unresolved_temporary_actions=candidate["temporary_action_candidates"],
                  warning="Proposed intervals are deliberately unverified. Candidate counts exclude unresolved temporary lines and are not certified coverage.")
    for row in candidate["identity_rows"]:
        sid, symbol = row["research_security_id"], row["symbol"]
        source_id = "march" if symbol in ADDITIONS else "baseline"
        lo = row["membership_valid_from"]
        hi = str(date.fromisoformat(row["membership_valid_to_exclusive"]) - timedelta(days=1))
        fact = dict(security_id=sid, valid_from=lo, valid_to=hi, known_at=sources[source_id]["published_at"], source_id=source_id, verified=False)
        result["membership"].append(fact.copy())
        result["sectors"].append(dict(fact, gics_sector=sectors[symbol]))
        # This explicitly names the listed research line, rather than inventing
        # a legal class title or collapsing different classes by issuer CIK.
        identity_fact = fact.copy()
        if symbol in ADDITIONS:
            identity_source = "identity_" + symbol
            sources[identity_source] = dict(url=row["identity_source"], published_at=sources["march"]["published_at"], kind="official_issuer_filing", verified=True, authoritative=True,
                availability_note="Conservative bound after the prior-dated filing; not an exact first-publication timestamp")
            identity_fact["source_id"] = identity_source
        result["identities"].append(dict(identity_fact, issuer_id=row["issuer_cik"], share_class="listed_line:" + symbol, ticker=symbol))
    for d in days:
        ids = [r["security_id"] for r in result["membership"] if r["valid_from"] <= d <= r["valid_to"]]
        result["decisions"].append(dict(date=d, at=closes[d], eligible_security_ids=ids))
    return result


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--candidate", required=True, type=Path)
    p.add_argument("--baseline", required=True, type=Path)
    p.add_argument("--output", required=True, type=Path)
    args = p.parse_args()
    with args.baseline.open(newline="") as f:
        manifest = build(json.loads(args.candidate.read_text()), list(csv.DictReader(f)))
    with os.fdopen(os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as f:
        json.dump(manifest, f, indent=2); f.write("\n")
    print(json.dumps({"status": manifest["status"], "decision_dates": len(manifest["decisions"]), "conditional_regular_union": len(manifest["membership"])}))

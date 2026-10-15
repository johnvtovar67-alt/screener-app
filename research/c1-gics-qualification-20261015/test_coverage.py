import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("metadata_coverage", Path(__file__).with_name("coverage.py"))
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


def fixture(dates=("2024-12-31", "2025-01-02"), clocks=None):
    clocks = clocks or {d: d + "T21:00:00Z" for d in dates}
    sources = {}
    for kind, name in (("calendar", "official_session_calendar"), ("membership", "official_membership_ledger"),
                       ("sectors", "official_sector_history"), ("identities", "official_security_history")):
        sources[kind] = dict(url="https://example.test/" + kind, published_at="2024-12-01T00:00:00Z", kind=name, verified=True, authoritative=True)
    manifest = dict(period={"from": dates[0], "through": dates[-1]}, sources=sources,
                    calendar=dict(dates=list(dates), closes=clocks, source_id="calendar", verified=True),
                    decisions=[dict(date=d, at=clocks[d], eligible_security_ids=["issuer-a", "issuer-b"]) for d in dates],
                    membership=[], sectors=[], identities=[], coverage=[], exclusions=[])
    for kind in gate.LEDGERS:
        manifest["coverage"].append(dict(kind=kind, valid_from=dates[0], valid_to=dates[-1], source_id=kind, verified=True, complete=True, scope="full_sp500", basis="authoritative_ledger"))
        for sid, share_class in (("issuer-a", "A"), ("issuer-b", "B")):
            row = dict(security_id=sid, valid_from=dates[0], valid_to=dates[-1], known_at="2024-12-02T00:00:00Z", source_id=kind, verified=True)
            if kind == "sectors":
                row["gics_sector"] = "Information Technology"
            if kind == "identities":
                row.update(issuer_id="same-issuer", share_class=share_class, ticker=share_class)
            manifest[kind].append(row)
    return manifest


class CoverageTests(unittest.TestCase):
    def check_failure(self, manifest, code):
        report = gate.validate(manifest)
        self.assertFalse(report["passed"])
        self.assertIn(code, {r["code"] for r in report["failures"]})

    def test_complete_and_same_issuer_distinct_classes(self):
        self.assertEqual(gate.validate(fixture()), dict(passed=True, failures=[], counts=dict(decisions=2, member_dates=4, union_securities=2)))

    def test_snapshots_cannot_prove_continuity(self):
        manifest = fixture(); manifest["sources"]["sectors"]["kind"] = "dated_snapshot"
        self.check_failure(manifest, "non_authoritative_continuity")

    def test_gap_and_overlap_rejected(self):
        manifest = fixture(); manifest["sectors"][0]["valid_to"] = "2024-12-31"
        self.check_failure(manifest, "fact_gap_or_overlap")
        manifest = fixture(); manifest["sectors"].append(copy.deepcopy(manifest["sectors"][0]))
        self.check_failure(manifest, "fact_gap_or_overlap")

    def test_late_publication_or_known_time(self):
        manifest = fixture(); manifest["sectors"][0]["known_at"] = "2025-01-01T00:00:00Z"
        self.check_failure(manifest, "lookahead_fact")
        manifest = fixture(); manifest["sources"]["sectors"]["published_at"] = "2025-02-27T00:00:00Z"
        self.check_failure(manifest, "invalid_fact_availability")

    def test_no_other_or_incomplete_identity(self):
        manifest = fixture(); manifest["sectors"][0]["gics_sector"] = "Other"
        self.check_failure(manifest, "invalid_gics_sector")
        manifest = fixture(); del manifest["identities"][0]["share_class"]
        self.check_failure(manifest, "incomplete_identity")

    def test_dropped_class_and_collision(self):
        manifest = fixture(); manifest["decisions"][0]["eligible_security_ids"] = ["issuer-a"]
        self.check_failure(manifest, "eligible_membership_mismatch")
        manifest = fixture(); manifest["identities"][1]["share_class"] = "A"
        self.check_failure(manifest, "identity_class_collision")

    def test_calendar_or_empty_pool(self):
        manifest = fixture(); manifest["decisions"].pop()
        self.check_failure(manifest, "decision_calendar_mismatch")
        manifest = fixture(); manifest["membership"] = []; manifest["decisions"][0]["eligible_security_ids"] = []
        self.check_failure(manifest, "empty_rank_universe")

    def test_missing_coverage_unverified_and_bad_clock(self):
        manifest = fixture(); manifest["coverage"].pop()
        self.check_failure(manifest, "continuity_gap")
        manifest = fixture(); manifest["membership"][0]["verified"] = False
        self.check_failure(manifest, "unverified_fact")
        manifest = fixture(); manifest["decisions"][0]["at"] = "2024-12-31T21:00:00"
        self.check_failure(manifest, "invalid_decision_clock")

    def test_dst_close_mismatch(self):
        manifest = fixture(("2025-03-07", "2025-03-10"), {"2025-03-07": "2025-03-07T21:00:00Z", "2025-03-10": "2025-03-10T20:00:00Z"})
        self.assertTrue(gate.validate(manifest)["passed"])
        manifest["decisions"][1]["at"] = "2025-03-10T21:00:00Z"
        self.check_failure(manifest, "invalid_decision_clock")


    def excluded_fixture(self):
        manifest = fixture()
        for row in manifest["decisions"]: row["rankable_security_ids"] = ["issuer-a"]
        manifest["sectors"] = manifest["sectors"][:1]
        manifest["exclusions"] = [dict(security_id="issuer-b", valid_from="2024-12-31", valid_to="2025-01-02", known_at="2024-12-02T00:00:00Z", source_id="identities", verified=True,
            reason="source_insufficient_history", source_rule="compiler_minimum_history_rows", required_sessions=20, max_available_sessions=3,
            first_possible_trade_date="2024-12-31", earliest_regular_listed_date="2024-12-31", no_inherited_history=True, no_inherited_history_source_id="identities")]
        return manifest

    def test_unrankable_member_needs_identity_but_not_sector(self):
        manifest = self.excluded_fixture()
        self.assertTrue(gate.validate(manifest)["passed"])
        manifest["identities"].pop()
        self.check_failure(manifest, "fact_gap_or_overlap")

    def test_fake_rank_exclusion_rejected(self):
        manifest = self.excluded_fixture(); manifest["exclusions"][0]["max_available_sessions"] = 1
        self.check_failure(manifest, "unproven_rank_exclusion")
        manifest = self.excluded_fixture(); manifest["exclusions"][0]["required_sessions"] = 253
        self.check_failure(manifest, "unproven_rank_exclusion")
        manifest = self.excluded_fixture(); manifest["exclusions"] = []
        self.check_failure(manifest, "unproven_rank_exclusion")


if __name__ == "__main__":
    unittest.main()

import unittest

from membership import Event, apply_day, compare_spelling, normalize, parse_row, public_baseline_forward, reconstruct


def row(kind="replacement", day="2025-03-24", add="NEW", remove="OLD"):
    return dict(date=day, dateAdded="March 24, 2025", changeType=kind,
                addedTicker=add, addedSecurity="New Company" if add else None,
                removedTicker=remove, removedSecurity="Old Company" if remove else "",
                symbol=remove if kind == "removal" else add)


class MembershipTests(unittest.TestCase):
    def test_removal_only_symbol_not_added(self):
        events = parse_row(row(kind="removal", add=""))
        self.assertEqual(events, (Event("2025-03-24", "remove", "OLD"),))
        self.assertEqual(reconstruct(["OLD", "KEEP"], "2025-03-21", events, "2025-03-24"), {"KEEP"})

    def test_addition_only(self):
        events = parse_row(row(kind="addition", remove=""))
        self.assertEqual(reconstruct(["KEEP"], "2025-03-21", events, "2025-03-24"), {"KEEP", "NEW"})

    def test_replacement_effective_open_and_reverse(self):
        events = parse_row(row())
        self.assertEqual(reconstruct(["OLD"], "2025-03-21", events, "2025-03-23"), {"OLD"})
        self.assertEqual(reconstruct(["OLD"], "2025-03-21", events, "2025-03-24"), {"NEW"})
        self.assertEqual(reconstruct(["NEW"], "2025-03-24", events, "2025-03-21"), {"OLD"})

    def test_single_day_rollover_independent_of_order(self):
        events = [Event("2025-03-24", "remove", "B"), Event("2025-03-24", "add", "B"),
                  Event("2025-03-24", "remove", "A"), Event("2025-03-24", "add", "C")]
        before = {"A", "B"}
        after = apply_day(before, events)
        self.assertEqual(after, {"B", "C"})
        self.assertEqual(apply_day(before, reversed(events)), after)
        self.assertEqual(apply_day(after, events, reverse=True), before)

    def test_different_day_add_and_remove_no_forced_pair(self):
        events = [Event("2025-03-24", "add", "NEW"), Event("2025-03-25", "remove", "OLD")]
        self.assertEqual(reconstruct(["OLD"], "2025-03-21", events, "2025-03-24"), {"NEW", "OLD"})
        self.assertEqual(reconstruct(["NEW"], "2025-03-25", events, "2025-03-21"), {"OLD"})

    def test_conflicting_dates_fail(self):
        r = row(); r["dateAdded"] = "March 7, 2025"
        with self.assertRaises(ValueError): parse_row(r)

    def test_missing_type_not_inferred(self):
        r = row(); r["changeType"] = ""
        with self.assertRaises(ValueError): parse_row(r)

    def test_inconsistent_removal_fields_fail(self):
        with self.assertRaises(ValueError): parse_row(row(kind="removal"))

    def test_mismatched_symbol_fails(self):
        r = row(); r["symbol"] = "WRONG"
        with self.assertRaises(ValueError): parse_row(r)

    def test_duplicate_actions_fail(self):
        with self.assertRaises(ValueError): normalize([row(), row()])

    def test_inconsistent_anchor_fails(self):
        with self.assertRaises(ValueError): apply_day({"KEEP"}, parse_row(row()))

    def test_duplicate_anchor_fails(self):
        with self.assertRaises(ValueError): reconstruct(["A", "A"], "2025-03-21", [], "2025-03-24")

    def test_share_classes_remain_separate(self):
        classes = {"GOOG", "GOOGL", "FOX", "FOXA", "NWS", "NWSA", "BRK-B", "BF-B"}
        self.assertEqual(reconstruct(classes, "2025-03-21", [], "2025-03-24"), classes)
        self.assertEqual(compare_spelling("BRK-B"), "BRK.B")
        self.assertEqual(compare_spelling("BF-B"), "BF.B")
        self.assertEqual(compare_spelling("FOXA"), "FOXA")

    def test_batch_rejects_mixed_dates_and_unknown_actions(self):
        with self.assertRaises(ValueError): apply_day([], [Event("2025-03-24", "add", "A"), Event("2025-03-25", "add", "B")])
        with self.assertRaises(ValueError): apply_day([], [Event("2025-03-24", "rename", "A")])

    def test_scoped_forward_keeps_observation_dates_separate_and_reports_gap(self):
        pairs = [("DASH", "BWA"), ("EXE", "CE"), ("TKO", "FMC"), ("WSM", "TFX")]
        rows = [row(add=a, remove=r) for a, r in pairs]
        base = [{"Symbol": r} for _, r in pairs] + [{"Symbol": "KEEP"}]
        # Deliberately incomplete independent snapshot must not silently pass.
        term = [{"Symbol": a} for a, _ in pairs]
        result = public_baseline_forward(base, term, rows, "2024-12-27", "2025-03-26")
        self.assertEqual(result["candidate_only"], ["KEEP"])
        self.assertTrue(result["roundtrip_agreement"])
        self.assertEqual(result["terminal_snapshot_observed_at"], "2025-03-26")
        self.assertTrue(all(s["valid_date"] == "2025-03-24" and s["announced_date"] == "2025-03-07" for s in result["dated_roster_sector_sample"]))
        self.assertIn("not_full_metadata_go", result["status"])

    def test_scoped_forward_rejects_unqualified_target_changes(self):
        with self.assertRaises(ValueError): public_baseline_forward([{"Symbol": "OLD"}], [{"Symbol": "NEW"}], [row()], "2024-12-27", "2025-03-26")


if __name__ == "__main__":
    unittest.main()

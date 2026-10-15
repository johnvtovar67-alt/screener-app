"""Synthetic aggregate-rendering and private-output safeguard tests."""
import csv
import io
from pathlib import Path
import tempfile
import unittest

import report
import stats


class ReportTests(unittest.TestCase):
    def test_empty_optional_period_renders_without_invented_observations(self):
        result = stats.summarize([], [{"name": "synthetic", "start": "2000-01-03",
            "end": "2000-12-29", "outcome_end": "2001-03-30"}], [], replicates=5)
        documents = report.render(result)
        self.assertEqual(set(documents), {"report.md", "summary.csv"})
        self.assertIn("not certified globally untouched", documents["report.md"])
        self.assertIn("No observations", documents["report.md"])
        rows = list(csv.DictReader(io.StringIO(documents["summary.csv"])))
        primary = next(r for r in rows if r["scope"] == "overall" and r["metric"] == "holding_delta_vh")
        self.assertEqual(primary["n"], "0")
        self.assertEqual(primary["mean"], "")

    def test_different_entry_and_holding_effects_are_retained(self):
        tag = {"period": "synthetic", "quarter": "2000Q1", "symbol": "TEST"}
        records = [dict(tag, type="entry", H=True, V=False, breakdown21=True,
                        recovery21=False, positive21=False, e21=3.0, e63=4.0, f5=-1.0),
                   dict(tag, type="holding", complete=True, H_trigger=True, V_trigger=False,
                        delta_vh=-2.0, delta_h_ref=2.0, delta_v_ref=0.0,
                        return_h=7.0, return_v=5.0, return_ref=5.0)]
        result = stats.summarize(records, [{"name": "synthetic", "start": "2000-01-03",
            "end": "2000-12-29", "outcome_end": "2001-03-30"}], ["TEST"], replicates=10)
        documents = report.render(result)
        rows = list(csv.DictReader(io.StringIO(documents["summary.csv"])))
        selected = {r["metric"]: r for r in rows if r["scope"] == "overall" and r["kind"] == "primary_uncertainty"}
        self.assertEqual(selected["entry_e21"]["mean"], "3.0")
        self.assertEqual(selected["holding_delta_vh"]["mean"], "-2.0")
        self.assertIn("Entry vetoes and holding exits use separate", documents["report.md"])
        self.assertNotIn("TEST,2000-", documents["summary.csv"])

    def test_exclusive_owner_private_outputs_and_no_overwrite(self):
        # Use the worktree's parent: some managed environments track /tmp.
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[3]) as temporary:
            target = Path(temporary) / "private-report"
            docs = {"report.md": "synthetic", "summary.csv": "metric\nsynthetic\n"}
            report.write_private(docs, target)
            self.assertEqual(target.stat().st_mode & 0o777, 0o700)
            for name in docs:
                self.assertEqual((target / name).stat().st_mode & 0o777, 0o600)
            with self.assertRaises(FileExistsError):
                report.write_private({"report.md": "changed", "summary.csv": "changed"}, target)
            self.assertEqual((target / "report.md").read_text(), "synthetic")

    def test_rejects_git_destination_and_wrong_schema(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / ".git").write_text("gitdir: synthetic")
            with self.assertRaisesRegex(ValueError, "outside Git"):
                report.write_private({"report.md": "synthetic", "summary.csv": "synthetic"}, root / "report")
            self.assertFalse((root / "report").exists())
        with self.assertRaisesRegex(ValueError, "aggregate schema"):
            report.render({"date": "2000-01-03", "close": 1.0})


if __name__ == "__main__":
    unittest.main()

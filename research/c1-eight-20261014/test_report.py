"""Synthetic privacy/format guards for aggregate-only rendering."""
import csv
import importlib.util
import io
import os
import stat
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('c1_eight_report', Path(__file__).with_name('report.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PrivateReportTests(unittest.TestCase):
    def test_private_exclusive_write_creates_owner_only_files(self):
        with tempfile.TemporaryDirectory() as folder:
            os.chmod(folder, 0o700)
            module.write_private({'synthetic.txt': 'synthetic aggregate\n'}, folder)
            p = Path(folder) / 'synthetic.txt'
            self.assertEqual(stat.S_IMODE(p.stat().st_mode), 0o600)
            self.assertEqual(p.read_text(), 'synthetic aggregate\n')

    def test_existing_artifact_blocks_entire_batch_without_overwrite(self):
        with tempfile.TemporaryDirectory() as folder:
            os.chmod(folder, 0o700)
            old = Path(folder) / 'old.txt'
            old.write_text('preserved')
            with self.assertRaises(FileExistsError):
                module.write_private({'new.txt': 'new', 'old.txt': 'replacement'}, folder)
            self.assertEqual(old.read_text(), 'preserved')
            self.assertFalse((Path(folder) / 'new.txt').exists())

    def test_nonprivate_destination_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            os.chmod(folder, 0o755)
            with self.assertRaises(ValueError):
                module.write_private({'synthetic.txt': 'x'}, folder)
            self.assertEqual(list(Path(folder).iterdir()), [])

    def test_csv_preserves_quotes_newlines_and_optional_fields(self):
        rows = [{'label': 'A, B', 'value': 1}, {'label': 'x\ny', 'extra': '"quoted"'}]
        output = module._csv_text(rows)
        parsed = list(csv.DictReader(io.StringIO(output)))
        self.assertEqual(parsed[0]['label'], 'A, B')
        self.assertEqual(parsed[1]['label'], 'x\ny')
        self.assertEqual(parsed[1]['extra'], '"quoted"')

    def test_wrong_contract_or_nonfrozen_draw_count_rejected(self):
        for result in ({}, {'contract': 'c1-eight-fresh-signal-diagnostic-v1', 'full_eight_security_panel': False},
                       {'contract': 'c1-eight-fresh-signal-diagnostic-v1', 'full_eight_security_panel': True, 'bootstrap': {'replicates': 20}}):
            with self.assertRaises(ValueError):
                module.build_artifacts(result, 'synthetic')

    def test_leave_one_out_labels_excluded_security_and_sparse_warning(self):
        metric = {'mean': 0.0, 'ci95_percentile': [0.0, 0.0]}
        uncertainty = {name: metric for name in ('slow_all_observed_F_minus_champion_restricted_latency',
            'fast_all_observed_F_minus_champion_restricted_latency', 'H_all_lot_difference_pp', 'P_all_lot_difference_pp')}
        group = {'deterioration': {'onsets': 1}, 'uncertainty': uncertainty,
                 'lots_entry_classification': {'H': {'triggered_lots': 1}, 'P': {'triggered_lots': 0}}}
        table = module._persistence_table({'leave_one_security_out': {'AAPL': group}}, 'leave_one_security_out')
        self.assertIn('Excluded security', table)
        self.assertIn('Excluding AAPL', table)
        note = module._sparsity_note({'by_security': {'JNJ': group, 'PG': group}})
        self.assertIn('JNJ contributes 1', note)
        self.assertIn('PG contributes 1', note)
        self.assertIn('JNJ/H', note)
        self.assertIn('degenerate', note)
        self.assertIn('do not establish statistical precision', note)

    def test_nonfinite_display_rejected_and_missing_interval_explicit(self):
        with self.assertRaises(ValueError):
            module._fmt(float('nan'))
        self.assertEqual(module._ci({'ci95_percentile': [None, None]}), '—')
        self.assertEqual(module._fmt(None), '—')


if __name__ == '__main__':
    unittest.main()

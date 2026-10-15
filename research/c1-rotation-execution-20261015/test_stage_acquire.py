"""Offline checks of staged limits, fail-closed acquisition and private writes."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

SPEC = importlib.util.spec_from_file_location('stage_acquire', Path(__file__).with_name('stage_acquire.py'))
stage = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(stage)


class Response:
    def __init__(self, body=b'[{"date":"2025-01-02","close":123.45}]', headers=None):
        self.body = body
        self.status = 200
        self.headers = headers or {'Content-Type': 'application/json', 'Content-Length': str(len(body))}
        self.read_sizes = []

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self, n):
        self.read_sizes.append(n)
        return self.body[:n]


class StageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.endpoint, self.params = stage.plan()[0]
        self.journal = {'calls': [], 'response_bytes': 0, 'sealed': False,
                        'private_prefix': 'research/test/'}
        self.env = patch.dict(os.environ, {'FMP_API_KEY': 'offline-secret'})
        self.env.start()
        self.sleep = patch.object(stage.time, 'sleep')
        self.sleep.start()

    def tearDown(self):
        self.sleep.stop()
        self.env.stop()
        self.tmp.cleanup()

    def request(self, opener):
        with contextlib.redirect_stdout(io.StringIO()) as output:
            stage.request_one(self.root, self.journal, self.endpoint, self.params, opener=opener)
        return output.getvalue()

    def test_success_private_exclusive_and_no_licensed_values_logged(self):
        response = Response()

        def opener(request, timeout):
            reserved = json.loads((self.root / 'journal.json').read_text())
            self.assertEqual(len(reserved['calls']), 1)
            self.assertEqual(timeout, 20)
            self.assertEqual(request.get_header('Accept-encoding'), 'identity')
            return response

        def storage(local, remote, output):
            self.assertEqual(stat.S_IMODE(local.stat().st_mode), 0o600)
            return {'bytes': local.stat().st_size, 'url': 'private://offline'}

        with patch.object(stage, 'store', side_effect=storage):
            output = self.request(opener)
        self.assertEqual(self.journal['response_bytes'], len(response.body))
        self.assertTrue(self.journal['calls'][0]['private_saved'])
        self.assertEqual((self.root / 'response-01.json').read_bytes(), response.body)
        self.assertEqual(stat.S_IMODE((self.root / 'response-01.json').stat().st_mode), 0o600)
        self.assertNotIn('123.45', output)
        self.assertNotIn('offline-secret', output)
        self.assertNotIn('private://', output)
        with self.assertRaises(FileExistsError):
            stage.exclusive(self.root / 'response-01.json', b'replacement')
        self.assertEqual((self.root / 'response-01.json').read_bytes(), response.body)

    def test_caps_sealed_and_duplicate_reject_before_network(self):
        for case in ('sealed', 'calls', 'bytes', 'duplicate'):
            with self.subTest(case=case):
                self.journal.update(calls=[], response_bytes=0, sealed=False)
                if case == 'sealed': self.journal['sealed'] = True
                if case == 'calls': self.journal['calls'] = [{}] * stage.CAP
                if case == 'bytes': self.journal['response_bytes'] = stage.BYTE_CAP
                if case == 'duplicate':
                    self.journal['calls'] = [{'endpoint': self.endpoint, 'params': self.params}]
                with patch.object(stage.urllib.request, 'urlopen') as opener:
                    with self.assertRaises((RuntimeError, ValueError)):
                        self.request(opener)
                    opener.assert_not_called()

    def test_declared_oversize_rejected_without_read_or_private_write(self):
        self.journal['response_bytes'] = stage.BYTE_CAP - 5
        response = Response(b'[1234567]')
        with patch.object(stage, 'store') as storage:
            with self.assertRaises(RuntimeError): self.request(lambda *a, **k: response)
        self.assertEqual(response.read_sizes, [])
        self.assertEqual(self.journal['response_bytes'], stage.BYTE_CAP - 5)
        storage.assert_not_called()

    def test_unknown_length_never_reads_beyond_remaining_bytes(self):
        self.journal['response_bytes'] = stage.BYTE_CAP - 5
        response = Response(b'[1234567]', {'Content-Type': 'application/json'})
        with self.assertRaises(RuntimeError): self.request(lambda *a, **k: response)
        self.assertEqual(response.read_sizes, [5])
        self.assertEqual(self.journal['response_bytes'], stage.BYTE_CAP)
        self.assertFalse((self.root / 'response-01.json').exists())

    def test_success_status_with_provider_limit_stops(self):
        response = Response(headers={'Content-Type': 'application/json', 'Retry-After': '60'})
        with patch.object(stage, 'store') as storage:
            with self.assertRaises(RuntimeError): self.request(lambda *a, **k: response)
        self.assertTrue(self.journal['calls'][0]['provider_limit_observed'])
        self.assertEqual(self.journal['response_bytes'], len(response.body))
        storage.assert_not_called()

    def test_http_limit_attempt_is_reserved_and_not_retried(self):
        attempts = []

        def opener(*a, **k):
            attempts.append(1)
            raise urllib.error.HTTPError('https://offline.invalid', 429, 'limited', {}, io.BytesIO(b'quota'))

        with self.assertRaises(RuntimeError): self.request(opener)
        self.assertEqual(len(attempts), 1)
        self.assertEqual(len(self.journal['calls']), 1)
        self.assertEqual(self.journal['calls'][0]['status'], 429)
        self.assertTrue(self.journal['calls'][0]['provider_limit_observed'])
        self.assertEqual(self.journal['response_bytes'], len(b'quota'))

    def test_main_seals_and_stops_entire_stage_on_first_provider_limit(self):
        original = stage.request_one
        attempts = []
        stage_dir = self.root / 'new-stage'

        def opener(*a, **k):
            attempts.append(1)
            raise urllib.error.HTTPError('https://offline.invalid', 429, 'limited', {}, io.BytesIO(b'quota'))

        def acquire(root, journal, endpoint, params):
            return original(root, journal, endpoint, params, opener=opener)

        with patch.object(stage, 'request_one', side_effect=acquire), \
                patch.object(stage, 'store', return_value={}), \
                patch('sys.argv', ['stage_acquire.py', '--private-dir', str(stage_dir)]), \
                contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises(SystemExit) as stopped:
                stage.main()
        self.assertEqual(stopped.exception.code, 2)
        self.assertEqual(len(attempts), 1)
        saved = json.loads((stage_dir / 'journal.json').read_text())
        self.assertEqual(saved['status'], 'STOPPED')
        self.assertTrue(saved['sealed'])
        self.assertEqual(len(saved['calls']), 1)
        self.assertEqual(stat.S_IMODE(stage_dir.stat().st_mode), 0o700)

    def test_storage_failure_does_not_trigger_second_fmp_request(self):
        attempts = []

        def opener(*a, **k):
            attempts.append(1)
            return Response()

        with patch.object(stage, 'store', side_effect=RuntimeError('offline storage failure')):
            with self.assertRaises(RuntimeError): self.request(opener)
        self.assertEqual(len(attempts), 1)
        self.assertTrue((self.root / 'response-01.json').exists())
        self.assertNotIn('private_saved', self.journal['calls'][0])


if __name__ == '__main__':
    unittest.main()

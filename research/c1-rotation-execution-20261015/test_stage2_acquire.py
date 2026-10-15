"""Offline tests of the stage-2 budget, isolation, recovery gate and durability."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import sys
import tempfile
import unittest
from unittest.mock import patch
import urllib.error
import urllib.response

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
SPEC = importlib.util.spec_from_file_location('stage2_acquire', HERE / 'stage2_acquire.py')
stage = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(stage)


def call(symbol, kind='full'):
    return {'endpoint': stage.validation.PRICE_PREFIX + kind,
            'params': {'symbol': symbol, 'from': stage.validation.FROM, 'to': stage.validation.TO}}


def manifest(*calls):
    return {'contract': 'c1-rotation-stage2-manifest-v1', 'requests': list(calls)}


def gate():
    return {'contract': 'c1-rotation-stage2-recovery-gate-v1', 'passed': True, 'fresh_context': True,
            'authenticated_private_read': True, 'clean_output_directory': True,
            'original_local_inputs_accessed': False, 'separate_cloud_instance': False,
            'original_archive_accessed': False, 'restored_responses': 25, 'restored_bytes': 2273904}


def prices(symbol='AAA', kind='full', *, incomplete=False, volume=1000):
    prefix = '' if kind == 'full' else 'adj'
    def field(k):
        return prefix + k.title() if prefix else k
    dates = stage.validation.sessions()
    if incomplete:
        dates = dates[:-1]
    return [{**{'symbol': symbol, 'date': date, 'volume': volume},
             **{field(k): v for k, v in [('open', 123.45), ('high', 130), ('low', 120), ('close', 125)]}}
            for date in dates]


class Response:
    def __init__(self, payload=None, *, body=None, headers=None):
        self.body = body if body is not None else json.dumps(payload).encode()
        self.headers = headers if headers is not None else {'Content-Type': 'application/json', 'Content-Length': str(len(self.body))}
        self.status, self.read_sizes = 200, []

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self, n):
        self.read_sizes.append(n)
        return self.body[:n]


class Tests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.now, self.storage_calls, self.attempts = 0.0, [], []
        self.env = patch.dict(os.environ, {'FMP_API_KEY': 'offline-secret'})
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()

    def storage(self, local, remote, output):
        self.storage_calls.append(remote)
        self.assertEqual(stat.S_IMODE(local.stat().st_mode), 0o600)
        return {'passed': True, 'url': 'private://offline', 'bytes': local.stat().st_size}

    def sleep(self, seconds):
        self.now += seconds

    def client(self, plan, opener):
        raw_manifest, raw_gate = json.dumps(plan).encode(), json.dumps(gate()).encode()
        stage.exclusive(self.root / 'manifest.json', raw_manifest)
        stage.exclusive(self.root / 'recovery-gate.json', raw_gate)
        return stage.Acquirer(self.root, plan, stage.digest(raw_manifest), gate(), stage.digest(raw_gate),
                              opener=opener, storage=self.storage, clock=lambda: self.now, sleep=self.sleep)

    def run_private(self, client):
        with contextlib.redirect_stdout(io.StringIO()) as output:
            result = client.run()
        return result, output.getvalue()

    def test_complete_triple_saved_validated_and_checkpointed_before_next_call(self):
        plan = manifest(*(call('AAA', kind) for kind in ('dividend-adjusted', 'full', 'non-split-adjusted')))
        def opener(request, timeout):
            n = len(self.attempts)
            if n:
                self.assertTrue(self.storage_calls[-1].endswith(f'journal-checkpoint-{n:03d}.json.gz'))
            else:
                self.assertEqual(len(self.storage_calls), 3)
                self.assertTrue(self.storage_calls[-1].endswith('journal-checkpoint-000.json.gz'))
            self.attempts.append(self.now)
            self.assertEqual(len(json.loads((self.root / 'journal.json').read_text())['calls']), n + 1)
            self.assertEqual(timeout, 20)
            return Response(prices(kind=plan['requests'][n]['endpoint'].split('/')[-1]))
        client = self.client(plan, opener)
        result, output = self.run_private(client)
        self.assertEqual(result, 0)
        self.assertEqual(self.attempts, [0.0, 2.0, 4.0])
        self.assertEqual(client.journal['symbols']['AAA']['status'], 'complete_three_view')
        self.assertEqual(client.journal['symbols']['AAA']['comparison']['matched_dates'], 316)
        self.assertTrue(client.journal['sealed'])
        self.assertEqual(len(self.storage_calls), 10)  # initial inputs + zero checkpoint, three bodies/checkpoints, final
        self.assertNotIn('123.45', output)
        self.assertNotIn('offline-secret', output)
        self.assertNotIn('private://', output)

    def test_first_bad_security_skips_remaining_views_and_continues(self):
        plan = manifest(call('AAA'), call('AAA', 'dividend-adjusted'), call('BBB'))
        def opener(*args, **kwargs):
            index = len(self.attempts)
            self.attempts.append(1)
            return Response(prices('AAA', incomplete=True) if index == 0 else prices('BBB'))
        client = self.client(plan, opener)
        self.assertEqual(self.run_private(client)[0], 0)
        self.assertEqual(len(self.attempts), 2)
        self.assertEqual(client.journal['failed_symbols'], ['AAA'])
        self.assertEqual(len(client.journal['skipped_requests']), 1)
        self.assertEqual(client.journal['status'], 'ACQUIRED_WITH_ISOLATED_FAILURE')

    def test_second_bad_security_stops_without_third_attempt(self):
        plan = manifest(call('AAA'), call('BBB'), call('CCC'))
        def opener(*args, **kwargs):
            symbol = ('AAA', 'BBB', 'CCC')[len(self.attempts)]
            self.attempts.append(1)
            return Response(prices(symbol, incomplete=True))
        client = self.client(plan, opener)
        self.assertEqual(self.run_private(client)[0], 2)
        self.assertEqual(len(self.attempts), 2)
        self.assertEqual(client.journal['failed_symbols'], ['AAA', 'BBB'])
        self.assertEqual(len(client.journal['unattempted_requests']), 1)

    def test_cross_view_volume_failure_is_security_failure(self):
        kinds = ('dividend-adjusted', 'full', 'non-split-adjusted')
        plan = manifest(*(call('AAA', k) for k in kinds))
        def opener(*args, **kwargs):
            n = len(self.attempts)
            self.attempts.append(1)
            return Response(prices(kind=kinds[n], volume=999 if n == 2 else 1000))
        client = self.client(plan, opener)
        self.assertEqual(self.run_private(client)[0], 0)
        self.assertEqual(client.journal['symbols']['AAA']['status'], 'validation_failed')
        self.assertEqual(client.journal['calls'][-1]['validation'], 'failed')

    def test_request_and_byte_caps_reject_before_network(self):
        for reason in ('calls', 'bytes', 'sealed'):
            with self.subTest(reason=reason), tempfile.TemporaryDirectory() as tmp:
                previous = self.root
                self.root = Path(tmp)
                client = self.client(manifest(call('AAA')), lambda *a, **kw: self.fail('network called'))
                self.root = previous
                if reason == 'calls':
                    client.journal['calls'] = [{}] * stage.CAP
                elif reason == 'bytes':
                    client.journal['response_bytes'] = stage.BYTE_CAP
                else:
                    client.journal['sealed'] = True
                with self.assertRaises(stage.StageStop):
                    client.request_one(call('AAA'))

    def test_declared_oversize_not_read_or_stored(self):
        response = Response(body=b'123456')
        client = self.client(manifest(call('AAA')), lambda *a, **k: response)
        client.journal['response_bytes'] = stage.BYTE_CAP - 5
        self.assertEqual(self.run_private(client)[0], 2)
        self.assertEqual(response.read_sizes, [])
        self.assertEqual(client.journal['response_bytes'], stage.BYTE_CAP - 5)
        self.assertEqual(len(self.storage_calls), 4)  # initial inputs + zero checkpoint + final, no body

    def test_unknown_length_bounded_read_and_exact_cap_stop(self):
        response = Response(body=b'[123456]', headers={'Content-Type': 'application/json'})
        client = self.client(manifest(call('AAA'), call('BBB')), lambda *a, **k: response)
        client.journal['response_bytes'] = stage.BYTE_CAP - 5
        self.assertEqual(self.run_private(client)[0], 2)
        self.assertEqual(response.read_sizes, [5])
        self.assertEqual(client.journal['response_bytes'], stage.BYTE_CAP)
        self.assertEqual(len(client.journal['calls']), 1)
        self.assertTrue(client.journal['calls'][0]['private_saved'])

    def test_http_error_accounted_stored_and_never_retried(self):
        def opener(*args, **kwargs):
            self.attempts.append(1)
            raise urllib.error.HTTPError('https://offline.invalid', 429, 'limited', {'Retry-After': '60'}, io.BytesIO(b'quota'))
        client = self.client(manifest(call('AAA'), call('BBB')), opener)
        self.assertEqual(self.run_private(client)[0], 2)
        self.assertEqual(len(self.attempts), 1)
        self.assertEqual(client.journal['response_bytes'], 5)
        self.assertTrue(client.journal['calls'][0]['provider_limit_observed'])
        self.assertTrue(client.journal['calls'][0]['private_saved'])

    def test_http200_array_and_object_errors_stop_immediately(self):
        for payload in ({'Error Message': 'quota exhausted'}, [{'Error Message': 'quota exhausted'}]):
            with self.subTest(payload_type=type(payload).__name__), tempfile.TemporaryDirectory() as tmp:
                previous = self.root
                self.root = Path(tmp)
                client = self.client(manifest(call('AAA'), call('BBB')), lambda *a, **k: Response(payload))
                self.root = previous
                self.assertEqual(self.run_private(client)[0], 2)
                self.assertEqual(len(client.journal['calls']), 1)
                self.assertTrue(client.journal['calls'][0]['provider_error_payload'])
                self.assertTrue(client.journal['calls'][0]['provider_limit_observed'])

    def test_provider_limit_header_stops_despite_valid_payload(self):
        response = Response(prices(), headers={'X-RateLimit-Remaining': '0'})
        client = self.client(manifest(call('AAA'), call('BBB')), lambda *a, **k: response)
        self.assertEqual(self.run_private(client)[0], 2)
        self.assertEqual(len(client.journal['calls']), 1)
        self.assertTrue(client.journal['calls'][0]['provider_limit_observed'])

    def test_initial_storage_failure_prevents_any_fmp_request_or_storage_retry(self):
        def opener(*args, **kwargs):
            self.attempts.append(1)
            return Response(prices())
        client = self.client(manifest(call('AAA'), call('BBB')), opener)
        client.storage = lambda *a, **k: (_ for _ in ()).throw(RuntimeError('offline'))
        self.assertEqual(self.run_private(client)[0], 2)
        self.assertEqual(len(self.attempts), 0)
        self.assertTrue(client.storage_failed)
        self.assertFalse((self.root / 'journal.json.gz').exists())

    def test_response_storage_failure_prevents_second_fmp_request(self):
        def opener(*args, **kwargs):
            self.attempts.append(1)
            return Response(prices())
        client = self.client(manifest(call('AAA'), call('BBB')), opener)
        def storage(local, remote, output):
            if local.name.startswith('response-'):
                raise RuntimeError('offline')
            return self.storage(local, remote, output)
        client.storage = storage
        self.assertEqual(self.run_private(client)[0], 2)
        self.assertEqual(len(self.attempts), 1)
        self.assertTrue(client.storage_failed)
        self.assertFalse((self.root / 'journal.json.gz').exists())

    def test_transport_failure_never_retried(self):
        def opener(*args, **kwargs):
            self.attempts.append(1)
            raise TimeoutError('offline')
        client = self.client(manifest(call('AAA'), call('BBB')), opener)
        self.assertEqual(self.run_private(client)[0], 2)
        self.assertEqual(len(self.attempts), 1)

    def test_default_opener_refuses_redirect_without_second_http_request(self):
        attempts = []
        class FakeHTTPS(urllib.request.HTTPSHandler):
            def https_open(self, request):
                attempts.append(request.full_url)
                response = urllib.response.addinfourl(io.BytesIO(b'redirect'),
                            {'Location': 'https://offline.invalid/second'}, request.full_url, 302)
                response.msg = 'Found'
                return response
        original_builder = stage.urllib.request.build_opener
        def builder(*handlers):
            return original_builder(*handlers, FakeHTTPS())
        with patch.object(stage.urllib.request, 'build_opener', side_effect=builder):
            with self.assertRaises(urllib.error.HTTPError) as caught:
                stage.no_redirect_urlopen(urllib.request.Request('https://offline.invalid/first'), timeout=20)
        self.assertEqual(caught.exception.code, 302)
        self.assertEqual(attempts, ['https://offline.invalid/first'])

    def test_manifest_rejects_duplicates_unsupported_endpoints_and_oversized_plan(self):
        invalids = [manifest(call('AAA'), call('AAA')), manifest({'endpoint': 'profile', 'params': {'symbol': 'AAA'}}),
                    manifest(*(call(f'A{i}') for i in range(251)))]
        for value in invalids:
            file = self.root / 'manifest.json'
            file.write_text(json.dumps(value))
            with self.assertRaises(ValueError):
                stage.load_manifest(file)

    def test_recovery_receipt_cannot_claim_wholly_new_instance_or_missing_fresh_context(self):
        file = self.root / 'receipt.json'
        file.write_text(json.dumps(gate()))
        self.assertTrue(stage.recovery_gate(file)[0]['passed'])
        for key, value in [('fresh_context', False), ('authenticated_private_read', False),
                           ('original_local_inputs_accessed', True), ('separate_cloud_instance', True),
                           ('restored_bytes', 0)]:
            receipt = gate()
            receipt[key] = value
            file.write_text(json.dumps(receipt))
            with self.subTest(key=key), self.assertRaises(ValueError):
                stage.recovery_gate(file)


if __name__ == '__main__':
    unittest.main()

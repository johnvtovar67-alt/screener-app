#!/usr/bin/env python3
"""Bounded, sequential price-only research acquisition; licensed values stay private.

No request is retried. A response and immutable progress checkpoint must be saved
privately before the next FMP request. This is acquisition validation, not a
partial-universe portfolio test. The manifest and recovery gate are private inputs.
"""
from __future__ import annotations

import argparse
import datetime as dt
import fcntl
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import time
import urllib.error
import urllib.parse
import urllib.request

from stage_acquire import exclusive, journal_save, store
import validation

CAP, BYTE_CAP, SPACING = 250, 20 * 1024 * 1024, 2.0
HERE = Path(__file__).resolve().parent
PROTOCOL_SHA256 = '761043b94b7b578727777b837549cc444b3097fe2d7d8be7c670937d3d3972ab'
ENDPOINTS = {validation.PRICE_PREFIX + kind for kind in validation.PRICE_KINDS}
LIMIT_HEADERS = ('Retry-After', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset')


class StageStop(RuntimeError):
    """An immediate fail-closed stage stop, without a retry."""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        return None


def no_redirect_urlopen(request, timeout):
    # Keep inherited proxy handling while forbidding a hidden second HTTP call.
    return urllib.request.build_opener(NoRedirect()).open(request, timeout=timeout)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def utc():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def request_key(endpoint, params):
    return endpoint, json.dumps(params, sort_keys=True, separators=(',', ':'))


def load_manifest(path):
    raw = path.read_bytes()
    manifest = json.loads(raw)
    if manifest.get('contract') != 'c1-rotation-stage2-manifest-v1':
        raise ValueError('Private stage-2 manifest contract required')
    calls = manifest.get('requests')
    if not isinstance(calls, list) or not 1 <= len(calls) <= CAP:
        raise ValueError('Manifest must contain 1..250 requests')
    seen = set()
    for call in calls:
        if not isinstance(call, dict) or not {'endpoint', 'params'} <= call.keys():
            raise ValueError('Endpoint and params required')
        endpoint, params = call['endpoint'], call['params']
        if endpoint not in ENDPOINTS or not isinstance(params, dict) or set(params) != {'symbol', 'from', 'to'}:
            raise ValueError('Only approved three-view price requests are allowed')
        if (params['from'] != validation.FROM or params['to'] != validation.TO or
                not isinstance(params['symbol'], str) or
                not re.fullmatch(r'[A-Z0-9][A-Z0-9.-]{0,15}', params['symbol'])):
            raise ValueError('Frozen bounds and a canonical security symbol required')
        key = request_key(endpoint, params)
        if key in seen:
            raise ValueError('Duplicate endpoint/params; retries forbidden')
        seen.add(key)
    return manifest, digest(raw)


def recovery_gate(path):
    raw = path.read_bytes()
    receipt = json.loads(raw)
    required = ('passed', 'fresh_context', 'authenticated_private_read', 'clean_output_directory')
    if (receipt.get('contract') != 'c1-rotation-stage2-recovery-gate-v1' or
            any(receipt.get(k) is not True for k in required) or
            receipt.get('original_archive_accessed') is not False or
            receipt.get('original_local_inputs_accessed') is not False or
            receipt.get('separate_cloud_instance') is not False or
            not isinstance(receipt.get('restored_responses'), int) or receipt['restored_responses'] <= 0 or
            not isinstance(receipt.get('restored_bytes'), int) or receipt['restored_bytes'] <= 0):
        raise ValueError('A successful fresh-context authenticated recovery receipt is required')
    return receipt, digest(raw)


def source_hashes():
    names = ['stage2_acquire.py', 'stage_acquire.py', 'validation.py', 'private_store.mjs', 'PROTOCOL.md']
    hashes = {name: digest((HERE / name).read_bytes()) for name in names}
    if hashes['PROTOCOL.md'] != PROTOCOL_SHA256:
        raise ValueError('Frozen exit protocol changed')
    return hashes


def provider_error(payload):
    """Detect provider errors even when incorrectly delivered as HTTP-200 arrays."""
    if isinstance(payload, dict):
        return True
    if not isinstance(payload, list):
        return True
    error_keys = {'error', 'errormessage', 'errorcode', 'message', 'note', 'information'}
    for row in payload:
        if isinstance(row, dict) and any(re.sub('[^a-z]', '', str(k).lower()) in error_keys for k in row):
            return True
    return False


class Acquirer:
    def __init__(self, root, manifest, manifest_sha256, recovery, recovery_sha256,
                 *, opener=no_redirect_urlopen, storage=store, clock=time.monotonic, sleep=time.sleep):
        self.root, self.manifest = Path(root), manifest
        self.opener, self.storage, self.clock, self.sleep = opener, storage, clock, sleep
        self.last_started = None
        self.bars = {}
        self.failed = set()
        self.storage_failed = False
        self.allowed = {request_key(c['endpoint'], c['params']) for c in manifest['requests']}
        self.journal = dict(contract='c1-rotation-stage2-v1', cap=CAP, byte_cap=BYTE_CAP,
                            spacing_seconds=SPACING, calls=[], skipped_requests=[], symbols={},
                            response_bytes=0, private_prefix='research/c1-rotation-2025q1/stages/' + self.root.name + '/',
                            request_manifest_sha256=manifest_sha256, recovery_receipt_sha256=recovery_sha256,
                            recovery_summary={k: recovery[k] for k in ('restored_responses', 'restored_bytes', 'fresh_context', 'separate_cloud_instance')},
                            source_sha256=source_hashes(), account_remaining_quota_known=False,
                            source_data_publication=False, sealed=False, started_utc=utc())
        journal_save(self.root / 'journal.json', self.journal)

    def checkpoint(self, *, final=False):
        """Immutable checkpoints make each completed response independently recoverable."""
        journal_save(self.root / 'journal.json', self.journal)
        n = len(self.journal['calls'])
        name = 'journal.json.gz' if final else f'journal-checkpoint-{n:03d}.json.gz'
        local = self.root / name
        exclusive(local, gzip.compress((self.root / 'journal.json').read_bytes(), mtime=0))
        try:
            receipt = self.storage(local, self.journal['private_prefix'] + name,
                                   self.root / (('journal-storage.json') if final else f'checkpoint-storage-{n:03d}.json'))
            if receipt.get('passed') is not True:
                raise StageStop('Private checkpoint receipt invalid')
        except Exception:
            self.storage_failed = True
            raise StageStop('Private checkpoint failed; no retry') from None

    def preserve_initial_inputs(self):
        """Preserve recovery instructions and the complete manifest before any FMP call."""
        for name, expected in [('manifest.json', self.journal['request_manifest_sha256']),
                               ('recovery-gate.json', self.journal['recovery_receipt_sha256'])]:
            raw = (self.root / name).read_bytes()
            if digest(raw) != expected:
                raise StageStop('Private acquisition input hash mismatch')
            compressed = self.root / (name + '.gz')
            exclusive(compressed, gzip.compress(raw, mtime=0))
            try:
                receipt = self.storage(compressed, self.journal['private_prefix'] + compressed.name,
                                       self.root / (name.removesuffix('.json') + '-storage.json'))
                if receipt.get('passed') is not True:
                    raise StageStop('Private acquisition input receipt invalid')
            except Exception:
                self.storage_failed = True
                raise StageStop('Private acquisition input storage failed; no retry') from None
        self.checkpoint()

    def _persist_body(self, meta, body):
        n = meta['index']
        local = self.root / f'response-{n:02d}.json'
        exclusive(local, body)
        compressed = self.root / f'response-{n:02d}.json.gz'
        exclusive(compressed, gzip.compress(body, mtime=0))
        meta.update(sha256=digest(body), response_file=local.name)
        try:
            receipt = self.storage(compressed, self.journal['private_prefix'] + compressed.name,
                                   self.root / f'storage-{n:02d}.json')
            if receipt.get('passed') is not True:
                raise StageStop('Private response receipt invalid')
            meta.update(private_saved=True, compressed_bytes=receipt['bytes'], private_url=receipt['url'])
        except Exception:
            self.storage_failed = True
            raise StageStop('Private response storage failed; no retry') from None

    def _read(self, response, meta):
        meta['status'] = response.status
        meta['content_type'] = response.headers.get('Content-Type', '')
        for name in LIMIT_HEADERS:
            if name in response.headers:
                meta.setdefault('response_limit_headers', {})[name] = response.headers[name]
        if response.headers.get('Content-Encoding', 'identity').lower() not in ('', 'identity'):
            raise StageStop('Unexpected compression; no uncounted decompression permitted')
        remaining = BYTE_CAP - self.journal['response_bytes']
        length = response.headers.get('Content-Length')
        if length is not None:
            try:
                length = int(length)
            except (ValueError, TypeError):
                raise StageStop('Malformed declared response size') from None
            if length < 0 or length > remaining:
                raise StageStop('Declared response exceeds remaining byte allowance')
        body = response.read(remaining)
        if len(body) > remaining:
            raise StageStop('Transport violated bounded read')
        meta['bytes'] = len(body)
        self.journal['response_bytes'] += len(body)
        self._persist_body(meta, body)
        if response.headers.get('Retry-After') or response.headers.get('X-RateLimit-Remaining') == '0':
            meta['provider_limit_observed'] = True
            raise StageStop('Provider limit indicated; stop immediately')
        if meta['status'] != 200:
            raise StageStop('FMP HTTP error; no retry')
        if len(body) == remaining:
            raise StageStop('Byte cap reached; no further request')
        if length is not None and len(body) != length:
            raise StageStop('Truncated response; no retry')
        return body

    def _validate(self, meta, payload):
        endpoint, symbol = meta['endpoint'], meta['params']['symbol']
        try:
            bars = validation.normalize(payload, symbol, endpoint)
            coverage = validation.coverage(bars)
            meta['coverage'] = coverage
            if not coverage['calendar_complete'] or coverage['rows'] != 316:
                raise validation.ValidationFailure('Frozen 316-session coverage failed')
            self.bars.setdefault(symbol, {})[endpoint] = bars
            if set(self.bars[symbol]) == ENDPOINTS:
                by_kind = {key.removeprefix(validation.PRICE_PREFIX): val for key, val in self.bars[symbol].items()}
                comparison = validation.compare_price_views(by_kind['full'], by_kind['non-split-adjusted'], by_kind['dividend-adjusted'])
                self.journal['symbols'][symbol] = {'status': 'complete_three_view', 'comparison': comparison}
                if (comparison['matched_dates'] != 316 or not comparison['same_dates_all_three'] or
                        not comparison['within_day_common_factor_0_3pct'] or
                        comparison['volume_relationship'] == 'unresolved_or_mixed' or
                        comparison['dividend_adjusted_vs_full_volume_mismatches'] != 0 or
                        comparison['asof_current_bar_volume_vs_nominal_mismatches_at_1e_5'] != 0):
                    raise validation.ValidationFailure('Cross-view price or volume relationship failed')
            else:
                self.journal['symbols'][symbol] = {'status': 'partial_views', 'validated_views': sorted(self.bars[symbol])}
            meta['validation'] = 'passed'
        except validation.ValidationFailure as error:
            meta.update(validation='failed', validation_failure=str(error))
            self.failed.add(symbol)
            self.journal['symbols'][symbol] = {'status': 'validation_failed', 'reason': str(error)}
            if len(self.failed) >= 2:
                raise StageStop('Second failed security; validation stop') from None

    def request_one(self, call):
        endpoint, params = call['endpoint'], call['params']
        if (self.journal['sealed'] or len(self.journal['calls']) >= CAP or
                self.journal['response_bytes'] >= BYTE_CAP):
            raise StageStop('Stage closed or cap exhausted')
        key = request_key(endpoint, params)
        if key not in self.allowed or any(request_key(c['endpoint'], c['params']) == key for c in self.journal['calls']):
            raise StageStop('Outside frozen manifest or already attempted')
        key_binding = os.environ.get('FMP_API_KEY')
        if not key_binding:
            raise StageStop('Existing FMP binding unavailable')
        if self.last_started is not None:
            self.sleep(max(0, SPACING - (self.clock() - self.last_started)))
        meta = dict(index=len(self.journal['calls']) + 1, endpoint=endpoint, params=params.copy(), started_utc=utc())
        meta['source_vintage_utc'] = meta['started_utc']
        self.journal['calls'].append(meta)
        journal_save(self.root / 'journal.json', self.journal)  # reserve before network
        request = urllib.request.Request('https://financialmodelingprep.com/stable/' + endpoint + '?' +
                                         urllib.parse.urlencode(dict(params, apikey=key_binding)),
                                         headers={'Accept-Encoding': 'identity', 'Accept': 'application/json'})
        try:
            self.last_started = self.clock()
            with self.opener(request, timeout=20) as response:
                body = self._read(response, meta)
            try:
                payload = json.loads(body)
            except (ValueError, UnicodeDecodeError):
                raise StageStop('Malformed provider JSON; no retry') from None
            if provider_error(payload):
                meta['provider_error_payload'] = True
                meta['provider_limit_observed'] = any(w in body.lower() for w in (b'limit', b'quota', b'bandwidth'))
                raise StageStop('Provider error payload; no retry')
            meta.update(rows=len(payload), source_vintage_utc=meta['started_utc'])
            self._validate(meta, payload)
        except urllib.error.HTTPError as error:
            meta.update(status=error.code, provider_limit_observed=error.code in (402, 403, 429), failure='HTTP error; no retry')
            for name in LIMIT_HEADERS:
                if error.headers and name in error.headers:
                    meta.setdefault('response_limit_headers', {})[name] = error.headers[name]
            self._read(error, meta)
            raise StageStop('FMP HTTP error; no retry') from None
        except StageStop as error:
            meta.setdefault('failure', str(error))
            raise
        except Exception as error:
            meta['failure_class'] = type(error).__name__
            raise StageStop('Transport or processing failed; no retry') from None
        finally:
            journal_save(self.root / 'journal.json', self.journal)
            print(json.dumps({'requests': len(self.journal['calls']), 'response_bytes': self.journal['response_bytes'],
                              'failed_securities': len(self.failed), 'last_validation': meta.get('validation', 'not_validated')}), flush=True)

    def run(self):
        try:
            self.preserve_initial_inputs()
            for call in self.manifest['requests']:
                if call['params']['symbol'] in self.failed:
                    self.journal['skipped_requests'].append({**call, 'reason': 'earlier_security_validation_failure'})
                    continue
                self.request_one(call)
                self.checkpoint()
            self.journal['status'] = 'ACQUIRED_WITH_ISOLATED_FAILURE' if self.failed else 'ACQUIRED_NOT_PORTFOLIO_VALIDATED'
        except StageStop as error:
            self.journal.update(status='STOPPED', failure=str(error))
        finally:
            self.journal.update(sealed=True, finished_utc=utc(), failed_symbols=sorted(self.failed))
            attempted = {request_key(c['endpoint'], c['params']) for c in self.journal['calls']}
            skipped = {request_key(c['endpoint'], c['params']) for c in self.journal['skipped_requests']}
            self.journal['unattempted_requests'] = [c for c in self.manifest['requests']
                                                    if request_key(c['endpoint'], c['params']) not in attempted | skipped]
            journal_save(self.root / 'journal.json', self.journal)
            if not self.storage_failed:
                try:
                    self.checkpoint(final=True)
                except StageStop:
                    self.journal.update(status='STOPPED', journal_backup_failed=True)
                    journal_save(self.root / 'journal.json', self.journal)
            print(json.dumps({'status': self.journal['status'], 'requests': len(self.journal['calls']),
                              'response_bytes': self.journal['response_bytes'], 'failed_securities': len(self.failed),
                              'sealed': True}), flush=True)
        return 2 if self.journal['status'] == 'STOPPED' else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--private-dir', type=Path, required=True)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--recovery-receipt', type=Path, required=True)
    args = parser.parse_args()
    manifest, manifest_hash = load_manifest(args.manifest)
    recovery, recovery_hash = recovery_gate(args.recovery_receipt)
    source_hashes()  # fail before creating the run directory
    root = args.private_dir.resolve()
    if (root == HERE.parent.parent or HERE.parent.parent in root.parents or
            not re.fullmatch(r'stage2-[a-zA-Z0-9-]+', root.name)):
        raise ValueError('New private stage2-* directory outside Git required')
    root.mkdir(mode=0o700, exist_ok=False)
    exclusive(root / 'manifest.json', args.manifest.read_bytes())
    exclusive(root / 'recovery-gate.json', args.recovery_receipt.read_bytes())
    lock = os.open(root / 'run.lock', os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        client = Acquirer(root, manifest, manifest_hash, recovery, recovery_hash)
        raise SystemExit(client.run())
    finally:
        os.close(lock)


if __name__ == '__main__':
    main()

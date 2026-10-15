#!/usr/bin/env python3
"""Build a private staged-acquisition coverage report from metadata only.

No network and no raw prices are read. This checks the sealed journal's own
coverage/validation attestations, not an independent revalidation of its prices.
Output is immutable (O_EXCL), mode 0600, and must remain outside a Git checkout.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path

VIEWS = ('historical-price-eod/dividend-adjusted', 'historical-price-eod/full',
         'historical-price-eod/non-split-adjusted')
GICS = {'Communication Services', 'Consumer Discretionary', 'Consumer Staples',
        'Energy', 'Financials', 'Health Care', 'Industrials',
        'Information Technology', 'Materials', 'Real Estate', 'Utilities'}
HERE = Path(__file__).resolve().parent
RESEARCH = HERE if (HERE / 'validation.py').is_file() else Path('/workspace/work/c1-fresh/research/c1-rotation-execution-20261015')


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def canonical(symbol):
    # The frozen research convention explicitly permits only class punctuation.
    return str(symbol).replace('-', '.').upper()


def key(call):
    return call['endpoint'], json.dumps(call['params'], sort_keys=True, separators=(',', ':'))


def load_sessions(research):
    spec = importlib.util.spec_from_file_location('c1_private_coverage_calendar', research / 'validation.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.sessions()


def call_valid(call, expected_dates, price_window):
    coverage = call.get('coverage', {})
    issues = []
    required = {'status': 200, 'validation': 'passed', 'private_saved': True,
                'rows': len(expected_dates)}
    for name, expected in required.items():
        if call.get(name) != expected:
            issues.append('call_' + name)
    if call.get('failure') or call.get('provider_limit_observed'):
        issues.append('call_failure_or_provider_limit')
    if not call.get('sha256') or not call.get('source_vintage_utc'):
        issues.append('missing_hash_or_vintage')
    if (coverage.get('calendar_complete') is not True or
            coverage.get('rows') != len(expected_dates) or
            coverage.get('expected_sessions') != len(expected_dates) or
            coverage.get('first') != expected_dates[0] or coverage.get('last') != expected_dates[-1]):
        issues.append('coverage_span_or_count')
    for name in ('missing_dates', 'extra_dates', 'leading_missing', 'internal_missing', 'trailing_missing'):
        if coverage.get(name) != []:
            issues.append('coverage_' + name)
    if (coverage.get('warmup_rows_before_2025') != price_window['warmup_sessions'] or
            coverage.get('evaluation_rows') != price_window['evaluation_sessions']):
        issues.append('warmup_or_evaluation_count')
    return not issues, issues


def cross_valid(symbol_meta):
    c = symbol_meta.get('comparison', {})
    return (symbol_meta.get('status') == 'complete_three_view' and
            c.get('matched_dates') == 316 and c.get('same_dates_all_three') is True and
            c.get('within_day_common_factor_0_3pct') is True and
            c.get('volume_relationship') != 'unresolved_or_mixed' and
            isinstance(c.get('volume_relationship'), str) and
            c.get('dividend_adjusted_vs_full_volume_mismatches') == 0 and
            c.get('asof_current_bar_volume_vs_nominal_mismatches_at_1e_5') == 0)


def build_report(journal, manifest, *, journal_sha256, manifest_sha256, sessions):
    if journal.get('request_manifest_sha256') != manifest_sha256:
        raise ValueError('Journal/frozen-manifest hash mismatch')
    if journal.get('contract') != 'c1-rotation-stage2-v1':
        raise ValueError('Stage2 journal required')
    if manifest.get('contract') != 'c1-rotation-stage2-manifest-v1':
        raise ValueError('Stage2 frozen manifest required')
    window = manifest['price_window']
    if len(sessions) != 316 or sessions[0] != window['from'] or sessions[-1] != window['through']:
        raise ValueError('Frozen independent calendar mismatch')
    expected = manifest['coverage_expected_metadata']
    accepted = manifest['cohort']['accepted_union_canonical_symbols']
    if len(accepted) != 505 or len(set(accepted)) != 505 or set(accepted) & {'LEN', 'WDC'}:
        raise ValueError('Frozen 505-security accepted union required')
    by_canonical = {row['symbol']: row for row in expected}
    if len(by_canonical) != len(expected) or not set(by_canonical) <= set(accepted):
        raise ValueError('Expected security lines not unique or outside accepted union')
    by_provider = {row['provider_symbol']: row for row in expected}
    if len(by_provider) != len(expected):
        raise ValueError('Provider symbol collision')
    for row in expected:
        if (canonical(row['provider_symbol']) != row['symbol'] or
                not row.get('research_security_id') or not row.get('issuer_cik') or
                row.get('gics_sector') not in GICS or not row.get('sector_known_at') or
                not row.get('sector_continuity_assumption')):
            raise ValueError('Incomplete or inconsistent expected identity/sector join')
        start = max(row['membership_valid_from'], '2024-12-31')
        finish = min(row['membership_valid_to_exclusive'], '2025-04-04')
        if start >= finish or row['sector_known_at'][:10] > start:
            raise ValueError('Sector availability or membership interval invalid')
    planned = {key(call): call for call in manifest['requests']}
    if len(planned) != len(manifest['requests']):
        raise ValueError('Duplicate planned request')
    grouped = defaultdict(dict)
    bytes_sum = 0
    for call in journal['calls']:
        k = key(call)
        if k not in planned:
            raise ValueError('Journal includes unplanned request')
        symbol, endpoint = call['params']['symbol'], call['endpoint']
        if endpoint in grouped[symbol]:
            raise ValueError('Repeated endpoint/symbol acquisition')
        if call['params']['from'] != window['from'] or call['params']['to'] != window['through']:
            raise ValueError('Unexpected request date bounds')
        grouped[symbol][endpoint] = call
        bytes_sum += call.get('bytes', 0)
    if bytes_sum != journal['response_bytes']:
        raise ValueError('Response-byte accounting mismatch')
    if len(journal['calls']) > 250 or bytes_sum > 20 * 1024 * 1024:
        raise ValueError('Authorized tranche cap exceeded')
    rows = []
    completed = []
    valid_view_count = 0
    all_call_issues = []
    for metadata in expected:
        symbol = metadata['symbol']; provider = metadata['provider_symbol']
        calls = grouped.get(provider, {})
        views = []; valid_endpoints = []
        for endpoint in VIEWS:
            call = calls.get(endpoint)
            if call is None:
                views.append({'endpoint': endpoint, 'status': 'not_acquired', 'validation_passed': False})
                continue
            valid, issues = call_valid(call, sessions, window)
            if valid:
                valid_endpoints.append(endpoint)
            else:
                all_call_issues.append({'symbol': symbol, 'endpoint': endpoint, 'issues': issues})
            views.append({k: call.get(k) for k in ('index', 'endpoint', 'status', 'bytes', 'rows', 'sha256',
                                                    'source_vintage_utc', 'validation', 'coverage', 'failure',
                                                    'validation_failure', 'provider_limit_observed') if k in call} |
                         {'validation_passed': valid, 'attestation_issues': issues})
        symbol_meta = journal.get('symbols', {}).get(provider, {})
        triple_valid = len(valid_endpoints) == 3 and cross_valid(symbol_meta)
        if triple_valid:
            completed.append(symbol)
        valid_view_count += len(valid_endpoints)
        dates = sorted(c.get('source_vintage_utc') for c in calls.values() if c.get('source_vintage_utc'))
        rows.append({'canonical_symbol': symbol, 'provider_symbol': provider,
                     'research_security_id': metadata['research_security_id'],
                     'issuer_cik': metadata['issuer_cik'],
                     'dated_security_name_class': metadata['dated_security_name_class'],
                     'gics_sector': metadata['gics_sector'],
                     'membership_valid_from': metadata['membership_valid_from'],
                     'membership_valid_to_exclusive': metadata['membership_valid_to_exclusive'],
                     'sector_source_id': metadata['sector_source_id'],
                     'sector_known_at': metadata['sector_known_at'],
                     'sector_continuity_assumption': metadata['sector_continuity_assumption'],
                     'current_stored_fmp_cik': metadata.get('current_stored_fmp_cik'),
                     'current_stored_fmp_cik_matches': metadata.get('current_stored_fmp_cik_matches'),
                     'views_acquired': len(calls), 'views_validated': len(valid_endpoints),
                     'views_quarantined_as_acquired_triple': len(calls) if len(calls) == 3 and not triple_valid else 0,
                     'journal_symbol_status': symbol_meta.get('status', 'not_acquired'),
                     'complete_validated_three_view': triple_valid,
                     'cross_view_validation_passed': cross_valid(symbol_meta),
                     'cross_view_validation': symbol_meta.get('comparison'),
                     'independent_corporate_action_certification': False,
                     'session_dates_if_complete': sessions if triple_valid else [],
                     'source_vintage_first_utc': dates[0] if dates else None,
                     'source_vintage_last_utc': dates[-1] if dates else None,
                     'views': views})
    completed_set = set(completed)
    remaining = []
    acquired_triple_reviews = []
    unacquired_view_inventory = []
    acquired_not_cleared_view_inventory = []
    for symbol in accepted:
        metadata = by_canonical.get(symbol)
        calls = grouped.get(metadata['provider_symbol'], {}) if metadata else {}
        unacquired = [endpoint for endpoint in VIEWS if endpoint not in calls]
        acquired_not_cleared = [endpoint for endpoint in VIEWS if endpoint in calls and
                                not call_valid(calls[endpoint], sessions, window)[0]]
        missing_or_invalid = [endpoint for endpoint in VIEWS
                              if endpoint in set(unacquired + acquired_not_cleared)]
        unacquired_view_inventory.extend({'canonical_symbol': symbol, 'endpoint': endpoint}
                                        for endpoint in unacquired)
        acquired_not_cleared_view_inventory.extend(
            {'canonical_symbol': symbol, 'endpoint': endpoint,
             'journal_validation': calls[endpoint].get('validation'),
             'validation_failure': calls[endpoint].get('validation_failure'),
             'automatic_refetch_recommended': False}
            for endpoint in acquired_not_cleared)
        acquired_triple_not_cleared = len(calls) == 3 and symbol not in completed_set
        if acquired_triple_not_cleared:
            acquired_triple_reviews.append({
                'canonical_symbol': symbol,
                'journal_symbol_status': journal.get('symbols', {}).get(metadata['provider_symbol'], {}).get('status'),
                'all_three_acquired_views_quarantined': True,
                'quarantined_view_count': len(calls),
                'individual_views_with_not_cleared_attestation': acquired_not_cleared,
                'review_required': True, 'automatic_refetch_recommended': False})
        if symbol not in completed_set:
            remaining.append({'canonical_symbol': symbol,
                              'unacquired_views': unacquired,
                              'unacquired_view_count': len(unacquired),
                              'acquired_but_not_cleared_views': acquired_not_cleared,
                              'acquired_but_not_cleared_view_count': len(acquired_not_cleared),
                              'missing_or_invalid_views': missing_or_invalid,
                              'missing_or_invalid_view_count': len(missing_or_invalid),
                              'acquisition_requests_needed_for_unacquired_views': len(unacquired),
                              'cross_view_review_required': acquired_triple_not_cleared,
                              'automatic_refetch_of_acquired_views_recommended': False,
                              'identity_risk_deferred': any(r['symbol'] == symbol for r in manifest['identity_risk_deferred_not_excluded'])})
    benchmark_rows = []
    for symbol in ('SPY', 'QQQ'):
        call = grouped.get(symbol, {}).get(VIEWS[0])
        valid, issues = call_valid(call, sessions, window) if call else (False, ['not_acquired'])
        benchmark_rows.append({'symbol': symbol, 'endpoint': VIEWS[0], 'validated': valid,
                               'coverage': call.get('coverage') if call else None,
                               'rows': call.get('rows') if call else 0,
                               'source_vintage_utc': call.get('source_vintage_utc') if call else None,
                               'sha256': call.get('sha256') if call else None,
                               'attestation_issues': issues})
    count_sector = Counter(r['gics_sector'] for r in rows if r['complete_validated_three_view'])
    vintages = sorted(c['source_vintage_utc'] for c in journal['calls'] if c.get('source_vintage_utc'))
    return {'contract': 'c1-rotation-stage2-private-coverage-v1',
            'generated_utc': dt.datetime.now(dt.timezone.utc).isoformat(),
            'private_only': True, 'source_data_publication': False,
            'historical_portfolio_comparison_performed': False,
            'verification_scope': 'Metadata-only audit of journal validation attestations; no raw price reads and no independent action/unit revalidation',
            'journal_sha256': journal_sha256, 'frozen_manifest_sha256': manifest_sha256,
            'input_cohort': manifest.get('input_cohort'), 'source_vintage_policy': manifest['source_vintage_policy'],
            'journal_sealed': journal.get('sealed') is True, 'acquisition_status': journal.get('status', 'IN_PROGRESS'),
            'actual_requests': len(journal['calls']), 'actual_response_bytes': bytes_sum,
            'http_errors': sum(c.get('status') not in (None, 200) for c in journal['calls']),
            'provider_limits_observed': any(c.get('provider_limit_observed') for c in journal['calls']),
            'account_remaining_quota_known': False, 'price_window': window,
            'source_vintage_first_utc': vintages[0] if vintages else None,
            'source_vintage_last_utc': vintages[-1] if vintages else None,
            'accepted_regular_union_security_lines': len(accepted),
            'completed_constituent_lines': len(completed), 'completed_canonical_symbols': sorted(completed),
            'incomplete_selected_canonical_symbols': [r['canonical_symbol'] for r in rows if not r['complete_validated_three_view']],
            'validated_constituent_price_views': valid_view_count,
            'completed_sector_counts': dict(sorted(count_sector.items())),
            'sectors_not_yet_covered': sorted(GICS - set(count_sector)),
            'primary_exclusions': manifest['cohort']['primary_exclusions'],
            'temporary_corporate_event_lines_not_invented': ['MRP', 'SNDK'],
            'identity_risk_deferrals_are_not_final_exclusions': True,
            'identity_risk_deferred_not_excluded': manifest['identity_risk_deferred_not_excluded'],
            'current_cik_matches_selected': sum(r['current_stored_fmp_cik_matches'] is True for r in rows),
            'current_cik_not_corroborated_selected': [r['canonical_symbol'] for r in rows if not r['current_stored_fmp_cik_matches']],
            'identity_corroboration_limitation': manifest['identity_corroboration_limitation'],
            'coverage_discrepancies': all_call_issues,
            'per_security': rows, 'benchmarks': benchmark_rows,
            'remaining_constituent_lines': len(remaining), 'remaining_constituent_coverage': remaining,
            'unacquired_constituent_lines': sum(len(r['unacquired_views']) == 3 for r in remaining),
            'partially_acquired_constituent_lines': sum(0 < len(r['unacquired_views']) < 3 for r in remaining),
            'acquired_but_not_cleared_constituent_lines': len(acquired_triple_reviews),
            'unacquired_constituent_views': len(unacquired_view_inventory),
            'unacquired_constituent_view_inventory': unacquired_view_inventory,
            'acquired_but_not_cleared_constituent_views': len(acquired_not_cleared_view_inventory),
            'acquired_but_not_cleared_view_inventory': acquired_not_cleared_view_inventory,
            'quarantined_acquired_triple_views': sum(r['quarantined_view_count'] for r in acquired_triple_reviews),
            'review_required_for_acquired_triples': acquired_triple_reviews,
            'remaining_constituent_price_requests': len(unacquired_view_inventory),
            'remaining_price_requests_scope': 'Exact unacquired views only; acquired-but-not-cleared observations require review, not an automatic refetch',
            'remaining_missing_or_invalid_view_count': len(unacquired_view_inventory) + len(acquired_not_cleared_view_inventory),
            'remaining_benchmark_adjusted_price_requests': sum(not b['validated'] for b in benchmark_rows),
            'remaining_actions_and_identity_requests': 'Not counted by this price-only coverage inventory; full-period verified action accounting and bounded identity resolution still required',
            'skipped_requests': journal.get('skipped_requests', []),
            'lookahead_and_replication_limitations': 'GICS continuity remains an explicitly frozen research approximation; passing coverage is not full historical replication or independent validation'}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--journal', type=Path, required=True)
    p.add_argument('--manifest', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--research-dir', type=Path, default=RESEARCH)
    p.add_argument('--allow-in-progress', action='store_true',
                   help='Explicitly permit a private interim report; never claim it is final')
    a = p.parse_args()
    journal_raw = a.journal.read_bytes(); manifest_raw = a.manifest.read_bytes()
    journal, manifest = json.loads(journal_raw), json.loads(manifest_raw)
    if journal.get('sealed') is not True and not a.allow_in_progress:
        raise SystemExit('Journal not sealed; report not written. Use --allow-in-progress only for an explicitly interim report.')
    report = build_report(journal, manifest, journal_sha256=digest(journal_raw),
                          manifest_sha256=digest(manifest_raw), sessions=load_sessions(a.research_dir))
    output = a.output.resolve()
    # The managed workspace can contain an empty .git permission scaffold.
    # A real checkout has a gitdir HEAD, or a worktree's .git pointer file.
    if any((parent / '.git').is_file() or (parent / '.git' / 'HEAD').is_file()
           for parent in output.parents):
        raise SystemExit('Private report cannot be written inside a Git checkout')
    with os.fdopen(os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as f:
        json.dump(report, f, indent=2, allow_nan=False); f.write('\n')
    print(json.dumps({'private_report_saved': True, 'sealed': report['journal_sealed'],
                      'requests': report['actual_requests'], 'bytes': report['actual_response_bytes'],
                      'completed_constituents': report['completed_constituent_lines'],
                      'remaining_price_requests': report['remaining_constituent_price_requests']}))


if __name__ == '__main__':
    main()

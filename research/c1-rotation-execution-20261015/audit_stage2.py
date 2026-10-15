"""Offline private tranche audit; no acquisition, rankings or economic replay."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import validation


def cross_vintage(previous_path, current_path):
    previous, current = [json.loads(p.read_text()) for p in (previous_path, current_path)]
    old = {(c['endpoint'], c['params']['symbol']): c for c in previous['calls']
           if c.get('status') == 200 and c['endpoint'].startswith(validation.PRICE_PREFIX)
           and c['params'].get('from') == validation.FROM and c['params'].get('to') == validation.TO}
    comparisons = []
    for c in current['calls']:
        key = c['endpoint'], c['params']['symbol']
        if c.get('status') != 200 or key not in old:
            continue
        before = old[key]
        maps = []
        for root, call in [(previous_path.parent, before), (current_path.parent, c)]:
            raw = validation._response_path(root, call, call['index']).read_bytes()
            if hashlib.sha256(raw).hexdigest() != call['sha256']:
                raise validation.ValidationFailure('Cross-vintage response integrity failure')
            maps.append(validation.normalize(json.loads(raw), key[1], key[0]))
        a, b = maps
        common = sorted(set(a) & set(b))
        comparisons.append({
            'symbol': key[1], 'endpoint': key[0],
            'previous_vintage_utc': before.get('source_vintage_utc'),
            'current_vintage_utc': c.get('source_vintage_utc'),
            'same_dates': set(a) == set(b), 'common_rows': len(common),
            'changed_normalized_rows': sum(a[d] != b[d] for d in common),
            'exact_response_bytes_identical': before['sha256'] == c['sha256'],
            'combined_or_overwritten': False,
        })
    return comparisons


def audit(journal_path, previous_journal=None):
    journal_path = Path(journal_path)
    journal = json.loads(journal_path.read_text())
    if (journal.get('contract') != 'c1-rotation-stage2-v1' or journal.get('sealed') is not True
            or len(journal['calls']) > 250 or journal['response_bytes'] > 20 * 1024 * 1024):
        raise validation.ValidationFailure('Sealed bounded stage-2 journal required')
    report = validation.validate_journal(journal_path)
    report['scope'] = 'Private tranche-2 units and coverage; no ranking universe or portfolio comparison'
    report['stage_status'] = journal['status']
    report['source_journal_sha256'] = hashlib.sha256(journal_path.read_bytes()).hexdigest()
    report['account_remaining_quota_known'] = False
    report['input_cohort'] = 'c1-rotation-2025q1-inputs-v1'
    report['accounting_actions_not_acquired_in_this_tranche'] = True
    report['full_opportunity_universe_verified'] = False
    report['historical_portfolio_result'] = False
    report['cross_vintage_comparisons'] = cross_vintage(Path(previous_journal), journal_path) if previous_journal else []
    report['summary'] = {
        'fmp_requests': len(journal['calls']), 'response_bytes': journal['response_bytes'],
        'price_views': len(report['series']), 'three_view_securities_compared': len(report['comparisons']),
        'three_view_securities_cleared': sum(v.get('status') == 'complete_three_view' for v in journal['symbols'].values()),
        'raw_price_rows': sum(s['rows'] for s in report['series']),
        'matched_security_dates': sum(c['matched_dates'] for c in report['comparisons'].values()),
        'missing_session_observations': sum(len(s['missing_dates']) for s in report['series']),
        'extra_session_observations': sum(len(s['extra_dates']) for s in report['series']),
        'failed_symbols': journal.get('failed_symbols', []),
        'http_errors': sum(c.get('status', 0) != 200 for c in journal['calls']),
        'provider_limits': sum(c.get('provider_limit_observed') is True for c in journal['calls']),
        'cross_view_price_failures': sum(not c['within_day_common_factor_0_3pct'] for c in report['comparisons'].values()),
        'adjusted_full_volume_mismatches': sum(c['dividend_adjusted_vs_full_volume_mismatches'] for c in report['comparisons'].values()),
        'normalized_volume_mismatches': sum(c['asof_current_bar_volume_vs_nominal_mismatches_at_1e_5'] for c in report['comparisons'].values()),
        'cross_vintage_changed_rows': sum(c['changed_normalized_rows'] for c in report['cross_vintage_comparisons']),
    }
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--journal', required=True, type=Path)
    parser.add_argument('--previous-journal', type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    report = audit(args.journal, args.previous_journal)
    validation.write_private(args.output, report)
    # Detailed numerical diagnostics and record hashes belong only in the private file.
    print(json.dumps({'audit_complete': True, **{k:report['summary'][k] for k in [
        'fmp_requests', 'response_bytes', 'price_views', 'three_view_securities_compared', 'three_view_securities_cleared',
        'raw_price_rows', 'missing_session_observations', 'extra_session_observations',
        'failed_symbols', 'http_errors', 'provider_limits']}}))


if __name__ == '__main__':
    main()

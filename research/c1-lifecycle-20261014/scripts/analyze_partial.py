#!/usr/bin/env python3
"""Fixed-path historical holding diagnostic. No strategy or portfolio replay.

Frozen specification: partial-study-plan.md. Uses archived historical modeled
fills/held closes only. Original entries/quantities and original endpoints fixed.
Early exits use NEXT SESSION CLOSE, never a claimed next-open execution.
"""
import csv, hashlib, json, math, statistics
from pathlib import Path
from collections import defaultdict, Counter

from research_paths import work_root, source_root
ROOT = work_root()
COSTS = (12, 25, 50)
WEIGHTS = {'base': .25, 'cooldown15': .5, 'sector40': .25}
RULES = ('H7', 'P50', 'V2')
EPS = 1e-8

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def avg(values):
    return statistics.mean(values) if values else None

def med(values):
    return statistics.median(values) if values else None

def summ(values):
    return {'n': len(values), 'mean': avg(values), 'median': med(values),
            'minimum': min(values) if values else None,
            'maximum': max(values) if values else None}

def close_metrics(values, basis, exit_price):
    gains = [(v / basis - 1) * 100 for v in values]
    mfe = max([0.] + gains)
    mae = min([0.] + gains)
    peak, maxdd = None, 0.
    for value in values:
        peak = value if peak is None else max(peak, value)
        maxdd = min(maxdd, (value / peak - 1) * 100)
    exit_gain = (exit_price / basis - 1) * 100
    return {'close_mfe_pct': mfe, 'close_mae_pct': mae,
            'max_observed_close_drawdown_pct': maxdd,
            'net_exit_gain_pct': exit_gain,
            'close_peak_to_net_exit_giveback_pp': mfe - exit_gain,
            'gain_retention_pct': exit_gain / mfe * 100 if mfe > 0 else None}

inventory = json.loads((ROOT / 'data/fixture-inventory.json').read_text())
source_receipts, episodes, ledger_checks, excluded = [], [], [], []
coverage = []
for item in inventory['inventory']:
    universe = item['universe']
    source = Path(item['source'])
    path = ROOT / f'data/{universe}-accounting.json'
    assert sha(source) == item['sourceSha256'], 'Source fixture hash mismatch'
    assert sha(path) == item['decodedSha256'], 'Decoded fixture hash mismatch'
    source_receipts.append({'universe': universe, 'source_path': str(source),
                            'source_sha256': sha(source), 'decoded_sha256': sha(path)})
    runs = json.loads(path.read_text())
    for run in runs:
        sleeve = run['id']
        dates = [p['date'] for p in run['curve']]
        assert dates == sorted(set(dates)), 'Unordered dates'
        indexes = {d: i for i, d in enumerate(dates)}
        points = {p['date']: p for p in run['curve']}
        terminal = dates[-1]
        assert terminal == '2026-09-01'
        active, completed = {}, []
        ledger_cash = float(run['options']['initialCapital'])
        cash_by_date, positions_by_date = {}, {}
        grouped = defaultdict(list)
        for sequence, trade in enumerate(run['trades']):
            assert trade['date'] in indexes
            grouped[trade['date']].append((sequence, trade))
        total_buy, total_sell, partial_count, add_count, same_day_reentry = 0., 0., 0, 0, 0
        max_cash_error = max_equity_error = 0.
        for date in dates:
            exited_today = set()
            for sequence, trade in grouped[date]:
                symbol, quantity, price = trade['symbol'], float(trade['shares']), float(trade['price'])
                assert quantity > 0 and price >= 0
                if trade['side'] == 'buy':
                    ledger_cash -= quantity * price
                    total_buy += quantity * price
                    if symbol in exited_today:
                        same_day_reentry += 1
                    if symbol not in active:
                        active[symbol] = {'universe': universe, 'sleeve': sleeve,
                            'episode_id': f'{universe}:{sleeve}:{sequence}:{symbol}',
                            'symbol': symbol, 'entry_date': date, 'entry_index': indexes[date],
                            'entry_shares': 0., 'entry_dollars': 0., 'remaining': 0.,
                            'buy_count': 0, 'sell_count': 0, 'partial_sale': False,
                            'sale_proceeds': 0., 'sales': []}
                    ep = active[symbol]
                    if ep['buy_count']:
                        add_count += 1
                    ep['buy_count'] += 1
                    ep['entry_shares'] += quantity
                    ep['entry_dollars'] += quantity * price
                    ep['remaining'] += quantity
                else:
                    assert trade['side'] == 'sell' and symbol in active, 'Orphan sale'
                    ep = active[symbol]
                    assert quantity <= ep['remaining'] + EPS, 'Oversold'
                    if quantity < ep['remaining'] - EPS:
                        partial_count += 1
                        ep['partial_sale'] = True
                    ep['remaining'] -= quantity
                    ep['sell_count'] += 1
                    ep['sale_proceeds'] += quantity * price
                    ep['sales'].append({'date': date, 'shares': quantity, 'price': price})
                    ledger_cash += quantity * price
                    total_sell += quantity * price
                    if ep['remaining'] <= EPS:
                        ep.update(exit_date=date, exit_index=indexes[date])
                        ep['basis'] = ep['entry_dollars'] / ep['entry_shares']
                        ep['reference_exit12'] = ep['sale_proceeds'] / ep['entry_shares']
                        ep['reference_exit_gross'] = ep['reference_exit12'] / (1 - .0012)
                        completed.append(ep)
                        del active[symbol]
                        exited_today.add(symbol)
            point = points[date]
            assert set(point['marks']) == set(active), 'Position/mark mismatch'
            value = ledger_cash + sum(ep['remaining'] * float(point['marks'][s]) for s, ep in active.items())
            cash_error, equity_error = abs(ledger_cash - point['cash']), abs(value - point['equity'])
            max_cash_error = max(max_cash_error, cash_error)
            max_equity_error = max(max_equity_error, equity_error)
            assert cash_error <= .00511 and equity_error <= .00511, 'Ledger mismatch'
            assert point['positions'] == len(active)
        for ep in active.values():
            excluded.append({'episode_id': ep['episode_id'], 'reason': 'unclosed_episode'})
        ledger_checks.append({'universe': universe, 'sleeve': sleeve,
            'fills': len(run['trades']), 'closed_episodes': len(completed),
            'unclosed_episodes': len(active), 'partial_sale_count': partial_count,
            'additional_buy_count': add_count, 'same_day_reentries': same_day_reentry,
            'total_buy_notional': total_buy, 'total_sale_notional': total_sell,
            'terminal_cash': ledger_cash, 'max_cash_error': max_cash_error,
            'max_equity_error': max_equity_error, 'checkpoints': len(dates)})
        for ep in completed:
            if ep['exit_date'] == terminal:
                excluded.append({'episode_id': ep['episode_id'], 'reason': 'final_source_date_sale'})
                continue
            if ep['partial_sale'] or ep['buy_count'] != 1 or ep['sell_count'] != 1:
                excluded.append({'episode_id': ep['episode_id'], 'reason': 'unsupported_partial_or_added_episode'})
                continue
            ep['weight'] = WEIGHTS[sleeve]
            ep['reference_duration_sessions'] = ep['exit_index'] - ep['entry_index']
            marks = {}
            for i in range(ep['entry_index'], ep['exit_index']):
                mark = points[dates[i]]['marks'].get(ep['symbol'])
                if mark is not None and math.isfinite(mark) and mark > 0:
                    marks[i] = float(mark)
            ep['marks'] = marks
            ep['missing_within_holding_marks'] = ep['reference_duration_sessions'] - len(marks)
            values = [marks[i] for i in sorted(marks)]
            returns = [math.log(marks[i] / marks[i-1]) for i in sorted(marks) if i-1 in marks]
            sigma = statistics.stdev(returns) if len(returns) >= 2 else None
            ep['observed_daily_log_volatility'] = sigma
            ep['volatility_stratum'] = ('unavailable' if sigma is None else
                'daily_sigma_lt_2pct' if sigma < .02 else
                'daily_sigma_2_to_lt_4pct' if sigma < .04 else 'daily_sigma_ge_4pct')
            ep['entry_year'] = ep['entry_date'][:4]
            ep['reference_metrics'] = close_metrics(values, ep['basis'], ep['reference_exit12'])
            ep['outcomes'] = {}
            for rule in RULES:
                trigger, peak = None, -math.inf
                eligible_days = available_days = active_days = 0
                activation_latched = False
                for i in range(ep['entry_index'], ep['exit_index']):
                    if i not in marks:
                        continue
                    price = marks[i]
                    gain = price / ep['basis'] - 1
                    peak = max(peak, gain)
                    activation_latched = activation_latched or peak >= .12 - 1e-12
                    age = i - ep['entry_index']
                    if age < 5:
                        continue
                    eligible_days += 1
                    contiguous6 = all(k in marks for k in range(i-5, i+1))
                    contiguous26 = all(k in marks for k in range(i-25, i+1))
                    feature_available = (contiguous6 if rule == 'H7' else True if rule == 'P50' else contiguous26)
                    if not feature_available:
                        continue
                    available_days += 1
                    if activation_latched:
                        active_days += 1
                    if rule == 'H7':
                        hit = price / marks[i-5] - 1 <= -.07 + 1e-12
                        diagnostic_value = (price / marks[i-5] - 1) * 100
                    elif rule == 'P50':
                        hit = activation_latched and gain <= .5 * peak + 1e-12
                        diagnostic_value = gain / peak if peak > 0 else None
                    else:
                        lagged = [math.log(marks[k] / marks[k-1]) for k in range(i-24, i-4)]
                        assert len(lagged) == 20
                        lag_sigma = statistics.stdev(lagged)
                        threshold = 2 * lag_sigma * math.sqrt(5)
                        drawdown = math.log((1 + peak) * ep['basis'] / price)
                        hit = activation_latched and drawdown >= threshold - 1e-12
                        diagnostic_value = drawdown
                    if hit and trigger is None:
                        trigger = {'decision_index': i, 'decision_date': dates[i],
                                   'decision_age': age, 'diagnostic_value': diagnostic_value,
                                   'decision_close': price}
                result = {'rule': rule, 'status': 'no_trigger', 'trigger': trigger,
                          'eligible_age_days': eligible_days, 'feature_available_days': available_days,
                          'activated_feature_days': active_days,
                          'early_index': None, 'early_close': None}
                if trigger:
                    early_index = trigger['decision_index'] + 1
                    if early_index >= ep['exit_index']:
                        result['status'] = 'reference_exit_priority'
                    elif early_index not in marks:
                        result['status'] = 'next_close_unavailable'
                    else:
                        result.update(status='changed_exit', early_index=early_index,
                                      early_date=dates[early_index], early_close=marks[early_index])
                ep['outcomes'][rule] = result
                coverage.append({'universe': universe, 'sleeve': sleeve,
                    'episode_id': ep['episode_id'], 'symbol': ep['symbol'], 'rule': rule,
                    'reference_duration_sessions': ep['reference_duration_sessions'],
                    'age_eligible_days': eligible_days, 'feature_available_days': available_days,
                    'activated_feature_days': active_days, 'missing_marks': ep['missing_within_holding_marks'],
                    'has_feature_coverage': available_days > 0, 'status': result['status']})
            episodes.append(ep)

# Merge overlapping same-issuer original episodes across sleeves AND universes.
issuer_groups = defaultdict(list)
for ep in episodes:
    issuer = 'ALPHABET' if ep['symbol'] in ('GOOG', 'GOOGL') else ep['symbol']
    issuer_groups[issuer].append(ep)
cluster_count = 0
for issuer, rows in sorted(issuer_groups.items()):
    end = None
    for ep in sorted(rows, key=lambda e: (e['entry_date'], e['exit_date'], e['episode_id'])):
        if end is None or ep['entry_date'] > end:
            cluster_count += 1
            cluster_id = f'issuer_episode_{cluster_count:04d}:{issuer}'
            end = ep['exit_date']
        else:
            end = max(end, ep['exit_date'])
        ep['dependence_cluster'] = cluster_id

rows = []
for ep in episodes:
    for rule, outcome in ep['outcomes'].items():
        changed = outcome['status'] == 'changed_exit'
        freed = ep['exit_index'] - outcome['early_index'] if changed else 0
        for cost in COSTS:
            ref_price = ep['reference_exit_gross'] * (1-cost/10000)
            early_price = outcome['early_close'] * (1-cost/10000) if changed else ref_price
            delta_per_share = early_price - ref_price
            raw_delta = delta_per_share * ep['entry_shares']
            hypothetical_duration = ep['reference_duration_sessions'] - freed
            if changed:
                vals = [p for i,p in sorted(ep['marks'].items()) if i <= outcome['early_index']]
            else:
                vals = list(v for _,v in sorted(ep['marks'].items()))
            hypothetical_metrics = close_metrics(vals, ep['basis'], early_price)
            ref_metrics = close_metrics(list(v for _,v in sorted(ep['marks'].items())), ep['basis'], ref_price)
            rows.append({'universe': ep['universe'], 'sleeve': ep['sleeve'],
                'episode_id': ep['episode_id'], 'dependence_cluster': ep['dependence_cluster'],
                'symbol': ep['symbol'], 'entry_date': ep['entry_date'], 'entry_year': ep['entry_year'],
                'reference_exit_date': ep['exit_date'], 'rule': rule, 'exit_cost_bps': cost,
                'status': outcome['status'], 'shares': ep['entry_shares'], 'sleeve_weight': ep['weight'],
                'entry_basis_with_original_entry_cost': ep['basis'],
                'decision_date': outcome['trigger']['decision_date'] if outcome['trigger'] else None,
                'hypothetical_exit_date': outcome.get('early_date', ep['exit_date']),
                'reference_duration_sessions': ep['reference_duration_sessions'],
                'hypothetical_duration_sessions': hypothetical_duration,
                'sessions_freed': freed, 'reference_exit_price': ref_price,
                'hypothetical_exit_price': early_price, 'per_share_exit_difference': delta_per_share,
                'entry_normalized_exit_delta_pp': delta_per_share / ep['basis'] * 100,
                'proceeds_difference_raw_sleeve': raw_delta,
                'proceeds_difference_weighted': raw_delta * ep['weight'],
                'released_notional_session_weighted': early_price * ep['entry_shares'] * ep['weight'] * freed,
                'reference_later_exit_vs_early_sale_pct': (ref_price/early_price-1)*100 if changed and early_price > 0 else None,
                'break_even_replacement_return_pct': (ref_price/early_price-1)*100 if changed and early_price > 0 else None,
                'volatility_stratum': ep['volatility_stratum'],
                'observed_daily_log_volatility': ep['observed_daily_log_volatility'],
                **{'reference_'+k:v for k,v in ref_metrics.items()},
                **{'hypothetical_'+k:v for k,v in hypothetical_metrics.items()}})

def aggregate(selected):
    changed = [r for r in selected if r['status'] == 'changed_exit']
    positive = [r for r in changed if r['proceeds_difference_weighted'] > EPS]
    negative = [r for r in changed if r['proceeds_difference_weighted'] < -EPS]
    return {'episodes': len(selected), 'status_counts': dict(Counter(r['status'] for r in selected)),
        'changed_episodes': len(changed), 'saved_exit_proceeds_episodes': len(positive),
        'harmed_exit_proceeds_episodes': len(negative),
        'unchanged_price_changed_time_episodes': len(changed)-len(positive)-len(negative),
        'weighted_fixed_episode_proceeds_difference': sum(r['proceeds_difference_weighted'] for r in selected),
        'weighted_saved_proceeds': sum(r['proceeds_difference_weighted'] for r in positive),
        'weighted_foregone_proceeds': -sum(r['proceeds_difference_weighted'] for r in negative),
        'raw_sleeve_proceeds_difference': sum(r['proceeds_difference_raw_sleeve'] for r in selected),
        'changed_per_share_exit_difference': summ([r['per_share_exit_difference'] for r in changed]),
        'changed_entry_normalized_exit_delta_pp': summ([r['entry_normalized_exit_delta_pp'] for r in changed]),
        'all_episode_entry_normalized_exit_delta_pp': summ([r['entry_normalized_exit_delta_pp'] for r in selected]),
        'sessions_freed_sum_unweighted_episode_count': sum(r['sessions_freed'] for r in selected),
        'sessions_freed_sleeve_weighted_sum': sum(r['sessions_freed']*r['sleeve_weight'] for r in selected),
        'released_notional_sessions_sleeve_weighted': sum(r['released_notional_session_weighted'] for r in selected),
        'original_duration_sessions': summ([r['reference_duration_sessions'] for r in selected]),
        'hypothetical_duration_sessions': summ([r['hypothetical_duration_sessions'] for r in selected]),
        'reference_close_mfe_pct': summ([r['reference_close_mfe_pct'] for r in selected]),
        'reference_close_mae_pct': summ([r['reference_close_mae_pct'] for r in selected]),
        'reference_peak_to_net_exit_giveback_pp': summ([r['reference_close_peak_to_net_exit_giveback_pp'] for r in selected]),
        'hypothetical_peak_to_net_exit_giveback_pp': summ([r['hypothetical_close_peak_to_net_exit_giveback_pp'] for r in selected]),
        'reference_gain_retention_pct': summ([r['reference_gain_retention_pct'] for r in selected if r['reference_gain_retention_pct'] is not None]),
        'hypothetical_gain_retention_pct': summ([r['hypothetical_gain_retention_pct'] for r in selected if r['hypothetical_gain_retention_pct'] is not None]),
        'reference_max_observed_close_drawdown_pct': summ([r['reference_max_observed_close_drawdown_pct'] for r in selected]),
        'hypothetical_max_observed_close_drawdown_pct': summ([r['hypothetical_max_observed_close_drawdown_pct'] for r in selected]),
        'changed_break_even_replacement_return_pct': summ([r['break_even_replacement_return_pct'] for r in changed if r['break_even_replacement_return_pct'] is not None]),
        'changed_original_later_recovery_count': sum(r['reference_later_exit_vs_early_sale_pct'] > EPS for r in changed if r['reference_later_exit_vs_early_sale_pct'] is not None),
        'dependent_issuer_clusters': len(set(r['dependence_cluster'] for r in selected)),
        'changed_dependent_issuer_clusters': len(set(r['dependence_cluster'] for r in changed))}

summary, per_sleeve, strata, cov_summary = [], [], [], []
for u in ('sp500','nasdaq'):
    for rule in RULES:
        cov = [r for r in coverage if r['universe']==u and r['rule']==rule]
        cov_summary.append({'universe':u,'rule':rule,'complete_nonterminal_episodes':len(cov),
            'episodes_with_age_eligible_days':sum(r['age_eligible_days']>0 for r in cov),
            'episodes_with_feature_coverage':sum(r['has_feature_coverage'] for r in cov),
            'age_eligible_days':sum(r['age_eligible_days'] for r in cov),
            'feature_available_days':sum(r['feature_available_days'] for r in cov),
            'activated_feature_days':sum(r['activated_feature_days'] for r in cov),
            'missing_within_holding_marks':sum(r['missing_marks'] for r in cov)})
        for cost in COSTS:
            selected = [r for r in rows if r['universe']==u and r['rule']==rule and r['exit_cost_bps']==cost]
            summary.append({'universe':u,'rule':rule,'exit_cost_bps':cost,**aggregate(selected)})
            for s in WEIGHTS:
                per_sleeve.append({'universe':u,'sleeve':s,'rule':rule,'exit_cost_bps':cost,
                                  **aggregate([r for r in selected if r['sleeve']==s])})
            if cost==25:
                for field in ('entry_year','volatility_stratum'):
                    for value in sorted(set(r[field] for r in selected)):
                        strata.append({'universe':u,'rule':rule,'exit_cost_bps':cost,
                            'stratification':field,'stratum':value,
                            **aggregate([r for r in selected if r[field]==value])})

limitations = [
 'Archived historical modeled output reference, not current-production Champion replay or certified raw-price provenance.',
 'Original entries, quantities, selection, stop outcomes and endogenous episode endpoints stay fixed; no portfolio or replacement simulation.',
 'Hypothetical execution is the following session CLOSE after a close decision, with adverse cost; opens are absent and next-open performance is unknown.',
 'An original exit on or before hypothetical execution retains priority. Stops/breakers cannot be separately inferred from these fill-only outputs.',
 'All final-source-date sales are excluded as potentially artificial liquidations; all outcomes are otherwise complete episodes, never survivor-only +30 returns.',
 'Observed volatility strata and issuer overlaps are descriptive dependence diagnostics, not causal market regimes or independent samples.',
 '25/50 bps results change EXIT-price costs only on fixed episodes after de-costing saved 12 bps exits; they are not independently replayed cost paths.',
 'Aggregate proceeds differences use 25/50/25 sleeve weights; they are not portfolio returns, realizable strategy profits or replacement alpha.',
 'Missing unheld prices, ranks, benchmarks, raw corporate actions and operational input verification prohibit new-entry or momentum-ranking efficacy conclusions.',
 'Hypothetical exits can alter future capital and opportunities; those effects are not observed. No extrapolation to October 14 DELL.']
result = {'contract':'c1-fixed-episode-delayed-close-diagnostic-v1','primary_exit_cost_bps':25,
 'source_commit':'f0d46ffceb98ba3fd5fca121beba6d8f23ccbdde',
 'reference_is_current_champion':False,'execution':'next-session-close sensitivity; NOT next-open',
 'source_receipts':source_receipts,'specification_sha256':sha(ROOT/'partial-study-plan.md'),
 'script_sha256':sha(Path(__file__).resolve()),'ledger_reconciliation':ledger_checks,
 'exclusions':{'counts':dict(Counter(x['reason'] for x in excluded)),'episodes':excluded},
 'included_episodes':len(episodes),'dependence_clusters_across_universes_sleeves':cluster_count,
 'coverage':cov_summary,'combined_weighted_fixed_episode_diagnostics':summary,
 'per_sleeve':per_sleeve,'descriptive_strata_at_25bps':strata,'limitations':limitations}
(ROOT/'partial-results.json').write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
for name, data in [('partial-episodes.csv',rows),('partial-coverage.csv',coverage)]:
    with (ROOT/name).open('w',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=list(data[0]));writer.writeheader();writer.writerows(data)
manifest = {'script_sha256':sha(Path(__file__).resolve()),'specification_sha256':sha(ROOT/'partial-study-plan.md'),
 'source_receipts':source_receipts,'outputs':{name:sha(ROOT/name) for name in ('partial-results.json','partial-episodes.csv','partial-coverage.csv')}}
(ROOT/'partial-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'included_episodes':len(episodes),'excluded':result['exclusions']['counts'],
 'ledger_checkpoints':sum(c['checkpoints'] for c in ledger_checks),'outputs':['partial-results.json','partial-episodes.csv','partial-coverage.csv','partial-manifest.json']}))

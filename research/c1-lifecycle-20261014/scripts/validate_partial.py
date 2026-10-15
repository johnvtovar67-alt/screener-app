#!/usr/bin/env python3
"""Independent original-fixture calculation of the frozen episode diagnostics."""
import base64, csv, gzip, hashlib, json, math, statistics
from pathlib import Path

from research_paths import work_root, source_root
ROOT = work_root()
REPO = source_root()
rows = list(csv.DictReader((ROOT/'partial-episodes.csv').open()))
observed = {(r['episode_id'], r['rule']): r for r in rows if r['exit_cost_bps']=='25'}
checked = 0
totals = {}
age_diagnostics = []
for universe in ('sp500', 'nasdaq'):
    source = REPO/'tools/fixtures'/f'c1-{universe}-accounting.json.gz.base64'
    runs = json.loads(gzip.decompress(base64.b64decode(source.read_bytes())))
    totals[universe] = {r:0. for r in ('H7','P50','V2')}
    for run in runs:
        dates = [x['date'] for x in run['curve']]
        index = {d:i for i,d in enumerate(dates)}
        marks = [x['marks'] for x in run['curve']]
        pending = {}
        for seq, trade in enumerate(run['trades']):
            symbol = trade['symbol']
            if trade['side']=='buy':
                assert symbol not in pending
                pending[symbol] = (seq, trade)
                continue
            buyseq, buy = pending.pop(symbol)
            assert buy['shares']==trade['shares']
            if trade['date']==dates[-1]:
                continue
            start, end = index[buy['date']], index[trade['date']]
            prices = [float(marks[i][symbol]) for i in range(start,end)]
            basis = float(buy['price'])
            identity = f'{universe}:{run["id"]}:{buyseq}:{symbol}'
            for rule in ('H7','P50','V2'):
                first = None
                peak = -float('inf')
                armed = False
                for offset, price in enumerate(prices):
                    peak = max(peak,price)
                    armed = armed or peak/basis-1 >= .12-1e-12
                    if offset<5:
                        continue
                    hit = False
                    if rule=='H7':
                        hit = price/prices[offset-5]-1 <= -.07+1e-12
                    elif rule=='P50':
                        hit = armed and price/basis-1 <= .5*(peak/basis-1)+1e-12
                    elif offset>=25:
                        past = prices[offset-25:offset-4]
                        sigma = statistics.stdev([math.log(b/a) for a,b in zip(past,past[1:])])
                        hit = armed and math.log(peak/price) >= 2*sigma*math.sqrt(5)-1e-12
                    if hit:
                        first=offset
                        break
                status = 'no_trigger' if first is None else 'reference_exit_priority' if start+first+1>=end else 'changed_exit'
                row = observed[(identity,rule)]
                assert row['status']==status,(identity,rule,status,row['status'])
                assert row['decision_date']==('' if first is None else dates[start+first])
                ref = float(trade['price'])/.9988*.9975
                alternative = prices[first+1]*.9975 if status=='changed_exit' else ref
                delta = (alternative-ref)*buy['shares']*float(row['sleeve_weight'])
                assert abs(delta-float(row['proceeds_difference_weighted']))<1e-7
                totals[universe][rule]+=delta
                checked+=1
        assert not pending
    for rule in ('H7','P50','V2'):
        subset=[r for r in rows if r['universe']==universe and r['rule']==rule and r['exit_cost_bps']=='25' and r['status']=='changed_exit']
        late=[r for r in subset if int(r['hypothetical_duration_sessions'])>30]
        activated=[r for r in rows if r['universe']==universe and r['rule']==rule and r['exit_cost_bps']=='25' and float(r['reference_close_mfe_pct'])>=12]
        age_diagnostics.append(dict(universe=universe,rule=rule,changed_episodes=len(subset),
            exits_after_age30=len(late),after_age30_weighted_delta=sum(float(r['proceeds_difference_weighted']) for r in late),
            median_sessions_freed_among_changed=statistics.median([int(r['sessions_freed']) for r in subset]),
            mean_sessions_freed_among_changed=statistics.mean([int(r['sessions_freed']) for r in subset]),
            original_endpoint_recovery_median_pct=statistics.median([float(r['break_even_replacement_return_pct']) for r in subset]),
            original_peak_ge12_episodes=len(activated),
            original_peak_ge12_median_signed_giveback_pp=statistics.median([float(r['reference_close_peak_to_net_exit_giveback_pp']) for r in activated]),
            hypothetical_same_set_median_signed_giveback_pp=statistics.median([float(r['hypothetical_close_peak_to_net_exit_giveback_pp']) for r in activated]),
            original_peak_ge12_median_gain_retention_pct=statistics.median([float(r['reference_gain_retention_pct']) for r in activated]),
            hypothetical_same_set_retention_available=sum(bool(r['hypothetical_gain_retention_pct']) for r in activated),
            hypothetical_same_set_median_gain_retention_pct=statistics.median([float(r['hypothetical_gain_retention_pct']) for r in activated if r['hypothetical_gain_retention_pct']])))

summary=json.loads((ROOT/'partial-results.json').read_text())
for r in summary['combined_weighted_fixed_episode_diagnostics']:
    if r['exit_cost_bps']==25:
        assert abs(totals[r['universe']][r['rule']]-r['weighted_fixed_episode_proceeds_difference'])<1e-7
assert checked==len(observed)==1410
report=dict(passed=True,independently_recomputed_episode_rule_pairs=checked,
    weighted_fixed_episode_proceeds_delta_at25bps=totals,descriptive_age_and_profit_diagnostics=age_diagnostics,
    limitations=['Age groups are descriptive, not a corrected 30-session backtest.',
                 'Reference-close peaks may miss intraday highs and a later opening fill above all observed closes; signed giveback may be negative.',
                 'Gain retention relative to the hypothetical truncated peak is not directly comparable to retention of the full original peak.',
                 'No thresholds or strategy parameters were changed during this validation.'])
(ROOT/'independent-validation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))

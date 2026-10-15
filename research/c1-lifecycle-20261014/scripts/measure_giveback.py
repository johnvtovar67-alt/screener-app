#!/usr/bin/env python3
"""Descriptive running-peak/current-close measurements on the original path."""
import csv, json, statistics
from pathlib import Path
from research_paths import work_root, source_root
ROOT=work_root()
rows=[r for r in csv.DictReader((ROOT/'partial-episodes.csv').open()) if r['rule']=='H7' and r['exit_cost_bps']=='25']
by_universe={}
for universe in ('sp500','nasdaq'):
    runs={r['id']:r for r in json.loads((ROOT/'data'/f'{universe}-accounting.json').read_text())}
    observations=[]
    for row in [r for r in rows if r['universe']==universe]:
        run=runs[row['sleeve']]
        basis=float(row['entry_basis_with_original_entry_cost'])
        peak=basis
        armed=False
        lost_profit_days=0
        worst_price_dd=worst_gain_giveback=0.
        first_half=None
        for point in run['curve']:
            if not (row['entry_date']<=point['date']<row['reference_exit_date']): continue
            price=float(point['marks'][row['symbol']])
            peak=max(peak,price)
            peak_gain=peak/basis-1
            armed=armed or peak_gain>=.12-1e-12
            worst_price_dd=max(worst_price_dd,(1-price/peak)*100)
            worst_gain_giveback=max(worst_gain_giveback,(peak-price)/basis*100)
            if armed and price<=basis: lost_profit_days+=1
            if armed and price/basis-1 <=.5*peak_gain+1e-12 and first_half is None:first_half=point['date']
        observations.append(dict(episode_id=row['episode_id'],peak_close_gain_pct=(peak/basis-1)*100,
            peak_ge12=armed,lost_all_observed_gain_while_held=lost_profit_days>0,
            observed_days_after_peak_ge12_at_or_below_cost=lost_profit_days,
            maximum_running_close_peak_to_current_drawdown_pct=worst_price_dd,
            maximum_running_gain_giveback_entry_pp=worst_gain_giveback,
            first_half_gain_giveback_date=first_half))
    winners=[r for r in observations if r['peak_ge12']]
    by_universe[universe]=dict(included_episodes=len(observations),episodes_with_close_peak_ge12=len(winners),
       episodes_that_later_lost_all_observed_gain_while_still_held=sum(r['lost_all_observed_gain_while_held'] for r in winners),
       held_days_at_or_below_basis_after_close_peak_ge12=sum(r['observed_days_after_peak_ge12_at_or_below_cost'] for r in winners),
       median_max_running_peak_to_current_drawdown_pct_among_peak_ge12=statistics.median(r['maximum_running_close_peak_to_current_drawdown_pct'] for r in winners),
       median_max_gain_giveback_entry_pp_among_peak_ge12=statistics.median(r['maximum_running_gain_giveback_entry_pp'] for r in winners),
       episodes=winners)
out=dict(purpose='descriptive running close-peak/current-close measurement; no strategy comparison',
    intraday_highs_available=False,exit_day_close_available=False,
    caveat='Observed close peaks and within-holding closes understate paths that include unobserved intraday highs or final-sale-day extremes; sleeves and universes overlap.',universes=by_universe)
(ROOT/'giveback-summary.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({u:{k:v for k,v in r.items() if k!='episodes'} for u,r in by_universe.items()},indent=2))

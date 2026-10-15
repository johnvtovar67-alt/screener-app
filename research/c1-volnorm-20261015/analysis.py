"""Pure paired research orchestrator. Licensed rows and record paths stay in RAM."""
from bisect import bisect_right
import common
import entries
import holding
import stats

def analyze(data,replicates=2000):
    dates=[r['date'] for r in data['SPY']]
    rows={}
    for symbol in data:
        if symbol=='SPY':continue
        index={r['date']:r for r in data[symbol]}
        rows[symbol]=[index.get(d) for d in dates]
    features=common.build_features(dates,rows,data['SPY'])
    records=[];native={}
    # Development is calculated first; fixed historical validation is then opened.
    for period in common.PERIODS:
        native[period['name']]={}
        for symbol,series in rows.items():
            args=(symbol,series,features[symbol],dates,period,common.SECTORS[symbol])
            records.extend(entries.build_entries(*args))
            records.extend(holding.build_holdings(*args))
            records.extend(entries.build_episodes(*args))
            native[period['name']][symbol]=entries.native_counts(*args)
    result=stats.summarize(records,list(common.PERIODS),list(rows),replicates=replicates)
    result['native_refractory_counts']=native
    result['cohort']={'symbols':list(rows),'active_panel':list(common.SYMBOLS),'delisted_available':[s for s in common.OPTIONAL if s in rows],
      'design_sectors':{s:common.SECTORS[s] for s in rows},'point_in_time_ranks_reconstructed':False,
      'candidate':'R5 / (sampleSD20 ending t-5 * sqrt5) <= -2', 'threshold_fit':False,
      'source_rows_retained':False,'record_paths_retained':False}
    return result

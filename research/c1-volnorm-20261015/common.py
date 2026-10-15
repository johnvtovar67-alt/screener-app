"""Pure causal research primitives. No acquisition, file output or C1 mutations."""
from __future__ import annotations
import importlib.util
import math
from pathlib import Path
import statistics

_path=Path(__file__).resolve().parent.parent/'c1-fresh-20261014'/'analyze.py'
_spec=importlib.util.spec_from_file_location('preserved_vnorm_primitives',_path)
_base=importlib.util.module_from_spec(_spec);_spec.loader.exec_module(_base)
pct,complete,factor=_base._pct,_base._complete,_base._factor
SYMBOLS=('AAPL','MSFT','NVDA','TSLA','JPM','XOM','PG','JNJ','AMZN','META','UNH','PFE','BA','CAT','WMT','HD','NKE','NEE','DUK','AMT','SPG','T','NEM','CVX')
OPTIONAL=('BBBY','SIVB','ATVI')
SECTORS=dict(zip(SYMBOLS,('technology','technology','technology','consumer_discretionary','financials','energy','consumer_staples','healthcare','consumer_discretionary','communication','healthcare','healthcare','industrials','industrials','consumer_staples','consumer_discretionary','consumer_discretionary','utilities','utilities','real_estate','real_estate','communication','materials','energy')))
SECTORS.update(BBBY='consumer_discretionary',SIVB='financials',ATVI='communication')
PERIODS=(
 {'name':'reused_2020_2024','start':'2020-01-02','end':'2024-09-30','outcome_end':'2024-12-31'},
 {'name':'validation_2010_2018','start':'2010-01-04','end':'2018-09-28','outcome_end':'2018-12-31'},
 {'name':'new_2025','start':'2025-01-02','end':'2025-09-30','outcome_end':'2025-12-31'},
)

def sigma(rows,t,lag=5,length=20):
    end=t-lag
    if not complete(rows,end-length,end):return None
    values=[pct(rows[j]['close'],rows[j-1]['close']) for j in range(end-length+1,end+1)]
    s=statistics.stdev(values)
    return s if math.isfinite(s) and s>0 else None

def signal(rows,t):
    r5=factor(rows,t,5)
    s=sigma(rows,t)
    z=r5/(s*math.sqrt(5)) if r5 is not None and s is not None else None
    return {'H':r5<=-7 if r5 is not None else None,'V':z<=-2 if z is not None else None,'z':z,'sigma':s,'r5':r5}

def forward(rows,t,limit,peak=None):
    """Signal close t -> next open; preserved close[execution+h] convention."""
    e=t+1;limit=min(limit,len(rows)-1)
    out={}
    s=sigma(rows,t)
    for h in (5,21,63):
        end=e+h
        status='censored_end' if end>limit else 'censored_missing' if not complete(rows,e,end) else 'observed'
        value=pct(rows[end]['close'],rows[e]['open']) if status=='observed' else None
        out[f'f{h}']=value;out[f'f{h}_status']=status
        out[f'risk_f{h}']=value/(s*math.sqrt(h)) if value is not None and s is not None else None
    if peak is None and complete(rows,t-19,t):peak=max(r['close'] for r in rows[t-19:t+1])
    observed=e+21<=limit and complete(rows,e,e+21)
    recovery=any(rows[j]['close']>=peak for j in range(e+1,e+22)) if observed and peak is not None else None
    out.update(recovery21=recovery,positive21=out['f21']>0 if out['f21'] is not None else None,
      breakdown21=out['f21']<0 and not recovery if out['f21'] is not None and recovery is not None else None,
      mae21=min(0,min(pct(rows[j]['close'],rows[e]['open']) for j in range(e,e+22))) if observed else None,
      mfe21=max(0,max(pct(rows[j]['close'],rows[e]['open']) for j in range(e,e+22))) if observed else None)
    return out

def tag(symbol,t,dates,features,period,sector):
    day=dates[t]
    return {'symbol':symbol,'period':period['name'],'quarter':f'{day[:4]}Q{(int(day[5:7])-1)//3+1}',
      'year':day[:4],'sector':sector,'regime':features[t]['regime'],'risk_group':features[t]['risk_group']}

def build_features(dates,rows,spy):
    """All tags use data available at or before their observation, never 2019 cutoffs."""
    spy_sd=[sigma(spy,t,lag=0) for t in range(len(dates))]
    regimes=[]
    for t in range(len(dates)):
        prior=t-1
        past=spy_sd[max(0,prior-252):prior]
        ret=factor(spy,prior,63)
        if prior<0 or len(past)!=252 or any(v is None for v in past) or ret is None or spy_sd[prior] is None:
            regimes.append('unclassified');continue
        regimes.append(('nonnegative63' if ret>=0 else 'negative63')+'_'+('highvol20' if spy_sd[prior]>statistics.median(past) else 'lowvol20'))
    result={};annual={}
    for symbol,series in rows.items():
        result[symbol]=[];annual[symbol]=[]
        for t in range(len(dates)):
            s=signal(series,t);slow=factor(series,t,100,20);fast=factor(series,t,55,5)
            s.update(slow=slow,fast=fast,context=slow>0 and fast>0 if slow is not None and fast is not None else None,regime=regimes[t])
            result[symbol].append(s)
            annual[symbol].append(sigma(series,t-1,lag=0,length=252))
    for t in range(len(dates)):
        known=[annual[s][t] for s in rows if annual[s][t] is not None]
        cutoff=statistics.median(known) if known else None
        for symbol in rows:
            value=annual[symbol][t]
            result[symbol][t]['risk_group']='unclassified' if value is None or cutoff is None else 'high' if value>cutoff else 'low'
    return result

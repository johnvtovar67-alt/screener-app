#!/usr/bin/env python3
"""Bounded FMP acquisition. Licensed payloads only in memory; NEVER saved/logged.

Only audit metadata and owner-private aggregate statistics are saved. API key is
read from the existing connection, sent solely to financialmodelingprep.com and
never interpolated into logs. Requires stdlib only. No retries or fallbacks.
"""
import argparse
import datetime as dt
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent
SYMBOLS = ['AAPL','MSFT','NVDA','TSLA','JPM','XOM','PG','JNJ']
FROM, TO = '2019-01-01', '2024-12-31'
LIMIT_CALLS, LIMIT_BYTES = 19, 12*1024*1024  # plus one prior schema probe =20

class DataFailure(Exception):
    pass

class Client:
    def __init__(self):
        self.key = os.environ.get('FMP_API_KEY')
        if not self.key:
            raise DataFailure('FMP_API_KEY missing from existing connection')
        self.calls, self.bytes, self.started = [], 2358, 0.0
    def get(self, endpoint, **params):
        if len(self.calls) >= LIMIT_CALLS:
            raise DataFailure('Predeclared request cap reached')
        time.sleep(max(0, .35-(time.monotonic()-self.started)))
        self.started=time.monotonic()
        url='https://financialmodelingprep.com/stable/'+endpoint+'?'+urllib.parse.urlencode(dict(params,apikey=self.key))
        meta={'endpoint':endpoint,'params':params,'utc':dt.datetime.now(dt.timezone.utc).isoformat()}
        self.calls.append(meta)
        try:
            with urllib.request.urlopen(url,timeout=20) as r:
                body=r.read(LIMIT_BYTES-self.bytes+1)
                meta.update(status=r.status, content_type=r.headers.get('Content-Type',''))
        except urllib.error.HTTPError as e:
            meta['status']=e.code
            raise DataFailure(f'FMP HTTP {e.code} at {endpoint}; no retry') from None
        except Exception as e:
            raise DataFailure(f'{type(e).__name__} at {endpoint}; no retry') from None
        self.bytes+=len(body)
        meta.update(bytes=len(body),sha256=hashlib.sha256(body).hexdigest())
        if self.bytes>LIMIT_BYTES:
            raise DataFailure('Cumulative byte cap exceeded')
        try: p=json.loads(body)
        except Exception: raise DataFailure('Non-JSON provider response') from None
        if not isinstance(p,list) or not p:
            raise DataFailure(f'Nonempty array required at {endpoint}')
        meta.update(rows=len(p),fields=sorted(p[0]))
        return p

def easter(y):
    a=y%19;b=y//100;c=y%100;d=b//4;e=b%4;f=(b+8)//25;g=(b-f+1)//3
    h=(19*a+b-d-g+15)%30;i=c//4;k=c%4;l=(32+2*e+2*i-h-k)%7;m=(a+11*h+22*l)//451
    n=h+l-7*m+114
    return dt.date(y,n//31,n%31+1)
def observed(d):
    return d+dt.timedelta(days=1 if d.weekday()==6 else -1 if d.weekday()==5 else 0)
def nth(y,m,w,n):
    d=dt.date(y,m,1)
    return d+dt.timedelta(days=(w-d.weekday())%7+7*(n-1))
def sessions(lo=FROM,hi=TO):
    first,last=dt.date.fromisoformat(lo),dt.date.fromisoformat(hi)
    holidays=set()
    for y in range(first.year,last.year+1):
        # NYSE does not observe Saturday New Year's Day on preceding Friday.
        ny=dt.date(y,1,1)
        holidays.add(ny+dt.timedelta(days=1) if ny.weekday()==6 else ny)
        holidays.update([nth(y,1,0,3),nth(y,2,0,3),easter(y)-dt.timedelta(days=2),
          max(dt.date(y,5,x) for x in range(25,32) if dt.date(y,5,x).weekday()==0),
          observed(dt.date(y,7,4)),nth(y,9,0,1),nth(y,11,3,4),observed(dt.date(y,12,25))])
        if y>=2022: holidays.add(observed(dt.date(y,6,19)))
    out=[];d=first
    while d<=last:
        if d.weekday()<5 and d not in holidays: out.append(d.isoformat())
        d+=dt.timedelta(days=1)
    return out

def normalize(rows,symbol):
    out=[];seen=set()
    for row in rows:
        date=row.get('date')
        try: dt.date.fromisoformat(date)
        except Exception: raise DataFailure(f'{symbol}: invalid date') from None
        if date in seen or not FROM<=date<=TO or row.get('symbol')!=symbol:
            raise DataFailure(f'{symbol}: duplicate/out-of-bound date or wrong symbol')
        seen.add(date)
        try:
            b={'date':date,**{k:float(row['adj'+k.title()]) for k in ['open','high','low','close']},'volume':float(row['volume'])}
        except Exception: raise DataFailure(f'{symbol}: adjusted OHLCV field missing') from None
        if not all(math.isfinite(b[k]) and b[k]>0 for k in ['open','high','low','close']):
            raise DataFailure(f'{symbol}: nonpositive/nonfinite adjusted price')
        if not math.isfinite(b['volume']) or b['volume']<0 or b['low']>min(b['open'],b['close'])+1e-7 or b['high']<max(b['open'],b['close'])-1e-7:
            raise DataFailure(f'{symbol}: OHLCV geometry failed')
        out.append(b)
    return sorted(out,key=lambda b:b['date'])

def run():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--private-output',required=True,help='Owner-private aggregate JSON, outside Git checkout')
    p.add_argument('--public-audit',default=str(ROOT/'acquisition-audit.json'))
    args=p.parse_args()
    private=Path(args.private_output).resolve()
    checkout=ROOT.parents[1]
    if private.is_relative_to(checkout):
        raise DataFailure('Private aggregate destination must be outside Git checkout')
    # Fail before consuming any paid request if the destination cannot be written.
    try:
        private.parent.mkdir(parents=True,exist_ok=True)
        import tempfile
        fd,check=tempfile.mkstemp(prefix='c1-output-preflight-',dir=private.parent)
        os.write(fd,b'output preflight');os.fsync(fd);os.close(fd);os.unlink(check)
    except OSError as e:
        raise DataFailure(f'Private output preflight failed: errno={e.errno}, {e.strerror}') from None
    c=Client();data={} 
    audit={'contract':'c1-fresh-ephemeral-v1','status':'running','source_ref':'f0d46ffceb98ba3fd5fca121beba6d8f23ccbdde',
      'spec_ref':'3bcfca60c8ec5d2f2bf3d1b1b6724bd1e34b9f08','frozen48_modified':False,'production_modified':False,
      'licensed_inputs_saved':False,'initial_schema_probe':{'symbol':'PG','from':'2020-02-18','to':'2020-03-06','status':200,'rows':14,'bytes':2358},
      'symbols':SYMBOLS,'from':FROM,'to':TO,'provider_vintage':'fresh_retrieval_not_as_known_history',
      'adjustment':'provider adjOpen/adjHigh/adjLow/adjClose; adjusted-open execution proxy only'}
    try:
        expected=sessions()
        for symbol in SYMBOLS+['SPY']:
            rows=c.get('historical-price-eod/dividend-adjusted',symbol=symbol,**{'from':FROM,'to':TO})
            bars=normalize(rows,symbol)
            if [b['date'] for b in bars]!=expected:
                missing=set(expected)-{b['date'] for b in bars};extra={b['date'] for b in bars}-set(expected)
                raise DataFailure(f'{symbol}: independent calendar mismatch, missing={len(missing)}, extra={len(extra)}')
            data[symbol]=bars
        audit['calendar']={'independent_nyse_calendar_match':True,'spy_calendar_match':True,'sessions_per_symbol':len(expected),
          'first_session':expected[0],'last_session':expected[-1],'warmup_sessions':sum(d<'2020-01-02' for d in expected),
          'missing_observations':0,'duplicate_observations':0,'adjusted_ohlcv_geometry_pass':True}
        changes=c.get('historical-sp500-constituent')
        fields=set().union(*(set(r) for r in changes))
        audit['membership']={'endpoint_available':True,'rows':len(changes),'fields':sorted(fields),
          'dated_change_fields_present':'dateAdded' in fields and bool(fields & {'addedSymbol','symbol'}) and bool(fields & {'removedSymbol','removedTicker'}),
          'full_dated_eligible_universe_verified':False,'historical_sector_assignments_verified':False,
          'limitation':'Change feed availability only; fixed purposive sample, no backdated membership or ranks.'}
        # Same adjusted payload overlap twice, response order and non-price columns irrelevant.
        repeat=[]
        for symbol,lo,hi in [('NVDA','2024-05-20','2024-06-21'),('PG','2020-02-18','2020-03-06')]:
            rows=c.get('historical-price-eod/dividend-adjusted',symbol=symbol,**{'from':lo,'to':hi})
            fresh=normalize(rows,symbol)
            old=[b for b in data[symbol] if lo<=b['date']<=hi]
            same=fresh==old
            repeat.append({'symbol':symbol,'from':lo,'to':hi,'rows':len(fresh),'identical_normalized_overlap':same})
            if not same: raise DataFailure(f'{symbol}: repeated adjusted OHLCV differ')
        audit['repeat_consistency']=repeat
        split=c.get('splits',symbol='NVDA',limit='100')
        div=c.get('dividends',symbol='PG',limit='100')
        action_checks=[]
        for symbol,lo,hi,actions in [('NVDA','2024-05-20','2024-06-21',split),('PG','2024-06-01','2024-08-31',div)]:
            full=c.get('historical-price-eod/full',symbol=symbol,**{'from':lo,'to':hi})
            adjusted={b['date']:b for b in data[symbol] if lo<=b['date']<=hi}
            fullmap={r['date']:r for r in full}
            if set(fullmap)!=set(adjusted): raise DataFailure(f'{symbol}: full/adjusted date mismatch')
            if not all(all(isinstance(r.get(k),(float,int)) and r[k]>0 for k in ['open','high','low','close']) for r in full):
                raise DataFailure(f'{symbol}: full OHLC fields invalid')
            factors={d:adjusted[d]['close']/r['close'] for d,r in fullmap.items()}
            ohlc_factor_match=all(abs(adjusted[d][k]/r[k]-factors[d])<.003 for d,r in fullmap.items() for k in ['open','high','low'])
            action_dates={r.get('date') for r in actions if lo<=str(r.get('date',''))<=hi}
            dates=sorted(fullmap)
            jumps=[dates[i] for i in range(1,len(dates)) if abs(factors[dates[i]]/factors[dates[i-1]]-1)>.0002]
            # No huge unadjusted split discontinuity at a known split; geometry is provider consistency only.
            split_continuity=bool(action_dates) and all(d in fullmap and dates.index(d)>0 for d in action_dates) and all(.5<fullmap[d]['close']/fullmap[dates[dates.index(d)-1]]['close']<2
                for d in action_dates if d in fullmap and dates.index(d)>0) if symbol=='NVDA' else None
            rec={'symbol':symbol,'dates_match':True,'ohlc_common_adjustment_factor_within_0_3pct':ohlc_factor_match,
              'action_records_in_window':sum(lo<=str(r.get('date',''))<=hi for r in actions),
              'action_field_names':sorted(set().union(*(set(r) for r in actions))),
              'split_adjusted_full_continuity':split_continuity,
              'dividend_factor_changes_coincide_with_action_dates':set(jumps)<=action_dates if symbol=='PG' else None,
              'interpretation':'Internal split/dividend consistency only; no independent vendor or as-known vintage certification.'}
            action_checks.append(rec)
            if not ohlc_factor_match or (symbol=='NVDA' and not split_continuity):
                raise DataFailure(f'{symbol}: corporate-action consistency failed')
            if symbol=='PG' and (not jumps or not set(jumps)<=action_dates):
                raise DataFailure('PG dividend factor changes do not match action records')
        audit['adjustment_checks']=action_checks
        spec=importlib.util.spec_from_file_location('c1_fresh_analysis',ROOT/'analyze.py')
        mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
        result=mod.analyze(data)
        # Aggregate derived results only. Price-level rows never leave RAM.
        private.parent.mkdir(parents=True,exist_ok=True)
        fd=os.open(private,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
        with os.fdopen(fd,'w') as f: json.dump(result,f,indent=2,allow_nan=False);f.write('\n')
        audit['status']='complete_partial_research'
        audit['analysis_executed']=True
        audit['numerical_results']='Owner-private aggregate output; not published without display rights'
    except Exception as e:
        audit['status']='failed_prerequisite'
        audit['failure']=str(e) if isinstance(e,DataFailure) else type(e).__name__
        raise
    finally:
        audit['requests']=c.calls;audit['provider_calls_including_initial_probe']=len(c.calls)+1
        audit['bytes_including_initial_probe']=c.bytes
        audit['input_preservation']='None: raw and normalized licensed inputs existed only in process memory'
        Path(args.public_audit).write_text(json.dumps(audit,indent=2,allow_nan=False)+'\n')
        print(json.dumps({'status':audit['status'],'calls':len(c.calls)+1,'bytes':c.bytes,
          'failure':audit.get('failure'),'audit':args.public_audit,'private_aggregate_output':str(private) if audit['status']=='complete_partial_research' else None}))

if __name__=='__main__':
    try: run()
    except Exception as e:
        print('Stopped at prerequisite: '+(str(e) if isinstance(e,DataFailure) else type(e).__name__),file=sys.stderr)
        sys.exit(2)

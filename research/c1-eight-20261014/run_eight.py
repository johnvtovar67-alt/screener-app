#!/usr/bin/env python3
"""Bounded authorized eight-security acquisition; licensed rows stay in memory.

Only private aggregate/provenance output is saved. Public audit contains no
provider fingerprints or market-derived outcome cells. Existing API key only;
no retries, route changes, external messages, account or production mutations.
"""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT=Path(__file__).resolve().parent
CHECKOUT=ROOT.parents[1]
SYMBOLS=['AAPL','MSFT','NVDA','TSLA','JPM','XOM','PG','JNJ']
LIMIT_CALLS=20
LIMIT_BYTES=12*1024*1024

def module_at(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
    return mod

acq=module_at('preserved_acquisition_validation',ROOT.parent/'c1-fresh-20261014'/'acquire.py')
base=module_at('preserved_base_analysis',ROOT.parent/'c1-fresh-20261014'/'analyze.py')
extension=module_at('eight_extension_analysis',ROOT/'analysis.py')
Failure=acq.DataFailure

def save_private(path,value):
    """Atomically publish an owner-only result, never overwrite an existing one."""
    path=Path(path)
    if path.exists():raise Failure('Private output already exists; refusing overwrite')
    fd,tmp=tempfile.mkstemp(prefix='.private-',dir=path.parent)
    try:
        with os.fdopen(fd,'w') as f:
            json.dump(value,f,indent=2,allow_nan=False);f.write('\n');f.flush();os.fsync(f.fileno())
        os.link(tmp,path)  # atomic, refuses overwrite
    finally:
        if os.path.exists(tmp):os.unlink(tmp)

def preflight_private(path):
    path=Path(path).resolve()
    if path.is_relative_to(CHECKOUT):raise Failure('Private output must be outside Git checkout')
    path.mkdir(mode=0o700,parents=True,exist_ok=False)
    os.chmod(path,0o700)
    fd,check=tempfile.mkstemp(prefix='.output-preflight-',dir=path)
    try:os.write(fd,b'private aggregate output preflight');os.fsync(fd)
    finally:os.close(fd);os.unlink(check)
    return path

class Client:
    def __init__(self):
        self.key=os.environ.get('FMP_API_KEY')
        if not self.key:raise Failure('Existing FMP_API_KEY binding unavailable')
        self.calls=[];self.fingerprints=[];self.bytes=0;self.started=0.0
    def get(self,endpoint,**params):
        if len(self.calls)>=LIMIT_CALLS:raise Failure('New experiment request cap reached')
        time.sleep(max(0,.35-(time.monotonic()-self.started)))
        self.started=time.monotonic()
        meta={'endpoint':endpoint,'params':params,'utc':dt.datetime.now(dt.timezone.utc).isoformat()}
        self.calls.append(meta)
        url='https://financialmodelingprep.com/stable/'+endpoint+'?'+urllib.parse.urlencode(dict(params,apikey=self.key))
        try:
            with urllib.request.urlopen(url,timeout=20) as r:
                body=r.read(LIMIT_BYTES-self.bytes+1)
                meta.update(status=r.status,content_type=r.headers.get('Content-Type',''))
        except urllib.error.HTTPError as e:
            meta['status']=e.code
            raise Failure(f'FMP HTTP{e.code} at {endpoint}; stopped without retry') from None
        except Exception as e:raise Failure(f'{type(e).__name__} at {endpoint}; stopped without retry') from None
        self.bytes+=len(body);meta['bytes']=len(body)
        self.fingerprints.append({'request_index':len(self.calls),'endpoint':endpoint,'params':params,'sha256':hashlib.sha256(body).hexdigest()})
        if self.bytes>LIMIT_BYTES:raise Failure('Cumulative response-byte cap exceeded')
        try:payload=json.loads(body)
        except Exception:raise Failure('Provider returned non-JSON payload') from None
        if not isinstance(payload,list) or not payload:raise Failure(f'Nonempty array required at {endpoint}')
        meta.update(rows=len(payload),fields=sorted(payload[0]))
        return payload

def validate_actions(c,data):
    split=c.get('splits',symbol='NVDA',limit='100')
    dividends=c.get('dividends',symbol='PG',limit='100')
    checks=[]
    for symbol,lo,hi,actions in [('NVDA','2024-05-20','2024-06-21',split),('PG','2024-06-01','2024-08-31',dividends)]:
        full=c.get('historical-price-eod/full',symbol=symbol,**{'from':lo,'to':hi})
        adjusted={r['date']:r for r in data[symbol] if lo<=r['date']<=hi}
        fullmap={r['date']:r for r in full}
        if len(fullmap)!=len(full) or set(fullmap)!=set(adjusted):raise Failure(f'{symbol}: action-window date uniqueness/coverage failure')
        if not all(r.get('symbol')==symbol and all(isinstance(r.get(k),(float,int)) and r[k]>0 for k in ['open','high','low','close']) for r in full):raise Failure(f'{symbol}: full OHLC fields invalid')
        factors={d:adjusted[d]['close']/r['close'] for d,r in fullmap.items()}
        common=all(abs(adjusted[d][k]/r[k]-factors[d])<.003 for d,r in fullmap.items() for k in ['open','high','low'])
        dates=sorted(fullmap)
        action_dates={r.get('date') for r in actions if lo<=str(r.get('date',''))<=hi}
        jumps={dates[i] for i in range(1,len(dates)) if abs(factors[dates[i]]/factors[dates[i-1]]-1)>.0002}
        continuity=(bool(action_dates) and all(d in fullmap and dates.index(d)>0 for d in action_dates)
          and all(.5<fullmap[d]['close']/fullmap[dates[dates.index(d)-1]]['close']<2 for d in action_dates)) if symbol=='NVDA' else None
        dividend_match=bool(jumps) and jumps<=action_dates if symbol=='PG' else None
        checks.append({'symbol':symbol,'dates_and_fields_match':True,'common_adjustment_factor':common,'action_present':bool(action_dates),'split_continuity':continuity,'dividend_factor_changes_match_exdates':dividend_match})
        if not common or (symbol=='NVDA' and not continuity) or (symbol=='PG' and not dividend_match):raise Failure(f'{symbol}: targeted adjustment consistency failed')
    return checks

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--run-id',required=True)
    p.add_argument('--private-root',default='/workspace/work/c1-private-eight')
    args=p.parse_args()
    if not args.run_id or any(ch not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_' for ch in args.run_id):raise Failure('Unsafe run identifier')
    private=Path(args.private_root).resolve()/args.run_id
    public=ROOT/'runs'/args.run_id
    if public.exists() or private.exists():raise Failure('Run already exists; refusing repeat acquisition')
    # Everything that can fail without data is tested before first subscription call.
    private=preflight_private(private)
    public.mkdir(parents=True,exist_ok=False)
    (public/'run.lock').write_text('one-time bounded run reserved\n')
    source_files=[Path(__file__),ROOT/'analysis.py',ROOT/'PROTOCOL.md',ROOT/'EXECUTION-ADDENDUM.md',ROOT.parent/'c1-fresh-20261014'/'analyze.py']
    code_hashes={str(x.relative_to(CHECKOUT)):hashlib.sha256(x.read_bytes()).hexdigest() for x in source_files}
    start=dt.datetime.now(dt.timezone.utc).isoformat()
    audit={'contract':'c1-eight-execution-v1','run_id':args.run_id,'started_utc':start,'status':'acquiring','new_experiment_call_cap':LIMIT_CALLS,'byte_cap':LIMIT_BYTES,'planned_calls':16,'prior_study_calls':20,'source_code_sha256':code_hashes,'securities':SYMBOLS,'from':acq.FROM,'to':acq.TO,'private_output_preflight':True,'source_price_or_membership_rows_persisted':False,'provider_fingerprints':'private provenance only','numerical_outputs':'subscriber-private only','provider_remaining_quota':'not exposed by existing connection; no numeric remainder claimed','production_modified':False,'pr262_modified':False,'frozen48_modified':False}
    admin={'research_execution_authorization':'Latest owner instruction expressly authorizes bounded eight-security study','processing_and_storage_permissions':'settled; not reopened','section2_8':'Technical location identifiers remain a separate administrative question, not a research-permission or execution gate under owner instruction','subscription':'Existing Ultimate connection; retention follows the established subscriber-private conditions','remaining_account_usage':'Not independently exposed; use hard experiment cap and stop on provider quota/entitlement errors','private_handling':'source rows RAM-only; fingerprints private and subject to source-data deletion rules; all numerical aggregates private','retention_conditions_reference':'Established subscriber-private written clarification; conditions are not reproduced in public source code','derived_retention':'Evaluate private output against established subscriber conditions before any post-subscription retention'}
    save_private(private/'administrative-status.json',admin)
    c=Client();data={}
    try:
        expected=acq.sessions()
        for symbol in SYMBOLS+['SPY']:
            payload=c.get('historical-price-eod/dividend-adjusted',symbol=symbol,**{'from':acq.FROM,'to':acq.TO})
            bars=acq.normalize(payload,symbol)
            if [b['date'] for b in bars]!=expected:raise Failure(f'{symbol}: independent NYSE calendar mismatch')
            data[symbol]=bars
        audit['calendar']={'independent_calendar_match':True,'SPY_match':True,'sessions_per_symbol':len(expected),'warmup_sessions':sum(d<'2020-01-02' for d in expected),'missing_rows':0,'duplicate_rows':0,'adjusted_OHLCV_geometry':'pass'}
        changes=c.get('historical-sp500-constituent')
        fields=set().union(*(set(r) for r in changes))
        audit['membership']={'available':True,'dated_change_fields_present':'dateAdded' in fields and bool(fields&{'addedSymbol','addedTicker','symbol'}) and bool(fields&{'removedSymbol','removedTicker'}),'full_dated_eligible_universe_verified':False,'historical_sectors_verified':False}
        overlaps=[]
        for symbol,lo,hi in [('NVDA','2024-05-20','2024-06-21'),('PG','2020-02-18','2020-03-06')]:
            fresh=acq.normalize(c.get('historical-price-eod/dividend-adjusted',symbol=symbol,**{'from':lo,'to':hi}),symbol)
            same=fresh==[b for b in data[symbol] if lo<=b['date']<=hi]
            overlaps.append({'symbol':symbol,'from':lo,'to':hi,'identical_normalized_OHLCV':same})
            if not same:raise Failure(f'{symbol}: inconsistent overlapping response')
        audit['repeat_consistency']=overlaps
        audit['adjustment_checks']=validate_actions(c,data)
        old=json.loads((ROOT.parent/'c1-fresh-20261014'/'acquisition-audit.json').read_text())
        old_hashes={r['params'].get('symbol'):r.get('sha256') for r in old['requests'] if r['endpoint']=='historical-price-eod/dividend-adjusted' and r['params'].get('from')==acq.FROM}
        vintage=[]
        for item in c.fingerprints[:9]:
            symbol=item['params']['symbol'];prior=old_hashes.get(symbol)
            vintage.append({'symbol':symbol,'prior_fingerprint_available':prior is not None,'same_full_payload_as_prior':item['sha256']==prior if prior else None})
        audit['vintage_comparison']=vintage
        audit['input_vintage']='New timestamped cohort exclusively; no old rows spliced; fresh vintage may differ and is not original-as-known history'
        base_result=base.analyze(data)
        save_private(private/'base-eight-aggregate.json',base_result)
        audit['base_eight_aggregate_saved']=True
        result=extension.analyze(data)  # preserved full-eight cohort, 2,000 draws
        save_private(private/'eight-aggregate.json',result)
        audit.update(status='complete_partial_research',extension_aggregate_saved=True,bootstrap_replicates=result['bootstrap']['replicates'])
    except Exception as e:
        audit['status']='stopped_at_prerequisite' if not audit.get('base_eight_aggregate_saved') else 'base_complete_extension_stopped'
        audit['failure']=str(e) if isinstance(e,Failure) else type(e).__name__
        raise
    finally:
        # Fingerprints are licensed private provenance; never copy them to public audit.
        save_private(private/'private-provenance.json',{'requests':c.calls,'provider_fingerprints':c.fingerprints,'run_id':args.run_id,'started_utc':start,'source_code_sha256':code_hashes,'vintage_comparison':audit.get('vintage_comparison'),'source_rows_retained':False})
        audit.update(requests=c.calls,new_experiment_calls=len(c.calls),response_bytes=c.bytes,completed_utc=dt.datetime.now(dt.timezone.utc).isoformat())
        (public/'operational-audit.json').write_text(json.dumps(audit,indent=2,allow_nan=False)+'\n')
        print(json.dumps({'status':audit['status'],'new_calls':len(c.calls),'bytes':c.bytes,'base_aggregate_saved':audit.get('base_eight_aggregate_saved',False),'extended_aggregate_saved':audit.get('extension_aggregate_saved',False),'private_run_directory':str(private),'failure':audit.get('failure')}))

if __name__=='__main__':
    try:main()
    except Exception as e:
        print('Stopped: '+(str(e) if isinstance(e,Failure) else type(e).__name__),file=sys.stderr)
        raise SystemExit(2)

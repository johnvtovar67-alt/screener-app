#!/usr/bin/env python3
"""One bounded authorized cohort; private aggregates only, no source persistence."""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import analysis
import common

ROOT=Path(__file__).resolve().parent
CHECKOUT=ROOT.parents[1]
def load_module(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod
old=load_module('preserved_private_acquisition',ROOT.parent/'c1-eight-20261014'/'run_eight.py')
Failure=old.Failure
FROM,TO='2008-01-01','2025-12-31'
CALL_CAP,BYTE_CAP=40,32*1024*1024

class Client:
    def __init__(self):
        self.key=os.environ.get('FMP_API_KEY')
        if not self.key:raise Failure('Existing FMP key binding unavailable')
        self.calls=[];self.fingerprints=[];self.bytes=0;self.started=0
    def get(self,endpoint,optional=False,**params):
        if len(self.calls)>=CALL_CAP:raise Failure('Request cap reached')
        time.sleep(max(0,.35-(time.monotonic()-self.started)));self.started=time.monotonic()
        meta={'endpoint':endpoint,'params':params,'utc':dt.datetime.now(dt.timezone.utc).isoformat()};self.calls.append(meta)
        url='https://financialmodelingprep.com/stable/'+endpoint+'?'+urllib.parse.urlencode(dict(params,apikey=self.key))
        try:
            with urllib.request.urlopen(url,timeout=20) as response:
                body=response.read(BYTE_CAP-self.bytes+1)
                meta.update(status=response.status,content_type=response.headers.get('Content-Type',''))
        except urllib.error.HTTPError as e:
            meta['status']=e.code
            if optional and e.code==404:meta['optional_unavailable']=True;return []
            raise Failure(f'FMP HTTP{e.code} at {endpoint}; no retry') from None
        except Exception as e:raise Failure(f'{type(e).__name__} at {endpoint}; no retry') from None
        self.bytes+=len(body);meta['bytes']=len(body)
        self.fingerprints.append({'index':len(self.calls),'endpoint':endpoint,'params':params,'sha256':hashlib.sha256(body).hexdigest()})
        if self.bytes>BYTE_CAP:raise Failure('Response-byte cap exceeded')
        try:payload=json.loads(body)
        except Exception:raise Failure('Non-JSON response') from None
        if not isinstance(payload,list):raise Failure(f'Array schema required at {endpoint}')
        if not payload and not optional:raise Failure(f'Empty critical response at {endpoint}')
        meta.update(rows=len(payload),fields=sorted(payload[0]) if payload else [])
        return payload

def sessions():
    closures={'2012-10-29','2012-10-30','2018-12-05','2025-01-09'}
    return [d for d in old.acq.sessions(FROM,TO) if d not in closures]

def normalize(payload,symbol,calendar):
    out=[];seen=set();allowed=set(calendar)
    for r in payload:
        day=r.get('date')
        if day not in allowed or day in seen or r.get('symbol')!=symbol:raise Failure(f'{symbol}: date/symbol/uniqueness validation failed')
        seen.add(day)
        try:bar={'date':day,**{k:float(r['adj'+k.title()]) for k in ('open','high','low','close')},'volume':float(r['volume'])}
        except Exception:raise Failure(f'{symbol}: adjusted field schema failed') from None
        if not all(math.isfinite(bar[k]) and bar[k]>0 for k in ('open','high','low','close')) or not math.isfinite(bar['volume']) or bar['volume']<0:raise Failure(f'{symbol}: invalid numeric fields')
        if bar['low']>min(bar['open'],bar['close'])+1e-7 or bar['high']<max(bar['open'],bar['close'])-1e-7:raise Failure(f'{symbol}: adjusted geometry failed')
        out.append(bar)
    return sorted(out,key=lambda b:b['date'])

def private_provenance(client,hashes,identities,run_id):
    """Keep source fingerprints private; never persist delisting source rows."""
    return {'run_id':run_id,'requests':client.calls,'provider_fingerprints':client.fingerprints,
      'source_code_sha256':hashes,'optional_identity_verified':{s:True for s in identities},'source_rows_retained':False}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--run-id',required=True);p.add_argument('--private-root',default='/workspace/work/c1-private-volnorm');args=p.parse_args()
    if not args.run_id or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_' for c in args.run_id):raise Failure('Unsafe run id')
    public=ROOT/'runs'/args.run_id;private=Path(args.private_root).resolve()/args.run_id
    if public.exists() or private.exists():raise Failure('Run exists; no repeated acquisition')
    private=old.preflight_private(private);public.mkdir(parents=True,exist_ok=False);(public/'run.lock').write_text('bounded one-time acquisition reserved\n')
    sources=list(ROOT.glob('*.py'))+[ROOT/'PROTOCOL.md',ROOT.parent/'c1-fresh-20261014'/'analyze.py',ROOT.parent/'c1-eight-20261014'/'run_eight.py']
    hashes={str(f.relative_to(CHECKOUT)):hashlib.sha256(f.read_bytes()).hexdigest() for f in sources}
    commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=CHECKOUT,text=True).strip()
    audit={'contract':'c1-volnorm-acquisition-v1','run_id':args.run_id,'started_utc':dt.datetime.now(dt.timezone.utc).isoformat(),'freeze_commit':commit,'source_code_sha256':hashes,'call_cap':CALL_CAP,'byte_cap':BYTE_CAP,'status':'acquiring','source_rows_persisted':False,'numerical_outputs':'private only','provider_remaining_quota':'not exposed; no measured remainder claimed','private_output_preflight':True,'production_modified':False,'pr262_modified':False,'frozen48_modified':False}
    old.save_private(private/'administrative-status.json',{'authorization':'Owner explicitly authorized next bounded personal research using existing private processing arrangements','location_notice':'Separate technical identifier administrative question; underlying research permission settled','retention':'Existing subscriber-private conditions apply; source fingerprints subject to source deletion obligations','private_preservation':'Existing owner-restricted cloud workspace, no new infrastructure or remote numerical publication','budget':'40requests/32MiB maximum; provider-wide remaining account quota not exposed'})
    c=Client();data={};optional_meta={};calendar=sessions()
    try:
        for page in (0,1):
            payload=c.get('delisted-companies',optional=True,page=page,limit=1000)
            for r in payload:
                symbol=r.get('symbol');name=str(r.get('companyName',r.get('name',''))).lower();ending=r.get('delistedDate',r.get('delistingDate'))
                token={'BBBY':'bath','SIVB':'svb','ATVI':'activision'}.get(symbol)
                if token and token in name and isinstance(ending,str) and len(ending)>=10:
                    optional_meta[symbol]=r
            if not payload:break
        audit['optional_delisted']={s:{'identity_metadata_verified':s in optional_meta,'price_history_attempted':False} for s in common.OPTIONAL}
        for symbol in ('SPY',)+common.SYMBOLS+tuple(s for s in common.OPTIONAL if s in optional_meta):
            optional=symbol in common.OPTIONAL
            if optional:audit['optional_delisted'][symbol]['price_history_attempted']=True
            payload=c.get('historical-price-eod/dividend-adjusted',optional=optional,symbol=symbol,**{'from':FROM,'to':TO})
            if not payload:
                if optional:audit['optional_delisted'][symbol]['price_history_available']=False;continue
                raise Failure(f'{symbol}: history unavailable')
            bars=normalize(payload,symbol,calendar)
            if symbol=='SPY' and [r['date'] for r in bars]!=calendar:raise Failure('SPY independent NYSE calendar mismatch')
            data[symbol]=bars
            if optional:
                end=str(optional_meta[symbol].get('delistedDate',optional_meta[symbol].get('delistingDate')))[:10]
                if bars[-1]['date']>end:raise Failure(f'{symbol}: prices beyond verified delisting date')
                audit['optional_delisted'][symbol].update(price_history_available=True,terminal_payout_verified=False)
        coverage=[]
        for symbol,bars in data.items():
            seen={r['date'] for r in bars};life=[d for d in calendar if bars[0]['date']<=d<=bars[-1]['date']]
            coverage.append({'symbol':symbol,'rows':len(bars),'first_session':bars[0]['date'],'last_session':bars[-1]['date'],'internal_missing':len(set(life)-seen),'duplicates':0,'adjusted_geometry':'pass'})
        audit['coverage']=coverage;audit['independent_calendar_match']=True
        repeats=[]
        previous=json.loads((ROOT.parent/'c1-fresh-20261014'/'acquisition-audit.json').read_text())
        for symbol,lo,hi in [('NVDA','2024-05-20','2024-06-21'),('PG','2020-02-18','2020-03-06')]:
            response=c.get('historical-price-eod/dividend-adjusted',symbol=symbol,**{'from':lo,'to':hi})
            bars=normalize(response,symbol,calendar);same=bars==[b for b in data[symbol] if lo<=b['date']<=hi]
            old_hash=next((r.get('sha256') for r in previous['requests'] if r['endpoint']=='historical-price-eod/dividend-adjusted' and r['params']=={'symbol':symbol,'from':lo,'to':hi}),None)
            repeats.append({'symbol':symbol,'same_new_cohort':same,'prior_overlap_fingerprint_available':old_hash is not None,'same_payload_as_prior_overlap':old_hash==c.fingerprints[-1]['sha256'] if old_hash else None})
            if not same:raise Failure('Repeated window inconsistency')
        audit['repeats']=repeats;audit['adjustment_checks']=old.validate_actions(c,data)
        result=analysis.analyze(data)
        old.save_private(private/'aggregate.json',result)
        audit.update(status='complete_partial_research',aggregate_saved=True,source_vintage='New cohort only; no old rows spliced; adjusted current-vintage history, not original-as-known snapshot')
    except Exception as e:
        audit.update(status='stopped_at_prerequisite',failure=str(e) if isinstance(e,Failure) else type(e).__name__)
        raise
    finally:
        old.save_private(private/'provenance.json',private_provenance(c,hashes,optional_meta,args.run_id))
        audit.update(requests=c.calls,calls=len(c.calls),response_bytes=c.bytes,completed_utc=dt.datetime.now(dt.timezone.utc).isoformat())
        (public/'operational-audit.json').write_text(json.dumps(audit,indent=2,allow_nan=False)+'\n')
        print(json.dumps({'status':audit['status'],'calls':len(c.calls),'bytes':c.bytes,'aggregate_saved':audit.get('aggregate_saved',False),'private_directory':str(private),'failure':audit.get('failure')}))

if __name__=='__main__':
    try:main()
    except Exception as e:
        print('Stopped: '+(str(e) if isinstance(e,Failure) else type(e).__name__))
        raise SystemExit(2)

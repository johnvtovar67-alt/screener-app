"""Metadata-only FMP gate: shared persisted25-call cap; no price endpoints."""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT=Path('/workspace/work/c1-private-metadata-gate/gate-20261015-v1')
ALLOWED={'sp500-constituent','historical-sp500-constituent','profile','search-cik','search-symbol','stock-list','symbol-change','delisted-companies','available-sectors','available-industries'}
CAP=25;BYTE_CAP=12*1024*1024

def save(path,value):
    fd,tmp=tempfile.mkstemp(prefix='.metadata-',dir=path.parent)
    try:
        with os.fdopen(fd,'w') as f:json.dump(value,f,indent=2,allow_nan=False);f.write('\n');f.flush();os.fsync(f.fileno())
        os.link(tmp,path)
    finally:os.unlink(tmp)

def initialize():
    ROOT.mkdir(parents=True,exist_ok=False,mode=0o700);os.chmod(ROOT,0o700)
    save(ROOT/'budget.json',{'contract':'c1-metadata-gate-budget-v1','cap':CAP,'bytes_cap':BYTE_CAP,'calls':[],'response_bytes':0,'market_price_calls':0,'frozen_archive_access':False,'private_processing':'Existing established subscriber-private arrangements; licensed metadata retained privately subject to established conditions'})

def request(endpoint,params):
    if endpoint not in ALLOWED:raise ValueError('Endpoint outside frozen metadata-only allowlist')
    budget_path=ROOT/'budget.json';budget=json.loads(budget_path.read_text())
    if budget.get('closed'):raise RuntimeError('Qualification run sealed; further acquisition requires a new authorized run')
    if len(budget['calls'])>=CAP:raise RuntimeError('25-call cap reached')
    if any(x['endpoint']==endpoint and x['params']==params for x in budget['calls']):raise RuntimeError('Exact request already attempted; use recorded result')
    key=os.environ.get('FMP_API_KEY')
    if not key:raise RuntimeError('Existing FMP binding unavailable')
    seq=len(budget['calls'])+1
    if budget['calls']:
        elapsed=(dt.datetime.now(dt.timezone.utc)-dt.datetime.fromisoformat(budget['calls'][-1]['utc'])).total_seconds()
        time.sleep(max(0,.4-elapsed))
    meta={'index':seq,'endpoint':endpoint,'params':params,'utc':dt.datetime.now(dt.timezone.utc).isoformat()}
    budget['calls'].append(meta)
    # Reserve count before network. All callers are sequential in the root task.
    budget_path.write_text(json.dumps(budget,indent=2)+'\n');os.chmod(budget_path,0o600)
    url='https://financialmodelingprep.com/stable/'+endpoint+'?'+urllib.parse.urlencode(dict(params,apikey=key))
    try:
        with urllib.request.urlopen(url,timeout=20) as r:
            body=r.read(BYTE_CAP-budget['response_bytes']+1);meta.update(status=r.status,content_type=r.headers.get('Content-Type',''))
        budget['response_bytes']+=len(body);meta['bytes']=len(body)
        if budget['response_bytes']>BYTE_CAP:raise RuntimeError('Metadata byte cap exceeded')
        payload=json.loads(body)
        meta.update(rows=len(payload) if isinstance(payload,list) else None,fields=sorted(payload[0]) if isinstance(payload,list) and payload else [],provider_sha256=hashlib.sha256(body).hexdigest())
        if endpoint=='profile':
            keys={'symbol','companyName','cik','isin','cusip','exchange','exchangeFullName','sector','industry','ipoDate','isEtf','isFund','isAdr','isActivelyTrading','country'}
            payload=[{k:v for k,v in row.items() if k in keys} for row in payload] if isinstance(payload,list) else payload
            meta['retention_projection']='identity/classification fields only; incidental quote fields discarded'
        save(ROOT/f'response-{seq:02d}.json',payload)
    except urllib.error.HTTPError as e:
        meta['status']=e.code;meta['failure']='HTTP error; no retry'
    except Exception as e:
        meta['failure']=type(e).__name__
    finally:
        budget_path.write_text(json.dumps(budget,indent=2)+'\n');os.chmod(budget_path,0o600)
    print(json.dumps({k:v for k,v in meta.items() if k!='provider_sha256'}))
    if meta.get('status') in (401,402,403,429) or meta.get('failure') and meta.get('status') not in (400,404):
        raise RuntimeError('Critical prerequisite failed; stopped, no retry')

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--initialize',action='store_true');p.add_argument('--endpoint');p.add_argument('--params',default='{}');a=p.parse_args()
    if a.initialize:initialize();print('Private metadata budget initialized:25calls; no prices')
    else:request(a.endpoint,json.loads(a.params))

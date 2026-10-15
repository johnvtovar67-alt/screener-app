"""Central staged FMP budget; one caller, no retries, immutable private inputs.

Licensed body values are never logged. Independent agents make zero API calls.
The shared journal reserves calls before network and seals at completion/failure.
"""
from __future__ import annotations
import argparse
import datetime as dt
import fcntl
import gzip
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

CAP, BYTE_CAP, SPACING = 25, 8*1024*1024, 2.0
FROM, TO = '2023-12-29', '2025-04-03'
SENTINELS = ['NVDA', 'ORLY', 'FAST', 'PG', 'WSM', 'BRK-B']
VIEWS = ['historical-price-eod/dividend-adjusted', 'historical-price-eod/full', 'historical-price-eod/non-split-adjusted']
HERE = Path(__file__).resolve().parent


def plan():
    calls = [(view, dict(symbol=s, **{'from': FROM, 'to': TO})) for s in SENTINELS for view in VIEWS]
    calls += [(VIEWS[0], dict(symbol=s, **{'from': FROM, 'to': TO})) for s in ['SPY', 'QQQ']]
    calls += [(VIEWS[0], dict(symbol='NVDA', **{'from':'2025-01-02','to':'2025-01-10'})),
              ('dividends-calendar', {'from':'2025-03-10','to':'2025-03-21','limit':4000,'page':0}),
              ('splits-calendar', {'from':'2025-01-01','to':'2025-03-31'}),
              ('dividends', {'symbol':'PG','limit':1000}), ('splits', {'symbol':'ORLY'})]
    if len(calls) != CAP:
        raise ValueError('Frozen manifest count changed')
    return calls


def exclusive(path, data):
    with os.fdopen(os.open(path, os.O_WRONLY|os.O_CREAT|os.O_EXCL, 0o600), 'wb') as f:
        f.write(data); f.flush(); os.fsync(f.fileno())


def journal_save(path, value):
    fd, name = tempfile.mkstemp(prefix='.journal-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as f:
            json.dump(value, f, indent=2, allow_nan=False); f.write('\n'); f.flush(); os.fsync(f.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name): os.unlink(name)


def store(local, remote, output, mode='put'):
    env = os.environ.copy(); env.update(NODE_USE_ENV_PROXY='1', VERCEL_BLOB_RETRIES='0')
    r = subprocess.run(['node', str(HERE/'private_store.mjs'), mode, str(local), remote, str(output)], env=env,
                       capture_output=True, text=True, timeout=25)
    if r.returncode or not output.exists():
        raise RuntimeError('Private storage prerequisite failed; no retry')
    return json.loads(output.read_text())


def request_one(root, journal, endpoint, params, opener=urllib.request.urlopen):
    if journal.get('sealed') or len(journal['calls']) >= CAP or journal['response_bytes'] >= BYTE_CAP:
        raise RuntimeError('Stage closed or cap exhausted')
    if (endpoint, params) not in plan():
        raise ValueError('Outside frozen request manifest')
    if any(c['endpoint'] == endpoint and c['params'] == params for c in journal['calls']):
        raise ValueError('Already attempted; no retries')
    key = os.environ.get('FMP_API_KEY')
    if not key: raise RuntimeError('Existing FMP binding unavailable')
    if journal['calls']:
        elapsed = (dt.datetime.now(dt.timezone.utc)-dt.datetime.fromisoformat(journal['calls'][-1]['started_utc'])).total_seconds()
        time.sleep(max(0, SPACING-elapsed))
    n = len(journal['calls'])+1
    meta = dict(index=n,endpoint=endpoint,params=params,started_utc=dt.datetime.now(dt.timezone.utc).isoformat())
    journal['calls'].append(meta); journal_save(root/'journal.json', journal)
    request = urllib.request.Request('https://financialmodelingprep.com/stable/'+endpoint+'?'+urllib.parse.urlencode(dict(params,apikey=key)),
                                     headers={'Accept-Encoding':'identity', 'Accept':'application/json'})
    try:
        with opener(request, timeout=20) as response:
            meta['status'] = response.status
            meta['content_type'] = response.headers.get('Content-Type','')
            encoding = response.headers.get('Content-Encoding','identity').lower()
            if encoding not in ('','identity'):
                raise RuntimeError('Unexpected encoding; decompressed accounting required')
            remaining = BYTE_CAP-journal['response_bytes']
            length = response.headers.get('Content-Length')
            if length and int(length) > remaining:
                raise RuntimeError('Declared response exceeds remaining byte allowance')
            body = response.read(remaining)
            meta['bytes'] = len(body); journal['response_bytes'] += len(body)
            if len(body) == remaining and (length is None or int(length) > len(body)):
                raise RuntimeError('Byte allowance reached; response quarantined')
            for name in ['Retry-After','X-RateLimit-Limit','X-RateLimit-Remaining','X-RateLimit-Reset']:
                if name in response.headers:
                    meta.setdefault('response_limit_headers', {})[name] = response.headers[name]
            if response.headers.get('Retry-After') or response.headers.get('X-RateLimit-Remaining') == '0':
                meta['provider_limit_observed'] = True
                raise RuntimeError('Provider limit indicated; stop immediately')
        payload = json.loads(body)
        if not isinstance(payload,list):
            meta['provider_limit_observed'] = any(word in body.lower() for word in [b'limit',b'quota',b'bandwidth'])
            raise RuntimeError('Unexpected provider payload; no retry')
        meta.update(rows=len(payload), fields=sorted(payload[0]) if payload and isinstance(payload[0],dict) else [],
                    sha256=hashlib.sha256(body).hexdigest(), source_vintage_utc=meta['started_utc'])
        local = root/f'response-{n:02d}.json'
        exclusive(local, body)
        compressed = root/f'response-{n:02d}.json.gz'
        exclusive(compressed, gzip.compress(body, mtime=0))
        remote = journal['private_prefix']+compressed.name
        receipt = store(compressed, remote, root/f'storage-{n:02d}.json')
        meta.update(private_saved=True, compressed_bytes=receipt['bytes'], private_url=receipt['url'])
    except urllib.error.HTTPError as error:
        error_body = error.read(min(65536, BYTE_CAP-journal['response_bytes']))
        meta.update(status=error.code, bytes=len(error_body), provider_limit_observed=error.code in (402,403,429), failure='HTTP error; no retry')
        journal['response_bytes'] += len(error_body)
        for name in ['Retry-After','X-RateLimit-Limit','X-RateLimit-Remaining','X-RateLimit-Reset']:
            if error.headers and name in error.headers:
                meta.setdefault('response_limit_headers', {})[name] = error.headers[name]
        meta['error_body_retained'] = False
        raise RuntimeError('FMP HTTP prerequisite failed; no retry') from None
    except Exception as error:
        meta.setdefault('failure',type(error).__name__)
        raise RuntimeError('Stage prerequisite failed; no retry') from None
    finally:
        journal_save(root/'journal.json',journal)
        print(json.dumps({k:meta[k] for k in ['index','endpoint','params','status','bytes','rows','fields','private_saved','failure','provider_limit_observed'] if k in meta}),flush=True)


def main():
    p=argparse.ArgumentParser(description=__doc__); p.add_argument('--private-dir',type=Path,required=True); a=p.parse_args()
    root=a.private_dir.resolve(); root.mkdir(mode=0o700,exist_ok=False)
    if any(parent == HERE.parent.parent for parent in root.parents):
        raise ValueError('Private input directory must be outside Git checkout')
    lock=os.open(root/'run.lock',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600); fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    journal=dict(contract='c1-rotation-stage1-v1',cap=CAP,byte_cap=BYTE_CAP,spacing_seconds=SPACING,calls=[],response_bytes=0,
                 private_prefix='research/c1-rotation-2025q1/stages/'+root.name+'/',
                 request_manifest_sha256=hashlib.sha256(json.dumps(plan(),sort_keys=True).encode()).hexdigest(),
                 frozen_exit_protocol_sha256=hashlib.sha256((HERE/'PROTOCOL.md').read_bytes()).hexdigest(),
                 stage_amendment_sha256=hashlib.sha256((HERE/'STAGE-1.md').read_bytes()).hexdigest(),
                 account_remaining_quota_known=False, sealed=False, source_data_publication=False)
    journal_save(root/'journal.json',journal)
    try:
        for endpoint,params in plan(): request_one(root,journal,endpoint,params)
        journal['status']='ACQUIRED_NOT_PORTFOLIO_VALIDATED'
    except Exception as error:
        journal['status']='STOPPED'; journal['failure_class']=type(error).__name__
    finally:
        journal['sealed']=True; journal['finished_utc']=dt.datetime.now(dt.timezone.utc).isoformat(); journal_save(root/'journal.json',journal)
        exclusive(root/'journal.json.gz',gzip.compress((root/'journal.json').read_bytes(),mtime=0))
        try:
            store(root/'journal.json.gz',journal['private_prefix']+'journal.json.gz',root/'journal-storage.json')
        except Exception:
            journal['journal_backup_failed']=True; journal_save(root/'journal.json',journal)
        print(json.dumps({k:journal[k] for k in ['status','response_bytes','sealed']}|{'requests':len(journal['calls'])}),flush=True)
        os.close(lock)
    if journal['status']=='STOPPED': raise SystemExit(2)


if __name__=='__main__': main()

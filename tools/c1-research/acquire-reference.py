#!/usr/bin/env python3
"""Fetch a bounded explicit authorized FMP reference-data plan; never approves PIT facts."""
import argparse,pathlib,json,os,hashlib,datetime,urllib.request,urllib.parse,tempfile
p=argparse.ArgumentParser(description=__doc__);p.add_argument('plan',type=pathlib.Path);p.add_argument('output',type=pathlib.Path);p.add_argument('--verify-only',action='store_true');a=p.parse_args();plan=json.loads(a.plan.read_text());tasks=plan['tasks'];limit=plan.get('limitRequests',plan.get('maxRequests'));allowed={'historical-sp500-constituent','historical-nasdaq-constituent','sp500-constituent','nasdaq-constituent','symbol-change','delisted-companies','splits','dividends','profile','sec-filings-search/symbol','splits-calendar','dividends-calendar','earnings-calendar'}
if not isinstance(limit,int) or not 0<len(tasks)<=limit<=300:raise SystemExit('Explicit bounded plan with <=300 calls required')
a.output.mkdir(exist_ok=True,parents=True)
def immutable(file,data):
 if file.exists():
  if file.read_bytes()!=data:raise ValueError('Immutable evidence differs: '+file.name)
  return
 fd,tmp=tempfile.mkstemp(prefix='.unsealed-',dir=file.parent)
 try:
  with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
  try:os.link(tmp,file)
  except FileExistsError:
   if file.read_bytes()!=data:raise ValueError('Immutable evidence differs: '+file.name)
 finally:os.unlink(tmp)
immutable(a.output/'source-plan.json',a.plan.read_bytes())
verified=0
for i,(endpoint,params) in enumerate(tasks,1):
 if endpoint not in allowed or any(k.lower() in ['apikey','token','authorization'] for k in params):raise SystemExit('Unapproved endpoint/credential argument')
 file=next((f for f in [a.output/f'request-{i:02}.json',a.output/f'request-{i:03}.json'] if f.exists()),a.output/f'reference-{i:03}.json')
 if file.exists():
  r=json.loads(file.read_text());b=(a.output/r['bodyPath']).read_bytes()
  if r['endpoint']!=endpoint or r['params']!=params or len(b)!=r['bytes'] or hashlib.sha256(b).hexdigest()!=r['sha256']:raise SystemExit('Receipt/hash mismatch')
  verified+=1;continue
 if a.verify_only:raise SystemExit('Missing receipt: '+file.name)
 safe='https://financialmodelingprep.com/stable/'+endpoint+('?' + urllib.parse.urlencode(params) if params else '')
 req=urllib.request.Request(safe+('&' if params else '?')+urllib.parse.urlencode({'apikey':os.environ['FMP_API_KEY']}),headers={'Accept':'application/json'})
 try:
  with urllib.request.urlopen(req,timeout=45) as response:b=response.read(16000001);status=response.status
  if len(b)>16000000 or status!=200:raise ValueError('Response bound/status')
  rows=json.loads(b);h=hashlib.sha256(b).hexdigest();body=h+'.body.json';immutable(a.output/body,b)
  r={'endpoint':endpoint,'params':params,'sourceUrl':safe,'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':status,'sha256':h,'bytes':len(b),'bodyPath':body,'rows':len(rows) if isinstance(rows,list) else None,'qualified':False,'license':'REQUIRES_ENTITLEMENT_REVIEW'}
  immutable(file,(json.dumps(r,sort_keys=True,indent=2)+'\n').encode());verified+=1
 except Exception as error:raise SystemExit('Acquisition failed: '+type(error).__name__+'; no credentials or complete request URL logged')
print(json.dumps({'verifiedResponses':verified,'planned':len(tasks),'qualified':False,'historicalExecutions':0}))

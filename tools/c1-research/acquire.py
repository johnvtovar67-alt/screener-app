#!/usr/bin/env python3
"""Append-only raw FMP acquisition; never runs app routes or certifies point-in-time data."""
import argparse,datetime,hashlib,json,os,pathlib,urllib.request,urllib.parse,urllib.error
p=argparse.ArgumentParser();p.add_argument('endpoint',choices=['historical-sp500-constituent','historical-nasdaq-constituent','historical-price-eod/dividend-adjusted']);p.add_argument('output',type=pathlib.Path);p.add_argument('--symbol');p.add_argument('--from-date');p.add_argument('--to-date');a=p.parse_args()
params={k:v for k,v in [('symbol',a.symbol),('from',a.from_date),('to',a.to_date)] if v}
if a.endpoint.endswith('dividend-adjusted') and not a.symbol:p.error('Price acquisition requires one explicit symbol')
key=os.environ.get('FMP_API_KEY')
if not key:raise SystemExit('FMP_API_KEY binding required; never paste it into arguments')
base='https://financialmodelingprep.com/stable/'+a.endpoint
safe_url=base+('?' + urllib.parse.urlencode(params) if params else '')
request=urllib.request.Request(base+'?'+urllib.parse.urlencode({**params,'apikey':key}),headers={'Accept':'application/json'})
try:
 with urllib.request.urlopen(request,timeout=30) as response:
  if response.status!=200:raise SystemExit('Acquisition returned non-200 status')
  data=response.read()
 json.loads(data)
except Exception as e:raise SystemExit('Acquisition failed: '+type(e).__name__+'; no credentials or request URL logged')
a.output.mkdir(parents=True,exist_ok=True)
digest=hashlib.sha256(data).hexdigest();target=a.output/(digest+'.json')
try:
 with target.open('xb') as f:f.write(data)
except FileExistsError:
 if target.read_bytes()!=data:raise SystemExit('Existing raw object digest collision')
receipt={'source':{'provider':'FMP','url':safe_url,'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'license':'REQUIRES_ENTITLEMENT_REVIEW'},'path':target.name,'bytes':len(data),'sha256':digest,'certifiedPointInTime':False}
receipt_path=a.output/(digest+'.receipt.json')
if not receipt_path.exists():
 with receipt_path.open('x') as f:json.dump(receipt,f,indent=2)
print(json.dumps({'sha256':digest,'bytes':len(data),'certifiedPointInTime':False}))

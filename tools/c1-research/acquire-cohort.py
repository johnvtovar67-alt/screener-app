"""Owner-authorized 414-name acquisition. Private raw evidence, no strategy execution."""
import pathlib,json,gzip,hashlib,datetime,os,urllib.request,urllib.parse,urllib.error,time,threading,concurrent.futures,argparse,tempfile
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('evidence_root',type=pathlib.Path);parser.add_argument('--phase',choices=['remaining','extension','aliases'],default='remaining');parser.add_argument('--verify-only',action='store_true');args=parser.parse_args();base=args.evidence_root;out=base/({'remaining':'remaining-cohort-v1','extension':'full-window-and-membership-candidates-v1','aliases':'transition-price-candidates-v1'}[args.phase]);out.mkdir(exist_ok=True)
def digest(b):return hashlib.sha256(b).hexdigest()
def immutable(p,b):
 if p.exists():
  if p.read_bytes()!=b:raise RuntimeError('Immutable object differs: '+p.name)
  return
 fd,tmp=tempfile.mkstemp(prefix='.unsealed-',dir=p.parent)
 try:
  with os.fdopen(fd,'wb') as f:f.write(b);f.flush();os.fsync(f.fileno())
  try:os.link(tmp,p)
  except FileExistsError:
   if p.read_bytes()!=b:raise RuntimeError('Immutable object differs: '+p.name)
 finally:os.unlink(tmp)
def seal(p,value):immutable(p,(json.dumps(value,sort_keys=True,indent=2)+'\n').encode())
if args.phase=='remaining':
 manifest=json.loads(gzip.decompress(next((base/'recovered').glob('*stage2*manifest.json.gz')).read_bytes()))
 old={r['params']['symbol'] for r in manifest['requests'] if 'symbol' in r.get('params',{})}
 new=set(json.loads((base/'next-tranche-20261016'/'plan.json').read_text())['symbols'])
 symbols=[s for s in manifest['cohort']['accepted_union_canonical_symbols'] if s not in old|new]
 assert len(symbols)==416
elif args.phase=='extension':
 manifest=json.loads(gzip.decompress(next((base/'recovered').glob('*stage2*manifest.json.gz')).read_bytes()))
 metadata=base/'metadata-20261016-v1';wanted=set(manifest['cohort']['accepted_union_canonical_symbols'])
 import re
 for i in [1,2,3,4]:
  r=json.loads((metadata/f'request-{i:02}.json').read_text());rows=json.loads((metadata/r['bodyPath']).read_text())
  for row in rows:
   if i<=2 and not('2021-11-01'<=row.get('date','')<='2026-10-15'):continue
   for key in (['addedTicker','removedTicker','symbol'] if i<=2 else ['symbol']):
    s=row.get(key)
    if isinstance(s,str) and re.fullmatch('[A-Z][A-Z0-9.-]{0,14}',s):wanted.add(s)
 fresh=set(json.loads((base/'remaining-cohort-v1'/'plan.json').read_text())['symbols'])|set(json.loads((base/'next-tranche-20261016'/'plan.json').read_text())['symbols'])|{'BF-B','BRK-B'}
 symbols=sorted(wanted-fresh)+['QQQ','SPY']
 assert len(symbols)==211
else:
 manifest=json.loads(gzip.decompress(next((base/'recovered').glob('*stage2*manifest.json.gz')).read_bytes()))
 import re
 symbols=[x for x in json.loads((base/'extra-transition-candidates.json').read_text())['symbols'] if re.fullmatch('[A-Z][A-Z0-9.-]{0,14}',x)]
 assert len(symbols)==43
plan={'schema':'c1-414-acquisition-plan-v1','label':'Retrospective raw acquisition, NOT qualified historical evidence','sourceManifestSha256':digest(next((base/'recovered').glob('*stage2*manifest.json.gz')).read_bytes()),'symbols':symbols,'from':'2021-11-01','to':'2026-10-15','endpoints':['historical-price-eod/dividend-adjusted','historical-price-eod/full','historical-price-eod/non-split-adjusted'],'batchNames':18,'maxRequests':1248,'maxResponseBytesPerRequest':2000000,'maxTotalBytes':1000000000,'minRequestIntervalSeconds':0.3,'concurrency':4,'strategyRuns':0,'securityOrHistoricalIdentityApproval':False}
if args.phase=='extension':plan.update(schema='c1-superset-acquisition-plan-v1',maxRequests=633)
if args.phase=='aliases':plan.update(schema='c1-transition-price-candidates-v1',maxRequests=129)
seal(out/'plan.json',plan);lock=threading.Lock();next_call=0.;stop=threading.Event()
def call(task):
 global next_call
 symbol,ep,index=task;receipt=out/f'request-{index:04}.json'
 if receipt.exists():
  r=json.loads(receipt.read_text());p=out/r['bodyPath'];b=p.read_bytes();assert digest(b)==r['sha256'] and len(b)==r['bytes'];return r
 if args.verify_only:raise RuntimeError('Missing immutable receipt: '+receipt.name)
 if stop.is_set():return None
 with lock:
  now=time.monotonic();delay=max(0,next_call-now);next_call=max(now,next_call)+0.3
 if delay:time.sleep(delay)
 if stop.is_set():return None
 params={'symbol':symbol,'from':plan['from'],'to':plan['to']};safe='https://financialmodelingprep.com/stable/'+ep+'?'+urllib.parse.urlencode(params)
 status=None
 try:
  req=urllib.request.Request(safe+'&'+urllib.parse.urlencode({'apikey':os.environ['FMP_API_KEY']}),headers={'Accept':'application/json'})
  with urllib.request.urlopen(req,timeout=45) as response:status=response.status;b=response.read(2000001)
  if len(b)>2000000:raise ValueError('response byte bound')
  data=json.loads(b)
  if not isinstance(data,list):raise ValueError('non-list API response')
  if status!=200:raise ValueError('non-200 response')
  h=digest(b);immutable(out/(h+'.body.json'),b);dates=[x.get('date') for x in data if isinstance(x,dict) and x.get('date')]
  r={'requestId':index,'symbol':symbol,'endpoint':ep,'params':params,'sourceUrl':safe,'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':status,'sha256':h,'bytes':len(b),'bodyPath':h+'.body.json','rows':len(data),'firstDate':min(dates) if dates else None,'lastDate':max(dates) if dates else None,'qualified':False,'license':'REQUIRES_ENTITLEMENT_REVIEW'}
  seal(receipt,r);return r
 except Exception as e:
  code=getattr(e,'code',None);error={'requestId':index,'symbol':symbol,'endpoint':ep,'errorClass':type(e).__name__,'httpStatus':code,'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
  # Preserve failures separately; no retry in this invocation. Never log request URLs with credentials.
  errorpath=out/f'failure-{index:04}-{time.time_ns()}.json';seal(errorpath,error)
  if code in [401,402,403,429] or code is None:stop.set()
  return error
all_results=[]
for batch,start in enumerate(range(0,len(symbols),18),1):
 tasks=[(symbol,ep,si*3+ei+1) for si,symbol in enumerate(symbols) if start<=si<start+18 for ei,ep in enumerate(plan['endpoints'])]
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(call,tasks))
 results=[r for r in results if r is not None];all_results+=results
 if all('sha256' in r for r in results) and len(results)==len(tasks):seal(out/f'batch-{batch:02}.json',{'planSha256':digest((out/'plan.json').read_bytes()),'batch':batch,'symbols':symbols[start:start+18],'receipts':[{'requestId':r['requestId'],'sha256':digest((out/f"request-{r['requestId']:04}.json").read_bytes())} for r in results],'rawQualified':False})
 print(json.dumps({'batch':batch,'batches':(len(symbols)+17)//18,'namesProcessed':min(start+18,len(symbols)),'responsesVerified':sum('sha256' in r for r in all_results),'nonemptyResponses':sum(r.get('rows',0)>0 for r in all_results),'emptyResponses':sum(r.get('rows')==0 for r in all_results),'bytes':sum(r.get('bytes',0) for r in all_results),'stopped':stop.is_set()}),flush=True)
 if sum(r.get('bytes',0) for r in all_results)>plan['maxTotalBytes']:raise RuntimeError('Total byte cap exceeded')
 if stop.is_set():break
summary={'planSha256':digest((out/'plan.json').read_bytes()),'plannedNames':len(symbols),'plannedRequests':len(symbols)*3,'verifiedResponses':sum('sha256' in r for r in all_results),'bytes':sum(r.get('bytes',0) for r in all_results),'emptySymbols':sorted({r['symbol'] for r in all_results if r.get('rows')==0}),'failures':[r for r in all_results if 'sha256' not in r],'qualifiedDataset':False,'performanceRuns':0}
seal(out/('completion-'+digest(json.dumps(summary,sort_keys=True).encode())+'.json'),summary)
print(json.dumps(summary),flush=True)

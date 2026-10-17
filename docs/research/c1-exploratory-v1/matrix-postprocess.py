"""Read-only arithmetic over completed frozen outputs; never simulates strategy."""
import json,pathlib,sys,statistics,tempfile,hashlib
B=pathlib.Path(sys.argv[1]);O=pathlib.Path(sys.argv[2]) if len(sys.argv)>2 else pathlib.Path(tempfile.mkdtemp(prefix='c1-matrix-review-'));O.mkdir(parents=True,exist_ok=True)
raw=json.loads((B/'raw.json').read_text());closeByDate={s['date']:{p['symbol']:p['close'] for p in s['prices']} for s in raw['sessions']}
files=sorted(p for p in B.glob('run-*.json') if p.stem.rsplit('-',1)[-1] in ['12','25','50']);runs={}
for p in files:
 r=json.loads(p.read_text());runs[(r['arm'],r['cost'])]=(r,p)
report={'author':'independent_control_review agent','scope':'Postprocessing only; no strategies rerun; conditional exploratory cohort only','completedPrimaryRuns':len(runs),'runs':{},'commonOpportunity':{},'sourceHashes':{},'historicalSimulations':0}
for (arm,cost),(r,p) in runs.items():
 key=f'{arm}-{cost}';report['sourceHashes'][p.name]=hashlib.sha256(p.read_bytes()).hexdigest();dates={m['date']:i for i,m in enumerate(r['curve'])};books={k:{'cash':v,'positions':{}} for k,v in [('base',25000.),('cooldown15',50000.),('sector40',25000.)]};maxbook={k:0 for k in books};maxnames=0;maxlots=0;ages={};sellcount=0;risksales=0;ledgererror=0;equityerror=0
 for mark in r['curve']:
  for f in [t for t in r['trades'] if t['date']==mark['date']]:
   b=books[f['sleeve']];p=b['positions'].get(f['symbol'],{'shares':0,'avgCost':0,'openedAt':f['date']});n=p['shares'];q=n+(f['shares'] if f['side']=='buy' else -f['shares']);b['cash']+=(1 if f['side']=='sell' else -1)*f['shares']*f['price']-f['fee'];assert q>=0 and b['cash']>=-1e-6,(key,f)
   if f['side']=='sell':
    age=dates[f['date']]-dates[p['openedAt']];bucket='0-4' if age<5 else '5-29' if age<30 else '30-59' if age<60 else '60+';a=ages.setdefault(bucket,{'sales':0,'realizedPnl':0,'riskSales':0});a['sales']+=1;a['realizedPnl']+=f['shares']*(f['price']-p['avgCost'])-f['fee'];sellcount+=1
    risk=any(s in f['reason'] for s in ['stop','recent-momentum','delisting','universe-removal']);a['riskSales']+=int(risk);risksales+=int(risk)
   if q:b['positions'][f['symbol']]={'shares':q,'avgCost':(n*p['avgCost']+f['shares']*f['price']+f['fee'])/q if f['side']=='buy' else p['avgCost'],'openedAt':p['openedAt']}
   else:b['positions'].pop(f['symbol'],None)
   maxnames=max(maxnames,len(set(s for book in books.values() for s in book['positions'])));maxlots=max(maxlots,sum(len(book['positions']) for book in books.values()))
   for k in books:maxbook[k]=max(maxbook[k],len(books[k]['positions']))
  delta=abs(sum(b['cash'] for b in books.values())-mark['cash']);ledgererror=max(ledgererror,delta);assert delta<1e-6,(key,mark['date'],delta)
  eq=sum(book['cash'] for book in books.values())+sum(pos['shares']*closeByDate[mark['date']][symbol] for book in books.values() for symbol,pos in book['positions'].items());equityerror=max(equityerror,abs(eq-mark['equity']));assert abs(eq-mark['equity'])<1e-6,(key,mark['date'],eq,mark['equity'])
 for k in books:
  assert abs(books[k]['cash']-r['finalBooks'][k]['cash'])<1e-6 and books[k]['positions']==r['finalBooks'][k]['positions'],key
 realized=sum(v['realizedPnl'] for v in ages.values());unrealized=sum(pos['shares']*(closeByDate[r['curve'][-1]['date']][symbol]-pos['avgCost']) for book in books.values() for symbol,pos in book['positions'].items());assert abs(realized+unrealized-(r['curve'][-1]['equity']-100000))<1e-6,key
 cap=9 if arm.endswith('cap9') else 3;assert max(maxbook.values())<=cap,(key,maxbook,cap)
 report['runs'][key]={'ledgerStatus':'PASS','maxCashError':ledgererror,'maxEquityError':equityerror,'realizedPnl':realized,'unrealizedPnl':unrealized,'perSleevePositionCap':cap,'maxPositionsPerSleeve':maxbook,'maxAccountDistinctNames':maxnames,'maxAccountSleeveLots':maxlots,'holdingAgeExternal':ages,'sellFills':sellcount,'riskSellFills':risksales}
 if ('Q9-cap3',cost) not in runs:continue
 q=runs[('Q9-cap3',cost)][0];reference={a['date']:set(a['eligibleSymbols']) for a in q['audit']};assert set(reference)=={a['date'] for a in r['audit']},key
 counts={'referenceQ9EligibleNameDays':sum(map(len,reference.values())),'referenceAlreadyHeldNameDays':0,'referenceNewBuyNameDays':0,'referenceUncoveredNameDays':0,'armOnlyEligibleNameDays':0,'armOnlyNewBuyNameDays':0,'referenceEligibleButArmScreenExcludedNameDays':0}
 for a in r['audit']:
  baseline=reference[a['date']];held=set(a['heldBefore']);bought={f['symbol'] for f in a['fills'] if f['side']=='buy'};eligible=set(a['eligibleSymbols']);counts['referenceAlreadyHeldNameDays']+=len(baseline&held);counts['referenceNewBuyNameDays']+=len((baseline-held)&bought);counts['referenceUncoveredNameDays']+=len(baseline-held-bought);counts['armOnlyEligibleNameDays']+=len(eligible-baseline);counts['armOnlyNewBuyNameDays']+=len(bought-baseline-held);counts['referenceEligibleButArmScreenExcludedNameDays']+=len(baseline-eligible)
 assert counts['referenceQ9EligibleNameDays']==counts['referenceAlreadyHeldNameDays']+counts['referenceNewBuyNameDays']+counts['referenceUncoveredNameDays']
 report['commonOpportunity'][key]=counts
report['limitations']=['Q9 eligible reference is screen-only, not certified sleeve/risk/issuer/funding execution permission; uncovered is not necessarily missed attainable profit.','Reference uses current-momentum baseline; arm-only eligibility and purchases reported separately, especially entry-off.','Counts are exact name-days; holding coverage at account union level differs from sleeve completion opportunity.','Holding age computed session-index distance and independent average-cost fill accounting; realized PnL excludes remaining open gains/losses.','Momentum ablations remove components: improvement by ablation does not mean original enhancement helped.','Caps3/9 are per sleeve, not per account; daily-close and intraday-after-fill maxima audited.']
with (O/'matrix-postprocess.json').open('x') as f:json.dump(report,f,indent=2)
print(json.dumps({'completedPrimaryRuns':len(runs),'sourceHashCount':len(report['sourceHashes']),'commonOpportunityReports':len(report['commonOpportunity']),'status':'PASS'}))

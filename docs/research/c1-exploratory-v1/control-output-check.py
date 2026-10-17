# Independent reviewer: arithmetic replay of completed outputs only, no strategy simulation.
import json,math,statistics,pathlib,hashlib,sys,tempfile
if len(sys.argv)<2:raise SystemExit('Usage: control-output-check.py DATA_DIR [NEW_OUTPUT_DIR]')
B=pathlib.Path(sys.argv[1]);O=pathlib.Path(sys.argv[2]) if len(sys.argv)>2 else pathlib.Path(tempfile.mkdtemp(prefix='c1-output-review-'));O.mkdir(parents=True,exist_ok=True)
raw=json.load(open(B/'raw.json'));sessions={s['date']:s for s in raw['sessions']};report={'author':'independent_control_review agent','scope':'Independent arithmetic replay of already-completed controls; no strategy simulation','costs':{},'historicalSimulations':0};runs={}
for c in [12,25,50]:
 r=json.load(open(B/f'run-C-{c}.json'));runs[c]=r;books={k:{'cash':v,'positions':{}} for k,v in [('base',25000.),('cooldown15',50000.),('sector40',25000.)]};ages={};pnls={};traces=[];peaks={k:v['cash'] for k,v in books.items()};paused={k:-1 for k in books};tolerance=0.;notional=costs=0.;trades=r['trades'];dates=[x['date'] for x in r['curve']];dateidx={d:i for i,d in enumerate(dates)}
 for i,mark in enumerate(r['curve']):
  date=mark['date'];prices={p['symbol']:p for p in sessions[date]['prices']};today=[t for t in trades if t['date']==date];risktrace={}
  if i:
   for sleeve,b in books.items():
    cash=b['cash'];qty={s:p['shares'] for s,p in b['positions'].items()}
    for t in today:
     if t['sleeve']==sleeve and t['side']=='sell' and t['reason']!='portfolio-drawdown-stop' and ':stop:' not in t['orderId']:cash+=t['shares']*t['price']-t['fee'];qty[t['symbol']]-=t['shares']
    equity=cash+sum(q*prices[s]['open'] for s,q in qty.items());
    if i==paused[sleeve]+1:peaks[sleeve]=equity
    peaks[sleeve]=max(peaks[sleeve],equity);dd=equity/peaks[sleeve]-1;risktrace[sleeve]={'preBreakerOpenEquity':equity,'openHighWater':peaks[sleeve],'drawdown':dd}
    if any(t['sleeve']==sleeve and t['reason']=='portfolio-drawdown-stop' for t in today):paused[sleeve]=i+(15 if sleeve=='cooldown15' else 10)
   traces.append({'date':date,**risktrace})
  for t in today:
   b=books[t['sleeve']];p=b['positions'].get(t['symbol'],{'shares':0,'avgCost':0,'openedAt':date});n=p['shares'];q=n+(t['shares'] if t['side']=='buy' else -t['shares']);b['cash']+=(1 if t['side']=='sell' else -1)*t['shares']*t['price']-t['fee'];assert q>=0 and b['cash']>=-1e-6
   if t['side']=='sell':
    age=dateidx[date]-dateidx[p['openedAt']];bucket='0-4' if age<5 else '5-29' if age<30 else '30-59' if age<60 else '60+';a=ages.setdefault(bucket,{'sales':0,'realizedPnl':0});a['sales']+=1;a['realizedPnl']+=t['shares']*(t['price']-p['avgCost'])-t['fee']
   if q:b['positions'][t['symbol']]={'shares':q,'avgCost':(n*p['avgCost']+t['shares']*t['price']+t['fee'])/q if t['side']=='buy' else p['avgCost'],'openedAt':p['openedAt']}
   else:b['positions'].pop(t['symbol'],None)
   notional+=t['shares']*t['price'];impact=c/10000;costs+=t['shares']*(t['price']-t['price']/(1+impact) if t['side']=='buy' else t['price']/(1-impact)-t['price'])
  cash=sum(b['cash'] for b in books.values());equity=cash+sum(p['shares']*prices[s]['close'] for b in books.values() for s,p in b['positions'].items());tolerance=max(tolerance,abs(cash-mark['cash']),abs(equity-mark['equity']));assert abs(cash-mark['cash'])<1e-6 and abs(equity-mark['equity'])<1e-6
 for k in books:
  assert abs(books[k]['cash']-r['finalBooks'][k]['cash'])<1e-6
  assert books[k]['positions']==r['finalBooks'][k]['positions']
 returns=[b['equity']/a['equity']-1 for a,b in zip(r['curve'],r['curve'][1:])];years=(__import__('datetime').date.fromisoformat(dates[-1])-__import__('datetime').date.fromisoformat(dates[0])).days/365.25;peak=0;dd=0
 for m in r['curve']:peak=max(peak,m['equity']);dd=min(dd,m['equity']/peak-1)
 metrics={'totalReturn':r['curve'][-1]['equity']/100000-1,'cagr':(r['curve'][-1]['equity']/100000)**(1/years)-1,'sharpe':math.sqrt(252)*statistics.mean(returns)/statistics.stdev(returns),'maxDrawdown':dd,'twoSidedAnnualTurnover':notional/statistics.mean(x['equity'] for x in r['curve'])/years,'meanCashWeight':statistics.mean(x['cash']/x['equity'] for x in r['curve']),'estimatedCostFromFillAssumptions':costs}
 cashspy=sum(r['curve'][j-1]['cash']*(next(p['close'] for p in sessions[r['curve'][j]['date']]['prices'] if p['symbol']=='SPY')/next(p['close'] for p in sessions[r['curve'][j-1]['date']]['prices'] if p['symbol']=='SPY')-1) for j in range(1,len(r['curve'])))
 missed=priced=wins=0;forward=[]
 for a in r['audit']:
  j=dateidx[a['date']];bought={f['symbol'] for f in a['fills'] if f['side']=='buy'}
  for symbol in a['eligibleSymbols']:
   if symbol in a['heldBefore'] or symbol in bought:continue
   missed+=1
   if j+4>=len(dates):continue
   first=next(p['open'] for p in sessions[dates[j]]['prices'] if p['symbol']==symbol);last=next(p['close'] for p in sessions[dates[j+4]]['prices'] if p['symbol']==symbol);ret=last*(1-c/10000)/(first*(1+c/10000))-1;forward.append(ret);priced+=1;wins+=int(ret>0)
 opportunity={'eligibleNotPurchasedNameDays':missed,'forwardFiveSessionObservableNameDays':priced,'meanForwardFiveSessionNetPriceReturn':statistics.mean(forward) if forward else None,'forwardFiveSessionWinShare':wins/priced if priced else None,'descriptiveCashTimesSpyPriceReturnDollars':cashspy}
 report['costs'][c]={'ledgerStatus':'PASS','all64CloseMarksReconciled':True,'maxDollarDifference':tolerance,'independentMetrics':metrics,'independentOpportunity':opportunity,'holdingAgeExternal':ages,'feb26Risk':next(t for t in traces if t['date']=='2025-02-26')}
for c in [25,50]:
 for a,b in zip(runs[12]['audit'],runs[c]['audit']):
  key=lambda z:[(f['orderId'],f['symbol'],f['side']) for f in z['fills']]
  if key(a)!=key(b):report[f'firstIdentityDivergence12vs{c}']={'date':a['date'],'12':a['fills'],str(c):b['fills']};break
 else:report[f'firstIdentityDivergence12vs{c}']=None
with (O/'control-output-check.json').open('x') as evidence:evidence.write(json.dumps(report,indent=2)+'\n');print(json.dumps(report['costs'],indent=2))

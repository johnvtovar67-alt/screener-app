// Manufactured prices/signals only. No FMP inputs or historical outcome tests.
const assert=require('node:assert/strict');
const {createResearchModuleLoader}=require('../../tools/research-module-loader.cjs');
const {loadEngine,verifyNoOp,runPair,cashSeed,applyAccounting,selectHEvent,assertEconomicInputContract}=require('./engine.cjs');
const engine=loadEngine();
const {isUsMarketSessionDay}=createResearchModuleLoader(process.cwd()).load('lib/marketSession.js');
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture({n=24,shock=true}={}){
  const sessions=[],symbols=Array.from({length:12},(_,i)=>'T'+String(i).padStart(2,'0'));
  for(let t=Date.parse('2025-01-02T12:00:00Z');sessions.length<n;t+=86400000){
    const date=new Date(t).toISOString().slice(0,10);if(!isUsMarketSessionDay(date))continue;
    const day=sessions.length;
    const prices=[...symbols,'SPY','QQQ'].map((symbol,i)=>{
      const close=100*(shock&&i===0&&day>=7?.92:1);
      const open=day?sessions.at(-1).prices[i].close:100;
      return {symbol,open,close,high:Math.max(open,close)*1.001,low:Math.min(open,close)*.999,volume:10000000,adjusted:true};
    });
    const signals=symbols.map((symbol,i)=>({symbol,sector:'Sector'+i%4,cik:String(i+1),price:prices[i].close,
      researchFactors:{momentumPercentile:100-i,volatility60Pct:20,coverage:1,return5:day>=5?100*(prices[i].close/sessions[day-5].prices[i].close-1):0},
      entryTiming:{available:true,liquidityPass:true,averageDollarVolume20:1000000000}}));
    sessions.push({date,decisionAt:date+'T21:00:00Z',universeSymbols:symbols,prices,positionSignals:signals,signals:signals.slice(0,5),corporateActions:[],researchHConsecutiveSymbols:symbols});
  }
  return {metadata:{benchmarkSymbol:'SPY',researchDataContract:'manufactured-fixture-v1'},sessions};
}
let count=0;
function test(name,fn){fn();count++;console.log('PASS '+name);}
test('disabled hook gives complete native parity in all sleeves',()=>{
  assert.deepEqual(verifyNoOp({dataset:fixture(),engine}),{base:true,cooldown15:true,sector40:true});
});
test('one causal H event, delayed purchases, same-name reentry and 1/2/1 scaling',()=>{
  const input=fixture(),before=JSON.stringify(input),r=runPair({dataset:input,engine});
  assert.equal(JSON.stringify(input),before);
  assert.equal(r.event.sleeve,'base');assert.equal(r.event.symbol,'T00');
  assert.ok(r.event.heldSessions>=5&&r.event.return5<=-7);
  assert.equal(r.interventions.length,1);assert.equal(r.interventions[0].status,'executed');
  const sale=r.challenger.trades.find(t=>t.reason==='research-H-capital-rotation');
  assert.ok(sale.date>r.event.decisionDate);
  const beforeSale=r.challenger.sleeves.base.researchAudit.openings.find(x=>x.date===sale.date);
  assert.equal(beforeSale.positions.length,3,'All ordinary queued purchases see the occupied slot');
  assert.ok(!r.challenger.trades.some(t=>t.side==='buy'&&t.sleeve==='base'&&t.date===sale.date),'No same-opening reinvestment');
  assert.equal(r.comparison.sameNameReentry,true);
  assert.ok(r.comparison.firstSubsequentPurchase.date>sale.date);
  assert.equal(r.champion.metrics.initialCapital,400000);
  assert.equal(r.champion.curve[0].equity,400000);
  for(const t of r.challenger.trades)assert.ok(Number.isSafeInteger(t.shares));
  const base=r.champion.trades.find(t=>t.sleeve==='base'&&t.side==='buy');
  const middle=r.champion.trades.find(t=>t.sleeve==='cooldown15'&&t.side==='buy'&&t.symbol===base.symbol);
  assert.equal(middle.shares,2*base.shares);
});
test('one extra intervention delay preserves ordinary protected opening priority',()=>{
  const a=runPair({dataset:fixture(),engine}),b=runPair({dataset:fixture(),engine,interventionDelaySessions:2});
  assert.deepEqual(a.event,b.event);
  assert.ok(b.interventions[0].executionDate>a.interventions[0].executionDate);
  assert.ok(b.comparison.firstSubsequentPurchase.date>b.interventions[0].executionDate);
});
test('opening stop preempts H without replacement event or double sale',()=>{
  const data=fixture(),r=runPair({dataset:data,engine}),date=r.interventions[0].executionDate;
  const bar=data.sessions.find(s=>s.date===date).prices.find(p=>p.symbol==='T00');
  Object.assign(bar,{open:80,low:79,close:81,high:82});
  const b=runPair({dataset:data,engine});
  assert.equal(b.interventions.length,1);assert.equal(b.interventions[0].status,'preempted-opening-stop');
  assert.equal(b.challenger.trades.filter(t=>t.reason==='research-H-capital-rotation').length,0);
  assert.equal(b.challenger.trades.filter(t=>t.sleeve==='base'&&t.symbol==='T00'&&t.date===date&&t.side==='sell').length,1);
});
test('later intraday low cannot censor an executable opening H sale',()=>{
  const data=fixture(),r=runPair({dataset:data,engine}),date=r.interventions[0].executionDate;
  data.sessions.find(s=>s.date===date).prices.find(p=>p.symbol==='T00').low=80;
  const b=runPair({dataset:data,engine});
  assert.equal(b.interventions[0].status,'executed');
  assert.equal(b.interventions[0].trade.reason,'research-H-capital-rotation');
});
test('a delayed intervention never sells a new same-ticker position after the original lot exited',()=>{
  const data=fixture(),reference=runPair({dataset:data,engine}),nextDate=reference.interventions[0].executionDate;
  data.sessions.find(s=>s.date===nextDate).prices.find(p=>p.symbol==='T00').low=80;
  const r=runPair({dataset:data,engine,interventionDelaySessions:2});
  assert.equal(r.interventions[0].status,'preempted-original-position-absent');
  assert.ok(!r.challenger.trades.some(t=>t.reason==='research-H-capital-rotation'));
  const newLot=r.challenger.trades.find(t=>t.sleeve==='base'&&t.symbol==='T00'&&t.side==='buy'&&t.date===r.interventions[0].executionDate);
  assert.ok(newLot);assert.notEqual(newLot.positionId,r.event.positionId);
});
test('future bars and future factor changes cannot change the selected event or earlier state',()=>{
  const input=fixture(),a=runPair({dataset:input,engine});
  for(const s of input.sessions.filter(x=>x.date>a.interventions[0].executionDate)){
    for(const p of s.prices)for(const f of ['open','high','low','close'])p[f]*=1.2;
    for(const signal of s.positionSignals)signal.researchFactors.momentumPercentile=signal.symbol==='T11'?100:10;
  }
  const b=runPair({dataset:input,engine});assert.deepEqual(a.event,b.event);
  const prior=run=>run.challenger.sleeves.base.researchAudit.closes.filter(x=>x.date<=a.event.decisionDate);
  assert.equal(JSON.stringify(prior(a)),JSON.stringify(prior(b)));
});
test('no trigger preserves identical A/B economics and account state',()=>{
  const r=runPair({dataset:fixture({shock:false}),engine});
  assert.equal(r.event,null);assert.equal(r.comparison.netReturnDeltaPct,0);
  assert.equal(JSON.stringify(r.champion),JSON.stringify(r.challenger));
});
test('cost scenarios replan affordability and charge each actual filled leg',()=>{
  const a=runPair({dataset:fixture(),engine}),b=runPair({dataset:fixture(),engine,executionCostsBps:50});
  assert.ok(b.champion.metrics.executionCostDollars>a.champion.metrics.executionCostDollars);
  assert.ok(b.champion.trades[0].shares<a.champion.trades[0].shares);
  for(const r of [a,b])for(const t of r.champion.trades)
    assert.ok(Math.abs(t.embeddedSlippage-t.shares*t.rawExecutionPrice*r.executionCostsBps/10000)<1e-7);
});
test('allocation-only exclusion retains cross-sectional native rank',()=>{
  const input=fixture();input.metadata.researchAllocationExcludedSymbols=['T00'];
  assert.deepEqual(verifyNoOp({dataset:input,engine}),{base:true,cooldown15:true,sector40:true});
  const r=runPair({dataset:input,engine});
  assert.equal(r.champion.sleeves.base.researchAudit.closes[0].rankedPool[0].symbol,'T00');
  assert.ok(!r.champion.trades.some(t=>t.side==='buy'&&t.symbol==='T00'));
});
test('actually held missing prices fail instead of carrying an invented mark',()=>{
  const input=fixture();input.sessions[4].prices=input.sessions[4].prices.filter(p=>p.symbol!=='T00');
  assert.throws(()=>runPair({dataset:input,engine}),/Missing executable held-security quote/);
});
test('missing adjusted-history continuity censors H rather than inventing five-session evidence',()=>{
  const input=fixture();
  for(const session of input.sessions)session.researchHConsecutiveSymbols=[];
  const r=runPair({dataset:input,engine});assert.equal(r.event,null);
  delete input.sessions[0].researchHConsecutiveSymbols;
  assert.throws(()=>runPair({dataset:input,engine}),/Explicit causal adjusted-close coverage/);
});
test('H tie order and native pending-sale exclusion',()=>{
  const p={date:'2025-01-10',positions:[{symbol:'ZZZ',positionId:1,heldSessions:5,shares:1,entryPrice:10},{symbol:'AAA',positionId:2,heldSessions:5,shares:1,entryPrice:10}],
    holdingReturns:{ZZZ:-8,AAA:-9},rankedPool:[],pending:[{symbol:'AAA',side:'sell'}]};
  const audit=closes=>({researchAudit:{closes}});
  const event=selectHEvent({base:audit([p]),cooldown15:audit([{...p,pending:[]}]),sector40:audit([])});
  assert.equal(event.sleeve,'base');assert.equal(event.symbol,'ZZZ');
});
test('verified dividend entitlement is nonspendable until payment and survives exit',()=>{
  const positions=new Map([['ABC',{shares:10}]]),receivables=[],ledger=[];
  const action={id:'d1',type:'cash-dividend',symbol:'ABC',amountPerShare:2,paymentDate:'2025-02-03',effectiveDate:'2025-01-15',verified:true,source:'synthetic-source',shareBasis:'ex-date-post-split'};
  let cash=applyAccounting({session:{date:'2025-01-15',researchAccountingActions:[action]},positions,pending:[],cash:50,receivables,ledger,enabled:true});
  assert.equal(cash,50);assert.equal(receivables[0].amount,20);assert.equal(receivables[0].paid,false);
  positions.delete('ABC');
  cash=applyAccounting({session:{date:'2025-02-03'},positions,pending:[],cash,receivables,ledger,enabled:true});
  assert.equal(cash,70);assert.equal(receivables[0].paid,true);
  cash=applyAccounting({session:{date:'2025-02-04'},positions,pending:[],cash,receivables,ledger,enabled:true});
  assert.equal(cash,70,'No duplicate payment');
});
test('integrated dividends add receivable equity before cash becomes spendable',()=>{
  const input=fixture({shock:false}),ex=input.sessions[4].date,pay=input.sessions[7].date;
  for(const s of input.sessions.slice(4)){
    const p=s.prices.find(p=>p.symbol==='T00');Object.assign(p,{open:98,close:98,high:98.1,low:97.9});
    for(const signal of s.positionSignals.filter(x=>x.symbol==='T00'))signal.price=98;
  }
  input.sessions[4].researchAccountingActions=[{id:'d1',type:'cash-dividend',symbol:'T00',amountPerShare:2,
    effectiveDate:ex,paymentDate:pay,verified:true,source:'synthetic-source',shareBasis:'ex-date-post-split'}];
  const a=runPair({dataset:input,engine}),b=runPair({dataset:input,engine,enableAccounting:false});
  const ar=a.champion.sleeves.base,br=b.champion.sleeves.base;
  const exA=ar.researchAudit.closes.find(x=>x.date===ex),exB=br.researchAudit.closes.find(x=>x.date===ex);
  assert.ok(exA.receivable>0);assert.equal(exA.cash,exB.cash);
  assert.ok(Math.abs(ar.curve[4].equity-br.curve[4].equity-exA.receivable)<0.011);
  const payA=ar.researchAudit.closes.find(x=>x.date===pay),payB=br.researchAudit.closes.find(x=>x.date===pay);
  assert.equal(payA.receivable,0);assert.ok(Math.abs(payA.cash-payB.cash-exA.receivable)<1e-7);
});
test('ex-date opening buyers receive no dividend and prior holders retain entitlement after sale',()=>{
  const input=fixture({shock:false}),ex=input.sessions[1].date;
  input.sessions[1].researchAccountingActions=[{id:'open-buy-div',type:'cash-dividend',symbol:'T00',amountPerShare:2,
    effectiveDate:ex,paymentDate:input.sessions[3].date,verified:true,source:'synthetic-source',shareBasis:'ex-date-post-split'}];
  const r=runPair({dataset:input,engine});
  const entitlement=r.champion.sleeves.base.researchAudit.accounting.find(a=>a.actionId==='open-buy-div');
  assert.equal(entitlement.amount,0);assert.equal(entitlement.shares,0);
  assert.ok(r.champion.sleeves.base.trades.some(t=>t.symbol==='T00'&&t.side==='buy'&&t.date===ex));
});
test('integrated verified split preserves share-value and source stop units',()=>{
  const input=fixture({shock:false}),ex=input.sessions[4].date;
  for(const s of input.sessions.slice(4)){
    const p=s.prices.find(x=>x.symbol==='T00');for(const field of ['open','high','low','close'])p[field]/=2;
    for(const signal of s.positionSignals.filter(x=>x.symbol==='T00'))signal.price/=2;
  }
  input.sessions[4].researchAccountingActions=[{id:'s1',type:'split',symbol:'T00',ratio:2,effectiveDate:ex,verified:true,source:'synthetic-source'}];
  const r=runPair({dataset:input,engine}),audit=r.champion.sleeves.base.researchAudit;
  const prior=audit.closes[3].positions.find(p=>p.symbol==='T00'),after=audit.closes[4].positions.find(p=>p.symbol==='T00');
  assert.equal(after.shares,prior.shares*2);assert.equal(after.stopPrice,prior.stopPrice/2);
  assert.equal(r.champion.sleeves.base.curve[4].equity,r.champion.sleeves.base.curve[3].equity);
});
test('split adapter conserves value and rejects unsupported fractions',()=>{
  const p={shares:10,initialShares:10,entryPrice:100,stopPrice:86,maxPrice:110},positions=new Map([['ABC',p]]),pending=[{symbol:'ABC',shares:5,stopPrice:86,signal:{price:100}}],ledger=[];
  const action={id:'s1',type:'split',symbol:'ABC',ratio:2,effectiveDate:'2025-01-15',verified:true,source:'synthetic-source'};
  applyAccounting({session:{date:'2025-01-15',researchAccountingActions:[action]},positions,pending,cash:0,receivables:[],ledger,enabled:true});
  assert.equal(p.shares,20);assert.equal(p.entryPrice,50);assert.equal(p.stopPrice,43);
  assert.equal(p.shares*p.entryPrice,1000);assert.equal(pending[0].shares,10);assert.equal(pending[0].signal.price,50);
  action.ratio=1/3;action.id='s2';
  assert.throws(()=>applyAccounting({session:{date:'2025-01-15',researchAccountingActions:[action]},positions,pending,cash:0,receivables:[],ledger,enabled:true}),/Unsupported split fraction/);
});
test('real economic execution fails closed on partial or unverified inputs',()=>{
  const input=fixture();delete input.metadata.researchDataContract;
  assert.throws(()=>runPair({dataset:input,engine}),/executionPricesVerified/);
  Object.assign(input.metadata,{executionPricesVerified:true,volumeUnitsVerified:true,fullOpportunityUniverseVerified:true,researchAccountingCoverageComplete:true,researchMembershipActionsComplete:true,
    researchInputCoverageHash:'a'.repeat(64),researchCoverageFrom:input.sessions[0].date,researchCoverageThrough:input.sessions.at(-1).date});
  assert.throws(()=>runPair({dataset:input,engine}),/Frozen baseline plus 63/);
  input.metadata.volumeUnitsVerified=false;
  assert.throws(()=>runPair({dataset:input,engine}),/volumeUnitsVerified/);
});
test('unmapped native dividend actions cannot silently escape accounting',()=>{
  const input=fixture();input.sessions[4].corporateActions=[{id:'d1',type:'dividend',symbol:'T00'}];
  assert.throws(()=>runPair({dataset:input,engine}),/explicit verified accounting mapping/);
});
test('64 labeled rows cannot substitute a missing or nonmarket session',()=>{
  const input=fixture({n:64});delete input.metadata.researchDataContract;
  input.sessions[0].date='2024-12-31';input.sessions.at(-1).date='2025-04-03';
  Object.assign(input.metadata,{executionPricesVerified:true,volumeUnitsVerified:true,fullOpportunityUniverseVerified:true,
    researchAccountingCoverageComplete:true,researchMembershipActionsComplete:true,researchInputCoverageHash:'a'.repeat(64),
    researchCoverageFrom:'2024-12-31',researchCoverageThrough:'2025-04-03'});
  assert.throws(()=>assertEconomicInputContract(input,true),/Complete frozen market-session calendar/);
});
test('split then post-split dividend order is explicit rather than action-id dependent',()=>{
  const positions=new Map([['ABC',{shares:10,initialShares:10,entryPrice:100}]]),receivables=[],ledger=[];
  const common={symbol:'ABC',effectiveDate:'2025-01-15',verified:true,source:'synthetic-source'};
  const split={...common,id:'z-split',type:'split',ratio:2};
  const div={...common,id:'a-div',type:'cash-dividend',amountPerShare:1,paymentDate:'2025-02-01',shareBasis:'ex-date-post-split'};
  applyAccounting({session:{date:'2025-01-15',researchAccountingActions:[div,split]},positions,pending:[],cash:0,receivables,ledger,enabled:true});
  assert.equal(receivables[0].amount,20);assert.equal(ledger[0].type,'split');
  assert.throws(()=>applyAccounting({session:{date:'2025-01-15',researchAccountingActions:[split]},positions,pending:[],cash:0,receivables,ledger,enabled:true}),/unique/);
});
test('unverified actions and invalid frozen execution settings fail',()=>{
  assert.throws(()=>applyAccounting({session:{date:'2025-01-15',researchAccountingActions:[{id:'x',type:'cash-dividend'}]},positions:new Map(),pending:[],cash:0,receivables:[],ledger:[],enabled:true}),/Verified unique/);
  assert.throws(()=>runPair({dataset:fixture(),engine,executionCostsBps:5}),/Only frozen/);
});
console.log('Passed '+count+' offline manufactured-data engine checks.');

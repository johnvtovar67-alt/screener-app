// Offline exploratory research only. No network, account, or production writes.
// The production simulator is loaded verbatim, then instrumented in memory with
// asserted insertion points. Source files and the production freeze are intact.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../..');
const {createResearchModuleLoader} = require(path.join(ROOT, 'tools/research-module-loader.cjs'));
const PINS = {
  'lib/c1AccountSimulator.js':'02e1edad62c96360a0380142e46e72eacf0a486cc8bb60f43979b7d7e21ce5fb',
  'lib/c1FrozenOptions.js':'a401105178824417b9d7823c2d6f5bb6dc809b6ed536fcee60a4085681be5dff',
  'lib/c1AccountSeed.js':'1a8327eeafaa0352b867ca28e3053f0f727839347f0843c61cdb08e2247a81ab',
  'lib/c1ActualFillReplay.js':'024e43c190a875c153337087046bfe3dfd216080c905ffaf8b4e26fbcb975a5c',
};
const SCALES = Object.freeze({base:1,cooldown15:2,sector40:1});
const clone = value => JSON.parse(JSON.stringify(value));
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const sum = values => values.reduce((a,b)=>a+b,0);

function assertPins(root=ROOT) {
  for(const [file,expected] of Object.entries(PINS))
    assert.equal(digest(fs.readFileSync(path.join(root,file))),expected,'Frozen source changed: '+file);
  return {...PINS};
}
function once(source,needle,replacement) {
  assert.equal(source.split(needle).length-1,1,'Research insertion must occur exactly once: '+needle.slice(0,100));
  return source.replace(needle,replacement);
}
function positionView(p,index) {
  const keys=['symbol','positionId','shares','initialShares','entryPrice','entryCommission','realizedPnl','enteredAt',
    'enteredSessionIndex','stopPrice','initialStopPrice','stopKind','sector','issuer','maxPrice','minPrice','lastPrice',
    'highWatermark','lastC1Rank','lastC1EligibleCount','earlyRankExitStreak','profitRankExitStreak','profitProtectionArmed'];
  return {...Object.fromEntries(keys.filter(k=>p[k]!==undefined).map(k=>[k,p[k]])),heldSessions:Math.max(0,index-p.enteredSessionIndex)};
}
function orderView(o) {
  return Object.fromEntries(['side','symbol','reason','rank','sector','issuer','shares','fraction','completeExisting'].filter(k=>o[k]!==undefined).map(k=>[k,o[k]]));
}

// A declared accounting adapter, separate from C1's ranking/selection policy.
// Only explicitly verified actions are accepted; no inferred action/payout.
function applyAccounting({session,positions,pending,prices,cash,receivables,ledger,enabled}) {
  if(!enabled)return cash;
  for(const item of receivables)if(!item.paid&&item.paymentDate<=session.date){
    item.paid=true;cash+=item.amount;
    ledger.push({date:session.date,type:'dividend-payment',symbol:item.symbol,amount:item.amount,actionId:item.actionId});
  }
  const actions=(session.researchAccountingActions||[]).slice().sort((a,b)=>
    (a.type==='split'?0:1)-(b.type==='split'?0:1)||String(a.id).localeCompare(String(b.id)));
  const seen=new Set();
  for(const action of actions){
    if(action.verified!==true||!action.id||!action.source||seen.has(action.id)||ledger.some(x=>x.actionId===action.id&&x.type!=='dividend-payment'))throw new Error('Verified unique corporate-action identity/source required');
    seen.add(action.id);
    if(action.effectiveDate!==session.date)throw new Error('Corporate-action effective date mismatch');
    const p=positions.get(action.symbol);
    if(action.type==='split'){
      const ratio=action.ratio;
      if(!Number.isFinite(ratio)||ratio<=0)throw new Error('Verified positive split ratio required');
      if(p){
        const shares=p.shares*ratio;
        if(!Number.isSafeInteger(shares))throw new Error('Unsupported split fraction/cash-in-lieu: '+action.symbol);
        p.shares=shares;p.initialShares*=ratio;
        if(p.entryTargetShares!=null)p.entryTargetShares*=ratio;
        for(const field of ['entryPrice','stopPrice','initialStopPrice','highWatermark','maxPrice','minPrice','lastPrice'])
          if(Number.isFinite(p[field]))p[field]/=ratio;
        if(p.winnerHistory){p.winnerHistory.originalShares*=ratio;p.winnerHistory.trimmedShares*=ratio;}
      }
      // Prior-close signals stay in their original units except absolute price
      // fields needed for the current opening gap guard and stop convention.
      for(const order of pending.filter(o=>o.symbol===action.symbol)){
        if(Number.isFinite(order.shares))order.shares*=ratio;
        if(Number.isFinite(order.stopPrice))order.stopPrice/=ratio;
        if(order.signal){
          order.signal=clone(order.signal);
          for(const field of ['price','currentPrice','lastPrice','close'])
            if(Number.isFinite(order.signal[field]))order.signal[field]/=ratio;
        }
      }
      ledger.push({date:session.date,type:'split',symbol:action.symbol,ratio,actionId:action.id,heldShares:p?.shares||0});
    }else if(action.type==='cash-dividend'){
      if(action.shareBasis!=='ex-date-post-split'||!Number.isFinite(action.amountPerShare)||action.amountPerShare<0||
          !/^\d{4}-\d{2}-\d{2}$/.test(action.paymentDate)||action.paymentDate<session.date)
        throw new Error('Verified nominal dividend and payment date required');
      const amount=(p?.shares||0)*action.amountPerShare;
      if(amount){
        const item={symbol:action.symbol,amount,paymentDate:action.paymentDate,actionId:action.id,paid:action.paymentDate===session.date};
        receivables.push(item);if(item.paid)cash+=amount;
      }
      ledger.push({date:session.date,type:'dividend-entitlement',symbol:action.symbol,amount,shares:p?.shares||0,actionId:action.id,paymentDate:action.paymentDate});
    }else throw new Error('Unsupported research accounting action: '+action.type);
  }
  return cash;
}

function loadEngine(root=ROOT) {
  assertPins(root);
  const loader=createResearchModuleLoader(root);
  const native=loader.load('lib/c1AccountSimulator.js');
  const {C1_FROZEN_OPTIONS}=loader.load('lib/c1FrozenOptions.js');
  let source=fs.readFileSync(path.join(root,'lib/c1AccountSimulator.js'),'utf8');
  source=once(source,
    'export function simulatePointInTimePortfolio(dataset = {}, options = {}, openingAccount = null, actualExecutions = null) {',
    'export function simulatePointInTimePortfolio(dataset = {}, options = {}, openingAccount = null, actualExecutions = null, research = {}) {');
  source=once(source,'  const pendingUniverseRemovalActions = new Map();',`  const researchAudit = {closes:[],openings:[],accounting:[],intervention:[]};
  const researchReceivables=[];
  let researchExit=null;
  let researchConsumed=false;
  const researchEquity=(...args)=>equityValue(...args)+researchReceivables.filter(x=>!x.paid).reduce((n,x)=>n+x.amount,0);
  if(research.executionCostsBps!=null){
    if(!Number.isFinite(research.executionCostsBps)||research.executionCostsBps<0||research.executionCostsBps>=10000)throw new Error('Invalid declared execution sensitivity');
    config.slippageBps=research.executionCostsBps;
  }
  const pendingUniverseRemovalActions = new Map();`);
  source=once(source,'  const allocationBlocked = new Set([...blocked, "SCHW"]);',
    '  const allocationBlocked = new Set([...blocked, "SCHW", ...(research.disableAllocationExclusions?[]:(dataset.metadata?.researchAllocationExcludedSymbols||[]))]);');
  // The adapter adds receivable equity at exactly the existing valuation calls;
  // cash itself remains spendable cash, so a receivable cannot fund a purchase.
  source=source.replace(/= equityValue\(cash, positions, (prices|lastActivePrices)(, "open")?\);/g,
    '= researchEquity(cash, positions, $1$2);');
  assert.equal((source.match(/= researchEquity\(/g)||[]).length,5,'Five source valuation calls required');
  source=once(source,'      // Delisting/acquisition proceeds are explicit dataset outcomes.',`      cash=researchApplyAccounting({session,positions,pending,prices,cash,receivables:researchReceivables,ledger:researchAudit.accounting,enabled:research.enableAccounting!==false});
      if(research.strictHeldQuotes!==false)for(const [symbol,p] of positions){
        const q=prices.get(symbol);
        if(!q||!['open','high','low','close'].every(k=>Number.isFinite(q[k])&&q[k]>0))throw new Error('Missing executable held-security quote: '+symbol+' '+session.date);
      }
      // Delisting/acquisition proceeds are explicit dataset outcomes.`);
  source=once(source,"      // Orders generated at yesterday's close execute at today's open. Stops",`      if(research.audit!==false)researchAudit.openings.push({date:session.date,cash,positions:[...positions.values()].map(p=>researchPositionView(p,sessionIndex)),phase:'after-native-buys-before-intervention'});
      if(researchExit && !researchConsumed && sessionIndex>=researchExit.executionIndex){
        researchConsumed=true;
        const event=researchExit,position=positions.get(event.symbol),row=prices.get(event.symbol);
        let status='executed';
        if(!position||position.positionId!==event.positionId)status='preempted-original-position-absent';
        else if(!row||!(Number(row.open)>0))status='censored-open-unavailable';
        else if(position.stopPrice>0&&row.open<=position.stopPrice)status='preempted-opening-stop';
        let trade=null;
        if(status==='executed')trade=executeSale({date:session.date,symbol:event.symbol,position,shares:position.shares,fill:tradePrice(row.open,'sell',config.slippageBps),reason:'research-H-capital-rotation'});
        researchAudit.intervention.push({...event,executionDate:session.date,status,trade:trade?JSON.parse(JSON.stringify(trade)):null,cashAfter:cash});
      }
      // Orders generated at yesterday's close execute at today's open. Stops`);
  source=once(source,'    }\n  }\n  if (config.liquidateAtEnd',`      if(research.audit!==false){
        const point={date:session.date,sessionIndex,cash,receivable:researchReceivables.filter(x=>!x.paid).reduce((n,x)=>n+x.amount,0),
          positions:[...positions.values()].map(p=>researchPositionView(p,sessionIndex)),
          rankedPool:rankedPool.map((s,i)=>({symbol:symbolOf(s),rank:i+1,score:researchRank(s,config,rankContext),sector:sectorOf(s),issuer:issuerOf(s),return5:s.researchFactors?.return5??null})),
          holdingReturns:Object.fromEntries([...signalMap].map(([s,row])=>[s,row.researchFactors?.return5??null])),
          candidates:candidates.map(symbolOf),pending:pending.map(researchOrderView),
          highWater:portfolioHighWatermark,pausedThrough:portfolioRiskPausedThrough};
        researchAudit.closes.push(point);
      }
      if(!researchExit&&!researchConsumed&&research.event&&research.event.decisionDate===session.date){
        const e=research.event,p=positions.get(e.symbol);
        if(!p||p.positionId!==e.positionId)throw new Error('Research event original position changed before decision');
        researchExit={...e,executionIndex:sessionIndex+(research.interventionDelaySessions||1)};
      }
    }
  }
  if (config.liquidateAtEnd`);
  source=once(source,'    endingCash: round(cash, 2),',`    ...(research.audit!==false?{researchAudit:{...researchAudit,receivables:researchReceivables,pendingIntervention:researchExit&&!researchConsumed?researchExit:null}}:{}),
    endingCash: round(cash, 2),`);
  const imported={};
  source=source.replace(/import\s*{([\s\S]*?)}\s*from\s*["']([^"']+)["'];?/g,(_,names,request)=>{
    const values=loader.load(request,path.join(root,'lib/c1AccountSimulator.js'));
    for(const n of names.split(',').map(x=>x.trim()).filter(Boolean))imported[n]=values[n];
    return '';
  });
  const exported=[];
  source=source.replace(/export (?:const|function) ([A-Za-z_$][\w$]*)/g,(m,n)=>{exported.push(n);return m.replace('export ','');});
  source+='\nmodule.exports={'+exported.join(',')+'};';
  const box={module:{exports:{}},console,Date,Intl,Math,Number,String,Object,Array,Set,Map,WeakSet,WeakMap,Boolean,RegExp,Error,TypeError,JSON,
    ...imported,researchPositionView:positionView,researchOrderView:orderView,researchApplyAccounting:applyAccounting};
  vm.createContext(box);vm.runInContext(source,box,{filename:'isolated-c1-rotation-research.js'});
  return {simulate:box.module.exports.simulatePointInTimePortfolio,native:native.simulatePointInTimePortfolio,options:C1_FROZEN_OPTIONS};
}

function cashSeed(sleeve,date) {
  return {contract:'c1-prospective-account-seed-v1',sleeve,asOfSession:date,prospectiveAdoptionConfirmed:true,
    cash:100000,highWater:100000,remainingCooldownSessions:0,positions:[]};
}
function stripAudit(run){const {researchAudit,...reference}=run;return reference;}
function verifyNoOp({dataset,engine=loadEngine(),seeds={}}) {
  const results={};
  for(const sleeve of Object.keys(SCALES)){
    const options={...engine.options[sleeve],startDate:dataset.sessions[0].date,endDate:dataset.sessions.at(-1).date,liquidateAtEnd:false};
    const seed=seeds[sleeve]||cashSeed(sleeve,options.startDate);
    const a=engine.native(clone(dataset),clone(options),clone(seed));
    const b=engine.simulate(clone(dataset),clone(options),clone(seed),null,{enableAccounting:false,strictHeldQuotes:false,disableAllocationExclusions:true});
    assert.equal(JSON.stringify(stripAudit(b)),JSON.stringify(a),'Disabled-hook native parity: '+sleeve);
    results[sleeve]=true;
  }
  return results;
}
function selectHEvent(sleeves,{sessions=null}={}) {
  const dates=[...new Set(Object.values(sleeves).flatMap(run=>run.researchAudit.closes.map(x=>x.date)))].sort();
  for(const date of dates)for(const sleeve of Object.keys(SCALES)){
    const point=sleeves[sleeve].researchAudit.closes.find(x=>x.date===date);
    if(!point)continue;
    const nativeSells=new Set(point.pending.filter(o=>o.side==='sell').map(o=>o.symbol));
    for(const p of point.positions.slice().sort((a,b)=>a.symbol.localeCompare(b.symbol))){
      const row=point.rankedPool.find(x=>x.symbol===p.symbol);
      // A nonrankable held name still has a causal return5 in the complete
      // position-signal map captured separately by the loader below.
      const return5=point.holdingReturns?.[p.symbol]??row?.return5;
      if(sessions){
        const index=sessions.findIndex(s=>s.date===date),prefix=sessions.slice(index-5,index+1);
        if(index<5||prefix.length!==6||!sessions[index].researchHConsecutiveSymbols?.includes(p.symbol)||
          prefix.some(s=>!s.prices.some(q=>q.symbol===p.symbol&&Number.isFinite(q.close)&&q.close>0)))continue;
      }
      if(p.heldSessions>=5&&!nativeSells.has(p.symbol)&&Number.isFinite(return5)&&return5<=-7)
        return {rule:'preserved-H-age5-return5-minus7',decisionDate:date,sleeve,symbol:p.symbol,positionId:p.positionId,
          heldSessions:p.heldSessions,return5,sharesAtDecision:p.shares,entryPrice:p.entryPrice};
    }
  }
  return null;
}
function combinedMetrics(curve,trades) {
  let peak=curve[0]?.equity||400000,maxDrawdownPct=0;
  for(const point of curve){peak=Math.max(peak,point.equity);maxDrawdownPct=Math.min(maxDrawdownPct,(point.equity/peak-1)*100);}
  const mean=curve.length?sum(curve.map(x=>x.equity))/curve.length:0;
  const tradedNotional=sum(trades.map(t=>t.shares*t.price));
  return {initialCapital:400000,endingEquity:curve.at(-1)?.equity||400000,
    totalReturnPct:curve.length?(curve.at(-1).equity/curve[0].equity-1)*100:0,maxDrawdownPct,
    grossTradedDollars:tradedNotional,turnoverPct:mean?100*tradedNotional/mean:0,
    turnoverDefinition:'Sum of buys and sells divided by mean marked equity; not divided by two.',
    executionCostDollars:sum(trades.map(t=>t.embeddedSlippage+t.commission)),fillCount:trades.length,
    endingCash:curve.at(-1)?.cash||0,endingDividendReceivable:curve.at(-1)?.receivable||0};
}
function combine(sleeves,bps) {
  const dates=sleeves.base.curve.map(x=>x.date);
  const curve=dates.map((date,i)=>({date,
    equity:sum(Object.entries(sleeves).map(([id,r])=>{assert.equal(r.curve[i].date,date);return r.curve[i].equity*SCALES[id];})),
    cash:sum(Object.entries(sleeves).map(([id,r])=>r.curve[i].cash*SCALES[id])),
    receivable:sum(Object.entries(sleeves).map(([id,r])=>(r.researchAudit.closes[i]?.receivable||0)*SCALES[id]))}));
  const trades=Object.entries(sleeves).flatMap(([sleeve,run])=>run.trades.map((t,index)=>{
    const scale=SCALES[sleeve],raw=t.price/(1+(t.side==='buy'?1:-1)*bps/10000);
    const slippageExempt=['delisting-outcome','universe-removal-zero-recovery'].includes(t.reason);
    const shares=t.shares*scale;
    if(!Number.isSafeInteger(shares))throw new Error('Noninteger actual shares: '+t.symbol);
    return {...clone(t),sleeve,sourceTradeIndex:index,shares,realizedPnl:t.realizedPnl==null?null:t.realizedPnl*scale,
      rawExecutionPrice:slippageExempt?t.price:raw,embeddedSlippage:slippageExempt?0:shares*Math.abs(t.price-raw),commission:run.config.commissionPerOrder*scale};
  })).sort((a,b)=>a.date.localeCompare(b.date)||Object.keys(SCALES).indexOf(a.sleeve)-Object.keys(SCALES).indexOf(b.sleeve)||a.sourceTradeIndex-b.sourceTradeIndex);
  return {sleeves,curve,trades,metrics:combinedMetrics(curve,trades)};
}
function assertCashConservation(run,seed) {
  let expected=seed.cash;
  for(const t of run.trades)expected+=(t.side==='sell'?1:-1)*t.shares*t.price-run.config.commissionPerOrder;
  for(const entry of run.researchAudit.accounting){
    if(entry.type==='dividend-payment')expected+=entry.amount;
    if(entry.type==='dividend-entitlement'&&entry.paymentDate===entry.date)expected+=entry.amount;
  }
  assert.ok(Math.abs(expected-run.endingCash)<0.011,'Cash ledger conservation');
  for(const point of run.researchAudit.closes)assert.ok(point.cash>=-1e-7,'No borrowing');
  const quantities=new Map(seed.positions.map(p=>[p.symbol,p.shares]));
  for(const point of run.researchAudit.closes){
    for(const action of run.researchAudit.accounting.filter(a=>a.date===point.date&&a.type==='split'))
      quantities.set(action.symbol,(quantities.get(action.symbol)||0)*action.ratio);
    for(const trade of run.trades.filter(t=>t.date===point.date)){
      const quantity=(quantities.get(trade.symbol)||0)+(trade.side==='buy'?1:-1)*trade.shares;
      assert.ok(quantity>=-1e-7,'Share ledger cannot oversell');
      quantities.set(trade.symbol,Math.max(0,quantity));
    }
    const actual=new Map(point.positions.map(p=>[p.symbol,p.shares]));
    for(const symbol of new Set([...quantities.keys(),...actual.keys()]))
      assert.ok(Math.abs((quantities.get(symbol)||0)-(actual.get(symbol)||0))<1e-7,'Daily share ledger conservation: '+symbol);
  }
  return true;
}

function assertEconomicInputContract(dataset,enableAccounting) {
  const m=dataset.metadata||{},synthetic=m.researchDataContract==='manufactured-fixture-v1';
  if(!synthetic){
    for(const field of ['executionPricesVerified','volumeUnitsVerified','fullOpportunityUniverseVerified','researchAccountingCoverageComplete','researchMembershipActionsComplete'])
      if(m[field]!==true)throw new Error('Economic input prerequisite not verified: '+field);
    if(!/^[a-f0-9]{64}$/.test(m.researchInputCoverageHash||''))throw new Error('Private complete-input coverage manifest hash required');
    if(m.researchCoverageFrom!==dataset.sessions[0].date||m.researchCoverageThrough!==dataset.sessions.at(-1).date)
      throw new Error('Economic input coverage dates do not cover the comparison');
    if(dataset.sessions.length!==64||dataset.sessions[0].date!=='2024-12-31'||dataset.sessions.at(-1).date!=='2025-04-03')
      throw new Error('Frozen baseline plus 63 evaluation sessions required');
    const {isUsMarketSessionDay}=createResearchModuleLoader(ROOT).load('lib/marketSession.js');
    const expectedDates=[];
    for(let day=Date.parse('2024-12-31T12:00:00Z');day<=Date.parse('2025-04-03T12:00:00Z');day+=86400000){
      const date=new Date(day).toISOString().slice(0,10);if(isUsMarketSessionDay(date))expectedDates.push(date);
    }
    if(JSON.stringify(dataset.sessions.map(s=>s.date))!==JSON.stringify(expectedDates))throw new Error('Complete frozen market-session calendar required');
    for(const s of dataset.sessions)if(!Array.isArray(s.universeSymbols)||new Set(s.universeSymbols).size!==s.universeSymbols.length||s.universeSymbols.length<490||s.universeSymbols.length>520)
      throw new Error('Complete accepted reconstructed opportunity universe required on every date');
    if(!enableAccounting)throw new Error('Historical economic execution cannot disable verified accounting');
    if(!Array.isArray(m.researchMembershipActions))throw new Error('Explicit documented membership-action coverage manifest required');
    for(const action of m.researchMembershipActions){
      if(action.type!=='universe-removal')continue;
      const session=dataset.sessions.find(s=>s.date===action.effectiveDate);
      if(action.verified!==true||!action.id||!action.source||!session||
        !session.corporateActions?.some(a=>a.type==='universe-removal'&&a.symbol===action.symbol&&a.effectiveDate===action.effectiveDate))
        throw new Error('Documented index removal missing verified effective-open engine action');
    }
  }
  for(const s of dataset.sessions){
    if(!Array.isArray(s.researchHConsecutiveSymbols))throw new Error('Explicit causal adjusted-close coverage required for H on every session');
    for(const a of s.corporateActions||[])if(['split','dividend','cash-dividend'].includes(String(a.type).toLowerCase())&&
      !(s.researchAccountingActions||[]).some(r=>r.id&&r.id===a.id&&r.verified===true))
      throw new Error('Economic corporate action lacks explicit verified accounting mapping');
    for(const a of s.researchAccountingActions||[])if(a.verified!==true||!a.id||!a.source||a.effectiveDate!==s.date)
      throw new Error('Invalid or unverified research accounting action');
  }
  return {synthetic,completeEconomicInputGate:!synthetic};
}

function runPair({dataset,executionCostsBps=12,interventionDelaySessions=1,enableAccounting=true,engine=loadEngine(),seeds={}}) {
  if(!dataset?.sessions?.length)throw new Error('Compiled dated sessions required');
  if(![12,25,50].includes(executionCostsBps))throw new Error('Only frozen execution-cost scenarios accepted');
  if(![1,2].includes(interventionDelaySessions))throw new Error('Only frozen intervention-delay scenarios accepted');
  const base=dataset.sessions[0].date,end=dataset.sessions.at(-1).date;
  for(let i=1;i<dataset.sessions.length;i++)if(dataset.sessions[i].date<=dataset.sessions[i-1].date)throw new Error('Strictly ordered unique dates required');
  const inputGate=assertEconomicInputContract(dataset,enableAccounting);
  const inputDigest=digest(JSON.stringify(dataset));
  const A={},B={};
  const optionsFor=sleeve=>({...engine.options[sleeve],startDate:base,endDate:end,liquidateAtEnd:false});
  for(const sleeve of Object.keys(SCALES))A[sleeve]=engine.simulate(clone(dataset),optionsFor(sleeve),clone(seeds[sleeve]||cashSeed(sleeve,base)),null,{executionCostsBps,enableAccounting});
  const event=selectHEvent(A,{sessions:dataset.sessions});
  for(const sleeve of Object.keys(SCALES))B[sleeve]=engine.simulate(clone(dataset),optionsFor(sleeve),clone(seeds[sleeve]||cashSeed(sleeve,base)),null,
    {executionCostsBps,enableAccounting,interventionDelaySessions,event:event?.sleeve===sleeve?event:null});
  for(const sleeve of Object.keys(SCALES)){
    const seed=seeds[sleeve]||cashSeed(sleeve,base);
    assertCashConservation(A[sleeve],seed);assertCashConservation(B[sleeve],seed);
    if(event){
      const a=A[sleeve].researchAudit.closes.filter(x=>x.date<=event.decisionDate);
      const b=B[sleeve].researchAudit.closes.filter(x=>x.date<=event.decisionDate);
      assert.equal(JSON.stringify(a),JSON.stringify(b),'A/B identity through event decision');
    }else assert.equal(JSON.stringify(A[sleeve]),JSON.stringify(B[sleeve]),'No H event must preserve complete parity');
  }
  assert.equal(digest(JSON.stringify(dataset)),inputDigest,'Input dataset mutation');
  const champion=combine(A,executionCostsBps),challenger=combine(B,executionCostsBps);
  const interventions=Object.values(B).flatMap(r=>r.researchAudit.intervention);
  assert.ok(interventions.length<=1,'At most one combined-account intervention');
  const actualExit=interventions.find(x=>x.status==='executed');
  const nextBuy=actualExit?challenger.trades.find(t=>t.sleeve===event.sleeve&&t.side==='buy'&&t.date>actualExit.executionDate):null;
  return {contract:'c1-gics-rotation-exploratory-pair-v1',sourcePins:{...PINS},inputDigest,inputGate,
    executionCostsBps,interventionDelaySessions,event,interventions,champion,challenger,
    comparison:{netReturnDeltaPct:challenger.metrics.totalReturnPct-champion.metrics.totalReturnPct,
      endingEquityDelta:challenger.metrics.endingEquity-champion.metrics.endingEquity,
      firstSubsequentPurchase:nextBuy||null,sameNameReentry:Boolean(nextBuy&&nextBuy.symbol===event?.symbol),
      netReleasedCapital:actualExit?actualExit.trade.shares*actualExit.trade.price*SCALES[event.sleeve]:0},
    limitations:['Approximate historical GICS inputs in both arms; not production-equivalent or independent validation.',
      'Daily-bar timing and costs are modeled; no brokerage fill or same-auction reinvestment claim.',
      'Cash is fungible; a subsequent purchase is not an attribution of the entire portfolio difference.']};
}

module.exports={ROOT,PINS,SCALES,assertPins,loadEngine,cashSeed,stripAudit,verifyNoOp,selectHEvent,combinedMetrics,combine,assertCashConservation,applyAccounting,assertEconomicInputContract,runPair};

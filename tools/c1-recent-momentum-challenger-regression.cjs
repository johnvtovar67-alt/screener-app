// Offline synthetic portfolio checks. No provider, account, or historical data is read.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {createResearchModuleLoader} = require('./research-module-loader.cjs');
const loader = createResearchModuleLoader(process.cwd());
const {analyzeEntryTiming} = loader.load('lib/entryTiming.js');
const {isUsMarketSessionDay,previousMarketSessionDay} = loader.load('lib/marketSession.js');
const {C1_FROZEN_OPTIONS} = loader.load('lib/c1FrozenOptions.js');
const champion = loader.load('lib/c1AccountSimulator.js').simulatePointInTimePortfolio;
const candidate = loader.load('lib/c1RecentMomentumChallengerSimulator.js').simulatePointInTimePortfolio;
let assertions = 0;
const ok = (value,message) => {assertions++;assert.ok(value,message);};
const eq = (actual,expected,message) => {assertions++;assert.equal(actual,expected,message);};
const same = (actual,expected,message) => {assertions++;assert.equal(JSON.stringify(actual),JSON.stringify(expected),message);};
const near = (actual,expected,message,tolerance=.000001) => {assertions++;assert.ok(Math.abs(actual-expected)<=tolerance,`${message}: ${actual} versus ${expected}`);};
const throws = (fn,pattern,message) => {assertions++;assert.throws(fn,pattern,message);};
const copy = value => JSON.parse(JSON.stringify(value));
const symbols = ['AAA','BBB','CCC','DDD','EEE','FFF','GGG','HHH','III','JJJ','KKK','LLL'];
const reasons = ['recent-momentum-deterioration','recent-momentum-profit-protection'];
const warmup = 220;
function marketDates(count) {
  const dates=[];
  for(let date=new Date('2025-01-02T00:00:00Z');dates.length<count;date.setUTCDate(date.getUTCDate()+1)){
    const key=date.toISOString().slice(0,10);
    if(isUsMarketSessionDay(key))dates.push(key);
  }
  return dates;
}

function fixture(path=[100,100.1,100.2,100.3,100.4,100.5],options={}){
  const dates=marketDates(warmup+path.length);
  const startPrice=path[0];
  const series=Object.fromEntries([...symbols,'SPY','QQQ'].map((symbol,index)=>[symbol,[]]));
  const sessions=dates.map((date,index)=>{
    const activeIndex=index-warmup;
    const decisionAt=date+'T21:00:00.000Z';
    const prices=[...symbols,'SPY','QQQ'].map((symbol,symbolIndex)=>{
      const close=symbol==='AAA'
        ?activeIndex>=0?path[activeIndex]:index>=warmup-(options.historyTail?.length??0)
          ?options.historyTail[index-warmup+options.historyTail.length]:startPrice-(warmup-1-index)*.025
        :100+index*.01+symbolIndex*.001;
      const prior=series[symbol].at(-1)?.close??close;
      const open=activeIndex>=0&&symbol==='AAA'?(options.opens?.[activeIndex]??close):close;
      const row={symbol,date,open,high:Math.max(open,close,options.highs?.[symbol]?.[activeIndex]??0),low:Math.min(open,close)*.999,close,volume:10_000_000,adjusted:true};
      series[symbol].push({...row,open:row.open??prior});
      return row;
    });
    const signals=symbols.map((symbol,signalIndex)=>{
      const price=prices.find(row=>row.symbol===symbol).close;
      const entryTiming=analyzeEntryTiming(symbol,series[symbol].slice(-220));
      return {symbol,sector:'Sector '+signalIndex%6,issuer:symbol,price,action:'Strong Buy',
        marketAvailableAt:decisionAt,fundamentalsAvailableAt:decisionAt,eventRiskAvailableAt:decisionAt,
        fundamentalDataVerified:true,fundamentalRevisionSafe:true,eventRiskVerified:true,eventHistoryComplete:true,
        entryTimingVerified:true,entryTiming,
        researchFactors:{momentumPercentile:100-signalIndex,volatility60Pct:20,return120Ex20:40-signalIndex,
          return60Ex5:30-signalIndex,return120Ex5:45-signalIndex,return252Ex21:60-signalIndex,
          return20:20-signalIndex,return5:0,alpha60VsSpy:5,alpha60VsQqq:5,controlledPullbackScore:50},
        riskPlan:{invalidationPrice:50},recommendation:{}};
    });
    return {date,decisionAt,prices,signals,positionSignals:signals,universeSymbols:symbols,corporateActions:[]};
  });
  return {dataset:{metadata:{benchmarkSymbol:'SPY',comparisonSymbols:['SPY','QQQ']},sessions},
    dates:dates.slice(warmup),start:dates[warmup],end:dates.at(-1)};
}

function seedFor(f,{shares=300,entryPrice=100,age=10,sleeve='base',cashOnly=false,extra={}}={}){
  let openedAt=f.start;
  for(let i=0;i<age;i++)openedAt=previousMarketSessionDay(openedAt);
  return {contract:'c1-prospective-account-seed-v1',sleeve,asOfSession:f.start,prospectiveAdoptionConfirmed:true,
    cash:cashOnly?100_000:100_000-shares*f.dataset.sessions[warmup].prices.find(row=>row.symbol==='AAA').close,
    highWater:100_000,remainingCooldownSessions:0,resumeAtNextOpen:false,
    positions:cashOnly?[]:[{symbol:'AAA',role:'Swing',shares,entryPrice,openedAt,inheritedRiskOnly:false,
      sector:'Sector 0',issuer:'AAA',stock:{symbol:'AAA',sector:'Sector 0'},...extra}]};
}
function run(f,{engine=candidate,seed=seedFor(f),end=f.end,options={}}={}){
  return engine(f.dataset,{...C1_FROZEN_OPTIONS[seed.sleeve],startDate:f.start,endDate:end,liquidateAtEnd:false,
    warmupSessions:warmup,...options},seed);
}
const recentSales = result => result.trades.filter(trade=>trade.side==='sell'&&reasons.includes(trade.reason));
const buys = (result,symbol='AAA') => result.trades.filter(trade=>trade.side==='buy'&&trade.symbol===symbol);
const activeSignal = (f,index,symbol='AAA') => f.dataset.sessions[warmup+index].signals.find(row=>row.symbol===symbol);
const activePrice = (f,index,symbol='AAA') => f.dataset.sessions[warmup+index].prices.find(row=>row.symbol===symbol);
function changeTiming(f,index,patch,symbol='AAA'){
  for(const field of ['signals','positionSignals','accountHoldingSignals'])
    for(const signal of f.dataset.sessions[warmup+index][field]||[])
      if(signal.symbol===symbol)signal.entryTiming={...signal.entryTiming,...patch};
}

// Reusable offline input for the CLI smoke test; requiring this module never
// runs portfolios or writes files.
module.exports={fixture,seedFor};

if(require.main===module){

// A lagged rank of one must not shield confirmed current deterioration.
{
  const f=fixture([100,99,98,97,96,95]);
  const result=run(f),control=run(f,{engine:champion});
  const sale=recentSales(result)[0];
  eq(sale?.reason,'recent-momentum-deterioration','DELL-like weakness uses the ordinary three-close exit');
  eq(sale?.date,f.dates[4],'Three qualifying completed closes execute at the following open');
  eq(sale?.symbol,'AAA','The deteriorating holding, rather than a substitute symbol, is sold');
  near(sale?.price,96*(1-.0012),'The actual exit retains 12 bps sell cost');
  eq(recentSales(control).length,0,'Champion does not receive Challenger exits');
  ok(control.openPositions.some(position=>position.symbol==='AAA'),'Historical-rank Champion still holds AAA');
  ok(result.trades.some(trade=>trade.side==='buy'&&trade.date===sale.date&&trade.symbol!=='AAA'),'Sale proceeds rotate to an eligible replacement at the actual next open');
  eq(buys(result).length,0,'Weak high-rank AAA is not immediately repurchased');
  ok(result.curve.at(-1).cash>=0,'Rotation retains nonnegative sleeve cash');
  const atThird=run(f,{end:f.dates[3]});
  const pending=atThird.pendingDecisions.find(order=>order.side==='sell'&&order.symbol==='AAA');
  eq(pending?.reason,'recent-momentum-deterioration','The third close creates an executable pending Sell');
  eq(recentSales(atThird).length,0,'A close decision is not fabricated as a same-close fill');
  eq(atThird.openPositions.find(position=>position.symbol==='AAA')?.lastC1Rank,1,'The exit decision leaves the actual historical opportunity rank unchanged');
}

// A verified intraday high arms protection, including very young and mature holdings.
for(const age of [0,50]){
  const f=fixture([110,105,99,98,97],{highs:{AAA:[112]}});
  const result=run(f,{seed:seedFor(f,{age})});
  const sale=recentSales(result)[0];
  eq(sale?.reason,'recent-momentum-profit-protection',`MPC-like winner uses two closes at ownership age ${age}`);
  eq(sale?.date,f.dates[3],`Profit protection remains active when the second qualifying close loses the gain at age ${age}`);
  ok(sale?.price<100,'The latched protection can exit after the remaining gain has disappeared');
  const pending=run(f,{seed:seedFor(f,{age}),end:f.dates[2]});
  eq(pending.openPositions.find(position=>position.symbol==='AAA')?.recentMomentumState?.profitProtectionArmed,true,'The 12% verified peak activation remains latched');
  ok(pending.pendingDecisions.some(order=>order.reason==='recent-momentum-profit-protection'),'The two-close decision is actionable before next-open execution');
}

// A normal correction may recover before ordinary confirmation is complete.
{
  const f=fixture([100,99,98,100.5,101,102]);
  const result=run(f);
  eq(recentSales(result).length,0,'Two weak closes followed by a recovery do not trigger an ordinary exit');
  ok(result.openPositions.some(position=>position.symbol==='AAA'),'A temporary correction retains the original investment through recovery');
  eq(result.openPositions.find(position=>position.symbol==='AAA')?.recentMomentumState?.streak,0,'Recovery clears the deterioration confirmation');
}

// Small green closes cannot keep resetting persistent 3/5-session deterioration.
{
  const f=fixture([100,99,98,98.01,97,96]);
  eq(activeSignal(f,3).entryTiming.macdImproving,false,'The tiny rebound remains unconfirmed by the existing MACD calculation');
  const sale=recentSales(run(f))[0];
  eq(sale?.date,f.dates[4],'A narrow green day continues an already-started deterioration streak');
  eq(sale?.reason,'recent-momentum-deterioration','Continuation uses the same confirmed deterioration branch');
}

// Entry eligibility is enforced after historical ranking for all fresh-capital routes.
{
  const weak=fixture([99,98,97]);
  for(let i=warmup-5;i<warmup;i++){
    const row=weak.dataset.sessions[i].prices.find(row=>row.symbol==='AAA');
    row.close=100+(i-warmup+5)*.1;row.high=row.close;row.open=row.close;row.low=row.close*.999;
  }
  changeTiming(weak,0,{macdImproving:false});
  const cashSeed=seedFor(weak,{cashOnly:true});
  const result=run(weak,{seed:cashSeed});
  eq(buys(result).length,0,'A new Buy cannot bypass recent weakness with a high historical rank');
  ok(result.trades.some(trade=>trade.side==='buy'&&trade.symbol==='BBB'),'The veto leaves another historically eligible opportunity executable');
  eq(run(weak,{seed:cashSeed,end:weak.start}).pendingDecisions.some(order=>order.side==='buy'&&order.symbol==='AAA'),false,'The weak Buy is removed from the actual close queue');
  const rules=[{priorDate:weak.dates[0],date:weak.dates[1],partialSymbols:['AAA']},{priorDate:weak.dates[1],date:weak.dates[2],partialSymbols:['AAA']}];
  const partial=seedFor(weak,{shares:100});
  eq(buys(run(weak,{seed:partial,options:{accountCompletionRules:rules}})).length,0,'Owner-confirmed partial completion uses the same recent-momentum veto');
  const saved=seedFor(weak,{shares:100,extra:{entryTargetShares:300}});
  eq(buys(run(weak,{seed:saved,options:{accountCompletionRules:rules}})).length,0,'A saved unfilled target cannot authorize an Add through recent weakness');
}

// A recovery can authorize fresh capital before both longer recent windows clear.
{
  const f=fixture([99,98,97,96,97,98,99,100],{historyTail:[100,100.2,100.4,100.6,100.8]});
  // Leave a slot available; otherwise the three valid replacements quite
  // properly occupy every slot before the recovering candidate becomes ready.
  for(const session of f.dataset.sessions)for(const signal of session.signals)
    if(signal.symbol!=='AAA')signal.entryTiming.liquidityPass=false;
  const seed=seedFor(f,{cashOnly:true});
  const result=run(f,{seed});
  ok(buys(result).some(trade=>trade.date>f.dates[1]),'Improving current momentum permits a later actual entry after an initial veto');
}

// New fills, rather than only adopted string-ID holdings, receive protection.
{
  const f=fixture([100,100.1,99,98,97,96,95]);
  const result=run(f,{seed:seedFor(f,{cashOnly:true})});
  eq(buys(result)[0]?.date,f.dates[1],'The scenario establishes a real newly bought position');
  const sale=recentSales(result).find(trade=>trade.symbol==='AAA');
  eq(sale?.reason,'recent-momentum-deterioration','A fresh numeric-ID position gets the same deterioration logic');
  eq(sale?.date,f.dates[5],'A fresh Buy exits after its own three post-entry qualifying closes');
}

// Every fresh-capital route must pass again when a queued order reaches the open.
const openingInvalidCases={
  missingPrice:(f)=>{f.dataset.sessions[warmup+1].prices=f.dataset.sessions[warmup+1].prices.filter(row=>row.symbol!=='AAA');},
  stalePrice:(f)=>{activePrice(f,1).stale=true;},
  staleSession:(f)=>{f.dataset.sessions[warmup+1].stale=true;},
  wrongDate:(f)=>{activePrice(f,1).date=f.dates[0];},
  wrongAsOf:(f)=>{activePrice(f,1).asOf=f.dates[0];},
  unadjustedPrice:(f)=>{activePrice(f,1).adjusted=false;},
  duplicatePrice:(f)=>{f.dataset.sessions[warmup+1].prices.push(copy(activePrice(f,1)));},
  futureOpeningAvailability:(f)=>{activePrice(f,1).availableAt='2099-01-01T00:00:00.000Z';},
  malformedOpeningAvailability:(f)=>{activePrice(f,1).marketAvailableAt=null;},
  futureSessionAvailability:(f)=>{f.dataset.sessions[warmup+1].marketAvailableAt='2099-01-01T00:00:00.000Z';},
  unverifiableOpeningAvailability:(f)=>{activePrice(f,1).availableAt=f.dates[1]+'T14:30:00.000Z';delete f.dataset.sessions[warmup+1].decisionAt;},
};
for(const route of ['new','partial','saved-target']){
  const seedOptions=route==='new'?{cashOnly:true}:route==='partial'?{shares:100}:{shares:100,extra:{entryTargetShares:300}};
  const fresh=fixture([100,100.1]);
  const rules=[{priorDate:fresh.dates[0],date:fresh.dates[1],partialSymbols:['AAA']}];
  const options={accountCompletionRules:rules};
  const positive=run(fresh,{seed:seedFor(fresh,seedOptions),options});
  ok(buys(positive).some(trade=>trade.date===fresh.dates[1]),`${route}: valid origin and opening evidence permit actual fresh capital`);
  const queued=run(fresh,{seed:seedFor(fresh,seedOptions),options,end:fresh.start});
  ok(queued.pendingDecisions.some(order=>order.side==='buy'&&order.symbol==='AAA'),`${route}: the healthy close creates the real pending Buy/Add`);
  for(const [name,invalidate] of Object.entries(openingInvalidCases)){
    const f=fixture([100,100.1]);invalidate(f);
    const result=run(f,{seed:seedFor(f,seedOptions),options});
    eq(buys(result).length,0,`${route}: ${name} vetoes actual opening execution`);
  }
}

// Missing or stale evidence cannot sell a holding or authorize fresh capital.
const invalidCases={
  futureSessionAvailability:(f,index)=>{f.dataset.sessions[warmup+index].availableAt='2099-01-01T00:00:00.000Z';},
  malformedSessionAvailability:(f,index)=>{f.dataset.sessions[warmup+index].marketAvailableAt=null;},
  missingTiming:(f,index)=>{changeTiming(f,index,{available:false});},
  stale:(f,index)=>{changeTiming(f,index,{staleVerification:true});},
  wrongAsOf:(f,index)=>{changeTiming(f,index,{asOf:previousMarketSessionDay(f.dates[index])});},
  wrongPriceAsOf:(f,index)=>{activePrice(f,index).asOf=previousMarketSessionDay(f.dates[index]);},
  missingMacd:(f,index)=>{changeTiming(f,index,{macdImproving:null});},
  duplicatePrice:(f,index)=>{f.dataset.sessions[warmup+index].prices.push(copy(activePrice(f,index)));},
  unadjusted:(f,index)=>{activePrice(f,index).adjusted=false;},
};
for(const [name,invalidate] of Object.entries(invalidCases)){
  const f=fixture([100,99,98,97]);
  invalidate(f,2);
  const held=run(f);
  eq(recentSales(held).length,0,`${name} cannot manufacture a confirmed exit`);
  const weak=fixture([100,100.1]);
  invalidate(weak,0);
  eq(buys(run(weak,{seed:seedFor(weak,{cashOnly:true})})).length,0,`${name} cannot authorize a new Buy`);
}

// A numeric-looking or stale high is not proof that profit activation was met.
{
  const f=fixture([100,99,98,97,96]);
  activePrice(f,0).high='120';
  const result=run(f);
  eq(recentSales(result)[0]?.reason,'recent-momentum-deterioration','An unverified high cannot accelerate the normal three-close exit');
  eq(recentSales(result)[0]?.date,f.dates[4],'Only three verified deterioration closes can authorize this unarmed exit');
  const early=run(f,{end:f.dates[2]});
  eq(early.openPositions.find(position=>position.symbol==='AAA')?.recentMomentumState?.profitProtectionArmed,false,'An unsupported apparent 20% high never arms profit protection');
}

// A confirmed exit still requires a verified, correctly dated next-session open.
for(const [name,invalidate] of Object.entries(openingInvalidCases)){
  const f=fixture([100,99,98,97,96]);
  // Reuse the opening mutators on the fourth active session, where the pending
  // three-close exit is due. The close evidence through the previous day stays valid.
  const shifted={...f,dataset:{...f.dataset,sessions:f.dataset.sessions.slice()},dates:[f.dates[3],f.dates[4]]};
  shifted.dataset.sessions[warmup+1]=f.dataset.sessions[warmup+4];
  invalidate(shifted);
  f.dataset.sessions[warmup+4]=shifted.dataset.sessions[warmup+1];
  eq(recentSales(run(f)).length,0,`${name} cannot execute an unsupported recent-momentum Sell`);
}

// A skipped market session invalidates the close evidence at the next opening.
{
  const f=fixture([100,100.1,100.2]);
  f.dataset.sessions.splice(warmup+1,1);
  const result=run(f,{seed:seedFor(f,{cashOnly:true})});
  eq(buys(result).length,0,'A missing intervening market session vetoes queued fresh capital at opening execution');
  const weak=fixture([100,99,98,97,96]);
  weak.dataset.sessions.splice(warmup+2,1);
  eq(recentSales(run(weak)).length,0,'A market-session gap cannot count as consecutive deterioration');
}

// The opening gate must not inspect the execution day's not-yet-known close.
{
  const f=fixture([100,90,91]);
  const result=run(f,{seed:seedFor(f,{cashOnly:true})});
  ok(buys(result).some(trade=>trade.date===f.dates[1]),'An execution-day weak close cannot retroactively veto a prior-close Buy');
}

// Safeguards retain precedence and do not depend on usable momentum evidence.
{
  const f=fixture([100,85,84]);
  changeTiming(f,0,{available:false});changeTiming(f,1,{available:false});
  const result=run(f);
  ok(result.trades.some(trade=>trade.side==='sell'&&trade.symbol==='AAA'&&trade.reason==='initial-stop'),'The established 14% stop still executes with unavailable recent momentum');
  eq(recentSales(result).length,0,'A pre-existing stop is not relabeled as a recent-momentum exit');
}

// A quiet path must preserve actual Champion trades, cash, positions and costs.
{
  const f=fixture([100,100.1,100.2,100.3,100.4,100.5,100.6]);
  for(const sleeve of ['base','cooldown15','sector40']){
    const seed=seedFor(f,{cashOnly:true,sleeve});
    const result=run(f,{seed}),control=run(f,{engine:champion,seed});
    same(result.trades,control.trades,`${sleeve}: no-trigger actual trade parity`);
    same(result.curve,control.curve,`${sleeve}: no-trigger equity and cash parity`);
    eq(result.endingCash,control.endingCash,`${sleeve}: no-trigger ending cash parity`);
    same(result.openPositions.map(position=>Object.fromEntries(Object.entries(position).filter(([key])=>!key.startsWith('recentMomentum')))),control.openPositions,`${sleeve}: original position lifecycle and safeguards are intact`);
    eq(result.config.maxPositions,3,`${sleeve}: three-name cap remains`);
    eq(result.config.minimumInitialStopPct,14,`${sleeve}: 14% fixed stop remains`);
    eq(result.config.portfolioDrawdownStopPct,12,`${sleeve}: 12% sleeve breaker remains`);
    eq(result.config.slippageBps,12,`${sleeve}: 12 bps transaction cost remains`);
    eq(result.config.maxSectorPct,sleeve==='sector40'?.4:.5,`${sleeve}: established sector cap remains`);
    eq(result.config.portfolioDrawdownCooldownSessions,sleeve==='cooldown15'?15:10,`${sleeve}: established cooldown remains`);
    ok(result.openPositions.length<=3,`${sleeve}: executable holdings stay within the existing slot limit`);
    ok(result.trades.filter(trade=>trade.side==='buy').every(trade=>trade.shares>0&&Number.isInteger(trade.shares)),`${sleeve}: fills keep the existing whole-share sizing`);
  }
}

// The single-Challenger wrapper includes three independent books, replacement
// investments, costs, and the recovery a sale can miss in both full equity paths.
{
  const {runC1RecentMomentumComparison:compare}=loader.load('lib/c1RecentMomentumChallenger.js');
  const f=fixture([100,99,98,97,96,100,105,110]);
  const openingAccounts=Object.fromEntries(['base','cooldown15','sector40'].map(sleeve=>[sleeve,seedFor(f,{sleeve})]));
  const result=compare({dataset:f.dataset,startDate:f.start,endDate:f.end,openingAccounts});
  eq(result.scope,'offline-simulation-only','The comparison cannot be mistaken for an account execution');
  eq(result.executable,false,'The comparison never grants brokerage execution authority');
  for(const side of ['champion','challenger']){
    const combined=result[side];
    for(let index=0;index<combined.curve.length;index++){
      const expected=.25*combined.sleeves.base.curve[index].equity+.5*combined.sleeves.cooldown15.curve[index].equity+.25*combined.sleeves.sector40.curve[index].equity;
      near(combined.curve[index].equity,expected,`${side}: session ${index} retains independent 25/50/25 accounting`);
    }
    for(const trade of combined.trades)near(trade.portfolioModelShares,trade.shares*(trade.sleeve==='cooldown15'?.5:.25),`${side}: weighted trade attribution preserves sleeve ownership`);
    near(combined.metrics.totalReturnPct,(combined.curve.at(-1).equity/100_000-1)*100,`${side}: portfolio return is sourced from its full after-cost equity path`);
  }
  ok(result.challenger.trades.some(trade=>trade.side==='buy'&&trade.symbol==='DDD'&&trade.date===f.dates[4]),'The combined Challenger includes actual replacement investment purchases');
  ok(result.champion.sleeves.base.openPositions.some(position=>position.symbol==='AAA'),'Champion continues to capture the subsequent AAA recovery');
  ok(result.comparison.endingEquityDifference<0,'A missed recovery is honestly counted against this synthetic Challenger');
  near(result.comparison.endingEquityDifference,result.challenger.curve.at(-1).equity-result.champion.curve.at(-1).equity,'Comparison difference includes both complete capital paths');
  const quiet=fixture([100,100.1,100.2]);
  const parity=compare({dataset:quiet.dataset,startDate:quiet.start,endDate:quiet.end});
  same(parity.challenger.curve,parity.champion.curve,'The full three-sleeve no-trigger comparison retains Champion equity parity');
  same(parity.challenger.trades,parity.champion.trades,'The full three-sleeve no-trigger comparison retains actual trade and fee parity');
  const bad=copy(quiet.dataset);bad.sessions.splice(warmup,0,copy(bad.sessions[warmup]));
  throws(()=>compare({dataset:bad,startDate:quiet.start,endDate:quiet.end}),/unique|chronological/,'The wrapper rejects duplicate whole sessions before counting confirmations');
}

// The candidate stays isolated from every production import and API route.
{
  const production=fs.readFileSync('lib/c1AccountSimulator.js','utf8');
  eq(production.includes('c1RecentMomentum'),false,'The canonical account engine does not import or activate the Challenger');
}

// Repeated close observations cannot create extra confirmations or newly arm
// protection from revised same-date evidence.
{
  const {evaluateC1RecentMomentum:evaluate,readC1RecentMomentum:read}=loader.load('lib/c1RecentMomentumGate.js');
  const f=fixture([100,99,98]);
  const position={positionId:'unit-lifecycle',enteredAt:seedFor(f).positions[0].openedAt,entryPrice:100,highWatermark:100};
  const first=evaluate({sessions:f.dataset.sessions,sessionIndex:warmup+1,symbol:'AAA',position,sleeve:'base'});
  const second=evaluate({sessions:f.dataset.sessions,sessionIndex:warmup+2,symbol:'AAA',position,sleeve:'base',prior:first.state});
  eq(second.state.streak,2,'Two distinct weak closes establish exactly two confirmations');
  const repeated=evaluate({sessions:f.dataset.sessions,sessionIndex:warmup+2,symbol:'AAA',position,sleeve:'base',prior:second.state});
  eq(repeated.state.streak,2,'Repeating the same accepted close is idempotent');
  const revised=evaluate({sessions:f.dataset.sessions,sessionIndex:warmup+2,symbol:'AAA',position:{...position,highWatermark:112},sleeve:'base',prior:second.state});
  eq(revised.available,false,'A changed same-date peak requires review');
  eq(revised.exitReason,null,'A changed same-date peak cannot manufacture a faster Sell');
  eq(revised.state.profitProtectionArmed,false,'An unaccepted peak revision cannot arm profit protection');
  changeTiming(f,2,{freshness:{stale:true}});
  const stale=read({sessions:f.dataset.sessions,sessionIndex:warmup+2,symbol:'AAA'});
  eq(stale.available,false,'Nested canonical freshness flags invalidate recent-momentum evidence');
  eq(stale.entryAllowed,false,'Nested stale evidence cannot authorize capital');
}

// A subsequent purchase is a new lifecycle: prior profit activation and exit
// confirmation do not leak across a completed sale and later recovery entry.
{
  const f=fixture([110,105,99,98,99,100,101,100,99,98,97],{highs:{AAA:[112]}});
  for(const session of f.dataset.sessions)for(const signal of session.signals)
    if(signal.symbol!=='AAA')signal.entryTiming.liquidityPass=false;
  const result=run(f);
  eq(recentSales(result)[0]?.reason,'recent-momentum-profit-protection','The old lifecycle completes its armed profit-protection sale');
  ok(buys(result).length>0,'The stock can later be repurchased after actual momentum recovery');
  const reviews=result.recentMomentumDecisions.filter(review=>review.phase==='close-holding'&&review.symbol==='AAA');
  const before=reviews[0],after=reviews.find(review=>review.date===buys(result)[0].date);
  ok(before.state.lifecycleKey!==after?.state.lifecycleKey,'The recovered purchase receives a distinct position lifecycle');
  eq(after?.state.profitProtectionArmed,false,'An earlier position peak does not arm the new purchase');
  eq(after?.state.streak,0,'The new purchase does not inherit the old exit confirmation count');
}

// Explicit availability timestamps cannot place market evidence after the
// accepted decision time, even if its date/MACD values otherwise look valid.
{
  const {evaluateC1RecentMomentum:evaluate,readC1RecentMomentum:read}=loader.load('lib/c1RecentMomentumGate.js');
  const cases=[
    ['future signal',f=>{activeSignal(f,2).marketAvailableAt=f.dates[2]+'T22:00:00.000Z';}],
    ['malformed timing',f=>{changeTiming(f,2,{availableAt:null});}],
    ['future historical bar',f=>{activePrice(f,1).availableAt=f.dates[1]+'T22:00:00.000Z';}],
    ['missing decision timestamp',f=>{delete f.dataset.sessions[warmup+2].decisionAt;}],
  ];
  for(const [name,mutate] of cases){
    const f=fixture([100,99,98]);mutate(f);
    const p={positionId:'availability',enteredAt:seedFor(f).positions[0].openedAt,entryPrice:100,highWatermark:112};
    const result=evaluate({sessions:f.dataset.sessions,sessionIndex:warmup+2,symbol:'AAA',position:p,sleeve:'base'});
    eq(result.available,false,`${name}: supplied unverified availability is rejected`);
    eq(result.entryAllowed,false,`${name}: cannot authorize fresh capital`);
    eq(result.exitReason,null,`${name}: cannot manufacture a recent-momentum exit`);
  }
  const boundary=fixture([100,99,98]);
  eq(read({sessions:boundary.dataset.sessions,sessionIndex:warmup+2,symbol:'AAA'}).available,true,'Evidence available exactly at decision time is accepted');
  const future=fixture([100,99,98,97,96]);
  for(let index=0;index<future.dates.length;index++)activeSignal(future,index).marketAvailableAt=future.dates[index]+'T22:00:00.000Z';
  eq(recentSales(run(future)).length,0,'Future-dated market evidence cannot produce an actual Challenger Sell fill');
  eq(buys(run(future,{seed:seedFor(future,{cashOnly:true})})).length,0,'Future-dated market evidence cannot produce an actual Challenger Buy fill');
}

console.log(`PASS: ${assertions} recent-momentum Challenger assertions across actual synthetic portfolio decisions and fills.`);
}

// Real compiler timing -> durable compaction -> dated snapshot -> entry gate
// and actual HTTP producer. Synthetic observations only; no provider or writes.
const assert=require('node:assert/strict');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const {analyzeEntryTiming,applyEntryTimingGate}=loader.load('lib/entryTiming.js');
const {compactReplaySession}=loader.load('lib/replayDatasetCompaction.js');
const {buildC1StockScreenSnapshot,classifyC1StockScreen}=loader.load('lib/c1StockClassification.js');
const {previousMarketSessionDay}=loader.load('lib/marketSession.js');
const {currentEventEvidenceFor}=require('./fixtures/c1-trading-workflow.cjs');
const clone=value=>structuredClone(value);
const date='2026-11-11',now=new Date('2026-11-12T17:00:00Z'),symbols=['X000','X001','X002'];
const dates=[date];while(dates.length<40)dates.unshift(previousMarketSessionDay(dates[0]));
const bars=dates.map((day,index)=>({date:day,open:96+index*.1,close:96.1+index*.1,high:96.2+index*.1,low:96+index*.1,volume:5000000,adjusted:true}));
const timing=analyzeEntryTiming(symbols[0],bars);
assert.equal(timing.liquiditySessions,20);assert.equal(timing.liquidityVerified,true);assert.equal(timing.liquidityPass,true);
const raw=dates.map((day,index)=>({date:day,universeSymbols:symbols,prices:symbols.map(symbol=>({...bars[index],symbol})),
 signals:symbols.map((symbol,rank)=>({symbol,sector:'Sector '+rank,issuer:'issuer:'+symbol,companyName:symbol,price:bars[index].close,
 researchFactors:{momentumPercentile:99-rank,factorCoverage:12,volatility60Pct:20},
 entryTiming:{...timing,symbol,asOf:day,macdImproving:true}}))}));
const fresh=raw.map(compactReplaySession);
for(const field of ['liquiditySessions','liquidityLookbackSessions','asOf'])assert.equal(fresh.at(-1).signals[0].entryTiming[field],raw.at(-1).signals[0].entryTiming[field],
 'Future compaction must preserve actual '+field+' evidence');
const accepted=clone(fresh);
for(const session of accepted)for(const signal of session.signals)for(const field of ['liquiditySessions','liquidityLookbackSessions','asOf'])delete signal.entryTiming[field];
const originalBytes=JSON.stringify(accepted),acceptedTiming=accepted.at(-1).signals[0].entryTiming;
const row={symbol:symbols[0],price:100};
// This is the exact production failure: the compacted accepted receipt carries
// a valid average/verified pass, but the generic gate sees no observation count.
const broken=applyEntryTimingGate(row,{...acceptedTiming,asOf:date},now);
assert.equal(broken.entryTiming.liquiditySessions,0);assert.equal(broken.entryTiming.liquidityVerified,false);assert.equal(broken.entryTiming.liquidityPass,false);
const snapshot=history=>buildC1StockScreenSnapshot(history.at(-1),now,history);
const repaired=snapshot(accepted),candidate=repaired.candidates[0];
assert.equal(candidate.sourceTiming.liquiditySessions,20);assert.equal(candidate.sourceTiming.liquidityLookbackSessions,20);
assert.equal(candidate.sourceTiming.averageDollarVolume20,timing.averageDollarVolume20,'Recovery must agree with the accepted dollar-volume average');
const checked=applyEntryTimingGate(row,candidate.sourceTiming,now);
assert.equal(checked.entryTiming.liquidityVerified,true);assert.equal(checked.entryTiming.liquidityPass,true);
assert.equal(JSON.stringify(accepted),originalBytes,'Transport recovery cannot rewrite accepted history or signals');
const events=currentEventEvidenceFor(symbols,now);
const screenRows=repaired.candidates.map(candidate=>({...applyEntryTimingGate({symbol:candidate.symbol,price:100},candidate.sourceTiming,now),
 expertDecision:{metrics:{quoteFreshnessPass:true}},eventRisk:events.find(event=>event.symbol===candidate.symbol)}));
assert.equal(classifyC1StockScreen({snapshot:repaired,rows:screenRows,current:true}).filter(row=>row.rating==='Buy').length,3,
 'Verified accepted counts restore the existing classifier; no rating or order is manufactured');
const explicitMissingEvent=clone(screenRows);explicitMissingEvent[0].eventRisk={status:'Manual',blockNewCapital:true,checkComplete:false};
assert.equal(classifyC1StockScreen({snapshot:repaired,rows:explicitMissingEvent,current:true})[0].rating,'Watch','Count recovery cannot bypass the event gate');
assert.equal(applyEntryTimingGate(row,candidate.sourceTiming,new Date('2026-11-13T17:00:00Z')).entryTiming.liquidityVerified,false,
 'Recovered counts cannot authorize a later session with stale timing');
const rejects=[
 ['missing session',history=>{history.splice(-10,1);}],
 ['duplicate session',history=>{history.splice(-10,0,clone(history.at(-10)));}],
 ['missing symbol bar',history=>{history.at(-10).prices=history.at(-10).prices.filter(bar=>bar.symbol!==symbols[0]);}],
 ['duplicate symbol bar',history=>{history.at(-10).prices.push(clone(history.at(-10).prices[0]));}],
 ['missing volume',history=>{delete history.at(-10).prices[0].volume;}],
 ['negative volume',history=>{history.at(-10).prices[0].volume=-1;}],
 ['nonfinite volume',history=>{history.at(-10).prices[0].volume=NaN;}],
 ['unadjusted bar',history=>{history.at(-10).prices[0].adjusted=false;}],
 ['stale bar',history=>{history.at(-10).prices[0].stale=true;}],
 ['stale session',history=>{history.at(-10).stale=true;}],
 ['mismatched bar date',history=>{history.at(-10).prices[0].date=date;}],
 ['mismatched accepted average',history=>{history.at(-1).signals[0].entryTiming.averageDollarVolume20+=1000000;}],
 ['false source verification',history=>{history.at(-1).signals[0].entryTiming.liquidityVerified=false;}],
 ['missing source verification',history=>{delete history.at(-1).signals[0].entryTiming.liquidityVerified;}],
 ['stale timing source',history=>{history.at(-1).signals[0].entryTiming.asOf=previousMarketSessionDay(date);}],
 ['stale timing receipt',history=>{history.at(-1).signals[0].entryTiming.staleVerification=true;}],
 ['inconsistent lookback',history=>{history.at(-1).signals[0].entryTiming.liquidityLookbackSessions=10;}],
 ['explicit short count',history=>{history.at(-1).signals[0].entryTiming.liquiditySessions=10;}],
 ['explicit zero count',history=>{history.at(-1).signals[0].entryTiming.liquiditySessions=0;}],
];
for(const [label,edit] of rejects){
 const history=clone(accepted);edit(history);const c=snapshot(history).candidates.find(candidate=>candidate.symbol===symbols[0]);
 const result=applyEntryTimingGate(row,c.sourceTiming,now);
 assert.equal(result.entryTiming.liquidityVerified,false,label+' must remain fail-closed');
 assert.equal(result.entryTiming.liquidityPass,false,label+' cannot acquire liquidity permission');
}
const fewer=clone(accepted).slice(-19);assert.equal(snapshot(fewer).candidates[0].sourceTiming.liquiditySessions,null,'An incomplete lookback cannot invent its missing observation count');
// Historical snapshot semantics stay unchanged even if the caller supplies bars.
const historicalDate='2026-11-09',historical=accepted.filter(session=>session.date<=historicalDate);
assert.equal(snapshot(historical).candidates[0].sourceTiming.liquiditySessions,null,'The earlier historical selection policy is untouched');

async function producer(){
 const {createHarness,CURRENT}=require('./top5-performance-regression.cjs');
 const h=createHarness(CURRENT,{quoteTimestamp:now.getTime()/1000});
 h.clock.advance(now.getTime()-h.clock.now());
 Object.assign(h.snapshot,{sourceSessionDate:date,requiredSessionDate:date,accountScreen:repaired});
 const response=await h.clock.settle(h.request({compact:'1',screenSymbols:symbols.join(',')}));
 assert.equal(response.code,200,JSON.stringify(response.body));
 for(const symbol of symbols){
  const actual=response.body.stocks.find(stock=>stock.symbol===symbol);assert(actual,'Actual HTTP producer retains required '+symbol);
  assert.equal(actual.entryTiming.liquiditySessions,20,'Actual producer transports the proved count');
  assert.equal(actual.entryTiming.liquidityVerified,true);assert.equal(actual.entryTiming.liquidityPass,true);
 }
 console.log('PASS: reproduced compacted verified-liquidity count loss; recovered only from matching accepted twenty-session evidence; incomplete/inconsistent/stale inputs stay blocked; future compaction and real HTTP producer preserve counts without bypassing entry/event gates.');
}
producer().catch(error=>{console.error(error);process.exitCode=1;});

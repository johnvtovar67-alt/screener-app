// Actual HTTP producer with accepted canonical timing whose old compacted
// observation count cannot be reconstructed. No live I/O or account writes.
const assert=require('node:assert/strict');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const {analyzeEntryTiming,applyEntryTimingGate}=loader.load('lib/entryTiming.js');
const {compactReplaySession}=loader.load('lib/replayDatasetCompaction.js');
const {buildC1StockScreenSnapshot,classifyC1StockScreen}=loader.load('lib/c1StockClassification.js');
const {previousMarketSessionDay}=loader.load('lib/marketSession.js');
const {currentEventEvidenceFor}=require('./fixtures/c1-trading-workflow.cjs');
const {createHarness,CURRENT}=require('./top5-performance-regression.cjs');
const copy=value=>structuredClone(value),date='2026-11-11',now=new Date('2026-11-12T17:00:00Z'),symbols=['X000','X001','X002'];
const dates=[date];while(dates.length<40)dates.unshift(previousMarketSessionDay(dates[0]));
const bars=dates.map((date,index)=>({date,open:96+index*.1,close:96.1+index*.1,high:96.2+index*.1,low:96+index*.1,volume:5000000,adjusted:true}));
const timing=analyzeEntryTiming(symbols[0],bars);
const accepted=dates.map((day,index)=>compactReplaySession({date:day,universeSymbols:symbols,
 prices:symbols.map(symbol=>({...bars[index],symbol})),signals:symbols.map((symbol,rank)=>({symbol,sector:'Sector '+rank,issuer:symbol,price:bars[index].close,
 researchFactors:{momentumPercentile:99-rank,factorCoverage:12,volatility60Pct:20},entryTiming:{...timing,asOf:day,macdImproving:true}}))}));
for(const session of accepted){
 for(const bar of session.prices)delete bar.volume;
 for(const signal of session.signals)for(const field of ['liquiditySessions','liquidityLookbackSessions','asOf'])delete signal.entryTiming[field];
}
const inputBytes=JSON.stringify(accepted),snapshot=buildC1StockScreenSnapshot(accepted.at(-1),now,accepted);
assert.equal(snapshot.candidates[0].sourceTiming.liquiditySessions,null,'Missing accepted bars cannot fabricate an observation count');
assert.equal(snapshot.candidates[0].sourceTiming.liquidityVerified,true);assert.equal(snapshot.candidates[0].sourceTiming.liquidityPass,true);
const generic=applyEntryTimingGate({symbol:symbols[0],price:100},snapshot.candidates[0].sourceTiming,now);
assert.equal(generic.entryTiming.liquiditySessions,0);assert.equal(generic.entryTiming.liquidityPass,false,'Reproduce the accidental generic missing-count reinterpretation');
async function screen(edit=()=>{},history=accepted){
 const h=createHarness(CURRENT,{quoteTimestamp:now.getTime()/1000}),source=buildC1StockScreenSnapshot(history.at(-1),now,history);
 h.clock.advance(now.getTime()-h.clock.now());
 Object.assign(h.snapshot,{sourceSessionDate:date,requiredSessionDate:date,accountScreen:source});edit({source,snapshot:h.snapshot});
 const result=await h.clock.settle(h.request({compact:'1',screenSymbols:symbols.join(',')}));assert.equal(result.code,200,JSON.stringify(result.body));
 return {body:result.body,row:result.body.stocks.find(row=>row.symbol===symbols[0]),source,reviewed:h.cache().rows.find(row=>row.symbol===symbols[0])};
}
async function main(){
 const {row,body,reviewed}=await screen();
 assert.equal(row.entryTiming.liquiditySessions,null,'Absent count stays unknown rather than becoming zero or twenty');
 assert.equal(row.entryTiming.liquidityVerified,true);assert.equal(row.entryTiming.liquidityPass,true);
 assert.equal(row.entryTiming.averageDollarVolume20,timing.averageDollarVolume20);
 assert.equal(reviewed.recommendation.entryTiming.liquiditySessions,0,'Generic reviewed decision remains exactly on its independent original evidence');
 assert.equal(reviewed.recommendation.entryTiming.liquidityPass,false);
 assert(!['Buy','Strong Buy'].includes(row.recommendation.displayLabel),'Canonical C1 transport cannot manufacture a generic purchase recommendation');
 // Existing current quote, event, momentum and gap checks still determine the
 // C1 rating. Server account/opening authority remains independently required.
 const events=currentEventEvidenceFor(symbols,now),verified=body.stocks.filter(row=>symbols.includes(row.symbol)).map(row=>({...row,eventRisk:events.find(event=>event.symbol===row.symbol)}));
 const classify=rows=>classifyC1StockScreen({snapshot,rows,current:true});
 assert.equal(classify(verified).filter(row=>row.rating==='Buy').length,3,'Otherwise verified C1 candidates can use their accepted canonical liquidity result');
 const missingEvent=copy(verified);missingEvent[0].eventRisk={status:'Manual',blockNewCapital:true,checkComplete:false};
 assert.equal(classify(missingEvent)[0].rating,'Watch','Current events remain fail-closed');
 const missingQuote=copy(verified);missingQuote[0].expertDecision={metrics:{quoteFreshnessPass:false}};
 missingQuote[0].recommendation={...missingQuote[0].recommendation,expertDecision:missingQuote[0].expertDecision};
 assert.equal(classify(missingQuote)[0].rating,'Watch','Current quote verification remains mandatory');
 const gap=copy(verified);gap[0].price=104;
 assert.equal(classify(gap)[0].rating,'Watch','Opening-gap limits remain unchanged');
 const momentum=copy(snapshot);momentum.candidates[0].recentMomentumGate.entryAllowed=false;
 assert.equal(classifyC1StockScreen({snapshot:momentum,rows:verified,current:true})[0].rating,'Watch','Accepted recent-momentum entry trigger remains mandatory');
 const cases=[
 ['explicit short count',({source})=>{source.candidates[0].sourceTiming.liquiditySessions=10;}],
 ['explicit zero count',({source})=>{source.candidates[0].sourceTiming.liquiditySessions=0;}],
 ['false canonical verification',({source})=>{source.candidates[0].sourceTiming.liquidityVerified=false;}],
 ['missing canonical verification',({source})=>{delete source.candidates[0].sourceTiming.liquidityVerified;}],
 ['false canonical pass',({source})=>{source.candidates[0].sourceTiming.liquidityPass=false;}],
 ['below C1 dollar-volume floor',({source})=>{source.candidates[0].sourceTiming.averageDollarVolume20=299999999;}],
 ['nonfinite average',({source})=>{source.candidates[0].sourceTiming.averageDollarVolume20=NaN;}],
 ['stale timing date',({source})=>{source.candidates[0].sourceTiming.asOf=previousMarketSessionDay(date);}],
 ['missing timing date',({source})=>{delete source.candidates[0].sourceTiming.asOf;}],
 ['stale timing receipt',({source})=>{source.candidates[0].sourceTiming.staleVerification=true;}],
 ['inconsistent lookback',({source})=>{source.candidates[0].sourceTiming.liquidityLookbackSessions=10;}],
 ['incomplete accepted scan',({source})=>{source.scan.complete=false;}],
 ['mismatched accepted source',({source})=>{source.sourceSessionDate=previousMarketSessionDay(date);}],
 ['stale production source',({snapshot})=>{snapshot.sourceSessionDate=previousMarketSessionDay(date);}],
 ];
 for(const [label,edit] of cases){const {row}=await screen(edit);assert.notEqual(row.entryTiming.liquidityPass,true,label+' cannot receive canonical liquidity acceptance');}
 for(const [label,edit] of [
  ['explicit stale timing',timing=>{timing.stale=true;}],
  ['fallback timing',timing=>{timing.staleFallback=true;}],
  ['stale verification',timing=>{timing.staleVerification=true;}],
  ['fallback client',timing=>{timing.clientSnapshotFallback=true;}],
  ['stale feed',timing=>{timing.dataFeedSnapshotStale=true;}],
  ['noncurrent timing',timing=>{timing.current=false;}],
  ['stale freshness',timing=>{timing.freshness={stale:true};}],
  ['missing explicit verification',timing=>{delete timing.liquidityVerified;}],
 ]){
  const history=copy(accepted);edit(history.at(-1).signals[0].entryTiming);
  const result=await screen(()=>{},history);
  assert.notEqual(result.row.entryTiming.liquidityPass,true,label+' survives raw accepted signal -> snapshot -> real producer');
 }
 assert.equal(JSON.stringify(accepted),inputBytes,'Producer transport cannot modify accepted history');
 console.log('PASS: real HTTP producer preserves exact-current accepted C1 liquidity without inventing missing counts; generic review remains unchanged; explicit counts, failed/stale/incomplete receipts and all independent C1 entry/event/quote/gap checks remain enforced.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});

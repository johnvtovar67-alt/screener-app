// Offline characterization of the existing event-dependent capacity exception.
// All account facts, events, factors and quotes are synthetic. A hypothetical
// fixture purchase does not establish eligibility for any production account.
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {createWorkflowFixture}=require('./fixtures/c1-trading-workflow.cjs');
const clone=value=>JSON.parse(JSON.stringify(value));
const originalFetch=global.fetch;
let liveFetchCalls=0,collectionCalls=0;
global.fetch=async()=>{liveFetchCalls++;throw Error('External access forbidden in position-limit dependency regression');};

const portfolio=[...['BBB','CCC','LLL'].map(symbol=>({symbol,role:'Swing',shares:40,avgCost:100,openedAt:'2026-10-14'})),{symbol:'CASH',role:'Swing',shares:8000,avgCost:1}];
const clear={status:'Clear',blockNewCapital:false,manualCheckRequired:false,checkComplete:true,
 earningsCheckComplete:true,mergerCheckComplete:true,newsCheckComplete:true};
const unavailable={status:'Manual',blockNewCapital:true,manualCheckRequired:true,checkComplete:false,
 earningsCheckComplete:false,mergerCheckComplete:false,newsCheckComplete:false};
const adverse={...clear,status:'Blocked',blockNewCapital:true};
const targetRows=f=>[...f.sessions[220].positionSignals,...f.sessions[220].signals].filter(row=>row.symbol==='CRWD');
function fixture(){
 const f=createWorkflowFixture('buy',{portfolio});
 for(const session of f.sessions){
  for(const row of [...session.prices,...session.signals,...session.positionSignals])if(row.symbol==='MRNA'){
   row.symbol='CRWD';
   if(row.entryTiming){row.entryTiming.symbol='CRWD';row.sector='Technology';}
  }
  session.universeSymbols=session.universeSymbols.map(symbol=>symbol==='MRNA'?'CRWD':symbol);
 }
 for(const row of targetRows(f))row.researchFactors.volatility60Pct=72.65;
 f.setCash(5000);
 return f;
}
function event(f,risk){for(const row of targetRows(f))row.eventRisk=clone(risk);}
function opening(f){
 const result=f.opening();
 return {...result,prices:result.prices.map(row=>row.symbol==='MRNA'?{...row,symbol:'CRWD'}:row)};
}
function validator(f){
 // Run the real opening validator, without importing the research/Blob graph.
 // Only its existing market-clock dependencies are supplied; no provider or
 // account endpoint is called and no validation predicate is copied here.
 const source=fs.readFileSync('lib/c1AccountOpeningProvider.js','utf8');
 const start=source.indexOf('const canonicalSymbol='),end=source.indexOf('export async function collectC1AccountOpening(');
 assert(start>=0&&end>start,'The real opening-validation boundary must remain available');
 const context={...f.loader.load('lib/marketSession.js'),Date};
 vm.createContext(context);
 vm.runInContext(source.slice(start,end).replace('export function ','function ')+';globalThis.validate=validateC1OpeningObservations;',context);
 return context.validate;
}
function collector(f,{missing=false,stale=false}={}){
 const validate=validator(f);
 return async({baseline,symbols,now})=>{
  collectionCalls++;
  assert(symbols.includes('CRWD'),'The native-eligible target must genuinely be requested');
  const source=new Map([...baseline.positionSignals,...baseline.signals].map(row=>[row.symbol,row]));
  const members=baseline.universeSymbols.map(symbol=>({symbol,sector:source.get(symbol)?.sector||'Synthetic sector'}));
  const prices=new Map(opening(f).prices.map(row=>[row.symbol,row]));
  const observations={};
  for(const symbol of symbols){
   const row=prices.get(symbol);assert(row,'Only existing fixture quotes may be requested');
   observations[symbol]={anchor:baseline.prices.find(price=>price.symbol===symbol),
    quote:missing&&symbol==='CRWD'?undefined:{symbol,open:row.open,price:row.observedPrice,
     timestamp:now.getTime()/1000-(stale&&symbol==='CRWD'?121:0)}};
  }
  return validate({baseline,symbols,membersBefore:members,membersAfter:members,observations,now});
 };
}
const buys=view=>(view.openingPlan?.orders||[]).filter(order=>order.side==='buy'&&order.symbol==='CRWD');
const reviews=view=>(view.openingPlan?.entryReviews||[]).filter(row=>row.symbol==='CRWD');
async function prepare(f,options){
 const before=JSON.stringify({account:f.account,book:f.book});
 const result=await f.loader.load('lib/c1AccountExecutionView.js').prepareC1AccountExecution({account:f.account,book:f.book,now:f.now,collectOpening:collector(f,options)});
 assert.equal(JSON.stringify({account:f.account,book:f.book}),before,'Preparation cannot mutate the synthetic account or accepted input');
 assert.equal(f.writes,0,'No account persistence is permitted');
 for(const row of targetRows(f))assert.equal(row.researchFactors.volatility60Pct,72.65,'The same native volatility component remains unchanged');
 for(const config of Object.values(f.loader.load('lib/c1FrozenOptions.js').C1_FROZEN_OPTIONS)){
  assert.equal(config.maxPositions,3);assert.equal(config.maxVolatility60Pct,100);
 }
 return result;
}

async function main(){
 const f=fixture(),accountBefore=JSON.stringify(f.account);
 event(f,unavailable);
 const blocked=await prepare(f);
 assert.equal(blocked.manualRecommendations.status,'ready','A completed account review can return no target purchase');
 assert.equal(buys(blocked).length,0);
 assert(!blocked.openingPlan.additionalSwingCapacity.symbols.includes('CRWD'));
 assert.match(blocked.openingPlan.additionalSwingCapacity.reviews.find(row=>row.symbol==='CRWD').reason,/material-event block/);
 assert(reviews(blocked).some(row=>row.reason==='position-limit'),'Missing event evidence must deny capacity and expose the existing position rejection');

 // Change only synthetic event evidence. Ownership, cash, counts, prices,
 // momentum and volatility remain identical; no actual activity is recorded.
 event(f,clear);
 const qualified=await prepare(f);
 assert.equal(qualified.manualRecommendations.status,'ready');
 assert(qualified.openingPlan.additionalSwingCapacity.symbols.includes('CRWD'));
 assert(buys(qualified).length>0,'The unchanged existing capacity exception can qualify this synthetic case');
 assert(buys(qualified).every(order=>order.additionalCapacity===true&&order.additionalCapacityEvidence.symbol==='CRWD'));
 assert(!reviews(qualified).some(row=>row.reason==='position-limit'),'The earlier POSITION_LIMIT is not counterfactually independent of event qualification');
 assert.deepEqual(clone(qualified.openingPlan.openingBooks),clone(blocked.openingPlan.openingBooks),'Both reviews start with exactly the same per-sleeve books');
 assert.deepEqual(clone(qualified.decision.positions),clone(blocked.decision.positions),'No hypothetical purchase becomes recorded ownership');
 assert.equal(JSON.stringify(f.account),accountBefore);

 // With the existing exception disabled, the same clear evidence cannot waive
 // the ordinary sleeve position maximum. Exercise the real planner/replay.
 const ordinary=f.loader.load('lib/c1AccountExecution.js').planC1ContinuedAccountOpening({adoption:f.account.adoption,
  sessions:[f.sessions[220]],historySessions:f.sessions.slice(0,221),records:f.account.records,cashReconciliations:f.account.cashReconciliations,
  opening:opening(f),observedAt:f.now.toISOString(),purchaseFundingIndependent:true,additionalSwingCapacity:false});
 assert(!ordinary.orders.some(order=>order.side==='buy'&&order.symbol==='CRWD'));
 assert(ordinary.entryReviews.some(row=>row.symbol==='CRWD'&&row.reason==='position-limit'),'Ordinary position limits still reject without the qualified exception');

 event(f,adverse);
 const genuine=await prepare(f);
 assert.equal(buys(genuine).length,0);
 assert(!genuine.openingPlan.additionalSwingCapacity.symbols.includes('CRWD'));
 assert(reviews(genuine).some(row=>row.reason==='position-limit'));
 event(f,clear);
 for(const control of [{missing:true},{stale:true}]){
  const unavailableQuote=await prepare(f,control);
  assert.equal(unavailableQuote.openingPlan,null,'Missing or 121-second stale requested quote must fail the real opening validator');
  assert.match(unavailableQuote.openingError,/Fresh opening quote missing for CRWD/);
  assert.equal(unavailableQuote.manualRecommendations.status,'waiting');
  assert.equal(buys(unavailableQuote).length,0);
 }

 // The capacity exception does not bypass the independent sector-position
 // limit. Keep the same number of synthetic holdings but occupy two Technology
 // names in each sleeve, while CRWD still qualifies for capacity selection.
 const sector=fixture();event(sector,clear);
 for(const seed of Object.values(sector.account.adoption.seeds))for(const position of seed.positions)if(['BBB','CCC'].includes(position.symbol)){
  position.sector='Technology';position.stock.sector='Technology';
 }
 for(const row of [...sector.sessions[220].positionSignals,...sector.sessions[220].signals])if(['BBB','CCC'].includes(row.symbol))row.sector='Technology';
 const sectorBlocked=await prepare(sector);
 assert(sectorBlocked.openingPlan.additionalSwingCapacity.symbols.includes('CRWD'),'The sector control must retain capacity qualification');
 assert.equal(buys(sectorBlocked).length,0);
 assert(reviews(sectorBlocked).some(row=>row.reason==='sector-position-limit'),'Existing sector-position limits remain effective');
 assert.equal(JSON.stringify(f.account),accountBefore);
 assert.equal(liveFetchCalls,0);assert.equal(collectionCalls,6);
 console.log('PASS: synthetic Manual event evidence yields POSITION_LIMIT; complete clear evidence can qualify the existing capacity exception with identical account books and volatility 72.65. Genuine events, missing/stale quotes, ordinary and sector-position limits remain blocked; no production eligibility or account write is implied.');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{global.fetch=originalFetch;});

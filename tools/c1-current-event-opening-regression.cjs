// Offline current-event integration with actual C1 opening, replay and manual
// review code. Every observation/account is synthetic; no live eligibility is
// claimed and no provider/account/storage endpoint is called.
const assert=require('node:assert/strict');
const {createWorkflowFixture}=require('./fixtures/c1-trading-workflow.cjs');
const clone=value=>JSON.parse(JSON.stringify(value));
const originalFetch=global.fetch;
let externalCalls=0;
global.fetch=async()=>{externalCalls++;throw Error('External requests forbidden in current-event opening regression');};
const fullPortfolio=[...['BBB','CCC','LLL'].map(symbol=>({symbol,role:'Swing',shares:40,avgCost:100,openedAt:'2026-10-14'})),{symbol:'CASH',role:'Swing',shares:8000,avgCost:1}];
const historicalManual={status:'Manual',blockNewCapital:true,manualCheckRequired:true,checkComplete:false,
 earningsCheckComplete:false,mergerCheckComplete:false,newsCheckComplete:false};
const kinds=[['EARNINGS','earnings-calendar',15],['MERGERS','mergers-acquisitions-latest',60],['NEWS','news/stock',5]];
function risk(symbol,now,{state='VERIFIED_CLEAR',status='Clear',expiresAt,patch={}}={}){
 const observedAt=now.toISOString(),until=expiresAt||new Date(now.getTime()+5*60000).toISOString();
 const complete=state!=='UNVERIFIED',blocked=state!=='VERIFIED_CLEAR';
 return {symbol,status:state==='UNVERIFIED'?'Manual':status==='Clear'&&blocked?'Blocked':status,
  blockNewCapital:blocked,manualCheckRequired:!complete,checkComplete:complete,eventRiskVerified:complete,
  earningsCheckComplete:complete,mergerCheckComplete:complete,newsCheckComplete:complete,reduceConviction:status==='Caution',
  materialNews:[],materialCatalysts:[],eventVerification:{contract:'c1-current-event-evidence-v1',state,provider:'FMP',observedAt,expiresAt:until,
   sources:kinds.map(([kind,endpoint,minutes])=>({kind,provider:'FMP',endpoint,complete,reason:complete?'OK':'UNAVAILABLE',fetchedAt:observedAt,
    expiresAt:new Date(now.getTime()+minutes*60000).toISOString(),status:'live'}))},...patch};
}
function fixture({full=true,target='CRWD',volatility=72.65}={}){
 const f=createWorkflowFixture('buy',full?{portfolio:fullPortfolio}:{});
 if(target==='CRWD')for(const session of f.sessions){
  for(const row of [...session.prices,...session.signals,...session.positionSignals])if(row.symbol==='MRNA'){
   row.symbol='CRWD';if(row.entryTiming){row.entryTiming.symbol='CRWD';row.sector='Technology';}
  }
  session.universeSymbols=session.universeSymbols.map(symbol=>symbol==='MRNA'?'CRWD':symbol);
 }
 for(const row of [...f.sessions[220].signals,...f.sessions[220].positionSignals])if(row.symbol===target){
  row.researchFactors.volatility60Pct=volatility;row.eventRisk=clone(historicalManual);row.eventRiskVerified=false;
 }
 f.setCash(5000);return f;
}
function collect(f,target,mode,requests,account){
 return async args=>{
  const required=f.service.deriveC1AccountAnalysis({account,book:f.book,now:f.now}).decision.requiredOpeningSymbols;
  // The invocation captures the exact real planner request; returning no extra
  // symbols protects the established missing-opening coverage boundary.
  requests.push([...args.symbols]);
  assert.deepEqual(clone(args.symbols),clone(required),'Current events must not expand quote collection');
  const raw=f.opening(),prices=raw.prices.map(row=>target==='CRWD'&&row.symbol==='MRNA'?{...row,symbol:'CRWD'}:row)
   .filter(row=>args.symbols.includes(row.symbol));
  let currentEventEvidence=args.symbols.map(symbol=>risk(symbol,f.now));
  const index=currentEventEvidence.findIndex(row=>row.symbol===target);
  if(mode==='missing')currentEventEvidence=currentEventEvidence.filter(row=>row.symbol!==target);
  if(mode==='failed')currentEventEvidence=[];
  if(index>=0&&mode==='blocked')currentEventEvidence[index]=risk(target,f.now,{state:'VERIFIED_BLOCKED'});
  if(index>=0&&mode==='unverified')currentEventEvidence[index]=risk(target,f.now,{state:'UNVERIFIED'});
  if(index>=0&&mode==='stale'){
   currentEventEvidence[index]=risk(target,f.now,{expiresAt:new Date(f.now.getTime()-1).toISOString()});
   for(const source of currentEventEvidence[index].eventVerification.sources)source.expiresAt=new Date(f.now.getTime()-1).toISOString();
  }
  if(index>=0&&mode==='contradictory')currentEventEvidence[index]=risk(target,f.now,{patch:{blockNewCapital:true}});
  if(index>=0&&mode==='caution')currentEventEvidence[index]=risk(target,f.now,{status:'Caution'});
  const result={...raw,prices,currentEventEvidence};
  if(mode==='absent')delete result.currentEventEvidence;
  return result;
 };
}
async function prepare(f,{target='CRWD',mode='clear',account=f.account,ticket}={}){
 const before=JSON.stringify({account,book:f.book}),requests=[];
 const execution=f.loader.load('lib/c1AccountExecutionView.js');
 const view=await execution.prepareC1AccountExecution({account,book:f.book,now:f.now,collectOpening:collect(f,target,mode,requests,account),
  ...(ticket?{recordTicket:ticket,expectedRevision:account.revision}:{})});
 assert.equal(JSON.stringify({account,book:f.book}),before,'The current review cannot rewrite its account or accepted source inputs');
 assert.equal(requests.length,1,'Each review must collect once and reuse observations across all sleeves/replans');
 assert.equal(f.writes,0,'No synthetic account is persisted');assert.equal(externalCalls,0);
 return {view,requests};
}
const purchases=(view,target='CRWD')=>(view.openingPlan?.orders||[]).filter(row=>row.side==='buy'&&row.symbol===target);
const capacity=(view,target='CRWD')=>view.openingPlan?.additionalSwingCapacity?.symbols.includes(target);
function noEventPayload(value){
 const text=JSON.stringify(value);
 assert.doesNotMatch(text,/currentEventEvidence|eventVerification|c1-current-event-evidence-v1/,'Current provider evidence must not enter saved account/plan evidence');
}

async function main(){
 const f=fixture(),starting=JSON.stringify(f.account),source=JSON.stringify(f.book);
 const {view:unverified}=await prepare(f,{mode:'unverified'});
 assert(unverified.openingPlan);assert.equal(purchases(unverified).length,0);assert.equal(capacity(unverified),false);
 assert(unverified.openingPlan.entryReviews.some(row=>row.symbol==='CRWD'&&row.reason==='position-limit'));
 const {view:clear}=await prepare(f);
 assert.equal(clear.manualRecommendations.status,'ready');assert.equal(capacity(clear),true);
 assert(purchases(clear).length>0,'Verified clear current evidence can resolve historical Manual for the existing capacity exception');
 assert(purchases(clear).every(row=>row.additionalCapacity===true));
 assert.deepEqual(clone(clear.openingPlan.openingBooks),clone(unverified.openingPlan.openingBooks));
 assert.equal(JSON.stringify(f.account),starting);assert.equal(JSON.stringify(f.book),source);
 noEventPayload(clear.account);noEventPayload(clear.openingPlan);
 const expiresAt=new Date(f.now.getTime()+5*60000).toISOString();
 assert(Date.parse(clear.manualRecommendations.validUntil)<=Date.parse(expiresAt),'Manual authority must expire with its earliest mandatory current-event source');
 assert.equal(f.loader.load('lib/c1ManualRecommendations.js').c1ManualReviewCurrent(clear.manualRecommendations,clear.executionDecision,new Date(expiresAt)),false);

 // An ordinary native entry has room and would bypass the capacity exception;
 // the new current-event check must still veto every unverified/adverse Buy.
 const ordinary=fixture({full:false});
 const {view:ordinaryClear}=await prepare(ordinary);
 assert(purchases(ordinaryClear).some(row=>row.additionalCapacity!==true),'The control must exercise an ordinary native entry');
 for(const mode of ['blocked','unverified','missing','failed','absent','stale','contradictory']){
  const {view}=await prepare(ordinary,{mode});
  assert.equal(purchases(view).length,0,mode+' current evidence must block ordinary Buy orders');
  noEventPayload(view.account);if(view.openingPlan)noEventPayload(view.openingPlan);
 }
 const {view:caution}=await prepare(ordinary,{mode:'caution'});
 assert(purchases(caution).length>0,'Verified caution retains the existing nonblocking policy');

 // Clear event evidence cannot introduce the native-ineligible MRNA into the
 // quote request or bypass its unchanged 100% volatility maximum.
 const mrna=fixture({target:'MRNA',volatility:373.2866}),mrnaBefore=JSON.stringify(mrna.account);
 const {view:mrnaView,requests:mrnaRequests}=await prepare(mrna,{target:'MRNA'});
 assert(!mrnaRequests[0].includes('MRNA'));assert.equal(purchases(mrnaView,'MRNA').length,0);
 for(const config of Object.values(mrna.loader.load('lib/c1FrozenOptions.js').C1_FROZEN_OPTIONS))assert.equal(config.maxVolatility60Pct,100);
 assert.equal(JSON.stringify(mrna.account),mrnaBefore);

 // Model one explicitly supplied synthetic fill in memory only. Its original
 // economics must survive a later adverse current check, while new unfilled
 // capital is withdrawn and provider evidence remains request-local.
 const shares=purchases(clear).reduce((total,row)=>total+row.shares,0);
 const ticket={id:'offline-current-event-fill',symbol:'CRWD',side:'buy',shares:Math.max(1,Math.floor(shares/2)),price:100.12,fee:0,executedAt:f.now.toISOString()};
 assert(shares>ticket.shares,'The synthetic fill must leave a genuine unfilled purchase remainder');
 const {view:recorded}=await prepare(f,{ticket});
 assert.equal(JSON.stringify(f.account),starting,'A returned synthetic fill does not persist into the fixture account');
 const posted=clone(recorded.account.intradayActivity.fills),postedTickets=clone(recorded.account.intradayActivity.tickets),recordedBefore=JSON.stringify(recorded.account);
 assert(posted.length>0);noEventPayload(recorded.account);noEventPayload(recorded.account.intradayActivity.plan);
 const {view:later}=await prepare(f,{account:recorded.account,mode:'blocked'});
 assert.deepEqual(clone(later.account.intradayActivity.fills),posted);assert.deepEqual(clone(later.account.intradayActivity.tickets),postedTickets);
 assert.equal(purchases(later).length,0);noEventPayload(later.account);
 await assert.rejects(()=>prepare(f,{account:recorded.account,mode:'blocked',ticket:{...ticket,id:'offline-current-event-denied-add',shares:1}}),/event|current|verification|remaining C1 quantity|authorized/i);
 assert.equal(JSON.stringify(recorded.account),recordedBefore,'A rejected new purchase cannot mutate previously posted synthetic facts');
 const ordinaryShares=purchases(ordinaryClear).reduce((total,row)=>total+row.shares,0);
 const ordinaryTicket={...ticket,id:'offline-current-event-ordinary-fill',shares:1};
 assert(ordinaryShares>ordinaryTicket.shares,'The ordinary entry must also retain a real unfilled remainder');
 const {view:ordinaryRecorded}=await prepare(ordinary,{ticket:ordinaryTicket});
 const ordinaryPosted=JSON.stringify(ordinaryRecorded.account);
 await assert.rejects(()=>prepare(ordinary,{account:ordinaryRecorded.account,mode:'blocked',ticket:{...ordinaryTicket,id:'offline-current-event-ordinary-denied-add'}}),/event|current|verification|remaining C1 quantity|authorized/i);
 assert.equal(JSON.stringify(ordinaryRecorded.account),ordinaryPosted,'The adverse-event recording veto must preserve prior ordinary fills exactly');
 noEventPayload(ordinaryRecorded.account);
 assert.equal(JSON.stringify(f.account),starting);assert.equal(JSON.stringify(f.book),source);
 assert.equal(f.writes,0);assert.equal(externalCalls,0);
 console.log('PASS: current verified event evidence replaces historical Manual only prospectively; capacity and ordinary buys fail closed on adverse/missing/stale/contradictory evidence, review expiry is bounded, MRNA volatility and quote scope remain unchanged, and original account/history/fills retain exact economics without persisted event payloads.');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{global.fetch=originalFetch;});

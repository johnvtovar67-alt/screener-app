// Synthetic read-only stop presentation checks. No providers, stores or research runs.
const assert=require('node:assert/strict');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const {c1PositionPresentation:present,c1RecordedSellInstruction:sell}=loader.load('lib/c1PositionPresentation.js');
const {c1PlainDecisionReason:copy,c1HoldingTiming:timing}=loader.load('lib/c1DecisionCopy.js');
const now=new Date('2026-11-03T16:00:00.000Z');
let count=0;
function equal(actual,expected,label){count++;assert.equal(actual,expected,label);}
function matches(value,expected,label){count++;assert.match(value,expected,label);}
function position(patch={}){return {symbol:'SYNA',role:'Swing',shares:36,avgCost:300,openedAt:'2026-11-03',stops:[
 {sleeve:'base',shares:10,price:240},{sleeve:'cooldown15',shares:17,price:230},{sleeve:'sector40',shares:9,price:225}],
 exits:[],recentMomentumReviews:[{sleeve:'base',available:false}],reviewRules:[{sleeve:'base',close:250,heldSessions:0,minimumHold:30}],...patch};}
function quote(price=228,patch={}){const row={symbol:'SYNA',role:'Swing',price,timestamp:Date.parse('2026-11-03T15:59:30Z')/1000,
 _fmpQuoteProvider:'FMP',_fmpQuoteEndpoint:'quote',_fmpQuoteCache:'live',_fmpQuoteFetchedAt:'2026-11-03T16:00:00.000Z',...patch};
 if(!Object.hasOwn(patch,'_fmpQuoteObservation'))row._fmpQuoteObservation={provider:'FMP',endpoint:'stable/quote',symbol:row.symbol,price:row.price,timestamp:row.timestamp,fetchedAt:row._fmpQuoteFetchedAt};
 return row;}
function args(p=position(),s=quote(),patch={}){const decision={contract:'c1-account-decision-v1',revision:7,decisionId:'synthetic:7',current:true,sourceSessionDate:'2026-11-02',positions:[p]};return {decision,position:p,symbol:p.symbol,stock:s,now,...patch};}
const input=args(),before=JSON.stringify(input),result=present(input);
equal(result.label,'SELL — STOP TRIGGERED','Fresh breach does not wait for holding age, unavailable momentum or a purchase plan');
equal(result.quoteVerified,true,'Fresh provider proof is retained');
equal(result.verifyStopNeeded,false,'Verified Sell needs no additional stop verification');
equal(sell(input.position,result).shares,27,'Only the two breached sleeves are included');
equal(JSON.stringify(input),before,'Read-only presentation preserves all account and quote inputs');
equal(present(args(position(),quote(230))).label,'SELL — STOP TRIGGERED','The exact stop boundary is inclusive');
equal(sell(position(),present(args(position(),quote(240)))).shares,10,'An exact higher-sleeve boundary does not sell unaffected sleeves');
equal(present(args(position(),quote(241))).label,'HOLD','Verified recovery above every stop retains existing nonlatched Hold behavior');
const mixed=position({exits:[{sleeve:'sector40',shares:9,reason:'recent-momentum-deterioration'}]});
equal(sell(mixed,present(args(mixed))).shares,36,'Accepted exits are combined with newly breached sleeves');
const bounded=position({exits:[{sleeve:'base',shares:90,reason:'initial-stop'}]});
equal(sell(bounded,present(args(bounded))).shares,27,'Accepted or new exits remain bounded by each recorded sleeve quantity');
for(const [name,stock,reason] of [
 ['missing timestamp',quote(228,{timestamp:undefined}),/timestamp.*missing/i],
 ['missing observation',quote(228,{_fmpQuoteObservation:undefined}),/observation.*missing/i],
 ['expired quote',quote(228,{timestamp:Date.parse('2026-11-03T15:57:59Z')/1000}),/window|expired/i],
 ['fallback',quote(228,{staleFallback:true}),/fallback/i],
 ['mismatched provenance',quote(228,{_fmpQuoteObservation:{provider:'FMP'}}),/provenance.*match/i],
 ['future',quote(228,{timestamp:Date.parse('2026-11-03T16:00:01Z')/1000}),/future/i],
 ]){
 const p=present(args(position(),stock));
 equal(p.label,'VERIFY STOP URGENTLY',name+' stays urgent without inventing Sell');
 equal(p.stopTriggered,false,name+' cannot manufacture a verified trigger');
 matches(p.verificationReason,reason,name+' explains the failed check');
 equal(p.verifyStopNeeded,true,name+' exposes direct verification action state');
 matches(copy({action:p.label,presentation:p,position:position()}),/Quote (observed|timestamp unavailable)/,name+' shows quote timestamp status');
}
for(const [name,p,s]of [['missing price',position(),quote(null)],['missing stop',position({stops:[]}),quote(228)],['partial stop',position({stops:[{sleeve:'base',shares:9,price:null}]}),quote(228)]]){
 const result=present(args(p,s));equal(result.label,'STOP STATUS UNVERIFIED',name+' never implies Hold');equal(result.canAdd,false,name+' cannot authorize Add');}
equal(present({...args(),decision:null,position:undefined}).label,'STOP STATUS UNVERIFIED','Missing reconciled ownership cannot imply Hold');
const extended=present(args(position(),quote(228,{timestamp:Date.parse('2026-11-03T13:00:00Z')/1000,_fmpQuoteFetchedAt:'2026-11-03T13:00:30Z'}),{now:new Date('2026-11-03T13:00:30Z')}));
equal(extended.label,'VERIFY STOP URGENTLY','Extended-hours observation cannot confirm a regular-session trigger');
matches(extended.verificationReason,/premarket/i,'Extended-hours failure is identified');
const expired=present({...input,now:new Date('2026-11-03T16:01:30.001Z')});
equal(expired.label,'VERIFY STOP URGENTLY','Transient Sell expires without a permanent trigger latch');
equal(expired.quoteAt,'2026-11-03T15:59:30.000Z','Expired observation time remains visible');
const pending=position({exits:[{sleeve:'base',shares:9,reason:'initial-stop'}]});
equal(present(args(pending,quote(250,{timestamp:undefined}))).label,'SELL — STOP TRIGGERED','Accepted pending stop survives missing current proof or recovery');
const base=args(),advisory={kind:'intraday-advisory',sourceSessionDate:'2026-11-02',observedAt:'2026-11-03T15:59:30.000Z',price:245,completedConfirmationsUnchanged:true};
const conflict=present({...base,executionDecision:{...base.decision,positions:[{...base.position,intradayMomentumAdvisory:advisory}]}});
equal(conflict.label,'VERIFY STOP URGENTLY','Conflicting equal-time observations do not create Sell');
matches(conflict.verificationReason,/conflicting/i,'Conflicting observations have a specific explanation');
const staleRevision=present({...args(position(),quote(228,{timestamp:undefined})),executionDecision:{...base.decision,revision:8,positions:[{...base.position,intradayMomentumAdvisory:{...advisory,price:228}}]}});
equal(staleRevision.label,'VERIFY STOP URGENTLY','Another ownership revision cannot supply current quote evidence');
equal(staleRevision.quoteVerified,false,'Superseded advisory cannot attach a verified Sell to current holdings');
const lines=timing({position:position(),presentation:expired,current:true});
matches(lines.join('\n'),/STOP STATUS UNVERIFIED/,'Timing details do not describe missing current proof as a safe stop state');
equal(present(args(position({role:'Core'}),quote(228,{role:'Core'}))),null,'Core remains outside Swing stop presentation');
{
 const input=args(position(),quote(250),{requireOpeningReview:true});
 const order={id:'base:opening-exit',symbol:'SYNA',side:'sell',reason:'portfolio-drawdown-stop',sleeve:'base',shares:10,estimatedPrice:250};
 const plan={providerVerified:true,date:'2026-11-03',sourceSessionDate:'2026-11-02',observedAt:now.toISOString(),orders:[order]};
 const review={policy:'c1-owner-authorized-manual-20260911',status:'ready',date:plan.date,sourceSessionDate:plan.sourceSessionDate,
  observedAt:plan.observedAt,validUntil:'2026-11-03T16:01:00Z',decisionId:input.decision.decisionId,revision:input.decision.revision,orders:[order]};
 equal(present({...input,openingPlan:plan,manualRecommendations:review}).label,'SELL','Current opening exit appears');
 equal(sell(input.position,present({...input,openingPlan:plan,manualRecommendations:review})).shares,10,'Only the checked opening exit sleeve supplies its ten shares');
 for(const patch of [{},{openingPlan:null,manualRecommendations:{status:'waiting'}},
  {openingPlan:plan,manualRecommendations:{...review,validUntil:now.toISOString()}},
  {openingPlan:{...plan,providerVerified:false},manualRecommendations:review},
  {openingPlan:{...plan,sourceSessionDate:'2026-10-30'},manualRecommendations:review},
  {openingPlan:{...plan,observedAt:'2026-11-03T15:59:10Z'},manualRecommendations:review},
  {openingPlan:plan,manualRecommendations:{...review,orders:[{...order,sleeve:'sector40'}]}},
  {openingPlan:plan,manualRecommendations:{...review,orders:[order,{...order,id:'second',sleeve:'sector40'}]}},
  {openingPlan:plan,manualRecommendations:{...review,orders:[]}},
  {openingPlan:{...plan,orders:[]},manualRecommendations:review}]){
  equal(present({...input,...patch}).label,'EXIT REVIEW PENDING','An unavailable or inconsistent review cannot publish HOLD');
 }
 equal(present({...input,openingPlan:{...plan,orders:[]},manualRecommendations:{...review,orders:[]}}).label,'HOLD','A current matching review can clear the pending state');
 equal(present({...input,position:position({exits:[order]})}).label,'SELL','A recorded exit survives an interrupted review');
 equal(present({...input,stock:quote(228)}).label,'SELL — STOP TRIGGERED','Fresh stop breach takes priority');
}
console.log(`PASS: ${count} stop-verification presentation assertions (synthetic; no account writes).`);

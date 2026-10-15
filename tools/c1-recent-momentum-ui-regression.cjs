// Offline decision/presentation integration; no provider or account is called.
const assert=require('node:assert/strict');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const {buildC1StockScreenSnapshot:screen,classifyC1StockScreen:classify}=loader.load('lib/c1StockClassification.js');
const {buildC1AccountDecision:accountDecision,applyC1OpeningPlan:applyOpening,c1AccountMatchesPortfolio:matches}=loader.load('lib/c1AccountDecision.js');
const {withC1RecentMomentumIntradayAdvisories:advisories,c1RecentMomentumIntradayExplanation:intradayText}=loader.load('lib/c1RecentMomentumLivePolicy.js');
const {evaluateC1RecentMomentum:evaluate}=loader.load('lib/c1RecentMomentumGate.js');
const {c1IntradayDecision:filledDecision}=loader.load('lib/c1IntradayActivity.js');
const {c1OpportunityPresentation:opportunities}=loader.load('lib/c1EntryReview.js');
const {C1_FROZEN_OPTIONS:options}=loader.load('lib/c1FrozenOptions.js');
const copy=value=>JSON.parse(JSON.stringify(value));
let assertions=0;
const eq=(actual,expected,message)=>{assertions++;assert.equal(actual,expected,message);};
const ok=(value,message)=>{assertions++;assert.ok(value,message);};
const same=(actual,expected,message)=>{assertions++;assert.deepEqual(copy(actual),copy(expected),message);};
const near=(actual,expected,message)=>{assertions++;assert.ok(Math.abs(actual-expected)<1e-9,message);};
const dates=['2026-10-07','2026-10-08','2026-10-09','2026-10-12','2026-10-13','2026-10-14'];
const symbols=['AAA','BBB','CCC'],source=dates.at(-1),now=new Date('2026-10-15T14:00:00.000Z');
function history(path=[100,101,102,103,102,101],improving=false){
 return dates.map((date,index)=>({date,decisionAt:date+'T21:00:00.000Z',
  prices:symbols.map((symbol,n)=>{const close=n?100+index*.1:path[index];return {symbol,date,open:close,high:close,low:close,close,adjusted:true};}),
  signals:symbols.map((symbol,n)=>({symbol,companyName:'Issuer '+symbol,sector:'Sector '+n,price:n?100+index*.1:path[index],
   researchFactors:{momentumPercentile:99-n},entryTiming:{available:true,asOf:date,macdImproving:n?true:improving,
    liquidityPass:true,liquidityVerified:true,averageDollarVolume20:500000000}}))}));
}
function screenView(data){
 const snapshot=screen(data.at(-1),now,data);
 const rows=data.at(-1).signals.map(signal=>({...signal,eventRisk:{status:'Passed'},
  recommendation:{expertDecision:{metrics:{quoteFreshnessPass:true}}}}));
 return {snapshot,rows,classified:classify({snapshot,rows,current:true})};
}
function review(data,sleeve='base'){
 return {sleeve,phase:'close-holding',date:source,symbol:'AAA',...evaluate({sessions:data,sessionIndex:5,symbol:'AAA',sleeve,
  position:{symbol:'AAA',positionId:sleeve+':owned',enteredAt:'2026-10-01',entryPrice:100,highWatermark:104,recentMomentumPeakVerified:true}})};
}
function decisionFor(data,sleeveReviews={base:review(data)}){
 const sleeves={},books={};
 for(const [sleeve,evidence] of Object.entries(sleeveReviews)){
  books[sleeve]={cash:1000,positions:{AAA:{shares:10,avgCost:100,openedAt:'2026-10-01'}}};
  sleeves[sleeve]={config:options[sleeve],pendingDecisions:[],openPositions:[{symbol:'AAA',stopPrice:86,lastPrice:data.at(-1).prices[0].close}],recentMomentumDecisions:[evidence]};
 }
 return accountDecision({continued:{contract:'c1-actual-account-continuation-v1',sourceSessionDate:source,
  sleeves,books,actualCash:1000},sourceHash:'accepted-ui-fixture',revision:1,now});
}
function opening(){return {date:'2026-10-15',receipt:{provider:'FMP',membershipCheckedTwice:true,previousAdjustedClosesUnchanged:true},
 prices:[{symbol:'AAA',adjusted:true,open:111,observedPrice:102,observedAt:'2026-10-15T13:59:00.000Z'}]};}

// The same historical rank remains visible, while current weakness controls the
// real rating; clearing the gate restores eligibility without changing ranks.
{
 const weak=history(),healthy=history([100,101,102,103,104,105],true);
 const blocked=screenView(weak),allowed=screenView(healthy);
 eq(blocked.snapshot.candidates[0].researchRank,1,'The weakening stock retains its historical first rank');
 eq(blocked.classified[0].rating,'Watch','Recent weakness changes the actual Buy rating to Watch');
 eq(allowed.classified[0].rating,'Buy','A qualifying high-rank stock can still be bought');
 same(blocked.snapshot.candidates.map(row=>[row.symbol,row.researchRank,row.policyScore]),allowed.snapshot.candidates.map(row=>[row.symbol,row.researchRank,row.policyScore]),'The gate never rewrites historical rank order or scores');
 const recovered=screenView(history([105,104,103,102,100,101],true));
 ok(recovered.snapshot.candidates[0].recentMomentumGate.metrics.ret3<0&&recovered.snapshot.candidates[0].recentMomentumGate.metrics.ret5<0,'The recovery exception is tested before the longer recent windows turn positive');
 eq(recovered.classified[0].rating,'Buy','A positive latest close with improving MACD restores actual Buy eligibility');
 for(const [label,mutate] of [
  ['missing timing',data=>{data.at(-1).signals[0].entryTiming.available=false;}],
  ['stale timing',data=>{data.at(-1).signals[0].entryTiming.staleVerification=true;}],
  ['missing close',data=>{data[2].prices.shift();}],
 ]){
  const data=history([100,101,102,103,104,105],true);mutate(data);
  eq(screenView(data).classified[0].rating,'Watch',`${label} cannot authorize a Buy through a high rank`);
 }
 const noHistory=screen(healthy.at(-1),now,[]);
 eq(classify({snapshot:noHistory,rows:allowed.rows,current:true})[0].rating,'Watch','Missing accepted recent history cannot authorize capital');
 eq(classify({snapshot:allowed.snapshot,rows:allowed.rows,current:false})[0].rating,'Watch','A stale overall screen cannot authorize capital');
}

// Shared Portfolio and Opportunities account actions cannot let a checked Add
// label replace an actual recent-momentum Review.
{
 const weak=decisionFor(history()),healthy=decisionFor(history([100,101,102,103,104,105],true));
 eq(weak.positions[0].action,'Review','A high historical rank cannot manufacture an unqualified Hold');
 ok(/Recent momentum/.test(weak.positions[0].reason),'The holding reason explains the real gate');
 eq(healthy.positions[0].action,'Hold','Verified recovery supports holding under unchanged safeguards');
 const plan={providerVerified:true,sourceSessionDate:source,observedAt:now.toISOString(),orders:[{symbol:'AAA',side:'buy',sleeve:'base',shares:1}]};
 eq(applyOpening(weak,plan).positions[0].action,'Review','An opening Add never overrides current deterioration Review');
 eq(applyOpening(healthy,plan).positions[0].action,'Add candidate','A healthy existing position can retain its checked Add');
 const tiles=opportunities({decision:{...weak,opportunities:[{symbol:'AAA',rating:'Buy'}]},buys:plan.orders,plan,ready:true}).tiles;
 eq(tiles[0].accountAction,'Review','An Opportunities tile uses the same account Review action');
 eq(tiles[0].order,null,'A Buy-rated tile cannot display an Add quantity during account Review');
 const missing=history();missing.at(-1).signals[0].entryTiming.available=false;
 eq(decisionFor(missing).positions[0].action,'Review','Missing evidence cannot be labeled a supported Hold');
 const portfolio=[{symbol:'AAA',role:'Swing',shares:10,avgCost:100,openedAt:'2026-10-01'},
  {symbol:'MSTR',role:'Core',shares:100,avgCost:10,openedAt:'2020-01-02'}];
 eq(matches(healthy,portfolio),true,'The unchanged account ownership comparison keeps Core outside Swing decision scope');
}

// Current intraday evidence uses observedPrice, not the opening price or a later
// close, and cannot mutate the completed-session decision or execution orders.
{
 const decision=decisionFor(history()),quote=opening();
 decision.orders=[{id:'unchanged-sale',symbol:'AAA',side:'sell',shares:1}];
 const before=copy({decision,quote}),view=advisories(decision,quote,now),evidence=view.positions[0].intradayMomentumAdvisory;
 eq(evidence?.price,102,'The advisory uses the already-verified current observed price');
 near(evidence?.changeFromCompletedClosePct,(102/101-1)*100,'Intraday change uses the same accepted completed-close basis');
 eq(view.positions[0].action,'Review','A current observation does not erase completed-session Review');
 same(view.orders,decision.orders,'The advisory cannot change orders');
 same(view.positions[0].recentMomentumReviews,decision.positions[0].recentMomentumReviews,'The advisory cannot advance confirmation, alter peaks or disarm the latch');
 same({decision,quote},before,'Advisory projection preserves all original inputs');
 ok(intradayText(view.positions[0],now)?.includes('does not confirm a completed-session exit'),'The displayed observation is explicitly advisory');
 eq(intradayText(view.positions[0],new Date('2026-10-15T14:01:01Z')),null,'Expired evidence is no longer labeled current');
 const boundary=opening();boundary.prices[0].observedAt='2026-10-15T13:58:00Z';
 ok(advisories(decision,boundary,now).positions[0].intradayMomentumAdvisory,'Exactly 120-second-old verified evidence remains valid');
 for(const [label,mutate] of [
  ['expired',q=>{q.prices[0].observedAt='2026-10-15T13:57:59Z';}],
  ['future',q=>{q.prices[0].observedAt='2026-10-15T14:00:01Z';}],
  ['stale',q=>{q.prices[0].stale=true;}],
  ['fallback',q=>{q.prices[0].staleFallback=true;}],
  ['nested stale',q=>{q.prices[0].freshness={stale:true};}],
  ['client fallback',q=>{q.prices[0].clientSnapshotFallback=true;}],
  ['stale data feed',q=>{q.prices[0].dataFeedSnapshotStale=true;}],
  ['not current',q=>{q.prices[0].current=false;}],
  ['wrong observation date',q=>{q.prices[0].date='2026-10-14';}],
  ['unadjusted',q=>{q.prices[0].adjusted=false;}],
  ['numeric-looking quote',q=>{q.prices[0].observedPrice='102';}],
  ['missing current quote',q=>{delete q.prices[0].observedPrice;}],
  ['duplicate',q=>{q.prices.push(copy(q.prices[0]));}],
  ['unverified membership',q=>{q.receipt.membershipCheckedTwice=false;}],
  ['different provider',q=>{q.receipt.provider='fixture';}],
  ['changed adjusted basis',q=>{q.receipt.previousAdjustedClosesUnchanged=false;q.priceBasisRevisions=[{symbol:'AAA'}];}],
 ]){
  const candidate=opening();mutate(candidate);
  eq(advisories(decision,candidate,now).positions[0].intradayMomentumAdvisory,undefined,`${label} cannot create a current intraday label`);
 }
 eq(advisories({...decision,current:false},quote,now).positions[0].intradayMomentumAdvisory,undefined,'A stale completed decision cannot receive a current intraday label');
 eq(advisories(decision,quote,new Date('2026-10-15T21:00:00Z')).positions[0].intradayMomentumAdvisory,undefined,'After-hours data does not become a current regular-session advisory');
}

// Selling one weak sleeve removes only its review. Remaining healthy ownership
// must not retain Review merely because another sleeve used to own the stock.
{
 const weak=review(history(),'base'),healthy=review(history([100,101,102,103,104,105],true),'cooldown15');
 const decision=decisionFor(history(),{base:weak,cooldown15:healthy});
 eq(decision.positions[0].action,'Review','The mixed position initially includes a weak owned sleeve');
 const activity={plan:{contract:'c1-actual-account-opening-plan-v1',sourceSessionDate:source,date:'2026-10-15',
  openingBooks:{base:{cash:1000,positions:{AAA:{shares:10,avgCost:100,openedAt:'2026-10-01'}}},
   cooldown15:{cash:1000,positions:{AAA:{shares:10,avgCost:100,openedAt:'2026-10-01'}}},sector40:{cash:0,positions:{}}},
  orders:[{id:'sold-weak-base',symbol:'AAA',side:'sell',sleeve:'base',shares:10,reason:'owner-discretionary-exit'}]},
  fills:[{id:'actual-base-sale',orderId:'sold-weak-base',symbol:'AAA',side:'sell',shares:10,price:102,fee:0,executedAt:'2026-10-15T13:45:00Z'}]};
 const before=copy({decision,activity}),view=filledDecision({decision,activity,revision:2,now});
 eq(view.positions[0].shares,10,'Actual fills retain only the surviving sleeve shares');
 same(view.positions[0].recentMomentumReviews.map(row=>row.sleeve),['cooldown15'],'A sold sleeve cannot leave stale deterioration evidence on remaining ownership');
 eq(view.positions[0].action,'Hold','Healthy remaining ownership receives its supported Hold');
 same({decision,activity},before,'Presentation filtering does not rewrite accepted fills or prior evidence');
}

console.log(`PASS: ${assertions} recent-momentum UI and shared-decision assertions.`);

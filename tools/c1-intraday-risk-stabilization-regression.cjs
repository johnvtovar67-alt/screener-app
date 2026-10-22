// Offline checks of verified current stop evidence and prospective capital.
// Synthetic provider observations; no network, storage, or historical reruns.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createRequire}=require('node:module');
const {currentEventEvidenceFor}=require('./fixtures/c1-trading-workflow.cjs');
const fixtureFile=path.resolve('tools/c1-recent-momentum-production-regression.cjs');
const source=fs.readFileSync(fixtureFile,'utf8'),boundary=source.indexOf('// A high historical rank');
if(boundary<0)throw new Error('Production fixture boundary unavailable');
const {testCase,loader}=new Function('require',source.slice(0,boundary)+'\nreturn {testCase,loader};')(createRequire(fixtureFile));
const {withC1RecentMomentumIntradayAdvisories:advisories,c1RecentMomentumIntradayExplanation:explanation}=loader.load('lib/c1RecentMomentumLivePolicy.js');
const {prepareC1AccountExecution:prepare}=loader.load('lib/c1AccountExecutionView.js');
const {verifiedC1OpeningPriceBasis}=loader.load('lib/c1OpeningPriceReview.js');
const clone=value=>JSON.parse(JSON.stringify(value));
let count=0;
const eq=(a,b,message)=>{count++;assert.equal(a,b,message);};
const ok=(value,message)=>{count++;assert.ok(value,message);};
const same=(a,b,message)=>{count++;assert.equal(JSON.stringify(a),JSON.stringify(b),message);};
const near=(a,b,message)=>{count++;assert.ok(Math.abs(a-b)<1e-6,`${message}: ${a} vs ${b}`);};
const shares=(books,symbol)=>Object.values(books).reduce((n,book)=>n+(book.positions[symbol]?.shares||0),0);
const cash=books=>Object.values(books).reduce((n,book)=>n+book.cash,0);
const now=new Date('2026-10-15T15:00:00.000Z');
function observed(c,price,{stamp=now.toISOString(),completedAt=now.toISOString()}={}){
 const row=clone(c.book.model.sessions[221]);
 row.currentEventEvidence=currentEventEvidenceFor(row.prices.map(p=>p.symbol),new Date(completedAt));
 row.receipt={provider:'FMP',observedAt:completedAt,membershipCheckedTwice:true,previousAdjustedClosesUnchanged:true};
 row.prices=row.prices.map(p=>({...p,observedAt:stamp,observedPrice:p.symbol===c.symbol?price:p.open}));
 return row;
}
function accountCase({cashOnly=false}={}){
 const c=testCase([100,100.1,100.2],{shares:100,cashOnly});
 c.account={...c.account,positionContext:cashOnly?[]:[{symbol:c.symbol,stage:'half',purchases:[]}],
  brokerageCash:{balance:100000,observedAt:'2026-10-15T14:45:00Z',source:'manual-broker-balance'}};
 return c;
}

async function main(){
 // Stop verification is independent of the historical indicator warmup.
 {
  const position={symbol:'DELL',shares:10,avgCost:500,stops:[{sleeve:'base',shares:10,price:468.85}],exits:[],action:'Review',
   recentMomentumReviews:[{available:false,state:{streak:0,profitGivebackStreak:0}}]};
  const decision={contract:'c1-account-decision-v1',current:true,sourceSessionDate:'2026-10-14',positions:[position,{...position,symbol:'CORE',role:'Core'}]};
  const opening={date:'2026-10-15',prices:[{symbol:'DELL',adjusted:true,open:480,observedPrice:460,observedAt:now.toISOString()}],
   receipt:{provider:'FMP',observedAt:now.toISOString(),membershipCheckedTwice:true,previousAdjustedClosesUnchanged:true}};
  const before=clone({decision,opening}),view=advisories(decision,opening,now),evidence=view.positions[0].intradayMomentumAdvisory;
  eq(evidence.price,460,'Verified DELL current price survives missing historical momentum');
  eq(evidence.changeFromCompletedClosePct,null,'Missing accepted comparison close is not fabricated');
  eq(evidence.stopBreaches[0].price,468.85,'Current risk uses the exact existing recorded stop');
  eq(view.positions[0].action,'Review','Intraday evidence does not manufacture a completed-session exit');
  same(view.positions[0].recentMomentumReviews,position.recentMomentumReviews,'No completed streak, peak or holding lifecycle is changed');
  ok(explanation(view.positions[0],now)?.includes('$460.00'),'Verified price remains explainable without MACD warmup');
  eq(view.positions[1].intradayMomentumAdvisory,undefined,'Core is outside Swing current-risk augmentation');
  same({decision,opening},before,'Current risk annotation preserves source objects');
  const revised=clone(opening);revised.receipt.previousAdjustedClosesUnchanged=false;
  revised.receipt.priceBasisReview={contract:'c1-verified-opening-price-review-v2',provider:'FMP',endpoint:'historical-price-eod/dividend-adjusted',
   sourceSessionDate:'2026-10-14',observedAt:now.toISOString(),recordedAccountReplayPreserved:true,originalInputsPreserved:true,
   identicalOpeningPlan:true,identicalCurrentPricePlan:true,revisions:[{rechecked:true,accountTreatment:'preserved-recorded-basis'}]};
  eq(advisories(decision,revised,now).positions[0].intradayMomentumAdvisory,undefined,'A raw changed basis requires existing server review');
  eq(verifiedC1OpeningPriceBasis(revised.receipt),true,'The fixture has the existing approved preserved-account-basis review');
  eq(advisories(decision,revised,now,{priceBasisVerified:verifiedC1OpeningPriceBasis(revised.receipt)}).positions[0].intradayMomentumAdvisory.price,460,'An approved repeat-verified basis no longer discards the current quote');
  for(const [name,patch] of Object.entries({stale:{observedAt:'2026-10-15T14:57:59Z'},future:{observedAt:'2026-10-15T15:00:01Z'},missing:{observedPrice:null},unadjusted:{adjusted:false}})){
   const invalid=clone(opening);Object.assign(invalid.prices[0],patch);
   eq(advisories(decision,invalid,now).positions[0].intradayMomentumAdvisory,undefined,`${name}: invalid current evidence cannot create a stop observation`);
  }
 }

 // Collection finishes after the request starts. Only its bounded validated
 // server receipt advances evaluation time, never the provider quote clock.
 {
  const c=accountCase(),opening=observed(c,100.05,{stamp:'2026-10-15T14:59:59Z'}),before=clone(c.account);
  const result=await prepare({account:c.account,book:c.book,now:new Date('2026-10-15T14:59:50Z'),collectOpening:async()=>opening});
  eq(result.manualRecommendations.status,'ready','A verified collection completing after request start is actionable');
  eq(result.decision.positions.find(p=>p.symbol===c.symbol).intradayMomentumAdvisory.price,100.05,'The accepted quote after request start is not mislabeled future');
  ok(result.openingPlan.orders.some(o=>o.side==='buy'&&o.symbol===c.symbol),'Healthy verified partial completion remains possible');
  same(c.account,before,'Advancing the local evaluation clock changes no account facts');
 }

 // A current breach blocks only proposed capital. The real open, conditional
 // stop IDs, actual holdings and cash remain intact until an owner posts a fill.
 {
  const c=accountCase(),opening=observed(c,85),before=clone({account:c.account,book:c.book,opening});
  const result=await prepare({account:c.account,book:c.book,now,collectOpening:async()=>opening});
  eq(result.manualRecommendations.status,'ready','Existing verified manual review remains available for genuine exits and other candidates');
  eq(result.openingPlan.orders.some(o=>o.side==='buy'&&o.symbol===c.symbol),false,'An existing current stop breach blocks all fresh Add quantities');
  eq(result.manualRecommendations.orders.some(o=>o.side==='buy'&&o.symbol===c.symbol),false,'The same stop block governs displayed manual capital authority');
  const stops=result.openingPlan.orders.filter(o=>o.symbol===c.symbol&&o.condition==='stop-triggered');
  eq(stops.length,3,'Each actual sleeve keeps its existing conditional stop identity');
  eq(stops.reduce((n,o)=>n+o.shares,0),100,'Stops cover actual shares, excluding the withdrawn completion');
  eq(result.openingPlan.orders.some(o=>o.side==='sell'&&o.symbol===c.symbol&&!o.condition),false,'Current risk does not invent an opening sale');
  eq(shares(result.openingPlan.projectedBooks,c.symbol),100,'Disposable projected holdings exclude the removed Add');
  eq(shares(result.openingPlan.openingBooks,c.symbol),100,'Actual opening ownership is untouched');
  const expected=clone(result.openingPlan.openingBooks);
  for(const order of result.openingPlan.orders){
   if(order.condition)continue;
   const book=expected[order.sleeve],held=book.positions[order.symbol],delta=order.side==='buy'?order.shares:-order.shares;
   book.cash-=delta*order.estimatedPrice;
   if((held?.shares||0)+delta>0)book.positions[order.symbol]={shares:(held?.shares||0)+delta};else delete book.positions[order.symbol];
  }
  near(cash(result.openingPlan.projectedBooks),cash(expected),'Projected cash matches exactly the permitted orders');
  eq(result.openingPlan.cashAuthority.unrecordedSaleProceedsIncluded,false,'An unexecuted stop cannot fund a replacement');
  const risk=result.decision.positions.find(p=>p.symbol===c.symbol);
  ok(risk.intradayMomentumAdvisory.stopBreaches.length>0,'Verified current stop evidence reaches the actual account view');
  eq(risk.exits.length,0,'A price observation does not fabricate a completed-session exit');
  same({account:c.account,book:c.book,opening},before,'The current-stop capital overlay preserves all accepted inputs');
  count++;await assert.rejects(()=>prepare({account:c.account,book:c.book,now,collectOpening:async()=>opening,expectedRevision:c.account.revision,
   recordTicket:{id:'unsupported-new-add',symbol:c.symbol,side:'buy',shares:1,price:85,fee:0,executedAt:now.toISOString()}}),/verified current price.*stop/i,
   'A new recorded purchase cannot use the old opening target through a current stop');
  const stopped=await prepare({account:c.account,book:c.book,now,collectOpening:async()=>opening,expectedRevision:c.account.revision,
   recordTicket:{id:'actual-stop-sale',symbol:c.symbol,side:'sell',shares:1,price:85,fee:.75,executedAt:now.toISOString()}});
  eq(stopped.account.intradayActivity.tickets[0].price,85,'The existing conditional stop accepts the actual manual sale price');
  eq(stopped.account.intradayActivity.fills.reduce((n,f)=>n+f.shares,0),1,'Only the posted broker sale reduces ownership');
  eq(stopped.decision.positions.find(p=>p.symbol===c.symbol).shares,99,'Actual recorded stop shares are reflected once');
  near(stopped.decision.actualCash,result.decision.actualCash+85-.75,'Only actual sale proceeds and the posted fee credit cash');
  same(c.account,before.account,'Recording returns a new account instead of mutating accepted original state');
  const completedBook=clone(c.book);
  completedBook.model.sessions[221].prices.find(row=>row.symbol===c.symbol).low=85;
  const completed=loader.load('lib/c1AccountService.js').deriveC1AccountAnalysis({account:stopped.account,book:completedBook,now:new Date('2026-10-15T22:00:00Z')});
  eq(completed.decision.positions.find(p=>p.symbol===c.symbol).shares,99,'A genuine recorded conditional stop survives completed-session replay');
  near(completed.decision.actualCash,stopped.decision.actualCash,'Closing replay retains the exact actual stop cash and fee');
  same(completed.account.records.at(-1).fills,stopped.account.intradayActivity.fills,'Closing replay retains the original posted stop fill identities');
 }

 // The execution path must pass the approved receipt, rather than reapplying
 // the old raw previous-close flag after the existing parity review succeeds.
 {
  const c=accountCase(),opening=observed(c,85),baseline=c.book.model.sessions[220].prices.find(p=>p.symbol===c.symbol);
  opening.receipt.previousAdjustedClosesUnchanged=false;
  opening.priceBasisRevisions=[{symbol:c.symbol,savedClose:baseline.close,rechecked:true,
   observedBar:{...baseline,date:'2026-10-14',high:101,low:99,open:100,close:100.01}}];
  const before=clone({account:c.account,book:c.book,opening}),result=await prepare({account:c.account,book:c.book,now,collectOpening:async()=>opening});
  eq(result.openingError,null,'The existing repeat-verified account-basis review passes unchanged');
  ok(verifiedC1OpeningPriceBasis(result.openingPlan.sourceReceipt),'The execution plan retains its accepted review evidence');
  eq(result.decision.positions.find(p=>p.symbol===c.symbol).intradayMomentumAdvisory.price,85,'Accepted revised-basis verification reaches the account stop observation');
  eq(result.openingPlan.orders.some(o=>o.side==='buy'&&o.symbol===c.symbol),false,'The same verified revised-basis quote blocks fresh capital through the stop');
  same({account:c.account,book:c.book,opening},before,'Approved current verification never rewrites the held historical basis');
 }

 // A valid earlier fill remains a fact when today's quote later crosses stop.
 {
  const c=accountCase(),oldNow=new Date('2026-10-15T14:55:00Z'),oldOpening=observed(c,100.05,{stamp:oldNow.toISOString(),completedAt:oldNow.toISOString()});
  const ticket={id:'earlier-verified-add',symbol:c.symbol,side:'buy',shares:2,price:100.05,fee:.4,executedAt:oldNow.toISOString()};
  const recorded=await prepare({account:c.account,book:c.book,now:oldNow,collectOpening:async()=>oldOpening,recordTicket:ticket,expectedRevision:c.account.revision});
  const saved=clone(recorded.account),opening=observed(c,85);
  const next=await prepare({account:recorded.account,book:c.book,now,collectOpening:async()=>opening});
  same(next.account.intradayActivity.fills,saved.intradayActivity.fills,'Current risk preserves every earlier fill ID, date, share, price and fee');
  eq(next.decision.positions.find(p=>p.symbol===c.symbol).shares,102,'A previously posted Add survives the new stop gate');
  near(next.decision.actualCash,recorded.decision.actualCash,'Current risk cannot undo the earlier cash debit or fee');
  eq(next.openingPlan.orders.some(o=>o.symbol===c.symbol&&o.side==='buy'),false,'The unfilled remainder cannot inherit the historical fill waiver');
  const repeat=await prepare({account:recorded.account,book:c.book,now,collectOpening:async()=>opening,recordTicket:ticket,expectedRevision:recorded.account.revision});
  same(repeat.account.intradayActivity.fills,saved.intradayActivity.fills,'An identical retry acknowledges the existing fact without a second fill');
  same(recorded.account,saved,'Refreshing current risk does not mutate the saved activity plan');
 }

 {
  const c=accountCase({cashOnly:true}),opening=observed(c,85),result=await prepare({account:c.account,book:c.book,now,collectOpening:async()=>opening});
  eq(result.openingPlan.orders.some(o=>o.symbol===c.symbol&&o.side==='buy'),false,'A new purchase also respects its existing opening-derived initial stop');
  eq(result.decision.positions.some(p=>p.symbol===c.symbol),false,'A blocked new purchase never invents a held position');
 }
 console.log(`PASS: ${count} verified intraday risk, request-clock, prospective capital and immutable-fill assertions.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});

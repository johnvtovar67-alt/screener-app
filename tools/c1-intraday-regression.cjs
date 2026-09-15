const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
// Reuse the independent account fixture rather than recreate strategy rules.
const setup=fs.readFileSync('tools/c1-account-seed-regression.cjs','utf8').split('const initialView=')[0];
const fixture=new Function('require',setup+';return {loader,baseline,baselineBook,privateAccount,opening,plan,portfolio,sessions};')(require);
const {loader,baseline,baselineBook,privateAccount,opening,plan,portfolio}=fixture;
const intraday=loader.load('lib/c1IntradayActivity.js'),service=loader.load('lib/c1AccountService.js'),execution=loader.load('lib/c1AccountExecution.js');
const now=new Date(opening.date+'T16:00:00Z'),ticket={id:'broker-sale',symbol:'T4',side:'sell',shares:3,price:plan.orders.find(o=>o.symbol==='T4'&&o.side==='sell').estimatedPrice,fee:.03,executedAt:opening.date+'T15:00:00Z'};
const original=JSON.stringify(privateAccount);
const saved=intraday.recordC1IntradayActivity({account:privateAccount,plan,ticket,expectedRevision:0,now});
assert.equal(JSON.stringify(privateAccount),original);
assert.equal(saved.records.length,0,'Intraday fills must not fabricate a completed market session');
assert.equal(saved.intradayActivity.fills.reduce((n,f)=>n+f.shares,0),3);
assert.equal(intraday.recordC1IntradayActivity({account:saved,plan,ticket,expectedRevision:0,now}),saved,'Retry is idempotent');
assert.throws(()=>intraday.recordC1IntradayActivity({account:saved,plan,ticket:{...ticket,price:1},expectedRevision:1,now}),/Conflicting/);
assert.throws(()=>intraday.recordC1IntradayActivity({account:privateAccount,plan,ticket:{...ticket,shares:4},expectedRevision:0,now}),/exceeds/);
assert.throws(()=>intraday.recordC1IntradayActivity({account:privateAccount,plan,ticket:{...ticket,executedAt:opening.date+'T17:00:00Z'},expectedRevision:0,now}),/actual regular-session/);
const prior=service.evaluateC1Account({account:privateAccount,book:baselineBook,now});
const view=intraday.c1IntradayDecision({decision:prior,activity:saved.intradayActivity,revision:saved.revision,now});
assert(!view.positions.some(p=>p.symbol==='T4'));
assert(Math.abs(view.actualCash-(prior.actualCash+3*ticket.price-.03))<1e-7);
const observed={...opening,prices:opening.prices.map(p=>({...p,observedPrice:p.open,observedAt:now.toISOString()})),receipt:{observedAt:now.toISOString(),membershipCheckedTwice:true,previousAdjustedClosesUnchanged:true}};
const remaining=intraday.c1IntradayRemainingPlan({plan,activity:saved.intradayActivity,opening:observed,baseline,decision:view,now});
assert(!remaining.orders.some(o=>o.symbol==='T4'&&o.side==='sell'));
assert(remaining.orders.some(o=>o.side==='buy'&&!o.condition),'Qualified replacement remains available after actual sale');
assert(Object.values(remaining.projectedBooks).every(b=>b.cash>=-1e-7));
const paused=intraday.c1IntradayRemainingPlan({plan:{...plan,riskBySleeve:Object.fromEntries(Object.keys(plan.openingBooks).map(s=>[s,{paused:true}]))},activity:saved.intradayActivity,opening:observed,baseline,decision:view,now});
assert(!paused.orders.some(o=>o.side==='buy'),'Actual sale must not bypass a sleeve cooldown');
const expensive={...observed,prices:observed.prices.map(p=>({...p,observedPrice:p.open*100}))};
assert(!intraday.c1IntradayRemainingPlan({plan,activity:saved.intradayActivity,opening:expensive,baseline,decision:view,now}).orders.some(o=>o.side==='buy'),'A sold position must not bypass the entry gap check');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),babel=require('next/dist/compiled/babel/core');
const file=require('node:path').resolve('components/C1IntradayActivity.js'),record={exports:{}};
const code=babel.transformSync(fs.readFileSync(file,'utf8'),{filename:file,babelrc:false,configFile:false,presets:[[require.resolve('next/babel'),{'preset-env':{modules:'commonjs'}}]]}).code;
new Function('require','module','exports',code)(name=>require(name.startsWith('@babel/runtime/')?'next/dist/compiled/'+name:name),record,record.exports);
const html=renderToStaticMarkup(React.createElement(record.exports.default,{session:{date:plan.date,plan,fills:[],tickets:[],revision:0},onSave(){}}));
assert.equal((html.match(/Sold T4/g)||[]).length,1,'One broker fill form aggregates sleeve orders');
assert.match(html,/up to 3 shares/);assert.match(html,/Save trade and update C1/);assert.match(html,/This trade has filled at Schwab/);

const partial=intraday.recordC1IntradayActivity({account:privateAccount,plan,ticket:{...ticket,shares:1},expectedRevision:0,now});
assert.equal(intraday.c1IntradayDecision({decision:prior,activity:partial.intradayActivity,revision:1,now}).positions.find(p=>p.symbol==='T4').shares,2);
const closeBook={...baselineBook,model:{sessions:[baseline,opening]},captures:[...baselineBook.captures,{sessionDate:opening.date,hash:'intraday-close',observedAt:opening.date+'T21:00:00Z'}]};
const closed=service.carryC1RecordedHoldings({account:saved,book:closeBook,now:new Date(opening.date+'T21:00:00Z')});
assert(!closed.intradayActivity);assert.equal(closed.records.length,1);assert.equal(closed.records[0].fills.length,3);
const after=service.evaluateC1Account({account:closed,book:closeBook,now:new Date(opening.date+'T21:00:00Z')});
assert(Math.abs(after.actualCash-view.actualCash)<1e-7);assert(!after.positions.some(p=>p.symbol==='T4'));
assert.equal(JSON.stringify(service.carryC1RecordedHoldings({account:closed,book:closeBook,now:new Date(opening.date+'T21:00:00Z')})),JSON.stringify(closed));

// A dropped opening purchase must free its projected slot for the next queued entry.
const selectedAtOpen=new Set(plan.orders.filter(o=>o.side==='buy').map(o=>o.symbol));
const movedOpening={...observed,prices:observed.prices.map(p=>({...p,observedPrice:selectedAtOpen.has(p.symbol)?p.open*1.04:p.open}))};
const recheckedOpening=intraday.c1IntradayEntryRecheck({account:saved,opening:movedOpening,baseline,now});
const refreshedPlan=execution.planC1ContinuedAccountOpening({adoption:privateAccount.adoption,sessions:[baseline],records:[],opening:recheckedOpening,observedAt:now.toISOString()});
const rebased=intraday.rebaseC1UnfilledEntryPlan({activity:saved.intradayActivity,plan:refreshedPlan,now});
const refreshedRemaining=intraday.c1IntradayRemainingPlan({plan:refreshedPlan,activity:rebased,opening:recheckedOpening,baseline,decision:view,now});
const alternative=refreshedRemaining.orders.find(o=>o.side==='buy'&&!selectedAtOpen.has(o.symbol));
assert(alternative,'Next eligible queued stock must receive a quantity after the first choices fail current entry checks');
assert(!refreshedRemaining.orders.some(o=>o.side==='buy'&&selectedAtOpen.has(o.symbol)));
assert.equal(JSON.stringify(execution.reconcileC1ActualAccountFills({plan:rebased.plan,fills:rebased.fills,observedAt:now.toISOString()}).books),JSON.stringify(execution.reconcileC1ActualAccountFills({plan:saved.intradayActivity.plan,fills:saved.intradayActivity.fills,observedAt:now.toISOString()}).books));
const replacement=intraday.recordC1IntradayActivity({account:{...saved,intradayActivity:rebased},plan:refreshedPlan,ticket:{id:'alternate-buy',symbol:alternative.symbol,side:'buy',shares:1,price:alternative.estimatedPrice,fee:0,executedAt:opening.date+'T15:30:00Z'},expectedRevision:1,now});
const alternateClosed=service.carryC1RecordedHoldings({account:replacement,book:closeBook,now:new Date(opening.date+'T21:00:00Z')});
const alternateView=service.evaluateC1Account({account:alternateClosed,book:closeBook,now:new Date(opening.date+'T21:00:00Z')});
assert(alternateView.positions.some(p=>p.symbol===alternative.symbol&&p.shares===1),'Alternative purchase must survive completed-session replay');
const following={...fixture.sessions.find(s=>s.date>opening.date),corporateActions:[]};
const followingBook={...closeBook,model:{sessions:[baseline,opening,following]},captures:[...closeBook.captures,{sessionDate:following.date,hash:'following-close',observedAt:following.date+'T21:00:00Z'}]};
const followingAccount=service.carryC1RecordedHoldings({account:alternateClosed,book:followingBook,now:new Date(following.date+'T21:00:00Z')});
assert(service.evaluateC1Account({account:followingAccount,book:followingBook,now:new Date(following.date+'T21:00:00Z')}).positions.some(p=>p.symbol===alternative.symbol&&p.shares===1),'Recorded alternative survives the next session without another activity confirmation');

assert.equal(JSON.stringify(intraday.c1IntradayEntryRecheck({account:replacement,opening:observed,baseline,now}).entryRecheck),JSON.stringify(refreshedPlan.entryRecheck),'Recorded purchase retains its checked selection evidence');
console.log('PASS: recorded sale → rejected opening buys → next queued entry → actual purchase → close replay, with unchanged actual books and original opening quotes.');

// A repeat-confirmed, unowned candidate correction needs identical plans.
const priceReview=loader.load('lib/c1OpeningPriceReview.js');
const revisedSymbol=plan.orders.find(o=>o.side==='buy'&&!portfolio.some(p=>p.symbol===o.symbol)).symbol;
const originalBar=baseline.prices.find(p=>p.symbol===revisedSymbol);
const correctedClose=originalBar.close*1.000374476;
const observedBar={...originalBar,date:baseline.date,close:correctedClose,high:Math.max(originalBar.high,correctedClose)};
const revision={symbol:revisedSymbol,savedClose:originalBar.close,observedBar,rechecked:true};
const revisionOpening={...observed,priceBasisRevisions:[revision],receipt:{...observed.receipt,previousAdjustedClosesUnchanged:false}};
const comparablePlan=execution.planC1ContinuedAccountOpening({adoption:privateAccount.adoption,sessions:[baseline],records:privateAccount.records,opening:revisionOpening,observedAt:revisionOpening.receipt.observedAt,completionPolicy:execution.c1CompletionPolicy(privateAccount.positionContext)});
const reviewed=priceReview.reviewC1OpeningPriceRevisions({account:privateAccount,sessions:[baseline],opening:revisionOpening,plan:{...comparablePlan,sourceReceipt:revisionOpening.receipt},now});
assert(priceReview.verifiedC1OpeningPriceBasis(reviewed.sourceReceipt));assert.equal(JSON.stringify(reviewed.orders),JSON.stringify(comparablePlan.orders));assert.equal(baseline.prices.find(p=>p.symbol===revisedSymbol).close,originalBar.close);
assert(!priceReview.verifiedC1OpeningPriceBasis(revisionOpening.receipt),'An unreconciled revision cannot pass');
assert.throws(()=>priceReview.reviewC1OpeningPriceRevisions({account:privateAccount,sessions:[baseline],opening:{...revisionOpening,priceBasisRevisions:[{...revision,rechecked:false}]},plan,now}),/consistent provider evidence/);
assert.throws(()=>priceReview.reviewC1OpeningPriceRevisions({account:privateAccount,sessions:[baseline],opening:{...revisionOpening,priceBasisRevisions:[{...revision,symbol:'T4'}]},plan,now}),/account history/);
assert.throws(()=>priceReview.reviewC1OpeningPriceRevisions({account:privateAccount,sessions:[baseline],opening:{...revisionOpening,priceBasisRevisions:[{...revision,symbol:'SPY'}]},plan,now}),/account history/);
const boundaryOpening={...revisionOpening,prices:observed.prices.map(p=>p.symbol===revisedSymbol?{...p,open:originalBar.close*1.025}:p)};
const boundaryPlan=execution.planC1ContinuedAccountOpening({adoption:privateAccount.adoption,sessions:[baseline],records:[],opening:boundaryOpening,observedAt:boundaryOpening.receipt.observedAt,completionPolicy:execution.c1CompletionPolicy(privateAccount.positionContext)});
const lowered=originalBar.close*.99;
assert.throws(()=>priceReview.reviewC1OpeningPriceRevisions({account:privateAccount,sessions:[baseline],opening:{...boundaryOpening,priceBasisRevisions:[{...revision,observedBar:{...observedBar,close:lowered,low:Math.min(observedBar.low,lowered)}}]},plan:boundaryPlan,now}),/changes opening orders/);

const provider={...loader.load('lib/marketSession.js'),Date};vm.createContext(provider);vm.runInContext(fs.readFileSync('lib/c1AccountOpeningProvider.js','utf8').replace(/^import .*;$/gm,'').replace(/export (async )?function /g,(_,a)=>(a||'')+'function '),provider);
const tinyBaseline={date:baseline.date,universeSymbols:['AAA'],prices:[{symbol:'AAA',close:100}],signals:[{symbol:'AAA',sector:'Technology'}]};
const anchor={date:baseline.date,open:100,high:101,low:99,close:100.04};
const tiny={baseline:tinyBaseline,symbols:['AAA'],membersBefore:[{symbol:'AAA',sector:'Technology'}],membersAfter:[{symbol:'AAA',sector:'Technology'}],observations:{AAA:{quote:{symbol:'AAA',timestamp:now.getTime()/1000,open:100,price:100},anchor,anchorRecheck:{...anchor}}},now};
assert.throws(()=>provider.validateC1OpeningObservations(tiny),/price basis changed/);
const checked=provider.validateC1OpeningObservations({...tiny,allowPriceRevisionReview:true});assert.equal(checked.receipt.previousAdjustedClosesUnchanged,false);assert.equal(checked.priceBasisRevisions.length,1);
assert.throws(()=>provider.validateC1OpeningObservations({...tiny,allowPriceRevisionReview:true,observations:{AAA:{...tiny.observations.AAA,anchorRecheck:{...anchor,close:100.05}}}}),/not stable/);

// Exercise the actual API with an injected store and observed-price provider.
const context={...loader.load('lib/c1OpeningPriceReview.js'),...service,...execution,...intraday,...loader.load('lib/c1AccountSave.js'),...loader.load('lib/c1AccountInput.js'),...loader.load('lib/c1AccountDecision.js'),...loader.load('lib/c1ManualRecommendations.js'),...loader.load('lib/c1HeldRankReview.js'),
 collectC1HeldRankReviews:async()=>({rows:[],unavailable:[]}),missingC1HoldingPrices:()=>[],collectC1HoldingCoverage:async()=>{throw Error('Unexpected holding collection');},collectC1AccountOpening:async()=>null,readStoredC1DatedBook:async()=>null,createHash:require('node:crypto').createHash,process:{env:{}},get(){},put(){},Date,console};
const route=fs.readFileSync('pages/api/c1-account.js','utf8').replace(/^import .*;$/gm,'').replace(/export const /g,'const ').replace(/export function /g,'function ').replace('export default createC1AccountHandler();','globalThis.factory=createC1AccountHandler;');
vm.createContext(context);vm.runInContext(route,context);
(async()=>{
 let stored={record:JSON.parse(original),etag:'v0'},writes=0,fail=false,openingUnavailable=false,priceRevision=false,moved=false;
 const handler=context.factory({environment:'preview',commit:'test',clock:()=>now,readBook:async()=>({record:baselineBook}),collectOpening:async()=>{if(openingUnavailable)throw Error('Fresh opening quote missing for T4');return moved?movedOpening:priceRevision?revisionOpening:observed;},store:{read:async()=>stored,write:async(path,record,etag)=>{if(fail)throw Error('Storage unavailable');assert.equal(etag,stored.etag);stored={record,etag:'v'+(++writes)};}}});
 async function request(body){const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};await handler({method:body?'POST':'GET',headers:{authorization:'Bearer '+'fixture'.repeat(6)},body},res);return res;}
 openingUnavailable=true;let unavailable=await request();assert.equal(unavailable.code,200);assert.equal(unavailable.body.intradaySession.sellOnly,true);assert.equal(unavailable.body.manualRecommendations.status,'waiting');assert.equal(unavailable.body.openingError,'Fresh opening quote missing for T4');openingUnavailable=false;
 let r=await request();assert.equal(r.code,200);assert(r.body.intradaySession,'Entry form is available during the open session');
 priceRevision=true;r=await request();assert.equal(r.code,200);assert.equal(r.body.manualRecommendations.status,'ready',JSON.stringify(r.body));assert.equal(r.body.openingPlan.sourceReceipt.priceBasisReview.identicalOpeningPlan,true);assert.equal(writes,0);priceRevision=false;
 fail=true;r=await request({operation:'record-intraday',ticket,expectedRevision:0});assert.equal(r.code,409);assert.equal(writes,0);fail=false;
 r=await request({operation:'record-intraday',ticket,expectedRevision:0});assert.equal(r.code,200,JSON.stringify(r.body));assert.equal(r.body.intradaySession.tickets.length,1);assert(!r.body.decision.positions.some(p=>p.symbol==='T4'));assert.equal(r.body.manualRecommendations.status,'ready');
 assert(r.body.manualRecommendations.orders.some(o=>o.side==='buy'&&!o.condition));
 const {mergeC1AccountPortfolio}=loader.load('lib/c1AccountPortfolio.js');
 const entered=mergeC1AccountPortfolio(portfolio.filter(p=>p.symbol!=='T4'),r.body.decision);
 assert(loader.load('lib/c1AccountDecision.js').c1AccountMatchesPortfolio(r.body.decision,entered));
 assert(entered.some(p=>p.symbol==='MSTR'&&p.role==='Core'));
 const next=r.body.manualRecommendations.orders.find(o=>o.side==='buy'&&!o.condition);
 const buyTicket={id:'broker-replacement',symbol:next.symbol,side:'buy',shares:1,price:next.estimatedPrice,fee:0,executedAt:opening.date+'T15:30:00Z'};
 r=await request({operation:'record-intraday',ticket:buyTicket,expectedRevision:r.body.decision.revision});assert.equal(r.code,200,JSON.stringify(r.body));assert(r.body.decision.positions.some(p=>p.symbol===next.symbol&&p.shares===1));
 const replayed=service.carryC1RecordedHoldings({account:stored.record,book:closeBook,now:new Date(opening.date+'T21:00:00Z')});
 const endView=service.evaluateC1Account({account:replayed,book:closeBook,now:new Date(opening.date+'T21:00:00Z')});
 assert(Math.abs(endView.actualCash-r.body.decision.actualCash)<1e-7,'Close replay preserves exact intraday sale and replacement economics');
 const reload=await request();assert.equal(reload.code,200);assert.equal(reload.body.intradaySession.tickets.length,2);
 // An unrelated candidate anchor failure must not block a known completed exit.
 stored={record:JSON.parse(original),etag:'fallback0'};openingUnavailable=true;
 r=await request({operation:'record-intraday',ticket:{...ticket,side:'buy'},expectedRevision:0});assert.equal(r.code,409);assert.equal(stored.record.revision,0);
 r=await request({operation:'record-intraday',ticket,expectedRevision:0});assert.equal(r.code,200,JSON.stringify(r.body));assert.equal(r.body.manualRecommendations.status,'waiting');assert(!r.body.decision.positions.some(p=>p.symbol==='T4'));assert.equal(r.body.intradaySession.sellOnly,true);
 const fallbackCash=r.body.decision.actualCash;
 const closedFallback=service.carryC1RecordedHoldings({account:stored.record,book:closeBook,now:new Date(opening.date+'T21:00:00Z')});
 assert(Math.abs(service.evaluateC1Account({account:closedFallback,book:closeBook,now:new Date(opening.date+'T21:00:00Z')}).actualCash-fallbackCash)<1e-7);
 assert(closedFallback.records[0].recordingEvidence,'Original accounting-only order evidence retained');
 openingUnavailable=false;r=await request();assert.equal(r.code,200,JSON.stringify(r.body));assert.equal(r.body.manualRecommendations.status,'ready');assert.equal(r.body.intradaySession.plan.recordingOnly,undefined);
 assert.equal(r.body.decision.actualCash,fallbackCash);assert(r.body.manualRecommendations.orders.some(o=>o.side==='buy'));
 r=await request({operation:'record-intraday',ticket,expectedRevision:0});assert.equal(r.code,200,JSON.stringify(r.body));assert.equal(r.body.decision.actualCash,fallbackCash,'Retry after provider recovery must not double-credit sale');
 stored={record:JSON.parse(original),etag:'moved0'};moved=false;
 r=await request({operation:'record-intraday',ticket,expectedRevision:0});assert.equal(r.code,200);
 moved=true;r=await request();assert.equal(r.code,200,JSON.stringify(r.body));
 const apiAlternative=r.body.manualRecommendations.orders.find(o=>o.side==='buy'&&!selectedAtOpen.has(o.symbol));assert(apiAlternative,'API must promote the next queued eligible stock after price rejection');
 assert(r.body.openingPlan.entryRecheck.blocks.length>0);
 r=await request({operation:'record-intraday',ticket:{...buyTicket,id:'api-alternative',symbol:apiAlternative.symbol,price:apiAlternative.estimatedPrice},expectedRevision:r.body.decision.revision});assert.equal(r.code,200,JSON.stringify(r.body));
 const apiClosed=service.carryC1RecordedHoldings({account:stored.record,book:closeBook,now:new Date(opening.date+'T21:00:00Z')});
 assert(service.evaluateC1Account({account:apiClosed,book:closeBook,now:new Date(opening.date+'T21:00:00Z')}).positions.some(p=>p.symbol===apiAlternative.symbol&&p.shares===1));
 r=await request();assert.equal(r.code,200);assert(r.body.decision.positions.some(p=>p.symbol===apiAlternative.symbol));
 r=await request({operation:'record-session',record:{date:opening.date,entryRecheck:{}},expectedRevision:stored.record.revision});assert.equal(r.code,409);assert.match(r.body.error,/server only/);
 console.log('PASS: missing candidate data → recorded exit → preserved cash → verified-plan recovery and closing replay; no buy authorization bypass.');
 console.log('PASS: intraday API sale → actual cash → qualified replacement → recorded purchase → reload → closing replay; partial sales, duplicates, storage failure and Core preservation.');
})().catch(e=>{console.error(e);process.exitCode=1;});

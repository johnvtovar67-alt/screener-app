const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
// Reuse the independent account fixture rather than recreate strategy rules.
const setup=fs.readFileSync('tools/c1-account-seed-regression.cjs','utf8').split('const initialView=')[0];
const fixture=new Function('require',setup+';return {loader,baseline,baselineBook,privateAccount,opening,plan,portfolio,sessions};')(require);
const {loader,baseline,baselineBook,privateAccount:legacyAccount,opening,plan,portfolio}=fixture;
// Purchase scenarios explicitly confirm the broker balance before the fills.
// The unchanged fixture account also exercises migration without that metadata.
const privateAccount={...legacyAccount,brokerageCash:{balance:legacyAccount.adoption.actualCash,observedAt:opening.date+'T14:00:00.000Z',source:'manual-broker-balance'}};
const intraday=loader.load('lib/c1IntradayActivity.js'),service=loader.load('lib/c1AccountService.js'),execution={...loader.load('lib/c1AccountLedger.js'),...loader.load('lib/c1AccountExecution.js')};
const now=new Date(opening.date+'T16:00:00Z'),ticket={id:'broker-sale',symbol:'T4',side:'sell',shares:3,price:plan.orders.find(o=>o.symbol==='T4'&&o.side==='sell').estimatedPrice,fee:.03,executedAt:opening.date+'T15:00:00Z'};
const collisionPlan={...plan,orders:[{id:'base:collision:0',sleeve:'base',date:plan.date,symbol:'NEW',side:'buy',shares:1,estimatedPrice:100,reason:'modeled-new-order'}]};
const recordedCollision={recordingEvidence:{date:plan.date,sourceSessionDate:plan.sourceSessionDate,openingBooks:plan.openingBooks,orders:[{id:'base:collision:0',sleeve:'base',date:plan.date,symbol:'OLD',side:'buy',shares:1,estimatedPrice:101,reason:'recorded-replacement',postExitReplacement:true}]}};
const collisionReplay=execution.c1ReplayRecordingEvidence(collisionPlan,recordedCollision);
assert.equal(collisionReplay.orders.length,1);assert.equal(collisionReplay.orders[0].symbol,'OLD');
const original=JSON.stringify(privateAccount);
const saved=intraday.recordC1IntradayActivity({account:privateAccount,plan,ticket,expectedRevision:0,now});
assert.equal(JSON.stringify(privateAccount),original);
assert.equal(saved.records.length,0,'Intraday fills must not fabricate a completed market session');
assert.equal(saved.intradayActivity.fills.reduce((n,f)=>n+f.shares,0),3);
assert.equal(intraday.recordC1IntradayActivity({account:saved,plan,ticket,expectedRevision:0,now}),saved,'Retry is idempotent');
assert.throws(()=>intraday.recordC1IntradayActivity({account:saved,plan,ticket:{...ticket,price:1},expectedRevision:1,now}),/Conflicting/);
assert.throws(()=>intraday.recordC1IntradayActivity({account:privateAccount,plan,ticket:{...ticket,shares:4},expectedRevision:0,now}),/exceeds/);
assert.throws(()=>intraday.recordC1IntradayActivity({account:privateAccount,plan,ticket:{...ticket,executedAt:opening.date+'T17:00:00Z'},expectedRevision:0,now}),/actual regular-session/);
const correctionNow=new Date(opening.date+'T23:59:00Z'),correctedAt=opening.date+'T15:30:00.000Z';
const corrected=intraday.correctC1IntradayTradeTime({account:saved,ticketId:ticket.id,executedAt:correctedAt,expectedRevision:1,now:correctionNow});
assert.equal(corrected.intradayActivity.tickets[0].executedAt,correctedAt);assert(corrected.intradayActivity.fills.every(fill=>fill.executedAt===correctedAt));
assert.equal(corrected.intradayActivity.tickets[0].shares,ticket.shares);assert.equal(corrected.intradayActivity.tickets[0].price,ticket.price);assert.equal(corrected.intradayActivity.tickets[0].fee,ticket.fee);
assert.equal(saved.intradayActivity.tickets[0].executedAt,ticket.executedAt,'A correction must not mutate the prior revision');
assert.throws(()=>intraday.correctC1IntradayTradeTime({account:saved,ticketId:ticket.id,executedAt:opening.date+'T22:15:00.000Z',expectedRevision:1,now:correctionNow}),/regular-session/);
assert.throws(()=>intraday.correctC1IntradayTradeTime({account:saved,ticketId:ticket.id,executedAt:correctedAt,expectedRevision:0,now:correctionNow}),/Account changed/);
const correctedPrice=ticket.price-10,correctedFee=.09;
const correctedDetails=intraday.correctC1IntradayTradeDetails({account:saved,ticketId:ticket.id,price:correctedPrice,fee:correctedFee,executedAt:correctedAt,expectedRevision:1,now:correctionNow});
const correctedTicket=correctedDetails.intradayActivity.tickets[0];
assert.equal(correctedTicket.price,correctedPrice);assert.equal(correctedTicket.fee,correctedFee);assert.equal(correctedTicket.executedAt,correctedAt);
assert.equal(correctedTicket.id,ticket.id);assert.equal(correctedTicket.symbol,ticket.symbol);assert.equal(correctedTicket.side,ticket.side);assert.equal(correctedTicket.shares,ticket.shares);
assert.equal(correctedDetails.intradayActivity.fills.reduce((sum,fill)=>sum+fill.fee,0),correctedFee);
assert(correctedDetails.intradayActivity.fills.every(fill=>fill.price===correctedPrice&&fill.executedAt===correctedAt));
assert.throws(()=>intraday.correctC1IntradayTradeDetails({account:saved,ticketId:ticket.id,price:0,fee:0,executedAt:correctedAt,expectedRevision:1,now:correctionNow}),/actual execution price/);
assert.throws(()=>intraday.correctC1IntradayTradeDetails({account:saved,ticketId:ticket.id,price:correctedPrice,fee:-1,executedAt:correctedAt,expectedRevision:1,now:correctionNow}),/actual execution price/);
const prior=service.evaluateC1Account({account:privateAccount,book:baselineBook,now});
const view=intraday.c1IntradayDecision({decision:prior,activity:saved.intradayActivity,revision:saved.revision,now});
assert(!view.positions.some(p=>p.symbol==='T4'));
assert(Math.abs(view.actualCash-(prior.actualCash+3*ticket.price-.03))<1e-7);
const observed={...opening,prices:opening.prices.map(p=>({...p,observedPrice:p.open,observedAt:now.toISOString()})),receipt:{observedAt:now.toISOString(),membershipCheckedTwice:true,previousAdjustedClosesUnchanged:true}};
const noReplacementPlan={...plan,providerVerified:true,sourceReceipt:observed.receipt,quoteValidUntil:new Date(now.getTime()+120000).toISOString(),orders:plan.orders.filter(o=>o.side!=='buy'&&!(o.symbol==='T4'&&o.side==='sell'))};
const noReplacementSale=intraday.recordC1IntradayActivity({account:privateAccount,plan:noReplacementPlan,ticket:{...ticket,id:'owner-sale-without-opening-replacement',recordingReason:'owner-discretionary-exit'},expectedRevision:0,now});
const regenerated=execution.replanC1IntradayAccountOpening({adoption:privateAccount.adoption,sessions:[baseline],records:[],opening:observed,observedAt:observed.receipt.observedAt,completionPolicy:execution.c1CompletionPolicy(privateAccount.positionContext),activity:noReplacementSale.intradayActivity,authorityPlan:noReplacementPlan});
assert(regenerated.plan.orders.some(o=>o.side==='buy'&&o.postExitReplacement===true),'An owner sale must regenerate the unchanged queued entries after freeing a slot');
assert(regenerated.activity.recordingEvidence.orders.some(o=>o.postExitReplacement===true),'The server-generated replacement identity must survive closing replay');
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
assert.equal((html.match(/C1 planned sale: T4/g)||[]).length,1,'One broker fill form aggregates sleeve orders');
assert.match(html,/Other completed sale: T4/);assert.match(html,/up to 3 shares/);assert.match(html,/Save trade and update C1/);assert.match(html,/This trade has filled at Schwab/);
assert.match(fs.readFileSync(file,'utf8'),/Saved in C1:/,'The form must show an explicit authoritative trade receipt');
const savedHtml=renderToStaticMarkup(React.createElement(record.exports.default,{session:{date:plan.date,plan,fills:saved.intradayActivity.fills,tickets:saved.intradayActivity.tickets,revision:1},onSave(){},onCorrectDetails(){}}));
assert.match(savedHtml,/Saved completed trades/);assert.match(savedHtml,/Sold 3 T4/);assert.match(savedHtml,/Correct details/);
assert.match(fs.readFileSync(file,'utf8'),/Shares are locked/);assert.match(fs.readFileSync(file,'utf8'),/Save corrected details/);

// A broker-confirmed owner sale is recordable without relabeling it as a C1 stop.
const discretionaryPlan={...plan,orders:plan.orders.filter(o=>!(o.symbol==='T4'&&o.side==='sell'))};
const discretionaryTicket={...ticket,id:'owner-sale',recordingReason:'owner-discretionary-exit'};
const discretionary=intraday.recordC1IntradayActivity({account:privateAccount,plan:discretionaryPlan,ticket:discretionaryTicket,expectedRevision:0,now});
assert(discretionary.intradayActivity.recordingEvidence);assert(discretionary.intradayActivity.plan.orders.some(o=>o.reason==='owner-discretionary-exit'));
assert(!intraday.c1IntradayDecision({decision:prior,activity:discretionary.intradayActivity,revision:1,now}).positions.some(p=>p.symbol==='T4'));
const discretionaryHtml=renderToStaticMarkup(React.createElement(record.exports.default,{session:{date:plan.date,plan:discretionaryPlan,fills:[],tickets:[],revision:0},onSave(){}}));
assert.match(discretionaryHtml,/Other completed sale: T4/);assert.doesNotMatch(discretionaryHtml,/Stop order filled: T4/);
assert.throws(()=>intraday.recordC1IntradayActivity({account:privateAccount,plan:discretionaryPlan,ticket:{...discretionaryTicket,side:'buy'},expectedRevision:0,now}),/Only a completed sale/);

const partial=intraday.recordC1IntradayActivity({account:privateAccount,plan,ticket:{...ticket,shares:1},expectedRevision:0,now});
assert.equal(intraday.c1IntradayDecision({decision:prior,activity:partial.intradayActivity,revision:1,now}).positions.find(p=>p.symbol==='T4').shares,2);
const closeBook={...baselineBook,model:{sessions:[baseline,opening]},captures:[...baselineBook.captures,{sessionDate:opening.date,hash:'intraday-close',observedAt:opening.date+'T21:00:00Z'}]};
const preOpeningCloseBook={...closeBook,captures:closeBook.captures.map(c=>c.sessionDate===opening.date?{...c,observedAt:opening.date+'T12:00:00Z'}:c)};
const closed=service.deriveC1CompletedAccount({account:saved,book:closeBook,now:new Date(opening.date+'T21:00:00Z')});
assert(!closed.intradayActivity);assert.equal(closed.records.length,1);assert.equal(closed.records[0].fills.length,3);
const after=service.evaluateC1Account({account:closed,book:closeBook,now:new Date(opening.date+'T21:00:00Z')});
assert(Math.abs(after.actualCash-view.actualCash)<1e-7);assert(!after.positions.some(p=>p.symbol==='T4'));
assert.equal(JSON.stringify(service.deriveC1CompletedAccount({account:closed,book:closeBook,now:new Date(opening.date+'T21:00:00Z')})),JSON.stringify(closed));
const discretionaryClosed=service.deriveC1CompletedAccount({account:discretionary,book:closeBook,now:new Date(opening.date+'T21:00:00Z')});
const discretionaryAfter=service.evaluateC1Account({account:discretionaryClosed,book:closeBook,now:new Date(opening.date+'T21:00:00Z')});
assert(!discretionaryAfter.positions.some(p=>p.symbol==='T4'));assert(discretionaryClosed.records[0].recordingEvidence);
const regeneratedAccount={...noReplacementSale,intradayActivity:regenerated.activity},regeneratedOrder=regenerated.plan.orders.find(o=>o.side==='buy');
const regeneratedPurchase=intraday.recordC1IntradayActivity({account:regeneratedAccount,plan:regenerated.plan,ticket:{id:'owner-sale-replacement',symbol:regeneratedOrder.symbol,side:'buy',shares:1,price:regeneratedOrder.estimatedPrice,fee:0,executedAt:opening.date+'T15:30:00Z'},expectedRevision:1,now});
const regeneratedClosed=service.deriveC1CompletedAccount({account:regeneratedPurchase,book:closeBook,now:new Date(opening.date+'T21:00:00Z')});
assert(service.evaluateC1Account({account:regeneratedClosed,book:closeBook,now:new Date(opening.date+'T21:00:00Z')}).positions.some(p=>p.symbol===regeneratedOrder.symbol),'The post-exit replacement purchase must survive completed-session replay');

// A dropped opening purchase must free its projected slot for the next queued entry.
const selectedAtOpen=new Set(plan.orders.filter(o=>o.side==='buy').map(o=>o.symbol));
const movedOpening={...observed,prices:observed.prices.map(p=>({...p,observedPrice:selectedAtOpen.has(p.symbol)?p.open*1.04:p.open}))};
const recheckedOpening=intraday.c1IntradayEntryRecheck({account:saved,opening:movedOpening,baseline,now});
// Provider/session serialization can preserve the same accepted close with
// sub-cent floating representation noise. The 3% gate must remain unchanged.
const noisyRecheck={...recheckedOpening,entryRecheck:{...recheckedOpening.entryRecheck,blocks:recheckedOpening.entryRecheck.blocks.map(block=>({...block,referencePrice:block.referencePrice*(1+5e-10)}))}};
assert.doesNotThrow(()=>execution.planC1ContinuedAccountOpening({adoption:privateAccount.adoption,sessions:[baseline],records:[],opening:noisyRecheck,observedAt:now.toISOString()}),'Equivalent accepted reference precision must not invalidate a genuine >3% server entry block');
const pennyRecheck={...recheckedOpening,entryRecheck:{...recheckedOpening.entryRecheck,blocks:recheckedOpening.entryRecheck.blocks.map((block,index)=>index?block:{...block,referencePrice:block.referencePrice+.01})}};
assert.doesNotThrow(()=>execution.planC1ContinuedAccountOpening({adoption:privateAccount.adoption,sessions:[baseline],records:[],opening:pennyRecheck,observedAt:now.toISOString()}),'A one-cent provider reference revision must preserve the block when both references independently exceed the unchanged 3% gap threshold');
const refreshedPlan=execution.planC1ContinuedAccountOpening({adoption:privateAccount.adoption,sessions:[baseline],records:[],opening:recheckedOpening,observedAt:now.toISOString()});
const rebased=intraday.rebaseC1UnfilledEntryPlan({activity:saved.intradayActivity,plan:refreshedPlan,now});
const refreshedRemaining=intraday.c1IntradayRemainingPlan({plan:refreshedPlan,activity:rebased,opening:recheckedOpening,baseline,decision:view,now});
const alternative=refreshedRemaining.orders.find(o=>o.side==='buy'&&!selectedAtOpen.has(o.symbol));
assert(alternative,'Next eligible queued stock must receive a quantity after the first choices fail current entry checks');
assert(!refreshedRemaining.orders.some(o=>o.side==='buy'&&selectedAtOpen.has(o.symbol)));
assert.equal(JSON.stringify(execution.reconcileC1ActualAccountFills({plan:rebased.plan,fills:rebased.fills,observedAt:now.toISOString()}).books),JSON.stringify(execution.reconcileC1ActualAccountFills({plan:saved.intradayActivity.plan,fills:saved.intradayActivity.fills,observedAt:now.toISOString()}).books));
const replacement=intraday.recordC1IntradayActivity({account:{...saved,intradayActivity:rebased},plan:refreshedPlan,ticket:{id:'alternate-buy',symbol:alternative.symbol,side:'buy',shares:1,price:alternative.estimatedPrice,fee:0,executedAt:opening.date+'T15:30:00Z'},expectedRevision:1,now});
const alternateClosed=service.deriveC1CompletedAccount({account:replacement,book:closeBook,now:new Date(opening.date+'T21:00:00Z')});
const alternateView=service.evaluateC1Account({account:alternateClosed,book:closeBook,now:new Date(opening.date+'T21:00:00Z')});
assert(alternateView.positions.some(p=>p.symbol===alternative.symbol&&p.shares===1),'Alternative purchase must survive completed-session replay');
const following={...fixture.sessions.find(s=>s.date>opening.date),corporateActions:[]};
const followingBook={...closeBook,model:{sessions:[baseline,opening,following]},captures:[...closeBook.captures,{sessionDate:following.date,hash:'following-close',observedAt:following.date+'T21:00:00Z'}]};
const followingAccount=service.deriveC1CompletedAccount({account:alternateClosed,book:followingBook,now:new Date(following.date+'T21:00:00Z')});
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
const verifiedRevisionFor=symbol=>{const saved=baseline.prices.find(p=>p.symbol===symbol),close=saved.close*1.000001;return {symbol,savedClose:saved.close,
 observedBar:{...saved,date:baseline.date,close,high:Math.max(saved.high,close)},rechecked:true};};
const reviewVerifiedRevision=revision=>{const candidateOpening={...revisionOpening,priceBasisRevisions:[revision]},candidatePlan=execution.planC1ContinuedAccountOpening({adoption:privateAccount.adoption,sessions:[baseline],records:privateAccount.records,opening:candidateOpening,observedAt:candidateOpening.receipt.observedAt,completionPolicy:execution.c1CompletionPolicy(privateAccount.positionContext)});
 return priceReview.reviewC1OpeningPriceRevisions({account:privateAccount,sessions:[baseline],opening:candidateOpening,plan:{...candidatePlan,providerVerified:true,sourceReceipt:candidateOpening.receipt,quoteValidUntil:new Date(now.getTime()+120000).toISOString()},now});};
const heldRevision=verifiedRevisionFor('T4'),heldReviewed=reviewVerifiedRevision(heldRevision);
assert(priceReview.verifiedC1OpeningPriceBasis(heldReviewed.sourceReceipt));
assert.equal(heldReviewed.sourceReceipt.priceBasisReview.revisions[0].accountTreatment,'preserved-recorded-basis');
assert.equal(baseline.prices.find(p=>p.symbol==='T4').close,heldRevision.savedClose,'Recorded position basis remains immutable');
const benchmarkReviewed=reviewVerifiedRevision(verifiedRevisionFor('SPY'));
assert.equal(benchmarkReviewed.sourceReceipt.priceBasisReview.revisions[0].accountTreatment,'verified-parity-overlay');
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
const context={...loader.load('lib/c1AccountExecutionView.js'),...loader.load('lib/c1OpeningPriceReview.js'),...service,...execution,...intraday,...loader.load('lib/marketSession.js'),...loader.load('lib/c1AccountSave.js'),...loader.load('lib/c1AccountInput.js'),...loader.load('lib/c1AccountDecision.js'),...loader.load('lib/c1ManualRecommendations.js'),...loader.load('lib/c1HeldRankReview.js'),
 collectC1HeldRankReviews:async()=>({rows:[],unavailable:[]}),missingC1HoldingPrices:()=>[],collectC1HoldingCoverage:async()=>{throw Error('Unexpected holding collection');},collectC1AccountOpening:async()=>null,readStoredC1DatedBook:async()=>null,createHash:require('node:crypto').createHash,process:{env:{}},get(){},put(){},Date,console};
const route=fs.readFileSync('pages/api/c1-account.js','utf8').replace(/^import .*;$/gm,'').replace(/export const /g,'const ').replace(/export function /g,'function ').replace('export default createC1AccountHandler();','globalThis.factory=createC1AccountHandler;');
vm.createContext(context);vm.runInContext(route,context);
(async()=>{
 let stored={record:JSON.parse(original),etag:'v0'},writes=0,fail=false,openingUnavailable=false,priceRevision=false,moved=false;
 const handler=context.factory({environment:'preview',commit:'test',clock:()=>now,readBook:async()=>({record:baselineBook}),collectOpening:async()=>{if(openingUnavailable)throw Error('Fresh opening quote missing for T4');return moved?movedOpening:priceRevision?revisionOpening:observed;},store:{read:async()=>stored,write:async(path,record,etag)=>{if(fail)throw Error('Storage unavailable');assert.equal(etag,stored.etag);stored={record,etag:'v'+(++writes)};}}});
 async function request(body={operation:'prepare-execution'}){const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};await handler({method:body?'POST':'GET',headers:{authorization:'Bearer '+'fixture'.repeat(6)},body},res);return res;}
 openingUnavailable=true;let unavailable=await request();assert.equal(unavailable.code,200);assert.equal(unavailable.body.intradaySession.sellOnly,true);assert.equal(unavailable.body.manualRecommendations.status,'waiting');assert.equal(unavailable.body.openingError,'Fresh opening quote missing for T4');openingUnavailable=false;
 let r=await request();assert.equal(r.code,200);assert(r.body.intradaySession,'Entry form is available during the open session');
 priceRevision=true;r=await request();assert.equal(r.code,200);assert.equal(r.body.manualRecommendations.status,'ready',JSON.stringify(r.body));assert.equal(r.body.openingPlan.sourceReceipt.priceBasisReview.identicalOpeningPlan,true);assert.equal(writes,0);priceRevision=false;
 fail=true;r=await request({operation:'record-intraday',ticket,expectedRevision:0});assert.equal(r.code,409);assert.equal(writes,0);fail=false;
 r=await request({operation:'record-intraday',ticket,expectedRevision:0});assert.equal(r.code,200,JSON.stringify(r.body));assert.equal(r.body.intradaySession.tickets.length,1);assert(!r.body.decision.positions.some(p=>p.symbol==='T4'));assert.equal(r.body.manualRecommendations.status,'ready');
 assert(r.body.manualRecommendations.orders.some(o=>o.side==='buy'&&!o.condition));
 const cashBeforeTimeCorrection=r.body.decision.actualCash,apiCorrectedAt=opening.date+'T15:15:00.000Z';
 r=await request({operation:'correct-intraday-time',ticketId:ticket.id,executedAt:apiCorrectedAt,expectedRevision:r.body.decision.revision});assert.equal(r.code,200,JSON.stringify(r.body));
 assert.equal(r.body.intradaySession.tickets.find(row=>row.id===ticket.id).executedAt,apiCorrectedAt);assert.equal(r.body.decision.actualCash,cashBeforeTimeCorrection,'A time correction must not change account economics');
 const apiCorrectedPrice=ticket.price-10,apiCorrectedFee=.13,cashBeforeDetailCorrection=r.body.decision.actualCash;
 r=await request({operation:'correct-intraday-details',ticketId:ticket.id,price:apiCorrectedPrice,fee:apiCorrectedFee,executedAt:apiCorrectedAt,expectedRevision:r.body.decision.revision});assert.equal(r.code,200,JSON.stringify(r.body));
 const apiCorrectedTicket=r.body.intradaySession.tickets.find(row=>row.id===ticket.id);
 assert.equal(apiCorrectedTicket.price,apiCorrectedPrice);assert.equal(apiCorrectedTicket.fee,apiCorrectedFee);assert.equal(apiCorrectedTicket.shares,ticket.shares);assert.equal(apiCorrectedTicket.side,ticket.side);
 assert(Math.abs(r.body.decision.actualCash-(cashBeforeDetailCorrection+ticket.shares*(apiCorrectedPrice-ticket.price)-(apiCorrectedFee-ticket.fee)))<1e-7,'A sale detail correction must update cash by the exact price and fee difference');
 const {mergeC1AccountPortfolio}=loader.load('lib/c1AccountPortfolio.js');
 const entered=mergeC1AccountPortfolio(portfolio.filter(p=>p.symbol!=='T4'),r.body.decision);
 assert(loader.load('lib/c1AccountDecision.js').c1AccountMatchesPortfolio(r.body.decision,entered));
 assert(entered.some(p=>p.symbol==='MSTR'&&p.role==='Core'));
 r=await request();assert.equal(r.code,200,JSON.stringify(r.body));
 const next=r.body.manualRecommendations.orders.find(o=>o.side==='buy'&&!o.condition);
 const buyTicket={id:'broker-replacement',symbol:next.symbol,side:'buy',shares:1,price:next.estimatedPrice,fee:0,executedAt:opening.date+'T15:30:00Z'};
 r=await request({operation:'record-intraday',ticket:buyTicket,expectedRevision:r.body.decision.revision});assert.equal(r.code,200,JSON.stringify(r.body));assert(r.body.decision.positions.some(p=>p.symbol===next.symbol&&p.shares===1));
 const replayed=service.deriveC1CompletedAccount({account:stored.record,book:closeBook,now:new Date(opening.date+'T21:00:00Z')});
 const endView=service.evaluateC1Account({account:replayed,book:closeBook,now:new Date(opening.date+'T21:00:00Z')});
 assert(Math.abs(endView.actualCash-r.body.decision.actualCash)<1e-7,'Close replay preserves exact intraday sale and replacement economics');
 const reload=await request();assert.equal(reload.code,200);assert.equal(reload.body.intradaySession.tickets.length,2);
 // An unrelated candidate anchor failure must not block a known completed exit.
 stored={record:JSON.parse(original),etag:'fallback0'};openingUnavailable=true;
 r=await request({operation:'record-intraday',ticket:{...ticket,side:'buy'},expectedRevision:0});assert.equal(r.code,409);assert.equal(stored.record.revision,0);
 r=await request({operation:'record-intraday',ticket,expectedRevision:0});assert.equal(r.code,200,JSON.stringify(r.body));assert.equal(r.body.manualRecommendations.status,'waiting');assert(!r.body.decision.positions.some(p=>p.symbol==='T4'));assert.equal(r.body.intradaySession.sellOnly,true);
 const fallbackCash=r.body.decision.actualCash;
 const closedFallback=service.deriveC1CompletedAccount({account:stored.record,book:closeBook,now:new Date(opening.date+'T21:00:00Z')});
 assert(Math.abs(service.evaluateC1Account({account:closedFallback,book:closeBook,now:new Date(opening.date+'T21:00:00Z')}).actualCash-fallbackCash)<1e-7);
 assert.equal(JSON.stringify(closedFallback.records[0].executionEvidence),JSON.stringify(stored.record.intradayActivity.plan),'The authoritative completed record retains the exact saved accounting-only plan');
 const fallbackStored=JSON.parse(JSON.stringify(stored));
 stored={record:JSON.parse(JSON.stringify(noReplacementSale)),etag:'legacy-owner-exit0'};
 const legacyAfterCloseNow=new Date(opening.date+'T21:00:00Z');
 const legacyAfterCloseHandler=context.factory({environment:'preview',commit:'test',clock:()=>legacyAfterCloseNow,readBook:async()=>({record:preOpeningCloseBook}),collectOpening:async()=>{throw Error('Live opening collection must not reconstruct a completed-session replacement');},store:{read:async()=>stored,write:async(path,record,etag)=>{assert.equal(etag,stored.etag);stored={record,etag:'v'+(++writes)};}}});
 async function legacyAfterCloseRequest(body={operation:'prepare-execution'}){const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};await legacyAfterCloseHandler({method:body?'POST':'GET',headers:{authorization:'Bearer '+'fixture'.repeat(6)},body},res);return res;}
 let legacyRecovery=await legacyAfterCloseRequest();assert.equal(legacyRecovery.code,200,JSON.stringify(legacyRecovery.body));
 const recoveredReplacement=legacyRecovery.body.intradaySession.plan.orders.find(o=>o.side==='buy'&&o.postExitReplacement===true);
 assert(recoveredReplacement,'A completed-session opening must recover the replacement omitted from the older saved owner-exit plan: '+JSON.stringify(legacyRecovery.body));
 legacyRecovery=await legacyAfterCloseRequest({operation:'record-intraday',ticket:{...buyTicket,id:'legacy-after-close-buy',symbol:recoveredReplacement.symbol,price:recoveredReplacement.estimatedPrice},expectedRevision:stored.record.revision});
 assert.equal(legacyRecovery.code,200,JSON.stringify(legacyRecovery.body));assert(stored.record.intradayActivity.fills.some(f=>f.side==='buy'&&f.symbol===recoveredReplacement.symbol));
 stored=fallbackStored;
 openingUnavailable=false;r=await request();assert.equal(r.code,200,JSON.stringify(r.body));assert.equal(r.body.manualRecommendations.status,'ready');assert.equal(r.body.intradaySession.plan.recordingOnly,undefined);
 assert.equal(r.body.decision.actualCash,fallbackCash);assert(r.body.manualRecommendations.orders.some(o=>o.side==='buy'));
 r=await request({operation:'record-intraday',ticket,expectedRevision:0});assert.equal(r.code,200,JSON.stringify(r.body));assert.equal(r.body.decision.actualCash,fallbackCash,'Retry after provider recovery must not double-credit sale');
 const fallbackBuy=r.body.manualRecommendations.orders.find(o=>o.side==='buy'&&!o.condition);
 r=await request({operation:'record-intraday',ticket:{...buyTicket,id:'fallback-buy',symbol:fallbackBuy.symbol,price:fallbackBuy.estimatedPrice},expectedRevision:r.body.decision.revision});
 assert.equal(r.code,200,JSON.stringify(r.body));
 assert(stored.record.intradayActivity.recordingEvidence,'Purchase retains accounting-only exit evidence');
 const fallbackBought=service.deriveC1CompletedAccount({account:stored.record,book:closeBook,now:new Date(opening.date+'T21:00:00Z')});
 assert(fallbackBought.records[0].recordingEvidence,'Closing replay retains accounting-only exit evidence after purchase');
 stored={record:JSON.parse(original),etag:'moved0'};moved=false;
 r=await request({operation:'record-intraday',ticket,expectedRevision:0});assert.equal(r.code,200);
 moved=true;r=await request();assert.equal(r.code,200,JSON.stringify(r.body));
 const apiAlternative=r.body.manualRecommendations.orders.find(o=>o.side==='buy'&&!selectedAtOpen.has(o.symbol));assert(apiAlternative,'API must promote the next queued eligible stock after price rejection');
 assert(r.body.openingPlan.entryRecheck.blocks.length>0);
 r=await request({operation:'record-intraday',ticket:{...buyTicket,id:'api-alternative',symbol:apiAlternative.symbol,price:apiAlternative.estimatedPrice},expectedRevision:r.body.decision.revision});assert.equal(r.code,200,JSON.stringify(r.body));
 assert(stored.record.intradayActivity.entryPlanEvidence,'Purchase retains original replacement-plan evidence');
 const apiClosed=service.deriveC1CompletedAccount({account:stored.record,book:closeBook,now:new Date(opening.date+'T21:00:00Z')});
 assert(apiClosed.records[0].entryPlanEvidence,'Close replay retains original replacement-plan evidence');
 assert(service.evaluateC1Account({account:apiClosed,book:closeBook,now:new Date(opening.date+'T21:00:00Z')}).positions.some(p=>p.symbol===apiAlternative.symbol&&p.shares===1));
 r=await request();assert.equal(r.code,200);assert(r.body.decision.positions.some(p=>p.symbol===apiAlternative.symbol));
 stored={record:JSON.parse(original),etag:'owner-exit0'};moved=false;priceRevision=false;openingUnavailable=false;
 r=await request({operation:'record-intraday',ticket:{...ticket,id:'api-owner-exit',recordingReason:'owner-discretionary-exit'},expectedRevision:0});
 assert.equal(r.code,200,JSON.stringify(r.body));assert(!r.body.decision.positions.some(p=>p.symbol==='T4'));
 assert(r.body.manualRecommendations.orders.some(o=>o.side==='buy'&&o.postExitReplacement===true),'API must return the frozen next queued entry after an owner-recorded exit');
 assert(stored.record.intradayActivity.recordingEvidence.orders.some(o=>o.postExitReplacement===true));
 const afterCloseNow=new Date(opening.date+'T20:30:00Z');
 const afterCloseHandler=context.factory({environment:'preview',commit:'test',clock:()=>afterCloseNow,readBook:async()=>({record:baselineBook}),collectOpening:async()=>{throw Error('Opening collection must not be required after close');},store:{read:async()=>stored,write:async(path,record,etag)=>{assert.equal(etag,stored.etag);stored={record,etag:'v'+(++writes)};}}});
 async function afterCloseRequest(body={operation:'prepare-execution'}){const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};await afterCloseHandler({method:body?'POST':'GET',headers:{authorization:'Bearer '+'fixture'.repeat(6)},body},res);return res;}
 let afterClose=await afterCloseRequest();assert.equal(afterClose.code,200);assert.equal(afterClose.body.intradaySession.afterClose,true,'The saved same-day plan remains available after the closing bell');
 const afterCloseOrder=stored.record.intradayActivity.plan.orders.find(o=>o.side==='buy'&&o.postExitReplacement===true);
 const afterCloseBuy={id:'after-close-broker-purchase',symbol:afterCloseOrder.symbol,side:'buy',shares:1,price:afterCloseOrder.estimatedPrice,fee:0,executedAt:opening.date+'T19:30:00Z'};
 afterClose=await afterCloseRequest({operation:'record-intraday',ticket:afterCloseBuy,expectedRevision:stored.record.revision});
 assert.equal(afterClose.code,200,JSON.stringify(afterClose.body));assert.equal(afterClose.body.intradaySession.tickets.length,2);assert(stored.record.intradayActivity.tickets.some(t=>t.id===afterCloseBuy.id));
 r=await request({operation:'record-session',record:{date:opening.date,entryRecheck:{}},expectedRevision:stored.record.revision});assert.equal(r.code,409);assert.match(r.body.error,/server only/);
 const beforeEvidenceInjection=JSON.stringify(stored);
 for(const field of ['executionEvidence','recordingEvidence','entryPlanEvidence']){
  r=await request({operation:'record-session',record:{date:opening.date,[field]:plan},expectedRevision:stored.record.revision});
  assert.equal(r.code,409);assert.match(r.body.error,/server only/);assert.equal(JSON.stringify(stored),beforeEvidenceInjection,'A client cannot inject server execution evidence');
 }

 // Production failure: compact carry fell back to pending opening planning
 // whenever a saved account contained intradayActivity. A valid daily capture
 // observed before the next opening then rejected the whole display request.
 const completedNow=new Date(opening.date+'T21:00:00Z');
 const preOpeningBook=preOpeningCloseBook;
 const persisted={record:JSON.parse(JSON.stringify(saved)),etag:'immutable-regression'};
 assert.throws(()=>execution.planC1ContinuedAccountOpening({adoption:persisted.record.adoption,sessions:[baseline],records:[],opening,observedAt:opening.date+'T12:00:00Z'}),/The next observed market opening is required/,'The fixture exercises the original prospective-opening failure');
 let openingCalls=0,inputCalls=0,accountWrites=0;
 const completedHandler=context.factory({clock:()=>completedNow,readBook:async()=>({record:preOpeningBook}),
  collectOpening:async()=>{openingCalls++;throw Error('The next observed market opening is required');},
  collectHoldings:async()=>{inputCalls++;throw Error('Unexpected display holding verification');},
  collectRanks:async()=>{inputCalls++;throw Error('Unexpected display rank verification');},
  store:{read:async()=>persisted,write:async()=>{accountWrites++;throw Error('Display analysis must never write account data');}}});
 const immutable=JSON.stringify(persisted),completedViews=[];
 for(const request of [{method:'GET'},{method:'POST',body:{operation:'refresh-analysis'}},{method:'POST',body:{operation:'refresh-analysis'},query:{compact:'1'}}]){
  const result={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
  await completedHandler({...request,headers:{authorization:'Bearer '+'fixture'.repeat(6)}},result);
  assert.equal(result.code,200,JSON.stringify(result.body));assert.equal(result.body.decision.current,true);
  assert(!result.body.decision.positions.some(p=>p.symbol==='T4'));
  assert(Math.abs(result.body.decision.actualCash-view.actualCash)<1e-7,'Posted fills and fees survive completed analysis without opening planning');
  assert.equal(result.body.openingPlan,null);assert.equal(result.body.manualRecommendations.status,'waiting');
  completedViews.push(result.body.decision);
 }
 assert.equal(JSON.stringify(completedViews[0]),JSON.stringify(completedViews[1]));assert.equal(JSON.stringify(completedViews[1]),JSON.stringify(completedViews[2]));
 const laterHandler=context.factory({clock:()=>new Date(following.date+'T21:00:00Z'),readBook:async()=>({record:followingBook}),collectOpening:async()=>{openingCalls++;throw Error('Unexpected opening verification');},store:{read:async()=>persisted,write:async()=>{accountWrites++;throw Error('Unexpected account write');}}});
 const later={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
 await laterHandler({method:'GET',headers:{authorization:'Bearer '+'fixture'.repeat(6)}},later);
 assert.equal(later.code,200,JSON.stringify(later.body));assert.equal(later.body.decision.sourceSessionDate,following.date);
 assert.equal(later.body.intradaySession,null,'An older completed activity must not expose a current-session trade form');
 assert.equal(openingCalls,0);assert.equal(inputCalls,0);assert.equal(accountWrites,0);assert.equal(JSON.stringify(persisted),immutable);
 console.log('PASS: saved intradayActivity completed-session GET/refresh shares one decision, preserves posted cash/fills, never invokes opening planning or writes account data.');
 console.log('PASS: a regular-session broker fill can be recorded from its saved plan after the closing bell without creating a new recommendation.');
 console.log('PASS: missing candidate data → recorded exit → preserved cash → verified-plan recovery and closing replay; no buy authorization bypass.');
 console.log('PASS: intraday API sale → actual cash → qualified replacement → recorded purchase → reload → closing replay; partial sales, duplicates, storage failure and Core preservation.');
})().catch(e=>{console.error(e);process.exitCode=1;});

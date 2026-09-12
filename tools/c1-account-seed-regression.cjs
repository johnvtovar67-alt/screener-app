const assert=require('node:assert/strict');
require('node:child_process').execFileSync(process.execPath,['tools/generate-c1-account-simulator.cjs','--check']);
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const {simulatePointInTimePortfolio:frozen}=loader.load('lib/c1FrozenSimulator.js');
const {simulatePointInTimePortfolio:account}=loader.load('lib/c1AccountSimulator.js');
const {C1_FROZEN_OPTIONS:options}=loader.load('lib/c1FrozenOptions.js');
const {createC1ProspectiveSeeds:create,C1_ACCOUNT_SEED_CONTRACT:contract}=loader.load('lib/c1AccountSeed.js');
const {isUsMarketSessionDay}=loader.load('lib/marketSession.js');
const {portfolioCompositionSignature:signature}=loader.load('lib/portfolioGovernor.js');
const sessions=[],symbols=Array.from({length:12},(_,i)=>'T'+i);
for(let t=Date.parse('2026-03-02T12:00:00Z');sessions.length<80;t+=86400000){
 const date=new Date(t).toISOString().slice(0,10);if(!isUsMarketSessionDay(date))continue;
 const day=sessions.length;
 const prices=[...symbols,'SPY','QQQ'].map((symbol,i)=>{
   const prior=day?sessions.at(-1).prices[i].close:100,close=prior*(day===25?.84:1+.001*(i%3+1));
   return {symbol,open:prior,close,high:Math.max(prior,close)*1.01,low:Math.min(prior,close)*.99,volume:10000000,adjusted:true};
 });
 sessions.push({date,decisionAt:date+'T21:00:00Z',universeSymbols:symbols,prices,
   signals:symbols.map((symbol,i)=>({symbol,sector:'Sector'+i%4,price:prices[i].close,
     researchFactors:{momentumPercentile:100-((i+Math.floor(day/18)*4)%12),volatility60Pct:20,coverage:1,return60Ex5:20,return120Ex5:30,return252Ex21:40},
     entryTiming:{available:true,liquidityPass:true,averageDollarVolume20:500000000}}))});
}
for(const config of Object.values(options)){
 const opts={...config,startDate:sessions[0].date,endDate:sessions.at(-1).date,liquidateAtEnd:false};
 assert.equal(JSON.stringify(account({sessions},opts)),JSON.stringify(frozen({sessions},opts)),'No-account runtime must exactly match the unchanged frozen engine');
}
const baseline=sessions[35],close=baseline.prices.find(p=>p.symbol==='T4').close;
const holding={symbol:'T4',role:'Swing',shares:10,entryPrice:close,openedAt:sessions[0].date,sector:'Sector0',issuer:'symbol:T4'};
const seed={contract,sleeve:'base',asOfSession:baseline.date,prospectiveAdoptionConfirmed:true,cash:100000-10*close,highWater:100000,remainingCooldownSessions:0,positions:[holding]};
const opts={...options.base,startDate:baseline.date,endDate:baseline.date,liquidateAtEnd:false};
const seeded=account({sessions},opts,seed);
assert.equal(seeded.trades.length,0,'Opening positions cannot become fabricated purchases or same-day sales');
assert.equal(seeded.openPositions[0].enteredAt,sessions[0].date);
assert.ok(seeded.pendingDecisions.some(o=>o.symbol==='T4'&&o.side==='sell'),'Old lower-ranked holding retains its elapsed minimum hold');
const young=account({sessions},opts,{...seed,positions:[{...holding,openedAt:baseline.date}]});
assert.ok(!young.pendingDecisions.some(o=>o.symbol==='T4'&&o.side==='sell'),'New holding retains the minimum holding period');
assert.equal(seeded.openPositions[0].stopPrice,close*.86);
assert.equal(seeded.accountOrigin.historicalPurchasesInferred,false);
const retainedLoss=account({sessions},{...opts,endDate:sessions[36].date},{...seed,highWater:120000,positions:[{...holding,openedAt:baseline.date}]});
assert.ok(retainedLoss.trades.some(t=>t.reason==='portfolio-drawdown-stop'),'Existing loss history cannot be reset at adoption');
assert.throws(()=>account({sessions},opts,{...seed,cash:0}),/do not reconcile/);
assert.throws(()=>account({sessions},opts,{...seed,positions:[{...holding,symbol:'MSTR'}]}),/excluded/);
assert.throws(()=>account({sessions},opts,{...seed,positions:[{...holding,openedAt:'2026-02-31'}]}),/holding date/);
assert.throws(()=>account({sessions},{...opts,rankedExitBuffer:9},seed),/frozen C1 options/);
const portfolio=[{symbol:'T4',role:'Swing',shares:3,avgCost:close,openedAt:sessions[0].date},{symbol:'MSTR',role:'Core',shares:2},{symbol:'CASH',role:'Swing',shares:1234.56,avgCost:1}];
const capitalRecord={version:2,highWater:1234.56+3*close,triggerDay:null,portfolioSignature:signature(portfolio),reconciliationRequired:false};
const adoption=create({portfolio,baseline,capitalRecord,adoptionConfirmed:true});
let cash=0,shares=0;
for(const s of Object.values(adoption.seeds)){cash+=s.cash*s.actualDollarsPerModelDollar;shares+=s.positions[0].shares*s.actualDollarsPerModelDollar;account({sessions},{...options[s.sleeve],startDate:baseline.date,endDate:baseline.date,liquidateAtEnd:false},s);}
assert.ok(Math.abs(cash-1234.56)<1e-8);assert.ok(Math.abs(shares-3)<1e-8);
assert.equal(adoption.historicalSleeveOwnershipInferred,false);assert.equal(adoption.executable,false);
assert.throws(()=>create({portfolio,baseline,capitalRecord:{...capitalRecord,reconciliationRequired:true},adoptionConfirmed:true}),/Reconcile/);
console.log('PASS: unchanged-engine parity in all three sleeves; real opening balances, old/new holding periods, initial stops, retained drawdown, exact account-unit conservation and no inferred historical buys.');
const {planC1ActualAccountOpening:planOpening,reconcileC1ActualAccountFills:reconcile}=loader.load('lib/c1AccountExecution.js');
const opening={...sessions[36],corporateActions:[]};
const observedAt=opening.date+'T14:00:00Z';
const plan=planOpening({adoption,baseline,opening,observedAt});
assert.ok(plan.orders.length>0,'A valid seeded account must produce opening orders');
assert.ok(plan.orders.every(o=>Number.isSafeInteger(o.shares)&&o.shares>0));
assert.ok(Object.values(plan.projectedBooks).every(b=>b.cash>=0));
const untouched=reconcile({plan,fills:[],observedAt});
assert.equal(JSON.stringify(untouched.books),JSON.stringify(plan.openingBooks),'Unfilled projections must never change actual balances');
assert.ok(Math.abs(untouched.actualCash-adoption.actualCash)<1e-8);
assert.throws(()=>planOpening({adoption,baseline,opening:{...opening,prices:[]},observedAt}),/Missing opening quote/);
assert.throws(()=>planOpening({adoption,baseline,opening,observedAt:opening.date+'T12:00:00Z'}),/next observed market opening/);
console.log('PASS: first opening produces funded whole-share orders; zero actual fills preserve opening balances.');
const fixture={contract:'c1-actual-account-opening-plan-v1',date:opening.date,openingBooks:{base:{cash:1000,positions:{T4:{shares:5,avgCost:90,openedAt:baseline.date}}},cooldown15:{cash:500,positions:{}},sector40:{cash:250,positions:{}}},orders:[{id:'sell',sleeve:'base',symbol:'T4',side:'sell',shares:5},{id:'buy',sleeve:'base',symbol:'T5',side:'buy',shares:10}]};
const sell={id:'fill-1',orderId:'sell',symbol:'T4',side:'sell',shares:2,price:100,fee:.50,executedAt:opening.date+'T13:31:00Z'};
const buy={id:'fill-2',orderId:'buy',symbol:'T5',side:'buy',shares:3,price:101,fee:1,executedAt:opening.date+'T13:32:00Z'};
const actual=reconcile({plan:fixture,fills:[sell,buy],observedAt});
assert.equal(actual.books.base.cash,895.5);
assert.equal(actual.books.base.positions.T4.shares,3);
assert.equal(actual.books.base.positions.T4.openedAt,baseline.date);
assert.equal(actual.books.base.positions.T5.shares,3);
assert.equal(actual.books.base.positions.T5.avgCost,304/3);
assert.equal(actual.outstanding.find(o=>o.id==='sell').shares,3);
assert.equal(actual.outstanding.find(o=>o.id==='buy').shares,7);
assert.equal(actual.books.cooldown15.cash,500);
assert.equal(JSON.stringify(reconcile({plan:fixture,fills:[sell,sell,buy],observedAt})),JSON.stringify(actual),'Exact duplicate fill is idempotent');
assert.throws(()=>reconcile({plan:fixture,fills:[sell,{...sell,fee:1}],observedAt}),/Conflicting/);
assert.throws(()=>reconcile({plan:fixture,fills:[{...sell,shares:6}],observedAt}),/exceed/);
assert.throws(()=>reconcile({plan:fixture,fills:[{...buy,shares:10,price:200}],observedAt}),/exceeds its sleeve cash/);
assert.throws(()=>reconcile({plan:fixture,fills:[buy,sell],observedAt}),/execution time/);
assert.throws(()=>reconcile({plan:fixture,fills:[{...buy,symbol:'MSTR'}],observedAt}),/does not match/);
assert.equal(actual.modelAdvanceAuthorized,false);
console.log('PASS: partial fills, posted fees, original dates, independent sleeve cash, duplicate handling and oversell/overspend rejection.');
const next=sessions[37];
const noFills={contract:'c1-actual-fill-replay-v1',sessions:[{date:opening.date,fills:[]},{date:next.date,fills:[]}]};
const unfilled=account({sessions},{...opts,endDate:next.date},seed,noFills);
assert.equal(unfilled.trades.length,0);
assert.equal(unfilled.openPositions[0].shares,10);
assert.equal(unfilled.openPositions[0].enteredAt,sessions[0].date);
assert.equal(unfilled.actualCash,seed.cash);
assert.throws(()=>account({sessions},{...opts,endDate:next.date},seed,{...noFills,sessions:[]}),/Missing/);
const partialRecord={date:opening.date,fills:[{symbol:'T4',side:'sell',reason:'rank-deterioration',shares:2,price:91,fee:.5}]};
const stableRanks=sessions.map(s=>s.date>baseline.date?{...s,signals:baseline.signals}:s);
const partialReplay=account({sessions:stableRanks},{...opts,endDate:next.date},seed,{...noFills,sessions:[partialRecord,{date:next.date,fills:[]}]});
assert.equal(partialReplay.openPositions.find(p=>p.symbol==='T4').shares,8);
assert.equal(partialReplay.actualCash,seed.cash+181.5);
assert.equal(partialReplay.trades.length,1);
assert.ok(partialReplay.pendingDecisions.some(p=>p.symbol==='T4'&&p.side==='sell'));
assert.throws(()=>account({sessions},{...opts,endDate:opening.date},seed,{...noFills,sessions:[{date:opening.date,fills:[{...partialRecord.fills[0],symbol:'ABSENT'}]}]}),/could not be applied/);
console.log('PASS: actual fills advance subsequent strategy sessions; unfilled ownership, original dates, cash and pending exits persist; missing/unmatched records fail without adopting a modeled account.');
// Real account orders are converted back with the original fixed scale; fees
// must match the independently reconciled ledger, including small partial buys.
const planFills=plan.orders.filter(o=>!o.condition).map((o,i)=>({id:'actual-'+i,orderId:o.id,symbol:o.symbol,side:o.side,shares:o.side==='buy'?1:o.shares,price:o.estimatedPrice,fee:.01,executedAt:opening.date+'T13:31:00Z'}));
assert.ok(planFills.some(f=>f.side==='buy'),'Fixture must exercise actual partial buys');
const planActual=reconcile({plan,fills:planFills,observedAt});
for(const id of ['base','cooldown15','sector40']){
 const aseed=adoption.seeds[id],scale=aseed.actualDollarsPerModelDollar;
 const fills=planFills.filter(f=>plan.orders.find(o=>o.id===f.orderId).sleeve===id).map(f=>({...f,reason:plan.orders.find(o=>o.id===f.orderId).reason,shares:f.shares/scale,fee:f.fee/scale}));
 const run=account({sessions},{...options[id],startDate:baseline.date,endDate:next.date,liquidateAtEnd:false},aseed,{...noFills,sessions:[{date:opening.date,fills},{date:next.date,fills:[]}]});
 assert.ok(Math.abs(run.actualCash*scale-planActual.books[id].cash)<1e-6);
 const held=Object.fromEntries(run.openPositions.map(p=>[p.symbol,Math.round(p.shares*scale)]));
 const ledgerHeld=Object.fromEntries(Object.entries(planActual.books[id].positions).map(([s,p])=>[s,p.shares]));
 assert.equal(JSON.stringify(Object.entries(held).sort()),JSON.stringify(Object.entries(ledgerHeld).sort()));
 for(const p of run.openPositions)if(p.enteredAt===opening.date)assert.ok(Math.abs(p.initialStopPrice-p.entryPrice*.86)<1e-7);
}
console.log('PASS: all three continuing sleeves match independently reconciled whole shares and actual cash after partial buys and fees, with actual execution-price stops.');
const {continueC1ActualAccount:continueAccount,planC1ContinuedAccountOpening:planContinued}=loader.load('lib/c1AccountExecution.js');
const records=[{date:opening.date,complete:true,openingObservedAt:observedAt,fills:planFills}];
const closedSessions=[baseline,opening];
const continued=continueAccount({adoption,sessions:closedSessions,records,observedAt:opening.date+'T21:00:00Z'});
assert.ok(Math.abs(continued.actualCash-planActual.actualCash)<1e-6);
assert.equal(JSON.stringify(continued.books),JSON.stringify(planActual.books));
const laterPlan=planContinued({adoption,sessions:closedSessions,records,opening:{...next,corporateActions:[]},observedAt:next.date+'T14:00:00Z'});
assert.equal(JSON.stringify(laterPlan.openingBooks),JSON.stringify(planActual.books));
assert.ok(laterPlan.orders.every(o=>Number.isSafeInteger(o.shares)));
assert.throws(()=>continueAccount({adoption,sessions:closedSessions,records:[{...records[0],complete:false}],observedAt:opening.date+'T21:00:00Z'}),/Confirm complete/);
assert.throws(()=>continueAccount({adoption,sessions:closedSessions,records,observedAt}),/completed sessions/);
console.log('PASS: account coordinator regenerates order identities from actual history, reconciles all three sleeves and plans the following opening without resetting account units.');
const lossSeed={...seed,highWater:120000,positions:[{...holding,openedAt:baseline.date}]};
const pausedUnfilled=account({sessions},{...opts,endDate:next.date},lossSeed,noFills);
assert.equal(pausedUnfilled.trades.length,0);
assert.equal(pausedUnfilled.openPositions[0].shares,10);
assert.ok(pausedUnfilled.pendingDecisions.some(o=>o.symbol==='T4'&&o.reason==='portfolio-drawdown-stop'),'An unfilled breaker exit must persist during the cooldown');
assert.ok(pausedUnfilled.accountRisk.pausedThrough>pausedUnfilled.accountRisk.activeSessionNumber);
console.log('PASS: a triggered but unfilled risk exit remains pending through cooldown instead of disappearing.');
const {adoptC1Account:adoptService,evaluateC1Account:evaluateService,appendC1AccountSession:appendService,pendingC1AccountSession:pendingService}=loader.load('lib/c1AccountService.js');
const {c1AccountPositionDecision:positionDecision,c1AccountMatchesPortfolio:matchesPortfolio}=loader.load('lib/c1AccountDecision.js');
const baselineBook={universe:'sp500',model:{sessions:[baseline]},captures:[{sessionDate:baseline.date,hash:'baseline-fixture',observedAt:baseline.date+'T21:00:00Z'}]};
const privateAccount=adoptService({portfolio,capitalRecord,book:baselineBook,now:new Date(baseline.date+'T21:00:00Z')});
const initialView=evaluateService({account:privateAccount,book:baselineBook,now:new Date(baseline.date+'T21:00:00Z')});
assert.equal(matchesPortfolio(initialView,portfolio),true);
const {c1AccountHoldingExplanation:explainHolding}=loader.load('lib/c1AccountDecision.js');
const explanationFixture={exits:[],stops:[{price:86}],reviewRules:[{heldSessions:2,minimumHold:30,exitBuffer:6,close:97}]};
const youngReason=explainHolding(explanationFixture,'2026-09-11');
assert.ok(youngReason.includes('2 of 30 trading sessions'));
assert.ok(youngReason.includes('Recorded stop: $86.00'));
assert.ok(youngReason.includes('Latest account close: $97.00 (2026-09-11)'));
const riskReason=explainHolding({...explanationFixture,inheritedRiskOnly:true},'2026-09-11');
assert.ok(riskReason.includes('Current momentum-ranking data does not cover this holding'));
assert.ok(!riskReason.includes('Inherited holding'));
assert.ok(!riskReason.includes('rank-based selling is eligible'));
const missingStop=explainHolding({...explanationFixture,stops:[{price:null}]},'2026-09-11');
assert.ok(missingStop.includes('No recorded stop price'));
assert.ok(!missingStop.includes('$0.00'));
const matureReason=explainHolding({...explanationFixture,reviewRules:[{heldSessions:31,minimumHold:30,exitBuffer:6,close:97}],exits:[{reason:'rank-deterioration'}]},'2026-09-11');
assert.ok(matureReason.includes('outside the C1 holding range'));
assert.ok(matureReason.includes('fall outside the top 6'));
assert.ok(initialView.positions.every(p=>p.reason.includes('Recorded stop:')||p.reason.includes('Recorded stops:')));
console.log('PASS: Holding explanations use actual dates, stops and closing marks; ranking coverage never implies purchase provenance.');

assert.equal(matchesPortfolio(initialView,portfolio.map(p=>p.symbol==='T4'?{...p,shares:2}:p)),false);
assert.equal(positionDecision(initialView,'T4').decisionId,initialView.decisionId);
const updatedBook={...baselineBook,model:{sessions:[baseline,opening]},captures:[...baselineBook.captures,{sessionDate:opening.date,hash:'opening-fixture',observedAt:opening.date+'T21:00:00Z'}]};
const pending=pendingService({account:privateAccount,book:updatedBook,now:new Date(opening.date+'T21:00:00Z')});
assert.equal(pending.date,opening.date);
const updatedAccount=appendService({account:privateAccount,record:records[0],book:updatedBook,expectedRevision:0,now:new Date(opening.date+'T21:00:00Z')});
const shared=evaluateService({account:updatedAccount,book:updatedBook,now:new Date(opening.date+'T21:00:00Z')});
assert.equal(shared.current,true);
assert.equal(shared.revision,1);
assert.equal(shared.executable,false);
assert.ok(shared.opportunities.every(p=>!['MSTR','SCHW'].includes(p.symbol)));
assert.throws(()=>appendService({account:updatedAccount,record:records[0],book:updatedBook,expectedRevision:0}),/Account changed/);
assert.throws(()=>evaluateService({account:updatedAccount,book:{...updatedBook,captures:[{...updatedBook.captures[0],hash:'changed'},updatedBook.captures[1]]}}),/input changed/);
console.log('PASS: shared account decisions bind original inputs, accepted activity and revision; stale ownership cannot reuse candidates, and forbidden purchases remain excluded.');
const vm=require('node:vm'),fs=require('node:fs');
const route=fs.readFileSync('pages/api/c1-account.js','utf8').replace(/^import .*;$/gm,'').replace(/export const /g,'const ').replace(/export function /g,'function ').replace('export default createC1AccountHandler();','globalThis.factory=createC1AccountHandler;');
const fmpSource=fs.readFileSync('lib/fmpResearchBacktest.js','utf8');
const barHelpers=fmpSource.slice(fmpSource.indexOf('const asArray ='),fmpSource.indexOf('const usableAdjustedOhlcBar ='));
const barNormalizer=fmpSource.slice(fmpSource.indexOf('export function normalizeHistoricalBars('),fmpSource.indexOf('export async function resolvePriceHistoryContract(')).replace('export function','function');
const holdingSource=fs.readFileSync('lib/c1HoldingCoverage.js','utf8').replace(/^import .*;$/gm,'').replace(/export (async )?function /g,(_,a)=>(a||'')+'function ');
const holdingBox={...loader.load('lib/marketSession.js'),Date,URLSearchParams,AbortSignal,process:{env:{}}};
vm.createContext(holdingBox);vm.runInContext(barHelpers+'\n'+barNormalizer+'\n'+holdingSource+'\nglobalThis.holdingExports={collectC1HoldingCoverage,missingC1HoldingPrices};',holdingBox);
const context={...loader.load('lib/c1ManualRecommendations.js'),...loader.load('lib/c1AccountService.js'),...loader.load('lib/c1AccountInput.js'),...holdingBox.holdingExports,applyC1OpeningPlan:loader.load('lib/c1AccountDecision.js').applyC1OpeningPlan,createHash:require('node:crypto').createHash,adoptC1Account:adoptService,evaluateC1Account:evaluateService,appendC1AccountSession:appendService,pendingC1AccountSession:pendingService,planC1ContinuedAccountOpening:planContinued,collectC1AccountOpening:async()=>null,process:{env:{}},get(){throw new Error('Unexpected provider call');},put(){throw new Error('Unexpected provider write');},Date};
vm.createContext(context);vm.runInContext(route,context);
(async()=>{
 let stored=null,writes=0,reads=0,fail=false,book=baselineBook;
 const handler=context.factory({environment:'preview',commit:'fixture',clock:()=>new Date(baseline.date+'T21:00:00Z'),
  readBook:async()=>{reads++;return {record:book};},
  store:{read:async()=>stored,write:async(path,record,etag)=>{if(fail)throw new Error('Storage write rejected');if(stored&&etag!==stored.etag)throw new Error('Conflicting account revision');stored={record,etag:String(++writes)};}}
 });
 async function request(method,body,authorized=true){const response={setHeader(){},status(code){this.code=code;return this;},json(value){this.body=value;return this;}};await handler({method,body,headers:authorized?{authorization:'Bearer '+'fixture'.repeat(6)}:{}},response);return response;}
 assert.equal((await request('POST',{},false)).code,401);assert.equal(reads,0);
 assert.equal((await request('GET')).code,404);assert.equal(reads,0,'An empty account read cannot start provider initialization');
 const body={operation:'adopt',portfolio,capitalRecord};
 fail=true;assert.equal((await request('POST',body)).code,409);assert.equal(stored,null);
 fail=false;assert.equal((await request('POST',body)).code,200);assert.equal(writes,1);
 assert.equal((await request('POST',body)).code,409);assert.equal(writes,1,'Existing account cannot reset');
 const response=await request('GET');assert.equal(response.code,200);assert.equal(response.body.decision.decisionId,initialView.decisionId);assert.equal(response.body.manualRecommendations.enabled,true);assert.equal(response.body.manualRecommendations.status,'waiting');assert.equal(response.body.manualRecommendations.brokerageExecutionAuthorized,false);
 assert.equal((await request('DELETE')).code,405);

 const testPortfolio=[...portfolio,{symbol:'OUT',shares:2,avgCost:1,role:'Swing'}],originalBook=JSON.stringify(baselineBook);
 let requests=0;
 const fetcher=async(url)=>{requests++;assert(url.includes('symbol=OUT'));if(url.includes('/profile?'))return {ok:true,json:async()=>[{symbol:'OUT',sector:'Healthcare',cik:'fixture-issuer'}]};return {ok:true,json:async()=>[{symbol:'OUT',date:baseline.date,adjOpen:100,adjHigh:102,adjLow:99,adjClose:101,volume:1000}]};};
 const covered=await holdingBox.holdingExports.collectC1HoldingCoverage({portfolio:testPortfolio,baseline,now:new Date(baseline.date+'T21:00:00Z'),fetcher,apiKey:'test-secret'});
 assert.equal(requests,2);assert.equal(covered.rows[0].status,'verified');assert.equal(covered.rows[0].price.close,101);assert.equal(covered.rows[0].inDecisionUniverse,false);
 assert.equal(JSON.stringify(baselineBook),originalBook,'Supplemental holdings cannot mutate index membership or prices');assert(!JSON.stringify(covered).includes('test-secret'));
 const bad=await holdingBox.holdingExports.collectC1HoldingCoverage({portfolio:testPortfolio,baseline,now:new Date(baseline.date+'T21:00:00Z'),fetcher:async()=>({ok:true,json:async()=>[{symbol:'WRONG',date:baseline.date,open:100,high:102,low:99,close:101}]}),apiKey:'test-secret'});
 assert.equal(bad.rows[0].status,'unavailable');
 console.log('PASS: outside-index holdings receive independently verified adjusted closes; wrong-symbol data rejects, credentials stay private, and accepted index data remains unchanged.');
 // Exercise the full previously blocked branch, including a persisted reload.
 const gapBook=JSON.parse(JSON.stringify(baselineBook));
 gapBook.model.sessions[0].prices=gapBook.model.sessions[0].prices.filter(p=>p.symbol!=='T4');
 const supplement={contract:'c1-held-price-coverage-v1',sourceSessionDate:baseline.date,rows:[{
  symbol:'T4',status:'verified',date:baseline.date,inDecisionUniverse:true,
  price:{...baseline.prices.find(p=>p.symbol==='T4'),date:baseline.date},
  source:{provider:'FMP',endpoint:'historical-price-eod/dividend-adjusted',observedAt:baseline.date+'T21:00:00Z'}
 }]};
 let gapSaved=null,gapWrites=0;
 const beforeGap=JSON.stringify(gapBook);
 const gapHandler=context.factory({environment:'preview',commit:'gap-fixture',clock:()=>new Date(baseline.date+'T21:00:00Z'),
  readBook:async()=>({record:gapBook}),collectHoldings:async()=>supplement,
  store:{read:async()=>gapSaved,write:async(path,record)=>{gapWrites++;gapSaved={record,etag:'1'};}}
 });
 async function gapRequest(method,body){const res={setHeader(){},status(code){this.code=code;return this;},json(value){this.body=value;return this;}};await gapHandler({method,body,headers:{authorization:'Bearer '+'fixture'.repeat(6)}},res);return res;}
 const activated=await gapRequest('POST',body);
 assert.equal(activated.code,200,JSON.stringify(activated.body));assert.equal(gapWrites,1);
 assert.equal(activated.body.decision.decisionId,initialView.decisionId);
 assert.equal((await gapRequest('GET')).body.decision.decisionId,activated.body.decision.decisionId);
 assert.equal(JSON.stringify(gapBook),beforeGap,'Activation must not mutate the source book');
 assert.equal(gapSaved.record.holdingCoverage.rows[0].price.close,close);
 const {c1AccountBook}=loader.load('lib/c1AccountInput.js');
 assert.throws(()=>c1AccountBook(baselineBook,supplement),/cannot replace/);
 assert.throws(()=>c1AccountBook(gapBook,{...supplement,rows:[supplement.rows[0],supplement.rows[0]]}),/Invalid verified/);
 assert.throws(()=>c1AccountBook({...gapBook,model:{sessions:[{...gapBook.model.sessions[0],universeSymbols:symbols.filter(s=>s!=='T4')}]}},supplement),/classification/);
 const gapNext={...updatedBook,model:{sessions:[gapBook.model.sessions[0],opening]}};
 const gapContinued=appendService({account:gapSaved.record,record:records[0],book:gapNext,expectedRevision:0,now:new Date(opening.date+'T21:00:00Z')});
 assert.equal(evaluateService({account:gapContinued,book:gapNext,now:new Date(opening.date+'T21:00:00Z')}).decisionId,shared.decisionId);
 // Nonmembers use a distinct inherited-risk path, never fabricated ranks.
 const inheritedPortfolio=[{symbol:'OUT',shares:8,avgCost:101,openedAt:sessions[0].date,role:'Swing'},{symbol:'CASH',shares:10000,avgCost:1,role:'Swing'}];
 const inheritedCapital={version:2,portfolioSignature:signature(inheritedPortfolio),highWater:10808,triggerDay:null,reconciliationRequired:false};
 const inherited=adoptService({portfolio:inheritedPortfolio,capitalRecord:inheritedCapital,book:baselineBook,holdingCoverage:covered,now:new Date(baseline.date+'T21:00:00Z')});
 const inheritedView=evaluateService({account:inherited,book:baselineBook,now:new Date(baseline.date+'T21:00:00Z')});
 assert.equal(inheritedView.positions[0].shares,8);
 assert.equal(inheritedView.positions[0].action,'Risk monitoring');
 assert.equal(inherited.adoption.actualSwingEquity,10808);
 assert.ok(inheritedView.positions[0].exits.length===0,'Being outside rankings cannot cause an inherited rank exit after 30 sessions');
 assert.ok(inheritedView.opportunities.every(p=>p.symbol!=='OUT'));
 const inheritedBook=c1AccountBook(baselineBook,covered);
 assert.equal(inheritedBook.model.sessions[0].universeSymbols.includes('OUT'),false);
 assert.equal(inheritedBook.model.sessions[0].signals.some(s=>s.symbol==='OUT'),false);
 const futureCoverage={...covered,sourceSessionDate:opening.date,rows:covered.rows.map(r=>({...r,date:opening.date,price:{...r.price,date:opening.date,open:101,high:102,low:99,close:101}}))};
 const inheritedFuture={...inherited,holdingCoverages:[covered,futureCoverage]};
 const inheritedPending=pendingService({account:inheritedFuture,book:updatedBook,now:new Date(opening.date+'T21:00:00Z')});
 assert.ok(!inheritedPending.plan.orders.some(o=>o.symbol==='OUT'&&!o.condition));
 const inheritedRecord={date:opening.date,openingObservedAt:inheritedPending.openingObservedAt,complete:true,fills:[]};
 const inheritedNext=appendService({account:inheritedFuture,record:inheritedRecord,book:updatedBook,expectedRevision:0,now:new Date(opening.date+'T21:00:00Z')});
 assert.equal(evaluateService({account:inheritedNext,book:updatedBook,now:new Date(opening.date+'T21:00:00Z')}).positions[0].shares,8);
 for(const [id,seed] of Object.entries(inherited.adoption.seeds)){
  const falling={...inheritedBook.model.sessions[0],date:opening.date,prices:[...opening.prices,{symbol:'OUT',date:opening.date,open:80,high:81,low:79,close:80,adjusted:true}]};
  const stoppedLegacy=account({sessions:[inheritedBook.model.sessions[0],falling]},{...options[id],startDate:baseline.date,endDate:opening.date,liquidateAtEnd:false},seed);
  assert.ok(stoppedLegacy.trades.some(t=>t.symbol==='OUT'&&['initial-stop','portfolio-drawdown-stop'].includes(t.reason)),'Inherited stop remains effective');
 }
 let inheritedSaved=null,inheritedApiBook=baselineBook,coverageCalls=0;
 const inheritedHandler=context.factory({clock:()=>new Date(opening.date+'T21:00:00Z'),readBook:async()=>({record:inheritedApiBook}),collectHoldings:async({baseline:b})=>{coverageCalls++;return b.date===baseline.date?covered:futureCoverage;},
  store:{read:async()=>inheritedSaved,write:async(path,record)=>{inheritedSaved={record,etag:'1'};}}
 });
 // Adoption uses a clock matching its current completed source session.
 const inheritedAdoptHandler=context.factory({clock:()=>new Date(baseline.date+'T21:00:00Z'),readBook:async()=>({record:baselineBook}),collectHoldings:async()=>covered,
  store:{read:async()=>inheritedSaved,write:async(path,record)=>{inheritedSaved={record,etag:'1'};}}
 });
 async function inheritedRequest(handler,method,body){const res={setHeader(){},status(code){this.code=code;return this;},json(value){this.body=value;return this;}};await handler({method,body,headers:{authorization:'Bearer '+'fixture'.repeat(6)}},res);return res;}
 const inheritedActivated=await inheritedRequest(inheritedAdoptHandler,'POST',{operation:'adopt',portfolio:inheritedPortfolio,capitalRecord:inheritedCapital});
 assert.equal(inheritedActivated.code,200,JSON.stringify(inheritedActivated.body));
 inheritedApiBook=updatedBook;
 const inheritedGet=await inheritedRequest(inheritedHandler,'GET');
 assert.equal(inheritedGet.code,200,JSON.stringify(inheritedGet.body));assert.equal(inheritedGet.body.pendingSession.date,opening.date);
 assert.equal(inheritedSaved.record.revision,0,'A GET cannot record transactions');
 const inheritedPost=await inheritedRequest(inheritedHandler,'POST',{operation:'record-session',record:inheritedRecord,expectedRevision:0});
 assert.equal(inheritedPost.code,200,JSON.stringify(inheritedPost.body));assert.equal(inheritedSaved.record.revision,1);
 assert.equal(inheritedSaved.record.holdingCoverages.length,2,'Posted activity retains the verified continuation price');
 assert.equal(inheritedPost.body.decision.positions[0].shares,8);
 assert.equal((await inheritedRequest(inheritedHandler,'GET')).code,200);
 assert.equal(coverageCalls,2,'Committed supplemental observations are reused, not silently revised');
 const {correctC1AccountOpenedAt}=loader.load('lib/c1AccountService.js');
 const originalAccount=JSON.stringify(inheritedSaved.record);
 const corrected=correctC1AccountOpenedAt({account:inheritedSaved.record,symbol:'OUT',openedAt:sessions[1].date,expectedRevision:1,book:updatedBook,now:new Date(opening.date+'T21:00:00Z')});
 assert.equal(JSON.stringify(inheritedSaved.record),originalAccount,'Correction cannot mutate the original account');
 assert.equal(corrected.revision,2);assert.equal(corrected.corrections[0].previousDates[0],sessions[0].date);
 assert.equal(JSON.stringify(corrected.records),JSON.stringify(inheritedSaved.record.records));
 for(const [id,seed] of Object.entries(corrected.adoption.seeds)){assert.equal(seed.highWater,inheritedSaved.record.adoption.seeds[id].highWater);assert.equal(seed.actualDollarsPerModelDollar,inheritedSaved.record.adoption.seeds[id].actualDollarsPerModelDollar);}
 const correctedApi=await inheritedRequest(inheritedHandler,'POST',{operation:'correct-opening-date',symbol:'OUT',openedAt:sessions[1].date,expectedRevision:1});
 assert.equal(correctedApi.code,200,JSON.stringify(correctedApi.body));assert.equal(correctedApi.body.decision.positions[0].openedAt,sessions[1].date);
 assert.equal(correctedApi.body.decision.positions[0].shares,8);
 assert.equal((await inheritedRequest(inheritedHandler,'POST',{operation:'correct-opening-date',symbol:'OUT',openedAt:baseline.date,expectedRevision:1})).code,409,'Concurrent stale date updates cannot overwrite the correction');
 assert.throws(()=>correctC1AccountOpenedAt({account:corrected,symbol:'OUT',openedAt:'2026-02-31',expectedRevision:2,book:updatedBook}),/valid first-purchase/);
 console.log('PASS: audited opening-date correction preserves holdings, cash, fills, capital peaks and sleeve units; stale revisions and invalid dates reject.');
 console.log('PASS: inherited nonmember retains real equity and shares across sessions, never enters C1 rankings, avoids false rank exits and retains stop protection.');
 console.log('PASS: verified missing constituent price activates, persists, reloads and continues actual fills without changing the accepted index or admitting outside holdings to entry rankings.');
 console.log('PASS: actual account API rejects unauthenticated access, preserves failed writes and existing accounts, and performs no provider initialization.');
})().catch(error=>{console.error(error);process.exitCode=1;});
const stopOrder=plan.orders.find(o=>o.condition==='stop-triggered'&&planFills.some(f=>f.side==='buy'&&f.symbol===o.symbol&&plan.orders.find(x=>x.id===f.orderId).sleeve===o.sleeve));
assert.ok(stopOrder,'Opening plans include standing stops without assuming a sale');
const stoppedFill={id:'actual-stop',orderId:stopOrder.id,symbol:stopOrder.symbol,side:'sell',shares:1,price:stopOrder.estimatedPrice*.999,fee:.01,executedAt:opening.date+'T15:00:00Z'};
const stopSession={...opening,prices:opening.prices.map(p=>p.symbol===stopOrder.symbol?{...p,low:stopOrder.estimatedPrice*.99,close:stopOrder.estimatedPrice}:p)};
const stopped=continueAccount({adoption,sessions:[baseline,stopSession],records:[{...records[0],fills:[...planFills,stoppedFill]}],observedAt:opening.date+'T21:00:00Z'});
assert.equal(stopped.books[stopOrder.sleeve].positions[stopOrder.symbol],undefined);
assert.ok(stopped.sleeves[stopOrder.sleeve].trades.some(t=>t.symbol===stopOrder.symbol&&t.reason==='initial-stop'));
console.log('PASS: a partial actual entry can trigger its recorded standing stop later in the session; untriggered stops do not become fabricated exits.');

const openingProviderSource=fs.readFileSync('lib/c1AccountOpeningProvider.js','utf8').replace(/^import .*;$/gm,'').replace(/export (async )?function /g,(_,a)=>(a||'')+'function ');
const providerBox={...loader.load('lib/marketSession.js'),Date};vm.createContext(providerBox);vm.runInContext(openingProviderSource+'\nglobalThis.validate=validateC1OpeningObservations;',providerBox);
const observedSymbols=['T4','SPY','QQQ'],memberRows=symbols.map(symbol=>({symbol,sector:baseline.signals.find(s=>s.symbol===symbol).sector}));
const observationRows=Object.fromEntries(observedSymbols.map(symbol=>[symbol,{quote:{symbol,open:100,price:101,timestamp:Date.parse(observedAt)/1000},anchor:baseline.prices.find(p=>p.symbol===symbol)&&{...baseline.prices.find(p=>p.symbol===symbol),date:baseline.date}}]));
const observedInput={baseline,symbols:observedSymbols,membersBefore:memberRows,membersAfter:memberRows,observations:observationRows,now:new Date(observedAt)};
const verifiedOpening=providerBox.validate(observedInput);assert.equal(verifiedOpening.receipt.previousAdjustedClosesUnchanged,true);assert.equal(verifiedOpening.prices[0].open,100);
assert.throws(()=>providerBox.validate({...observedInput,observations:{...observationRows,T4:{...observationRows.T4,quote:{...observationRows.T4.quote,timestamp:Date.parse(observedAt)/1000-121}}}}),/Fresh opening quote/);
assert.throws(()=>providerBox.validate({...observedInput,observations:{...observationRows,T4:{...observationRows.T4,anchor:{...observationRows.T4.anchor,close:50}}}}),/price basis changed/);
assert.throws(()=>providerBox.validate({...observedInput,membersAfter:[]}),/membership/);
const renamedMembers=memberRows.map((row,index)=>({...row,name:'Updated display name '+index})).reverse();
assert.equal(providerBox.validate({...observedInput,membersAfter:renamedMembers}).prices.length,observedSymbols.length,'Names and row order cannot create a membership change');
assert.throws(()=>providerBox.validate({...observedInput,membersBefore:memberRows.slice(1),membersAfter:memberRows.slice(1)}),/Index membership changed: added none; removed T0/);
assert.throws(()=>providerBox.validate({...observedInput,membersAfter:memberRows.map((row,i)=>i?row:{...row,sector:'Changed'})}),/sector classification changed during collection: T0/);
const aliasBaseline={...baseline,universeSymbols:[...baseline.universeSymbols,'BRK.B','BF.B']};
const aliasMembers=[...memberRows,{symbol:'BRK-B',sector:'Financial Services'},{symbol:'BF-B',sector:'Consumer Defensive'}];
assert.equal(providerBox.validate({...observedInput,baseline:aliasBaseline,membersBefore:aliasMembers,membersAfter:aliasMembers}).prices.length,observedSymbols.length,'Explicit share-class aliases preserve membership identity');
assert.throws(()=>providerBox.validate({...observedInput,baseline:aliasBaseline,membersBefore:[...aliasMembers,{symbol:'BRK.B',sector:'Financial Services'}],membersAfter:aliasMembers}),/Duplicate index membership/);
const {applyC1OpeningPlan}=loader.load('lib/c1AccountDecision.js');
const openView=applyC1OpeningPlan(initialView,{...plan,providerVerified:true});
assert.ok(openView.decisionId.includes(plan.observedAt));
for(const p of openView.positions)if(plan.orders.some(o=>o.symbol===p.symbol&&o.side==='sell'&&!o.condition))assert.equal(positionDecision(openView,p.symbol).action,'Exit candidate');
console.log('PASS: observed opening prices retain their identity; stale quotes and changed membership/basis fail, and Portfolio uses the same opening proposal as Opportunities.');

// Legacy V1 never recorded opening holdings. Prospective adoption must retain
// known risk values without claiming that historical activity was reconciled.
const {adoptLegacyC1Capital}=loader.load('lib/c1LegacyCapitalAdoption.js');
const legacyCapital={version:null,observedPortfolioSignature:signature(portfolio),highWater:capitalRecord.highWater*1.25,triggerDay:null,reconciliationRequired:true};
const legacyBefore=JSON.stringify(legacyCapital);
assert.throws(()=>adoptService({portfolio,capitalRecord:legacyCapital,book:baselineBook,now:new Date(baseline.date+'T21:00:00Z')}),/Reconcile/);
const migratedAccount=adoptService({portfolio,capitalRecord:legacyCapital,book:baselineBook,now:new Date(baseline.date+'T21:00:00Z'),prospectiveLegacyAdoptionConfirmed:true});
assert.equal(JSON.stringify(legacyCapital),legacyBefore,'Original risk state is unchanged');
assert.equal(migratedAccount.adoption.capitalHistory.historyReconciled,false);
assert.equal(migratedAccount.adoption.capitalHistory.retainedPeak,legacyCapital.highWater);
for(const seed of Object.values(migratedAccount.adoption.seeds))assert(seed.highWater>=124999.99,'Retained loss is not reset to current equity');
assert.throws(()=>adoptLegacyC1Capital({portfolio,record:{...legacyCapital,version:2,portfolioSignature:signature(portfolio)},confirmed:true,asOfSession:baseline.date}),/Only a legacy/);
assert.throws(()=>adoptLegacyC1Capital({portfolio,record:{...legacyCapital,observedPortfolioSignature:'OTHER'},confirmed:true,asOfSession:baseline.date}),/Analyze/);
assert.throws(()=>adoptLegacyC1Capital({portfolio,record:{...legacyCapital,highWater:0},confirmed:true,asOfSession:baseline.date}),/positive retained/);
const withBreaker=adoptLegacyC1Capital({portfolio,record:{...legacyCapital,triggerDay:baseline.date},confirmed:true,asOfSession:baseline.date});
assert.equal(withBreaker.capitalRecord.triggerDay,baseline.date);
console.log('PASS: explicit prospective legacy adoption retains peak, breaker and original record, cannot clear V2 reconciliation, and never claims prior history was reconciled.');

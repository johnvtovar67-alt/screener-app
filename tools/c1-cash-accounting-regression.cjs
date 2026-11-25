// Fictional behavior/accounting examples. No live account or market data.
const assert=require('node:assert/strict');
const {createWorkflowFixture}=require('./fixtures/c1-trading-workflow.cjs');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd()),ledger=loader.load('lib/c1AccountLedger.js'),cash=loader.load('lib/c1CashAccounting.js'),epoch=loader.load('lib/c1OperationalRiskEpoch.js');
const clone=value=>JSON.parse(JSON.stringify(value)),near=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} differs from ${b}`),same=(a,b,message)=>assert.equal(JSON.stringify(a),JSON.stringify(b),message);
const ids=['base','cooldown15','sector40'];let checks=0;
function check(name,run){run();checks++;console.log('PASS '+name);}
function fixture(){
 const workflow=createWorkflowFixture('buy',{baselineDate:'2026-11-19',portfolio:[{symbol:'LLL',role:'Swing',shares:100,avgCost:100,openedAt:'2026-11-19'},{symbol:'CASH',role:'Swing',shares:3000,avgCost:1}]});
 const sessions=workflow.sessions.filter(row=>row.date>='2026-11-19'),records=sessions.slice(1).map(row=>({date:row.date,complete:true,fills:[]}));
 const args={adoption:workflow.account.adoption,sessions,historySessions:workflow.sessions,records,observedAt:new Date('2026-11-23T23:00:00Z')};
 const review={contract:'c1-broker-statement-review-v1',reviewId:'a'.repeat(64),bindings:{accountHash:'b'.repeat(64)},window:{from:'2026-11-19',through:'2026-11-23'},
  externalCapitalFlows:[{date:'2026-11-20',kind:'core-purchase',netCash:-800}],pnlCashEvents:[{date:'2026-11-20',kind:'interest',netCash:3}],matchedTrades:[],
  remainingRoundedBalanceAdjustment:{allowed:true,amount:0,limit:5},originalLedgerCash:3000,afterKnownEventsCash:2203,currentBrokerAvailability:{brokerageCash:2203}};
 return {workflow,args,review};
}
check('approved journal derives conserved effective cash while original evidence and raw history stay unchanged',()=>{
 const {args,review}=fixture(),before=clone(args),original=ledger.continueC1ActualAccount(args),context=cash.createC1CashAccounting({review});
 const effective=ledger.continueC1ActualAccount({...args,cashAccounting:context});
 near(original.actualCash,3000);near(effective.actualCash,2203);same(args,before,'Financial view must not rewrite the original account evidence');
 near(effective.recordedHistory.actualCash,3000);same(effective.recordedHistory.books,original.books);
 for(const id of ids){same(effective.books[id].positions,original.books[id].positions);near(effective.sleeves[id].actualCash*args.adoption.seeds[id].actualDollarsPerModelDollar,effective.books[id].cash);}
 assert.equal(effective.cashAccounting.capitalReference,'proportional-nav-no-reset');
});
check('serialized approval flags cannot activate financial replay and inactive accounts retain exact outputs',()=>{
 const {args,review}=fixture(),context=cash.createC1CashAccounting({review});
 assert.throws(()=>ledger.continueC1ActualAccount({...args,cashAccounting:clone(context)}),/server-validated/);
 assert.throws(()=>ledger.continueC1ActualAccount({...args,cashAccounting:{approved:true,ownerConfirmed:true}}),/server-validated/);
 same(ledger.continueC1ActualAccount(args),ledger.continueC1ActualAccount({...args,cashAccounting:null}));
});
check('flows require verified dated marks, bounded reconciliation and retained source identities',()=>{
 const {args,review}=fixture();
 assert.throws(()=>cash.createC1CashAccounting({review:{...review,remainingRoundedBalanceAdjustment:{allowed:true,amount:6,limit:5}}}),/small-balance/);
 const missing=clone(args);missing.sessions[1].prices=missing.sessions[1].prices.filter(row=>row.symbol!=='LLL');
 assert.throws(()=>ledger.continueC1ActualAccount({...missing,cashAccounting:cash.createC1CashAccounting({review})}),/mark|price|cash flow|cash-flow/i);
 const context=cash.createC1CashAccounting({review}),changed=clone(args),opening=ledger.c1AccountBooks(args.adoption);
 changed.records[0].executionEvidence={contract:'c1-actual-account-opening-plan-v1',date:changed.records[0].date,sourceSessionDate:args.adoption.sourceSessionDate,openingBooks:opening,orders:[],cashAccounting:cash.c1CashAccountingPlanIdentity(context)};
 assert.throws(()=>ledger.continueC1ActualAccount({...changed,cashAccounting:context}),/predates its original approved journal boundary/,'Immutable pre-correction plans cannot acquire a financial alias');
});
check('existing small cash reconciliation remains immutable and enters corrected cash once',()=>{
 const {args,review}=fixture(),event={contract:'c1-broker-cash-reconciliation-v1',revision:1,amount:.31,balanceBefore:3000,balanceAfter:3000.31,
  effectiveSessionDate:'2026-11-20',recordedAt:'2026-11-20T23:00:00Z',source:'broker-statement-balance'},source={...args,cashReconciliations:[event]},before=clone(source);
 const original=ledger.continueC1ActualAccount(source),context=cash.createC1CashAccounting({review:{...review,originalLedgerCash:3000.31,afterKnownEventsCash:2203.31,currentBrokerAvailability:{brokerageCash:2203.31}}});
 near(original.actualCash,3000.31);near(ledger.continueC1ActualAccount({...source,cashAccounting:context}).actualCash,2203.31);same(source,before);
});
check('a future captured financial plan validates against effective books and retains strict tamper rejection',()=>{
 const {args,review}=fixture(),context=cash.createC1CashAccounting({review}),effective=ledger.continueC1ActualAccount({...args,cashAccounting:context});
 const date='2026-11-24',session={...clone(args.sessions.at(-1)),date,decisionAt:date+'T21:00:00Z'};for(const price of session.prices)price.date=date;
 const order={id:'fictional-future-exit',date,sleeve:'base',symbol:'LLL',side:'sell',shares:1,reason:'owner-discretionary-exit',recordingOnly:true,estimatedPrice:100},
  fill={id:'fictional-future-fill',orderId:order.id,symbol:'LLL',side:'sell',shares:1,price:100,fee:.01,executedAt:date+'T15:00:00Z'};
 const plan={contract:'c1-actual-account-opening-plan-v1',date,sourceSessionDate:'2026-11-23',observedAt:date+'T17:00:00Z',openingBooks:clone(effective.books),orders:[order],
  purchaseFundingPolicy:'brokerage-cash-only-v1',cashAccounting:cash.c1CashAccountingPlanIdentity(context),riskBySleeve:{}};
 const next={...args,sessions:[...args.sessions,session],historySessions:[...args.historySessions,session],records:[...args.records,{date,complete:true,fills:[fill],executionEvidence:plan}],observedAt:new Date(date+'T23:00:00Z'),cashAccounting:context};
 const continued=ledger.continueC1ActualAccount(next);near(continued.actualCash,2302.99);assert.equal(Object.values(continued.books).reduce((sum,book)=>sum+(book.positions.LLL?.shares||0),0),99);
 const superseding={...review,reviewId:'d'.repeat(64),bindings:{accountHash:'e'.repeat(64)},window:{...review.window,through:date},currentBrokerAvailability:{brokerageCash:2302.99}};
 const nextContext=cash.createC1CashAccounting({review:superseding,predecessorSourceDigests:[context.sourceDigest],predecessorReviews:[{review,appliedAt:'2026-11-23T23:00:00Z'}],originalWindowThrough:review.window.through});
 near(ledger.continueC1ActualAccount({...next,cashAccounting:nextContext}).actualCash,2302.99,'A later complete statement retains the approved earlier financial lineage');
 const changed=clone(next);changed.cashAccounting=context;changed.records.at(-1).executionEvidence.openingBooks.base.cash+=1;
 assert.throws(()=>ledger.continueC1ActualAccount(changed),/financial opening books/);
 const missing=clone(next);missing.cashAccounting=context;delete missing.records.at(-1).executionEvidence.cashAccounting;
 assert.throws(()=>ledger.continueC1ActualAccount(missing),/execution evidence/);
});
check('a superseding complete statement retains prior small adjustments on their original date exactly once',()=>{
 const {args,review}=fixture(),firstReview={...review,remainingRoundedBalanceAdjustment:{allowed:true,amount:-.01,limit:5}},first=cash.createC1CashAccounting({review:firstReview}),firstView=ledger.continueC1ActualAccount({...args,cashAccounting:first});
 const date='2026-11-24',session={...clone(args.sessions.at(-1)),date,decisionAt:date+'T21:00:00Z'};for(const row of session.prices)row.date=date;
 const plan={contract:'c1-actual-account-opening-plan-v1',date,sourceSessionDate:'2026-11-23',observedAt:date+'T17:00:00Z',openingBooks:clone(firstView.books),orders:[],cashAccounting:cash.c1CashAccountingPlanIdentity(first)};
 const nextReview={...review,reviewId:'f'.repeat(64),bindings:{accountHash:'c'.repeat(64)},window:{...review.window,through:date},
  pnlCashEvents:[...review.pnlCashEvents,{date:'2026-11-23',kind:'prior-confirmed-balance-adjustment',netCash:-.01}],currentBrokerAvailability:{brokerageCash:2202.99}};
 const context=cash.createC1CashAccounting({review:nextReview,predecessorSourceDigests:[first.sourceDigest],predecessorReviews:[{review:firstReview,appliedAt:'2026-11-23T23:00:00Z'}],originalWindowThrough:firstReview.window.through}),next={...args,
  sessions:[...args.sessions,session],historySessions:[...args.historySessions,session],records:[...args.records,{date,complete:true,fills:[],executionEvidence:plan}],cashAccounting:context,observedAt:date+'T23:00:00Z'};
 near(ledger.continueC1ActualAccount(next).actualCash,2202.99);
});
check('later-reviewed historical Core cash preserves full opening validation against each original approved source',()=>{
 const {args,review}=fixture(),approvedAt='2026-11-23T23:00:00Z',originalContext=cash.createC1CashAccounting({review,originalAppliedAt:approvedAt,approvedAt}),
  prior=ledger.continueC1ActualAccount({...args,cashAccounting:originalContext}),dates=['2026-11-24','2026-11-25'],
  extra=dates.map(date=>{const row={...clone(args.sessions.at(-1)),date,decisionAt:date+'T21:00:00Z'};for(const price of row.prices)price.date=date;return row;}),
  plans=dates.map((date,index)=>({contract:'c1-actual-account-opening-plan-v1',date,sourceSessionDate:index?dates[index-1]:'2026-11-23',observedAt:date+'T17:00:00Z',openingBooks:clone(prior.books),orders:[],cashAccounting:cash.c1CashAccountingPlanIdentity(originalContext)})),
  latest={...review,reviewId:'e'.repeat(64),bindings:{accountHash:'f'.repeat(64)},window:{...review.window,through:dates[1]},externalCapitalFlows:[...review.externalCapitalFlows,{date:dates[0],kind:'core-purchase',netCash:-100}],currentBrokerAvailability:{brokerageCash:2103}},
  context=cash.createC1CashAccounting({review:latest,originalWindowThrough:review.window.through,originalAppliedAt:approvedAt,predecessorSourceDigests:[originalContext.sourceDigest],predecessorReviews:[{review,appliedAt:approvedAt}]}),
  options={...args,sessions:[...args.sessions,...extra],historySessions:[...args.historySessions,...extra],records:[...args.records,...dates.map((date,index)=>({date,complete:true,fills:[],executionEvidence:plans[index]}))],cashAccounting:context,observedAt:dates[1]+'T23:00:00Z'};
 const after=ledger.continueC1ActualAccount(options);near(after.actualCash,2103);same(options.records.at(-1).executionEvidence.openingBooks,prior.books,'Original financial opening remains unchanged');
 const changed=clone(options);changed.cashAccounting=context;changed.records.at(-1).executionEvidence.openingBooks.base.cash+=.01;assert.throws(()=>ledger.continueC1ActualAccount(changed),/financial opening books/);
});
check('current intraday financial view applies historical offset and current journal cash only once',()=>{
 const {args,review}=fixture(),date='2026-11-24',current={...review,window:{...review.window,through:date},pnlCashEvents:[...review.pnlCashEvents,{date,kind:'fee',netCash:-.02}],
  remainingRoundedBalanceAdjustment:{allowed:true,amount:-.01,limit:5}},context=cash.createC1CashAccounting({review:current}),original=ledger.continueC1ActualAccount(args),effective=ledger.continueC1ActualAccount({...args,cashAccounting:context});
 const plan={contract:'c1-actual-account-opening-plan-v1',date,openingBooks:clone(original.books),orders:[]},activity={date,plan,fills:[]};
 const reconciled=ledger.reconcileC1ActualAccountFills({plan,fills:[],observedAt:date+'T17:00:00Z'}),options={originalResult:reconciled,effectiveOpeningBooks:effective.books,completedContinued:effective,cashAccounting:context,activity};
 near(cash.reconcileC1FinancialIntraday(options).actualCash,2202.97);near(cash.reconcileC1FinancialIntraday(options).actualCash,2202.97);near(reconciled.actualCash,3000);
 const decision={contract:'fictional-decision'};assert.equal(cash.markC1CashAccountingDecision(decision,effective),decision);assert.equal(cash.c1CashAccountingDecisionContinued(decision),effective);assert.equal(cash.c1CashAccountingDecisionContinued(clone(decision)),null);
 const currentCapital=cash.createC1CashAccounting({review:{...current,externalCapitalFlows:[...current.externalCapitalFlows,{date,kind:'journal',netCash:10}]}});
 assert.throws(()=>cash.reconcileC1FinancialIntraday({...options,cashAccounting:currentCapital}),/completed verified close/);
});
check('current P&L without any trade activity updates only detached financial books exactly once',()=>{
 const {args,review}=fixture(),date='2026-11-24',now=new Date(date+'T17:00:00Z'),pending={...review,window:{...review.window,through:date},
  remainingRoundedBalanceAdjustment:{allowed:true,amount:-1,limit:5},currentBrokerAvailability:{brokerageCash:2202}},
  context=cash.createC1CashAccounting({review:pending}),continued=ledger.continueC1ActualAccount({...args,cashAccounting:context}),before=clone(continued),
  options={completedContinued:continued,cashAccounting:context,now};
 near(continued.actualCash,2203);near(cash.reconcileC1FinancialCurrentBooks(options).actualCash,2202);near(cash.reconcileC1FinancialCurrentBooks(options).actualCash,2202);same(continued,before);
 const current=cash.reconcileC1FinancialCurrentBooks(options),projected={...clone(continued.replay.base),projectionDate:date};
 cash.markC1FinancialReplay({continued,replay:projected,sleeve:'base',currentBooks:current});
 assert(loader.load('lib/c1CashFlowReplay.js').c1ReplayOpeningCashFlowEvents(projected,date).length>0);
 assert.throws(()=>cash.markC1FinancialReplay({continued,replay:{...clone(continued.replay.base),projectionDate:date},sleeve:'base',currentBooks:clone(current)}),/trusted current books/);
 assert.throws(()=>cash.reconcileC1FinancialCurrentBooks({...options,completedContinued:clone(continued)}),/trusted completed/);
 const capital=cash.createC1CashAccounting({review:{...pending,externalCapitalFlows:[...pending.externalCapitalFlows,{date,kind:'journal',netCash:10}]}}),capitalView=ledger.continueC1ActualAccount({...args,cashAccounting:capital});
 assert.throws(()=>cash.reconcileC1FinancialCurrentBooks({...options,completedContinued:capitalView,cashAccounting:capital}),/completed verified close/);
 const session={...clone(args.sessions.at(-1)),date,decisionAt:date+'T21:00:00Z'};for(const row of session.prices)row.date=date;
 const closed=ledger.continueC1ActualAccount({...args,sessions:[...args.sessions,session],historySessions:[...args.historySessions,session],records:[...args.records,{date,complete:true,fills:[]}],cashAccounting:context,observedAt:date+'T23:00:00Z'});
 near(cash.reconcileC1FinancialCurrentBooks({...options,completedContinued:closed}).actualCash,2202);
 near(cash.reconcileC1FinancialCurrentBooks({...options,completedContinued:closed,now:'2026-11-28T17:00:00Z'}).actualCash,2202,'A closed-market date cannot erase already completed financial evidence');
});
check('a same-day financial plan requires the trusted first approval time and full matching economics',()=>{
 const {args,review}=fixture(),date='2026-11-24',approval=date+'T17:00:00Z',current={...review,window:{...review.window,through:date}},
  context=cash.createC1CashAccounting({review:current,originalAppliedAt:approval}),continued=ledger.continueC1ActualAccount({...args,cashAccounting:context}),
  session={...clone(args.sessions.at(-1)),date,decisionAt:date+'T21:00:00Z'};for(const row of session.prices)row.date=date;
 const plan={contract:'c1-actual-account-opening-plan-v1',date,sourceSessionDate:'2026-11-23',observedAt:approval,openingBooks:clone(continued.books),orders:[],cashAccounting:cash.c1CashAccountingPlanIdentity(context)},
  options={...args,sessions:[...args.sessions,session],historySessions:[...args.historySessions,session],records:[...args.records,{date,complete:true,fills:[],executionEvidence:plan}],cashAccounting:context,observedAt:date+'T23:00:00Z'};
 near(ledger.continueC1ActualAccount(options).actualCash,2203);
 const predating=clone(options);predating.cashAccounting=context;predating.records.at(-1).executionEvidence.observedAt=date+'T16:59:59Z';assert.throws(()=>ledger.continueC1ActualAccount(predating),/predates/);
 const tampered=clone(options);tampered.cashAccounting=context;tampered.records.at(-1).executionEvidence.openingBooks.base.cash+=.01;assert.throws(()=>ledger.continueC1ActualAccount(tampered),/financial opening books/);
 const changedDate=clone(options);changedDate.cashAccounting=context;changedDate.records.at(-1).executionEvidence.openingBooks.base.positions.LLL.openedAt='2026-11-20';assert.throws(()=>ledger.continueC1ActualAccount(changedDate),/financial opening books/);
 const unknown=cash.createC1CashAccounting({review:current});assert.throws(()=>ledger.continueC1ActualAccount({...options,cashAccounting:unknown}),/predates/);
 const postingContext=cash.createC1CashAccounting({review:{...current,remainingRoundedBalanceAdjustment:{allowed:true,amount:-1,limit:5}},originalAppliedAt:approval}),
  postingContinued=ledger.continueC1ActualAccount({...args,cashAccounting:postingContext}),
  opening=cash.reconcileC1FinancialCurrentBooks({completedContinued:postingContinued,cashAccounting:postingContext,now:approval});
 const posting=clone(options);posting.cashAccounting=postingContext;posting.records.at(-1).executionEvidence={...plan,openingBooks:opening.books,cashAccounting:cash.c1CashAccountingPlanIdentity(postingContext)};
 near(ledger.continueC1ActualAccount(posting).actualCash,2202,'Known current P&L is admitted in the approved opening and applied once at close');
});
check('a completed future financial exit establishes one effective epoch and later closes cannot reset it again',()=>{
 const {args,review}=fixture(),context=cash.createC1CashAccounting({review}),effective=ledger.continueC1ActualAccount({...args,cashAccounting:context});
 const dates=['2026-11-24','2026-11-25','2026-11-27'],extra=dates.map(date=>{const row={...clone(args.sessions.at(-1)),date,decisionAt:date+'T21:00:00Z'};for(const price of row.prices)price.date=date;return row;});
 const order={id:'fictional-future-full-loss',date:dates[0],sleeve:'base',symbol:'LLL',side:'sell',shares:25,reason:'portfolio-drawdown-stop',estimatedPrice:100},
  fill={id:'fictional-future-full-fill',orderId:order.id,symbol:'LLL',side:'sell',shares:25,price:100,fee:.25,executedAt:dates[0]+'T15:00:00Z'},
  plan={contract:'c1-actual-account-opening-plan-v1',date:dates[0],sourceSessionDate:'2026-11-23',openingBooks:clone(effective.books),orders:[order],purchaseFundingPolicy:'brokerage-cash-only-v1',
   cashAccounting:cash.c1CashAccountingPlanIdentity(context),riskBySleeve:{base:{highWater:4000,paused:true,operationalRisk:{triggerDate:dates[0],requiresLiquidationEpoch:true}}}};
 const record={date:dates[0],complete:true,fills:[fill],executionEvidence:plan},base={...args,historySessions:[...args.historySessions,...extra],cashAccounting:context};
 const after=ledger.continueC1ActualAccount({...base,sessions:[...args.sessions,...extra.slice(0,2)],records:[...args.records,record,{date:dates[1],complete:true,fills:[]}],observedAt:dates[1]+'T23:00:00Z'}),state=after.sleeves.base.accountRisk.operationalRisk;
 assert.equal(state.appliedEpochs.length,1);const reference=state.operationalHighWater;
 const later=ledger.continueC1ActualAccount({...base,sessions:[...args.sessions,...extra],records:[...args.records,record,{date:dates[1],complete:true,fills:[]},{date:dates[2],complete:true,fills:[]}],observedAt:dates[2]+'T23:00:00Z'});
 assert.equal(later.sleeves.base.accountRisk.operationalRisk.appliedEpochs.length,1);near(later.sleeves.base.accountRisk.operationalRisk.operationalHighWater,reference);
 near(after.books.base.cash,after.operationalRiskReceipts.base[0].postExitEquity);
});
check('known current income cannot manufacture a new financial loss episode or later reset',()=>{
 const {args,review}=fixture(),date='2026-11-24',approval=date+'T17:00:00Z',current={...review,window:{...review.window,through:date},pnlCashEvents:[...review.pnlCashEvents,{date,kind:'interest',netCash:100}]},
  context=cash.createC1CashAccounting({review:current,originalAppliedAt:approval}),prior=ledger.continueC1ActualAccount({...args,cashAccounting:context}),
  opening=cash.reconcileC1FinancialCurrentBooks({completedContinued:prior,cashAccounting:context,now:approval}),
  order={id:'fictional-income-flat',date,sleeve:'base',symbol:'LLL',side:'sell',shares:25,reason:'owner-discretionary-exit',recordingOnly:true,estimatedPrice:118},
  fill={id:'fictional-income-flat-fill',orderId:order.id,symbol:'LLL',side:'sell',shares:25,price:118,fee:0,executedAt:date+'T17:01:00Z'},
  plan={contract:'c1-actual-account-opening-plan-v1',date,sourceSessionDate:'2026-11-23',observedAt:approval,openingBooks:opening.books,orders:[order],purchaseFundingPolicy:'brokerage-cash-only-v1',cashAccounting:cash.c1CashAccountingPlanIdentity(context),riskBySleeve:{base:{highWater:4000,paused:false}}},
  session={...clone(args.sessions.at(-1)),date,decisionAt:date+'T21:00:00Z'};for(const row of session.prices)row.date=date;
 const after=ledger.continueC1ActualAccount({...args,sessions:[...args.sessions,session],historySessions:[...args.historySessions,session],records:[...args.records,{date,complete:true,fills:[fill],executionEvidence:plan}],cashAccounting:context,observedAt:date+'T23:00:00Z'});
 assert(after.books.base.cash>3520,'Fully corrected cash remains above the 12% loss threshold');assert.equal(after.operationalRiskReceipts.base?.length||0,0);
});
check('later-reviewed capital withdrawals preserve drawdown and cannot manufacture a financial loss epoch',()=>{
 const {args,review}=fixture(),date='2026-11-24',appliedAt='2026-11-23T23:00:00Z',first=cash.createC1CashAccounting({review,originalAppliedAt:appliedAt,approvedAt:appliedAt}),
  prior=ledger.continueC1ActualAccount({...args,cashAccounting:first}),order={id:'fictional-capital-flat',date,sleeve:'base',symbol:'LLL',side:'sell',shares:25,reason:'owner-discretionary-exit',recordingOnly:true,estimatedPrice:119},
  fill={id:'fictional-capital-flat-fill',orderId:order.id,symbol:'LLL',side:'sell',shares:25,price:119,fee:0,executedAt:date+'T17:01:00Z'},
  plan={contract:'c1-actual-account-opening-plan-v1',date,sourceSessionDate:'2026-11-23',observedAt:date+'T17:00:00Z',openingBooks:clone(prior.books),orders:[order],purchaseFundingPolicy:'brokerage-cash-only-v1',cashAccounting:cash.c1CashAccountingPlanIdentity(first),riskBySleeve:{base:{highWater:4000,paused:false}}},
  latest={...review,reviewId:'f'.repeat(64),bindings:{accountHash:'e'.repeat(64)},window:{...review.window,through:'2026-11-25'},externalCapitalFlows:[...review.externalCapitalFlows,{date,kind:'core-purchase',netCash:-200}]},
  context=cash.createC1CashAccounting({review:latest,originalWindowThrough:review.window.through,originalAppliedAt:appliedAt,predecessorSourceDigests:[first.sourceDigest],predecessorReviews:[{review,appliedAt}]}),
  session={...clone(args.sessions.at(-1)),date,decisionAt:date+'T21:00:00Z'};for(const row of session.prices)row.date=date;
 const options={...args,sessions:[...args.sessions,session],historySessions:[...args.historySessions,session],records:[...args.records,{date,complete:true,fills:[fill],executionEvidence:plan}],cashAccounting:context,observedAt:'2026-11-25T17:00:00Z'},
  after=ledger.continueC1ActualAccount(options);
 assert(after.books.base.cash<3520,'Cash is below the unscaled reference threshold after a Core withdrawal');assert.equal(after.operationalRiskReceipts.base?.length||0,0,'The NAV-scaled risk reference preserves the non-breach');
 const wrong=clone(options);wrong.cashAccounting=context;wrong.records.at(-1).executionEvidence.cashAccounting.reviewId='0'.repeat(64);assert.throws(()=>ledger.continueC1ActualAccount(wrong),/financial opening books/);
 assert.equal(cash.c1CashAccountingAcceptsPlanIdentity(context,{...plan.cashAccounting,reviewId:'0'.repeat(64)}),false);
});
check('corrected epoch preserves original liquidation proof, stable logical identity and one-use reset',()=>{
 const evidence={allocation:'base',triggerDate:'2026-11-25',completedDate:'2026-11-25',historicalPeak:1000,
  openingBook:{cash:100,positions:{ZZZ:{shares:5,avgCost:100}}},closingBook:{cash:599,positions:{}},risk:{highWater:1000,paused:true},
  orders:[{id:'fictional-epoch-order',sleeve:'base',symbol:'ZZZ',side:'sell',shares:5}],fills:[{id:'fictional-epoch-fill',orderId:'fictional-epoch-order',symbol:'ZZZ',side:'sell',shares:5,price:100,fee:1,executedAt:'2026-11-25T15:00:00Z'}]};
 const original=epoch.captureC1OperationalRiskLiquidation(evidence),params={originalReceipt:original,openingBook:{...clone(evidence.openingBook),cash:50},closingBook:{cash:549.02,positions:{}},fills:evidence.fills,
  events:[{id:'fictional-interest',date:'2026-11-25',amount:.02,kind:'pnl'}],sourceDigest:'c'.repeat(64)},corrected=epoch.captureC1CorrectedOperationalRiskLiquidation(params);
 near(corrected.postExitEquity,549.02);assert.equal(corrected.historicalPeak,1000);assert.equal(corrected.nextOpening,'2026-11-27');
 const policy={active:true,activationDate:'2026-11-11',operationalRiskReceipts:{base:[corrected]}},state={historicalHighWater:1000,operationalHighWater:1000,appliedEpochs:[],requiresLiquidationEpoch:true};
 const applied=epoch.operationalRiskForSession({policy,state,session:{date:'2026-11-27'},allocation:'base',openingEquity:549.02});assert.equal(applied.resetApplied,true);
 const newer=epoch.captureC1CorrectedOperationalRiskLiquidation({...params,sourceDigest:'d'.repeat(64)});assert.equal(newer.sourceDigest,corrected.sourceDigest);assert.notEqual(newer.financialSourceDigest,corrected.financialSourceDigest);
 assert.equal(epoch.operationalRiskForSession({policy:{...policy,operationalRiskReceipts:{base:[newer]}},state:applied,session:{date:'2026-11-30'},allocation:'base',openingEquity:540}).resetApplied,false);
 const legacyApplied={...state,appliedEpochs:[original.sourceDigest],requiresLiquidationEpoch:false};assert.equal(epoch.operationalRiskForSession({policy,state:legacyApplied,session:{date:'2026-11-27'},allocation:'base',openingEquity:549.02}).resetApplied,false);
 assert.throws(()=>epoch.captureC1CorrectedOperationalRiskLiquidation({...params,originalReceipt:clone(original)}),/verified liquidation/);
 assert.throws(()=>epoch.captureC1CorrectedOperationalRiskLiquidation({...params,closingBook:{cash:550,positions:{}}}),/does not reconcile/);
});
console.log(`PASS: ${checks} fictional cash-accounting cases; strict original/effective lineage, single conserved cash, trusted journal, current postings and stable one-use risk episodes. No live data or writes.`);

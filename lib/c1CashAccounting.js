import {createHash} from 'node:crypto';
import {simulatePointInTimePortfolio} from './c1RecentMomentumAccountSimulator';
import {C1_FROZEN_OPTIONS} from './c1FrozenOptions';
import {markC1CashFlowReplay} from './c1CashFlowReplay';
import {markC1NonCashReplay,applyC1NonCashBooks,c1NonCashEvents} from './c1NonCashAdoption';
import {markC1ReconciledRankSale,markC1BrokerageFundedPurchase,markC1AdditionalCapacityPurchase,markC1InitialSwingStopPurchase,markC1ReconciledAccountFill} from './c1ActualFillReplay';
import {isC1AdditionalCapacityOrder} from './c1AdditionalSwingCapacity';
import {captureC1CorrectedOperationalRiskLiquidation,captureC1OperationalRiskLiquidation} from './c1OperationalRiskEpoch';
import {easternMarketClock,isUsMarketSessionDay} from './marketSession';
import {markC1StatementTradeCash} from './c1StatementTradeCash';

const ids=['base','cooldown15','sector40'],capabilities=new WeakMap(),financialViews=new WeakMap(),bridges=new WeakMap(),decisions=new WeakMap(),currentViews=new WeakMap();
const clone=value=>JSON.parse(JSON.stringify(value));
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const positive=value=>finite(value)&&value>0;
const near=(a,b)=>finite(a)&&finite(b)&&Math.abs(a-b)<=1e-6;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const validDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value&&isUsMarketSessionDay(value);
const fail=message=>{throw new Error('Cash accounting: '+message);};
const totalCash=books=>ids.reduce((sum,id)=>sum+books[id].cash,0);
function facts(context){const proof=capabilities.get(context);if(!proof)fail('a server-validated statement journal is required');return proof;}
function evidenceId(source,kind,index,event){return hash([source,kind,index,event.date,event.symbol||null,event.side||null,event.netCash??event.cashAdjustment]);}

// Called only after the server validates an approved journal, or while deriving
// an explicitly read-only proposal. Serialized status/owner flags cannot mark
// an input object as trusted. This capability is never sent to a browser.
export function createC1CashAccounting({review,predecessorSourceDigests=[],predecessorReviews=[],originalWindowThrough=review?.window?.through,originalAppliedAt,approvedAt=review?.appliedAt}={}){
 if(review?.contract!=='c1-broker-statement-review-v1'||!/^[a-f0-9]{64}$/.test(review.reviewId||'')||
  !/^[a-f0-9]{64}$/.test(review.bindings?.accountHash||'')||!Array.isArray(review.externalCapitalFlows)||
  !Array.isArray(review.pnlCashEvents)||!Array.isArray(review.matchedTrades)||!validDay(review.window?.through))
  fail('a complete bound statement review is required');
 const sourceDigest=hash([review.reviewId,review.bindings]),events=[];
 for(const [kind,rows]of [['capital',review.externalCapitalFlows],['pnl',review.pnlCashEvents]])for(const [index,row]of rows.entries()){
  if(!validDay(row.date)||!finite(row.netCash)||row.netCash===0)fail('a dated statement amount is required');
  const sourceKind=row.kind==='prior-confirmed-balance-adjustment'?'confirmed-small-balance-reconciliation':row.kind;
  events.push({id:evidenceId(sourceDigest,kind,index,row),date:row.date,kind,amount:row.netCash,sourceKind,
   orderKey:JSON.stringify([kind,sourceKind,row.symbol||null,row.netCash,row.quantity||null])});
 }
 const trades=[];
 for(const [index,row]of review.matchedTrades.entries()){
  if(!validDay(row.date)||!['buy','sell'].includes(row.side)||typeof row.symbol!=='string'||
   !finite(row.cashAdjustment)||!Array.isArray(row.rawFills)||!row.rawFills.length||!Array.isArray(row.rawFillIds))
   fail('matched statement trade facts are required');
  if(Math.abs(row.cashAdjustment)>1e-10)trades.push({...clone(row),id:evidenceId(sourceDigest,'trade',index,row)});
 }
 const residual=review.remainingRoundedBalanceAdjustment;
 if(!residual?.allowed||!finite(residual.amount)||Math.abs(residual.amount)>5||residual.limit!==5)
  fail('the residual requires a current balance within the existing small-balance limit');
 if(residual.amount)events.push({id:hash([sourceDigest,'closing-balance']),date:review.window.through,kind:'pnl',amount:residual.amount,sourceKind:'confirmed-small-balance-reconciliation',
  orderKey:JSON.stringify(['pnl','confirmed-small-balance-reconciliation',null,residual.amount,null])});
 if(!Array.isArray(predecessorSourceDigests)||predecessorSourceDigests.some(value=>!/^[a-f0-9]{64}$/.test(value))||!validDay(originalWindowThrough)||originalWindowThrough>review.window.through)fail('valid prior financial proof identities and original window are required');
 if(originalAppliedAt!==undefined&&!Number.isFinite(Date.parse(originalAppliedAt)))fail('a valid original approval time is required');
 if(approvedAt!==undefined&&!Number.isFinite(Date.parse(approvedAt)))fail('a valid source approval time is required');
 if(!Array.isArray(predecessorReviews)||predecessorReviews.length>100)fail('validated predecessor financial sources are required');
 const predecessors=new Map();
 for(const entry of predecessorReviews){
  if(!entry?.review||!Number.isFinite(Date.parse(entry.appliedAt)))fail('a dated validated predecessor review is required');
  const predecessor=createC1CashAccounting({review:entry.review,originalWindowThrough,originalAppliedAt,approvedAt:entry.appliedAt}),prior=facts(predecessor);
  if(!predecessorSourceDigests.includes(prior.sourceDigest)||predecessors.has(prior.sourceDigest))fail('predecessor economic evidence does not match its approved identity');
  predecessors.set(prior.sourceDigest,{context:predecessor,proof:prior});
 }
 const proof={sourceDigest,reviewId:review.reviewId,originalWindowThrough,originalAppliedAt,approvedAt,predecessors,predecessorSourceDigests:[...predecessorSourceDigests],events:events.sort((a,b)=>a.date.localeCompare(b.date)||a.kind.localeCompare(b.kind)||a.orderKey.localeCompare(b.orderKey)),trades,
  balanceDate:review.window.through,brokerageCash:review.currentBrokerAvailability?.brokerageCash,
  originalLedgerCash:review.originalLedgerCash,afterKnownEventsCash:review.afterKnownEventsCash};
 const context=Object.freeze({contract:'c1-trusted-cash-accounting-context-v1',sourceDigest});capabilities.set(context,proof);
 markC1StatementTradeCash(context,review.matchedTrades);
 return context;
}

export function c1CashAccountingPlanIdentity(context){const proof=facts(context);return {contract:'c1-effective-cash-accounting-v1',reviewId:proof.reviewId,sourceDigest:proof.sourceDigest};}
export function c1CashAccountingAcceptsPlanIdentity(context,identity){
 const proof=facts(context);
 const source=identity?.sourceDigest===proof.sourceDigest?proof:proof.predecessors.get(identity?.sourceDigest)?.proof;
 return identity?.contract==='c1-effective-cash-accounting-v1'&&Boolean(source)&&identity.reviewId===source.reviewId;
}

function markedEquity(books,session){
 const marks=new Map((session?.prices||[]).map(row=>[row.symbol,row.close]));
 return Object.fromEntries(ids.map(id=>{
  let value=books[id].cash;
  for(const [symbol,p]of Object.entries(books[id].positions||{})){
   const price=marks.get(symbol);if(!positive(price))fail('verified dated closing marks are required for allocation cash flows');
   value+=p.shares*price;
  }
  if(!positive(value))fail('positive marked allocation equity is required for cash-flow attribution');
  return [id,value];
 }));
}
function distribute(amount,weights){
 const total=ids.reduce((sum,id)=>sum+weights[id],0);if(!positive(total))fail('valid cash attribution weights are required');
 let allocated=0;
 return Object.fromEntries(ids.map((id,index)=>{const value=index===ids.length-1?amount-allocated:amount*weights[id]/total;allocated+=value;return [id,value];}));
}
function pnlWeights(books,session){
 try{return markedEquity(books,session);}catch{
  const cash=Object.fromEntries(ids.map(id=>[id,Math.max(0,books[id].cash)]));
  return ids.some(id=>cash[id]>0)?cash:{base:.25,cooldown15:.5,sector40:.25};
 }
}
function fillParts(trade,days){
 const day=days.find(day=>day.date===trade.date);if(!day)fail('a statement trade is outside validated actual records');
 const idsSet=new Set(trade.rawFillIds),ticketIds=new Set((trade.rawTicketIds||[]));
 const matching=day.accepted.fills.filter(fill=>idsSet.has(fill.id)||ticketIds.has(fill.id.slice(0,fill.id.lastIndexOf(':'))));
 const shares=matching.reduce((sum,fill)=>sum+fill.shares,0);
 if(!matching.length||!near(shares,trade.quantity)||matching.some(fill=>fill.symbol!==trade.symbol||fill.side!==trade.side))
  fail('statement trade identities changed before financial replay');
 const orderMap=new Map(day.plan.orders.map(order=>[order.id,order]));
 return {matching,orderMap,shares};
}
function applyDateEvents({books,session,proof,days,eventsBySleeve,existingReconciliations=[]}){
 const assigned=Object.fromEntries(ids.map(id=>[id,[]]));
 const append=(event,allocation)=>{for(const id of ids)if(Math.abs(allocation[id])>1e-12){const row={id:event.id+':'+id,date:session.date,amount:allocation[id],kind:event.kind};assigned[id].push(row);eventsBySleeve[id].push(row);books[id].cash+=row.amount;}};
 for(const trade of proof.trades.filter(row=>row.date===session.date)){
  const {matching,orderMap,shares}=fillParts(trade,days),weights=Object.fromEntries(ids.map(id=>[id,0]));
  for(const fill of matching){const id=orderMap.get(fill.orderId)?.sleeve;if(!ids.includes(id))fail('original matched allocation is unavailable');weights[id]+=fill.shares;}
  const rawNet=matching.reduce((sum,fill)=>sum+(fill.side==='sell'?1:-1)*fill.shares*fill.price-fill.fee,0);
  if(!near(rawNet,trade.rawNetCash)||!near(shares,trade.quantity))fail('original matched statement economics changed');
  append({id:trade.id,kind:'pnl'},distribute(trade.cashAdjustment,weights));
 }
 // These already accepted small cash corrections remain in the audit and are
 // consumed once at their dated close in the detached financial view.
 for(const event of existingReconciliations.filter(row=>row.effectiveSessionDate===session.date)){
  if(!finite(event.amount)||Math.abs(event.amount)>5)fail('original small-balance reconciliation is invalid');
  append({id:hash(['original-reconciliation',event]),kind:'pnl'},distribute(event.amount,pnlWeights(books,session)));
 }
 for(const event of proof.events.filter(row=>row.date===session.date&&row.kind==='pnl'))append(event,distribute(event.amount,pnlWeights(books,session)));
 const capital=proof.events.filter(row=>row.date===session.date&&row.kind==='capital'),capitalNet=capital.reduce((sum,event)=>sum+event.amount,0);
 // Date-only broker postings share the verified close. Net their capital
 // effect rather than invent an intraday order between a deposit and a buy.
 if(Math.abs(capitalNet)>1e-12){
  const event={id:hash([proof.sourceDigest,'daily-capital',session.date,capital.map(row=>row.id)]),date:session.date,kind:'capital',amount:capitalNet};
  const equity=markedEquity(books,session),sum=ids.reduce((total,id)=>total+equity[id],0);
  if(!positive(sum+event.amount))fail('capital flow exceeds the marked account equity');
  append(event,distribute(event.amount,equity));
 }
 return assigned;
}

const economicBooks=books=>JSON.stringify(ids.map(id=>({cash:books[id]?.cash,positions:Object.entries(books[id]?.positions||{}).sort(([a],[b])=>a.localeCompare(b)).map(([symbol,p])=>[symbol,p.shares,p.avgCost,p.openedAt])})));
export function createC1CashAccountingBridge({context,adoption,sessions,historySessions,cashReconciliations=[]}={}){
 const proof=facts(context),books=Object.fromEntries(ids.map(id=>{const seed=adoption.seeds[id],scale=seed.actualDollarsPerModelDollar;return [id,{cash:seed.cash*scale,positions:Object.fromEntries(seed.positions.map(p=>[p.symbol,{shares:Math.round(p.shares*scale),avgCost:p.entryPrice,openedAt:p.openedAt}]))}];}));
 const nonCash=c1NonCashEvents(adoption,historySessions||sessions);applyC1NonCashBooks(books,nonCash,adoption.sourceSessionDate);
 const bridge=Object.freeze({contract:'c1-trusted-financial-lineage-bridge-v1'});
 bridges.set(bridge,{context,proof,adoption,sessions,historySessions,cashReconciliations,books,nonCash,eventsBySleeve:Object.fromEntries(ids.map(id=>[id,[]])),snapshots:{},days:[],financialReceipts:{},validationBridges:new Map(),referenceScales:Object.fromEntries(ids.map(id=>[id,1])),validatedPlanReferenceScales:new WeakMap()});return bridge;
}
function bridgeFacts(bridge){const value=bridges.get(bridge);if(!value)fail('validated financial lineage bridge required');return value;}

// A future plan saved AFTER the approved journal is bound to corrected books.
// Compare those complete economics strictly before translating its in-memory
// cash into the legacy shadow used only by the original validation pass.
export function c1OriginalCashAccountingPlan({bridge,plan,originalExpectedBooks}={}){
 if(!bridge||!plan?.cashAccounting)return {plan,financial:false};
 const state=bridgeFacts(bridge),identity=plan.cashAccounting;
 const sameBoundary=plan.date===state.proof.originalWindowThrough,
  afterApproval=sameBoundary&&Number.isFinite(Date.parse(state.proof.originalAppliedAt))&&
   Number.isFinite(Date.parse(plan.observedAt))&&Date.parse(plan.observedAt)>=Date.parse(state.proof.originalAppliedAt)&&easternMarketClock(plan.observedAt)?.key===plan.date;
 if(plan.date<state.proof.originalWindowThrough||sameBoundary&&!afterApproval)fail('a captured financial plan predates its original approved journal boundary');
 let source=state.proof,sourceBooks=state.books,sourceReferenceScales=state.referenceScales;
 if(identity.sourceDigest!==state.proof.sourceDigest){
  if(!state.proof.predecessors.has(identity.sourceDigest))fail('the original approved financial source evidence is unavailable');
  const predecessor=state.proof.predecessors.get(identity.sourceDigest);source=predecessor.proof;
  let sourceBridge=state.validationBridges.get(identity.sourceDigest);
  if(!sourceBridge){sourceBridge=createC1CashAccountingBridge({context:predecessor.context,adoption:state.adoption,sessions:state.sessions,historySessions:state.historySessions,cashReconciliations:state.cashReconciliations});state.validationBridges.set(identity.sourceDigest,sourceBridge);}
  const validation=bridgeFacts(sourceBridge);
  for(let index=validation.days.length;index<state.days.length;index++)advanceC1CashAccountingBridge({bridge:sourceBridge,day:{...state.days[index],financial:false}});
  sourceBooks=validation.books;
  sourceReferenceScales=validation.referenceScales;
 }
 if(source.approvedAt!==undefined&&(!Number.isFinite(Date.parse(plan.observedAt))||Date.parse(plan.observedAt)<Date.parse(source.approvedAt)))fail('a captured financial plan predates its source approval');
 // An approved same-day interest/fee/minor posting can already be part of a
 // newly captured opening. Compare with that exact dated cash on a copy only;
 // the actual replay still posts it once at close, after the recorded fills.
 const expected=clone(sourceBooks),pending=source.events.filter(event=>event.date===plan.date);
 if(pending.some(event=>event.kind==='capital'))fail('current capital flows require a completed verified close before risk replay');
 if(pending.length){
  const reference=state.sessions.find(row=>row.date===plan.sourceSessionDate);
  applyDateEvents({books:expected,session:{date:plan.date,prices:reference?.prices||[]},proof:{...source,trades:[]},days:[],eventsBySleeve:Object.fromEntries(ids.map(id=>[id,[]]))});
 }
 if(identity.contract!=='c1-effective-cash-accounting-v1'||
  ![state.proof.sourceDigest,...state.proof.predecessorSourceDigests].includes(identity.sourceDigest)||
  identity.reviewId!==source.reviewId||economicBooks(plan.openingBooks)!==economicBooks(expected))
  fail('captured financial opening books do not match their approved journal lineage');
 state.validatedPlanReferenceScales.set(plan,{...sourceReferenceScales});
 return {plan:{...plan,openingBooks:clone(originalExpectedBooks)},financial:true};
}

export function advanceC1CashAccountingBridge({bridge,day}={}){
 const state=bridgeFacts(bridge),{books}=state,opening=clone(books),orders=new Map(day.plan?.orders?.map(order=>[order.id,order])||[]);
 for(const fill of day.accepted.fills){const id=orders.get(fill.orderId)?.sleeve;if(!ids.includes(id))fail('validated original fill allocation missing');books[id].cash+=(fill.side==='sell'?1:-1)*fill.shares*fill.price-fill.fee;}
 for(const id of ids)books[id].positions=clone(day.accepted.books[id].positions);
 applyC1NonCashBooks(books,state.nonCash,day.date);
 state.days.push(day);
 const assigned=applyDateEvents({books,session:state.sessions.find(row=>row.date===day.date),proof:state.proof,days:state.days,eventsBySleeve:state.eventsBySleeve,existingReconciliations:state.cashReconciliations});
 if(ids.some(id=>assigned[id].some(event=>event.kind==='capital'))){
  const equity=markedEquity(books,state.sessions.find(row=>row.date===day.date));
  for(const id of ids){
   const capital=assigned[id].filter(event=>event.kind==='capital').reduce((sum,event)=>sum+event.amount,0),before=equity[id]-capital;
   if(!positive(before)||!positive(equity[id]))fail('capital-reference attribution requires positive verified equity');
   state.referenceScales[id]*=equity[id]/before;
  }
 }
 state.snapshots[day.date]={opening,closing:clone(books),events:assigned};
 // Financial future plans are validated against the effective opening above.
 // Their existing original liquidation verifier receives those exact books.
 if(day.financial&&day.capturedPlan){
  for(const id of ids){
   const capturedRisk=day.capturedPlan.riskBySleeve?.[id];if(!positive(capturedRisk?.highWater))continue;
   const sourceScales=state.validatedPlanReferenceScales.get(day.capturedPlan);if(!positive(sourceScales?.[id]))fail('the captured risk reference lacks its original financial source');
   const referenceRatio=state.referenceScales[id]/sourceScales[id],risk={...capturedRisk,highWater:capturedRisk.highWater*referenceRatio};
   const threshold=risk.highWater*(1-C1_FROZEN_OPTIONS[id].portfolioDrawdownStopPct/100),
    observedRiskEquity=finite(risk.operationalRisk?.observedRiskEquity)?risk.operationalRisk.observedRiskEquity*referenceRatio:books[id].cash;
   // New financial episodes need a demonstrated loss on corrected equity.
   // Omitting known income before the test must not manufacture a new epoch.
   // A captured prior breach remains usable only with its actual evidence.
   if(!(books[id].cash<=threshold||risk.paused===true&&observedRiskEquity<=threshold))continue;
   const financialOpening={...clone(opening[id]),cash:opening[id].cash+assigned[id].reduce((sum,event)=>sum+event.amount,0)};
   const receipt=captureC1OperationalRiskLiquidation({allocation:id,triggerDate:risk.operationalRisk?.triggerDate||day.date,completedDate:day.date,historicalPeak:risk.highWater,
    openingBook:financialOpening,closingBook:books[id],fills:day.accepted.fills.filter(fill=>orders.get(fill.orderId)?.sleeve===id),
    orders:day.capturedPlan.orders.filter(order=>order.sleeve===id),risk,observedRiskEquity});
   if(receipt){const corrected=captureC1CorrectedOperationalRiskLiquidation({originalReceipt:receipt,openingBook:financialOpening,closingBook:books[id],fills:day.accepted.fills.filter(fill=>orders.get(fill.orderId)?.sleeve===id),events:[],sourceDigest:state.proof.sourceDigest});
    if(corrected)(state.financialReceipts[id]||(state.financialReceipts[id]=[])).push(corrected);}
  }
 }
 return {opening,closing:clone(books),events:assigned};
}
function normalizedReplay({adoption,sessions,days,original,eventsBySleeve,sourceDigest}){
 return Object.fromEntries(ids.map(id=>{
  const scale=adoption.seeds[id].actualDollarsPerModelDollar,replay={contract:'c1-actual-fill-replay-v1',sessions:[],accountPolicy:original.accountPolicy};
  for(const day of days){
   const orderMap=new Map(day.plan?.orders?.map(order=>[order.id,order])||[]),prior=sessions.find(session=>session.date===day.plan?.sourceSessionDate);
   replay.sessions.push({date:day.date,fills:day.accepted.fills.filter(fill=>orderMap.get(fill.orderId)?.sleeve===id).map(fill=>{
    const order=orderMap.get(fill.orderId),normalized=markC1ReconciledRankSale({...fill,reason:order.reason,shares:fill.shares/scale,fee:fill.fee/scale,
     ...(Number.isFinite(order.targetShares)?{targetShares:order.targetShares/scale}:{})},day.date);
    if(isC1AdditionalCapacityOrder(day.plan,order))markC1AdditionalCapacityPurchase(normalized,day.date);
    markC1InitialSwingStopPurchase(normalized,day.date,order);
    // Original facts already passed their original funding guard. The detached
    // attribution can be signed; it is never new purchase authority.
    markC1BrokerageFundedPurchase(normalized,day.date);
    const signal=[...(prior?.positionSignals||[]),...(prior?.signals||[]),...(prior?.accountHoldingSignals||[])].find(row=>row.symbol===fill.symbol)||null;
    return markC1ReconciledAccountFill(normalized,day.date,signal);
   })});
  }
  markC1NonCashReplay(replay,adoption,id,sessions);
  markC1CashFlowReplay(replay,{sleeve:id,actualDollarsPerModelDollar:scale,events:eventsBySleeve[id],sourceDigest});
  return [id,replay];
 }));
}

// The caller has already validated the COMPLETE original account through its
// unmodified opening-book/actual-fill guards. Only this detached copy receives
// approved dated cash events. Original plans, fills and seed units stay intact.
export function deriveC1CashAccounting({context,original,adoption,sessions,historySessions,days,cashReconciliations=[],completionRules,bridge,effectiveAccountPolicy}={}){
 const proof=facts(context),through=sessions.at(-1)?.date;
 if(!bridge){bridge=createC1CashAccountingBridge({context,adoption,sessions,historySessions,cashReconciliations});for(const day of days)advanceC1CashAccountingBridge({bridge,day});}
 const state=bridgeFacts(bridge),{books,eventsBySleeve,snapshots}=state;
 days=state.days;
 const replay=normalizedReplay({adoption,sessions:historySessions||sessions,days,original,eventsBySleeve,sourceDigest:proof.sourceDigest}),operationalRiskReceipts={};
 // Receipt WeakMap capabilities must remain attached; never JSON-clone them.
 for(const id of ids)if(state.financialReceipts[id])operationalRiskReceipts[id]=[...state.financialReceipts[id]];
 for(const id of ids)for(const receipt of original.operationalRiskReceipts?.[id]||[]){
  const snapshot=snapshots[receipt.completedDate],day=days.find(row=>row.date===receipt.completedDate);
  if(!snapshot||!day?.plan)fail('original completed risk episode is outside financial replay');
  const corrected=captureC1CorrectedOperationalRiskLiquidation({originalReceipt:receipt,openingBook:snapshot.opening[id],closingBook:snapshot.closing[id],
   fills:day.accepted.fills.filter(fill=>day.plan.orders.find(order=>order.id===fill.orderId)?.sleeve===id),
   events:snapshot.events[id],sourceDigest:proof.sourceDigest});
  if(corrected)(operationalRiskReceipts[id]||(operationalRiskReceipts[id]=[])).push(corrected);
 }
 let accountPolicy=effectiveAccountPolicy||original.accountPolicy;
 accountPolicy=accountPolicy?{...accountPolicy,operationalRiskReceipts}:null;
 const sleeves={};
 const simulate=id=>{
  if(accountPolicy)replay[id].accountPolicy=accountPolicy;
  const seed=adoption.seeds[id],run=simulatePointInTimePortfolio({sessions,recentMomentumHistorySessions:historySessions||sessions},
   {...C1_FROZEN_OPTIONS[id],startDate:seed.asOfSession,endDate:through,liquidateAtEnd:false,...(accountPolicy?{accountPolicy}:{}),
    ...(completionRules?.length?{accountCompletionRules:completionRules}:{})},seed,replay[id]);
  if(!near(run.actualCash*seed.actualDollarsPerModelDollar,books[id].cash))fail('detached financial cash differs from its trusted model replay');
  const held=new Map(run.openPositions.map(position=>[position.symbol,Math.round(position.shares*seed.actualDollarsPerModelDollar)]));
  if(held.size!==Object.keys(books[id].positions).length||Object.entries(books[id].positions).some(([symbol,p])=>held.get(symbol)!==p.shares))fail('detached financial ownership differs from original actual fills');
  return run;
 };
 for(const id of ids)sleeves[id]=simulate(id);
 if(accountPolicy){
  const activeExitSymbols=[...new Set(ids.flatMap(id=>sleeves[id].pendingDecisions.filter(order=>order.side==='sell'&&!order.condition).map(order=>order.symbol)))].sort();
  accountPolicy={...accountPolicy,activeExitSymbols};
  for(const id of ids){replay[id].accountPolicy=accountPolicy;if(activeExitSymbols.length)sleeves[id]=simulate(id);}
 }
 const effective={...original,books,sleeves,replay,actualCash:totalCash(books),...(accountPolicy?{accountPolicy,operationalRiskReceipts}:{}),
  cashAccounting:{contract:'c1-effective-cash-accounting-v1',sourceDigest:proof.sourceDigest,through,eventsBySleeve:clone(eventsBySleeve),
   scales:Object.fromEntries(ids.map(id=>[id,adoption.seeds[id].actualDollarsPerModelDollar])),reviewId:proof.reviewId,
   currentBrokerCash:proof.brokerageCash,capitalAttribution:'proportional-marked-allocation-equity',capitalReference:'proportional-nav-no-reset'},
  recordedHistory:{books:original.books,sleeves:original.sleeves,actualCash:original.actualCash,operationalRiskReceipts:original.operationalRiskReceipts}};
 financialViews.set(effective,{context,proof,eventsBySleeve,days});return effective;
}

export function markC1FinancialReplay({continued,replay,sleeve,currentBooks}={}){
 const view=financialViews.get(continued);if(!view)return replay;
 const actualDollarsPerModelDollar=continued.cashAccounting?.scales?.[sleeve];
 if(!positive(actualDollarsPerModelDollar))fail('financial projection account units are unavailable');
 let openingEvents=[];
 if(currentBooks){
  const current=currentViews.get(currentBooks);
  if(!current||current.continued!==continued||current.sourceDigest!==view.proof.sourceDigest)fail('financial opening events require their trusted current books');
  openingEvents=current.eventsBySleeve[sleeve].filter(event=>event.date===replay.projectionDate);
 }
 return markC1CashFlowReplay(replay,{sleeve,actualDollarsPerModelDollar,events:view.eventsBySleeve[sleeve],openingEvents,sourceDigest:view.proof.sourceDigest});
}

export function markC1CashAccountingDecision(decision,continued){
 if(financialViews.has(continued)&&decision&&typeof decision==='object')decisions.set(decision,continued);
 return decision;
}
export function c1CashAccountingDecisionContinued(decision){return decisions.get(decision)||null;}

// A current cash posting does not require a fabricated trade or opening plan.
// Start with the trusted completed books on every call, so rereads cannot
// consume an event twice. Capital changes still require their accepted close.
export function reconcileC1FinancialCurrentBooks({completedContinued,cashAccounting,now=new Date(),activity,originalResult}={}){
 const view=financialViews.get(completedContinued),proof=facts(cashAccounting),clock=easternMarketClock(now);
 if(!view||view.proof.sourceDigest!==proof.sourceDigest||!clock)fail('trusted completed financial books and the matching journal are required');
 const date=activity?.date||clock.key;if(activity&&!validDay(date)||date>clock.key)fail('financial activity cannot precede its observed session');
 const books=clone(completedContinued.books),through=completedContinued.sourceSessionDate,
  outstanding=proof.events.filter(row=>row.date>through&&row.date<=date),
  outstandingTrades=proof.trades.filter(row=>row.date>through&&row.date<=date);
 if(outstanding.some(row=>row.date!==date)||outstandingTrades.some(row=>row.date!==date))fail('an earlier cash posting requires its completed verified close');
 if(outstanding.some(row=>row.kind==='capital'))fail('current capital flows require a completed verified close before risk replay');
 if(outstandingTrades.length&&(!activity||originalResult?.contract!=='c1-actual-account-fills-v1'||originalResult.date!==activity.date||!Array.isArray(originalResult.fills)))
  fail('current statement trade adjustments require their validated recorded activity');
 const eventsBySleeve=Object.fromEntries(ids.map(id=>[id,[]]));
 if(outstanding.length||outstandingTrades.length){
  const reference={prices:ids.flatMap(id=>Object.keys(books[id].positions||{}).map(symbol=>({symbol,close:completedContinued.sleeves[id].openPositions.find(p=>p.symbol===symbol)?.lastPrice})))};
  const days=activity&&originalResult?[{date:activity.date,plan:activity.plan,accepted:{fills:originalResult.fills}}]:[];
  applyDateEvents({books,session:{date,...reference},proof,days,eventsBySleeve});
 }
 const result={books,actualCash:totalCash(books),cashAccounting:{contract:'c1-effective-current-cash-v1',sourceDigest:proof.sourceDigest,eventsBySleeve}};
 currentViews.set(result,{continued:completedContinued,sourceDigest:proof.sourceDigest,eventsBySleeve:clone(eventsBySleeve)});
 return result;
}

// Current fills are reconciled against their ORIGINAL captured plan first.
// This adds the already validated historical cash offset and only the current
// journal's known P&L postings. It cannot invent a close mark for a current
// capital flow; those require the completed dated financial replay.
export function reconcileC1FinancialIntraday({originalResult,effectiveOpeningBooks,completedContinued,cashAccounting,activity,now=new Date()}={}){
 if(!cashAccounting)return originalResult;
 const proof=facts(cashAccounting),date=activity?.date||originalResult?.date;
 if(!originalResult?.books||!effectiveOpeningBooks||!validDay(date))fail('validated original intraday books are required');
 const clock=easternMarketClock(now);if(!clock||date>clock.key)fail('financial activity cannot precede its observed session');
 const books=clone(originalResult.books),rawOpening=activity?.plan?.openingBooks;
 if(!rawOpening)fail('captured original intraday opening books are required');
 for(const id of ids)books[id].cash+=effectiveOpeningBooks[id].cash-rawOpening[id].cash;
 const eventsBySleeve=Object.fromEntries(ids.map(id=>[id,[]]));
 const capital=proof.events.filter(row=>row.date===date&&row.kind==='capital');
 if(capital.length)fail('current capital flows require a completed verified close before risk replay');
 const current=reconcileC1FinancialCurrentBooks({completedContinued,cashAccounting,now,activity,originalResult});
 for(const id of ids)for(const event of current.cashAccounting.eventsBySleeve[id]){books[id].cash+=event.amount;eventsBySleeve[id].push(event);}
 const result={...originalResult,books,actualCash:totalCash(books),cashAccounting:{contract:'c1-effective-intraday-cash-v1',sourceDigest:proof.sourceDigest,eventsBySleeve}};
 currentViews.set(result,{continued:completedContinued,sourceDigest:proof.sourceDigest,eventsBySleeve:clone(eventsBySleeve)});
 return result;
}

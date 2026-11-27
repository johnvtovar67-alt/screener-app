import {c1AccountPolicyFingerprint} from './c1AccountPolicyVersion';
import {isUsMarketSessionDay,marketSessionDistance,easternMarketClock} from './marketSession';
import {C1_OPERATIONAL_RISK_DECISION,C1_OPERATIONAL_RISK_MODE} from './c1OperationalRiskDecision';
import {c1HasCashFlowReplay,c1ReplayOpeningCashFlowEvents} from './c1CashFlowReplay';
export {C1_OPERATIONAL_RISK_DECISION,C1_OPERATIONAL_RISK_MODE};

export const C1_OPERATIONAL_RISK_EPOCH='c1-operational-risk-epoch-v1';
// Operational policy approval is the separate immutable server configuration.
// Serialized browser flags never authorize a new operational risk reference.
// This fingerprint is an opaque replay identity, not authentication. Only the
// request-local WeakMap capability below establishes trusted liquidation facts.
const receipts=new WeakMap();
const ids=['base','cooldown15','sector40'];
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const positive=value=>finite(value)&&value>0;
const clone=value=>JSON.parse(JSON.stringify(value));
const validDay=day=>typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&
 Number.isFinite(Date.parse(day))&&new Date(day).toISOString().slice(0,10)===day&&isUsMarketSessionDay(day);
const nextSession=day=>{
 let cursor=new Date(day+'T00:00:00.000Z');
 for(let i=0;i<10;i++){cursor.setUTCDate(cursor.getUTCDate()+1);const date=cursor.toISOString().slice(0,10);if(isUsMarketSessionDay(date))return date;}
 throw new Error('Next exchange session unavailable');
};
const same=(a,b)=>Math.abs(a-b)<=1e-6;

// Called with server-reconciled original books/orders/fills, never a browser
// assertion that an exit was verified. Independently conserve its economics.
// Owner-recorded sales are valid facts; their reason does not erase the loss.
export function captureC1OperationalRiskLiquidation({allocation,triggerDate,completedDate,historicalPeak,
 openingBook,closingBook,fills,orders,risk,observedRiskEquity,limitPct=12}={}){
 if(!ids.includes(allocation)||!validDay(triggerDate)||!validDay(completedDate)||completedDate<triggerDate||
   !positive(historicalPeak)||!positive(limitPct)||limitPct>=100||!openingBook||!closingBook||
   !finite(openingBook.cash)||!finite(closingBook.cash)||!Array.isArray(fills)||!Array.isArray(orders))
  throw new Error('Complete dated portfolio-liquidation evidence required');
 if(!positive(risk?.highWater)||!same(risk.highWater,historicalPeak))
  throw new Error('Verified original portfolio-risk reference required');
 const positions=new Map();
 for(const [symbol,p] of Object.entries(openingBook.positions||{})){
  if(!symbol||!Number.isSafeInteger(p?.shares)||p.shares<=0||!positive(p.avgCost))throw new Error('Original whole-share portfolio ownership required');
  positions.set(symbol,p.shares);
 }
 if(!positions.size)return null;
 if(Object.keys(closingBook.positions||{}).length)return null;
 const orderMap=new Map();
 for(const order of orders){if(typeof order?.id!=='string'||orderMap.has(order.id))throw new Error('Unique original liquidation orders required');orderMap.set(order.id,order);}
 let cash=openingBook.cash,lastTime=-Infinity;const seen=new Map(),quantities=new Map();
 const economicFacts=[];
 for(const fill of fills){
  const order=orderMap.get(fill?.orderId);
  if(!order)throw new Error('Liquidation fill lacks its original reconciled order');
  if(order.sleeve!==allocation)continue;
  const time=Date.parse(fill.executedAt),clock=easternMarketClock(fill.executedAt);
  if(typeof fill.id!=='string'||!fill.id||!Number.isSafeInteger(fill.shares)||fill.shares<=0||!positive(fill.price)||
    !finite(fill.fee)||fill.fee<0||fill.side!=='sell'||order.side!=='sell'||order.symbol!==fill.symbol||
    !Number.isSafeInteger(order.shares)||order.shares<=0||!Number.isFinite(time)||time<lastTime||
    !clock?.isSessionDay||clock.key<triggerDate||clock.key>completedDate)
   throw new Error('Verified chronological actual liquidation fills required');
  if(seen.has(fill.id)){if(JSON.stringify(seen.get(fill.id))!==JSON.stringify(fill))throw new Error('Conflicting liquidation fill identity');continue;}
  const filled=(quantities.get(order.id)||0)+fill.shares,held=positions.get(fill.symbol)||0;
  if(filled>order.shares||fill.shares>held)throw new Error('Liquidation exceeds its original order or ownership');
  quantities.set(order.id,filled);positions.set(fill.symbol,held-fill.shares);
  cash+=fill.shares*fill.price-fill.fee;lastTime=time;seen.set(fill.id,clone(fill));
  economicFacts.push([fill.id,fill.orderId,fill.symbol,fill.shares,fill.price,fill.fee,fill.executedAt]);
 }
 if([...positions.values()].some(shares=>shares!==0))return null;
 if(!economicFacts.length||!same(cash,closingBook.cash))throw new Error('Completed liquidation cash does not reconcile');
 if(!positive(cash))return null;
 const threshold=historicalPeak*(1-limitPct/100);
 // A morning plan may precede actual owner sales that complete a loss later
 // that day. Once flat, conserved net actual cash independently proves the
 // breach; no quote, sale reason, or fabricated paused flag is necessary.
 if(risk.paused!==true&&!(finite(observedRiskEquity)&&same(observedRiskEquity,cash)&&cash<=threshold))
  throw new Error('Verified original portfolio-risk reference or completed actual cash breach required');
 if(!(cash<=threshold||finite(observedRiskEquity)&&observedRiskEquity<=threshold))
  throw new Error('Liquidation evidence does not establish the portfolio loss threshold');
 const facts={allocation,triggerDate,completedDate,historicalPeak,postExitEquity:cash,limitPct,
  nextOpening:nextSession(completedDate),sourceDigest:c1AccountPolicyFingerprint({openingBook,closingBook,economicFacts})};
 const receipt=Object.freeze({contract:C1_OPERATIONAL_RISK_EPOCH,...facts});
 receipts.set(receipt,{...facts,originalEvidence:{openingBook:clone(openingBook),closingBook:clone(closingBook),economicFacts:clone(economicFacts)}});return receipt;
}

// Reclassifying documented capital and cash postings must not erase the
// original liquidation proof or create a new episode. Only an existing trusted
// receipt can enter this path; serialized copies have no WeakMap capability.
export function captureC1CorrectedOperationalRiskLiquidation({originalReceipt,openingBook,closingBook,fills,events=[],sourceDigest}={}){
 const prior=receipts.get(originalReceipt),original=prior?.originalEvidence;
 if(!prior||!original||originalReceipt.contract!==C1_OPERATIONAL_RISK_EPOCH||!/^[a-f0-9]{64}$/.test(sourceDigest||'')||
  !openingBook||!closingBook||!finite(openingBook.cash)||!finite(closingBook.cash)||!Array.isArray(fills)||!Array.isArray(events))
  throw new Error('Original verified liquidation and approved financial correction required');
 const holdings=book=>JSON.stringify(Object.entries(book.positions||{}).sort(([a],[b])=>a.localeCompare(b)).map(([symbol,p])=>[symbol,p.shares,p.avgCost]));
 if(holdings(openingBook)!==holdings(original.openingBook)||Object.keys(closingBook.positions||{}).length)
  throw new Error('Financial correction changed the original completed liquidation ownership');
 const economicFacts=fills.map(fill=>[fill.id,fill.orderId,fill.symbol,fill.shares,fill.price,fill.fee,fill.executedAt]);
 if(JSON.stringify(economicFacts)!==JSON.stringify(original.economicFacts))throw new Error('Financial correction changed original liquidation executions');
 let cash=openingBook.cash;for(const fill of fills)cash+=fill.shares*fill.price-fill.fee;
 const seen=new Map();
 for(const event of events){
  if(typeof event?.id!=='string'||!event.id||!validDay(event.date)||event.date!==prior.completedDate||!finite(event.amount)||
    !['capital','pnl'].includes(event.kind))throw new Error('Invalid dated liquidation cash correction');
  if(seen.has(event.id)){if(JSON.stringify(seen.get(event.id))!==JSON.stringify(event))throw new Error('Conflicting liquidation cash correction');continue;}
  cash+=event.amount;seen.set(event.id,event);
 }
 if(!same(cash,closingBook.cash))throw new Error('Corrected completed liquidation cash does not reconcile');
 if(!positive(cash))return null;
 const logicalEpisodeId=prior.logicalEpisodeId||c1AccountPolicyFingerprint({allocation:prior.allocation,triggerDate:prior.triggerDate,completedDate:prior.completedDate,
  fills:original.economicFacts.map(row=>[row[0],row[1],row[2],row[3],row[6]])});
 const financialSourceDigest=c1AccountPolicyFingerprint({sourceDigest,openingBook,closingBook,economicFacts,events});
 const facts={allocation:prior.allocation,triggerDate:prior.triggerDate,completedDate:prior.completedDate,historicalPeak:prior.historicalPeak,
  postExitEquity:cash,limitPct:prior.limitPct,nextOpening:prior.nextOpening,sourceDigest:logicalEpisodeId,logicalEpisodeId,financialSourceDigest,
  originalSourceDigest:prior.originalSourceDigest||prior.sourceDigest};
 const receipt=Object.freeze({contract:C1_OPERATIONAL_RISK_EPOCH,...facts});
 receipts.set(receipt,{...facts,originalEvidence:original});return receipt;
}

export function operationalRiskForSession({policy,state,session,allocation,openingEquity,equityScale=1,hasOpenHoldings=false,cashFlowReplay}={}){
 if(!state||!positive(state.historicalHighWater)||!positive(state.operationalHighWater??state.historicalHighWater)||
   !finite(openingEquity)||openingEquity<0||!positive(equityScale)||!validDay(session?.date))
  throw new Error('Valid separate historical and operational risk state required');
 const next={...clone(state),operationalHighWater:state.operationalHighWater??state.historicalHighWater,
  appliedEpochs:[...(state.appliedEpochs||[])],resetApplied:false};
 if(policy?.active!==true)return {...next,status:'legacy',decisionRequired:false,purchaseRiskReady:true};
 const decision=policy.operationalRiskDecision||C1_OPERATIONAL_RISK_DECISION;
 if(decision.status!=='approved')return {...next,status:'pending-owner-decision',decisionRequired:true,purchaseRiskReady:false};
 if(decision.mode!==C1_OPERATIONAL_RISK_MODE)throw new Error('Unsupported operational risk baseline decision');
 const candidates=policy.operationalRiskReceipts?.[allocation];
 if(!candidates||(Array.isArray(candidates)&&!candidates.length)){
  if(state.requiresLiquidationEpoch===true)return {...next,status:'liquidation-evidence-required',decisionRequired:false,purchaseRiskReady:false};
  return {...next,status:'active-existing-reference',decisionRequired:false,purchaseRiskReady:true};
 }
 const source=Array.isArray(candidates)?candidates:[candidates];
 const episodes=source.map(receipt=>({receipt,facts:receipts.get(receipt)}));
 if(episodes.some(({receipt,facts})=>!facts||receipt.contract!==C1_OPERATIONAL_RISK_EPOCH||facts.allocation!==allocation))
  return {...next,status:'liquidation-evidence-required',decisionRequired:false,purchaseRiskReady:false};
 const activation=policy.activationDate;
 if(!validDay(activation))throw new Error('Explicit risk-policy activation session required');
 // Full replay may already hold later accepted receipts. Never use a future
 // liquidation to reset today's protection or pre-approve today's purchases.
 const available=episodes.map(({facts})=>facts).filter(f=>f.completedDate<session.date)
  .sort((a,b)=>a.completedDate.localeCompare(b.completedDate)||a.triggerDate.localeCompare(b.triggerDate));
 const requiredTrigger=state.requiresLiquidationEpoch===true&&validDay(state.triggerDate)?state.triggerDate:null;
 const unapplied=available.filter(f=>![f.sourceDigest,f.logicalEpisodeId,f.originalSourceDigest].filter(Boolean).some(key=>next.appliedEpochs.includes(key))&&(!requiredTrigger||f.triggerDate>=requiredTrigger));
 if(!unapplied.length){
  const waiting=episodes.map(({facts})=>facts).filter(f=>f.completedDate===session.date&&(!requiredTrigger||f.triggerDate>=requiredTrigger));
  if(waiting.length&&state.requiresLiquidationEpoch===true)return {...next,status:'awaiting-next-opening',decisionRequired:false,purchaseRiskReady:false,effectiveDate:nextSession(session.date)};
  if(state.requiresLiquidationEpoch===true)return {...next,status:'liquidation-evidence-required',decisionRequired:false,purchaseRiskReady:false};
  return {...next,status:'active',decisionRequired:false,purchaseRiskReady:true};
 }
 // When transitioning old episodes at activation, only the latest completed
 // exit supplies current post-exit equity. Earlier completed episodes retain
 // their identities without introducing retroactive operational resets.
 const facts=unapplied.at(-1);
 const effectiveDate=facts.nextOpening>activation?facts.nextOpening:activation;
 if(session.date<effectiveDate)return {...next,status:'awaiting-next-opening',decisionRequired:false,purchaseRiskReady:false,effectiveDate};
 // A newly activated rule cannot dispose of an existing holding to manufacture
 // a fresh risk epoch. Any intervening investment requires its own reviewed path.
 if(hasOpenHoldings)return {...next,status:'holding-continuity',decisionRequired:false,purchaseRiskReady:false,effectiveDate};
 // Approved current-opening income/fees are already in cash. Reconcile only
 // that exact journal capability; copied flags, other allocations/units,
 // historical postings and unexplained differences cannot bridge an exit.
 const openingPnl=c1HasCashFlowReplay(cashFlowReplay,{sleeve:allocation,actualDollarsPerModelDollar:equityScale})?
  c1ReplayOpeningCashFlowEvents(cashFlowReplay,session.date).reduce((sum,event)=>sum+event.amount,0):0;
 const postExitReference=openingEquity-openingPnl;
 if(!positive(postExitReference)||!same(postExitReference*equityScale,facts.postExitEquity))
  return {...next,status:'post-exit-equity-changed',decisionRequired:false,purchaseRiskReady:false,effectiveDate};
 // Reset to conserved exit equity once, before current P&L. The caller then
 // applies ordinary high-water/loss checks to the full current opening equity.
 next.operationalHighWater=postExitReference;
 next.appliedEpochs.push(...unapplied.map(f=>f.sourceDigest));
 next.requiresLiquidationEpoch=false;
 return {...next,status:'active',decisionRequired:false,purchaseRiskReady:true,resetApplied:true,
  epoch:{contract:C1_OPERATIONAL_RISK_EPOCH,allocation,triggerDate:facts.triggerDate,completedDate:facts.completedDate,
   effectiveDate,observedSessionDate:session.date,reference:postExitReference,sourceDigest:facts.sourceDigest}};
}

export function c1OperationalPortfolioLoss({operationalHighWater,openingEquity,limitPct=12}={}){
 if(!positive(operationalHighWater)||!finite(openingEquity)||openingEquity<0||!positive(limitPct)||limitPct>=100)
  throw new Error('Valid operational portfolio-loss inputs required');
 return {drawdownPct:100*(openingEquity-operationalHighWater)/operationalHighWater,
  threshold:operationalHighWater*(1-limitPct/100),triggered:openingEquity<=operationalHighWater*(1-limitPct/100)};
}

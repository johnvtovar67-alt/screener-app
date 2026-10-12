import {simulatePointInTimePortfolio} from './c1AccountSimulator';
import {C1_FROZEN_OPTIONS} from './c1FrozenOptions';
import {marketSessionDistance,easternMarketClock,latestCompletedMarketSessionDay} from './marketSession';
import {c1HistoricalPriceEvidence,withC1HistoricalPriceEvidence} from './c1AccountSeed';
import {projectC1AccountSession} from './c1AccountProjection';

const clone=value=>JSON.parse(JSON.stringify(value));
const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;
const whole=value=>{const n=Math.round(value);if(Math.abs(value-n)>1e-7||!Number.isSafeInteger(n)||n<0)throw new Error('Whole-share sleeve ownership required');return n;};
const ids=['base','cooldown15','sector40'];
const ownerExitReason='owner-discretionary-exit';

// A factual purchase-date correction changes the adopted lifecycle date, not
// the immutable broker execution's ownership, basis or cash evidence.
function accountEconomics(books){
  return JSON.stringify(ids.map(id=>({cash:books[id]?.cash,positions:Object.entries(books[id]?.positions||{}).sort(([a],[b])=>a.localeCompare(b)).map(([symbol,p])=>[symbol,p.shares,p.avgCost])})));
}

function applyCashReconciliations(books,reconciliations=[]){
  if(!Array.isArray(reconciliations)||reconciliations.length>100)throw new Error('Invalid cash reconciliation history');
  const next=clone(books);
  let priorRevision=0;
  for(const event of reconciliations){
    if(event?.contract!=='c1-broker-cash-reconciliation-v1'||!Number.isSafeInteger(event.revision)||event.revision<=priorRevision||
      !Number.isFinite(event.amount)||Math.abs(Math.round(event.amount*100)-event.amount*100)>1e-7||
      !Number.isFinite(event.balanceBefore)||!Number.isFinite(event.balanceAfter)||Math.abs(event.balanceBefore+event.amount-event.balanceAfter)>1e-7||
      typeof event.recordedAt!=='string'||!Number.isFinite(Date.parse(event.recordedAt))||event.source!=='broker-statement-balance')throw new Error('Invalid cash reconciliation event');
    const total=ids.reduce((sum,id)=>sum+next[id].cash,0);
    let allocated=0;
    ids.forEach((id,index)=>{
      const amount=index===ids.length-1?event.amount-allocated:event.amount*(total?next[id].cash/total:({base:.25,cooldown15:.5,sector40:.25}[id]));
      next[id].cash+=amount;allocated+=amount;
      if(next[id].cash<-.000001)throw new Error('Cash reconciliation exceeds the recorded account balance');
    });
    priorRevision=event.revision;
  }
  return next;
}

export function c1ReplayRecordingEvidence(plan,record){
  const evidence=record.recordingEvidence;
  const recordedOrders=evidence?.orders?.filter(o=>o.reason===ownerExitReason||o.postExitReplacement===true)||[];
  if(!recordedOrders.length)return plan;
  if(evidence.date!==plan.date||evidence.sourceSessionDate!==plan.sourceSessionDate||accountEconomics(evidence.openingBooks)!==accountEconomics(plan.openingBooks))throw new Error('Recorded owner exit evidence does not match the reconstructed account');
  const orders=[...plan.orders],idsSeen=new Set(orders.map(o=>o.id));
  for(const order of recordedOrders){
    const held=plan.openingBooks[order.sleeve]?.positions[order.symbol]?.shares,ownerExit=order.reason===ownerExitReason;
    if(!ids.includes(order.sleeve)||!Number.isSafeInteger(order.shares)||order.shares<=0||(ownerExit?(order.side!=='sell'||order.recordingOnly!==true||order.shares!==held):(!['buy','sell'].includes(order.side)||(order.side==='buy'&&['MSTR','SCHW'].includes(order.symbol))||!positive(order.estimatedPrice))))throw new Error('Invalid recorded owner exit evidence');
    if(idsSeen.has(order.id)){
      const index=orders.findIndex(o=>o.id===order.id),existing=orders[index];
      if(existing.symbol===order.symbol&&existing.side===order.side&&existing.sleeve===order.sleeve&&existing.reason===order.reason)continue;
      // Numeric model-order IDs were historically based on queue position.
      // A later authorized strategy repair can legitimately assign that old
      // ID to a different hypothetical order. The immutable, broker-filled
      // replacement evidence must win for its completed session; ownership,
      // cash, quantity, price, fee and execution time still replay unchanged.
      if(order.postExitReplacement!==true)throw new Error('Recorded replacement order identity changed');
      orders.splice(index,1,clone(order));
      continue;
    }
    orders.push(clone(order));idsSeen.add(order.id);
  }
  return {...plan,orders};
}

export function c1CompletionPolicy(positionContext=[]){
  return {version:1,partialSymbols:positionContext.filter(p=>p.stage==='half').map(p=>p.symbol).sort()};
}
export function c1CompletionRules(records,sourceDate){
  return records.flatMap((record,index)=>{
    if(!record.completionPolicy)return [];
    const policy=record.completionPolicy;
    if(policy.version!==1||!Array.isArray(policy.partialSymbols)||policy.partialSymbols.some(s=>typeof s!=='string'||!/^[A-Z][A-Z0-9.-]{0,14}$/.test(s)))throw new Error('Invalid dated completion policy');
    return [{date:record.date,priorDate:index?records[index-1].date:sourceDate,partialSymbols:policy.partialSymbols}];
  });
}

export function c1AccountBooks(adoption) {
  if(adoption?.contract!=='c1-prospective-account-adoption-v1'||!adoption.seeds)throw new Error('Accepted prospective account required');
  const books={};
  for(const id of ids){
    const seed=adoption.seeds[id],scale=seed?.actualDollarsPerModelDollar;
    if(!positive(scale)||seed.sleeve!==id)throw new Error('Account unit conversion missing');
    books[id]={cash:seed.cash*scale,positions:Object.fromEntries(seed.positions.map(p=>[p.symbol,{shares:whole(p.shares*scale),avgCost:p.entryPrice,openedAt:p.openedAt}]))};
  }
  if(Math.abs(ids.reduce((sum,id)=>sum+books[id].cash,0)-adoption.actualCash)>1e-6)throw new Error('Opening account cash does not reconcile');
  return books;
}

// Actual posted economics, including partial fills, are conserved per sleeve.
// Unfilled orders remain outstanding; projected balances are never adopted.
export function reconcileC1ActualAccountFills({plan,fills,observedAt}={}) {
  if(plan?.contract!=='c1-actual-account-opening-plan-v1'||!Array.isArray(fills)||fills.length>10000)throw new Error('Account plan and actual fill records required');
  const now=new Date(observedAt);
  if(!Number.isFinite(now.getTime()))throw new Error('Valid reconciliation time required');
  const books=clone(plan.openingBooks),orders=new Map(plan.orders.map(o=>[o.id,o])),seen=new Map(),quantities=new Map();
  if(orders.size!==plan.orders.length)throw new Error('Duplicate account order');
  let lastTime=-Infinity;
  for(const fill of fills){
    if(typeof fill.id!=='string'||!fill.id||fill.id.length>200)throw new Error('Unique actual fill ID required');
    if(seen.has(fill.id)){if(JSON.stringify(seen.get(fill.id))!==JSON.stringify(fill))throw new Error('Conflicting actual fill ID');continue;}
    const order=orders.get(fill.orderId),time=new Date(fill.executedAt),clock=easternMarketClock(time);
    if(!order||order.symbol!==fill.symbol||order.side!==fill.side)throw new Error('Actual fill does not match an account order');
    if(!Number.isFinite(time.getTime())||time>now||time.getTime()<lastTime||clock?.key!==plan.date||clock.minutes<570)throw new Error('Invalid actual execution time');
    if(!Number.isSafeInteger(fill.shares)||fill.shares<=0||!positive(fill.price)||typeof fill.fee!=='number'||!Number.isFinite(fill.fee)||fill.fee<0)throw new Error('Actual quantity, execution price and fee required');
    const filled=(quantities.get(order.id)||0)+fill.shares;
    if(filled>order.shares)throw new Error('Actual fills exceed the planned account order');
    const book=books[order.sleeve],position=book.positions[fill.symbol],delta=fill.side==='buy'?fill.shares:-fill.shares;
    const shares=(position?.shares||0)+delta,cash=book.cash-delta*fill.price-fill.fee;
    if(shares<0||cash< -1e-6)throw new Error('Actual fill oversells or exceeds its sleeve cash');
    book.cash=Math.max(0,cash);
    if(shares){
      const avgCost=fill.side==='buy'?((position?.shares||0)*(position?.avgCost||0)+fill.shares*fill.price+fill.fee)/shares:position.avgCost;
      book.positions[fill.symbol]={shares,avgCost,openedAt:position?.openedAt||plan.date};
    }else delete book.positions[fill.symbol];
    seen.set(fill.id,clone(fill));quantities.set(order.id,filled);lastTime=time.getTime();
  }
  const outstanding=plan.orders.map(o=>({...o,shares:Math.min(o.shares-(quantities.get(o.id)||0),o.condition==='stop-triggered'?(books[o.sleeve].positions[o.symbol]?.shares||0):Infinity)})).filter(o=>o.shares>0);
  return {contract:'c1-actual-account-fills-v1',status:outstanding.length?'partial':'recorded',date:plan.date,books,
    fills:[...seen.values()],outstanding,actualCash:ids.reduce((sum,id)=>sum+books[id].cash,0),
    executable:false,modelAdvanceAuthorized:false,brokerageVerified:false};
}


// Rebuild from the immutable adoption and actual executions. All state inside
// the strategy (including age, stops and cooldowns) is replayed chronologically;
// it is never reset by re-normalizing today's equity into a new account.
export function continueC1ActualAccount({adoption,sessions,historySessions,records,cashReconciliations,observedAt}={}) {
  const sourceAdoption=adoption,priceHistory=historySessions||sessions;
  adoption=withC1HistoricalPriceEvidence(adoption,priceHistory);
  let books=c1AccountBooks(adoption);
  if(!Array.isArray(sessions)||!sessions.length||sessions[0]?.date!==adoption.sourceSessionDate||!Array.isArray(records)||records.length!==sessions.length-1)throw new Error('Complete account sessions and execution records required');
  const latest=latestCompletedMarketSessionDay(observedAt);
  if(!latest||sessions.at(-1).date>latest)throw new Error('Account continuation requires completed sessions');
  const replay=Object.fromEntries(ids.map(id=>[id,{contract:'c1-actual-fill-replay-v1',sessions:[]}]));
  for(let i=1;i<sessions.length;i++){
    const session=sessions[i],record=records[i-1];
    if(record?.date!==session.date||record.complete!==true||marketSessionDistance(sessions[i-1].date,session.date)!==1)throw new Error('Confirm complete actual activity for each consecutive session');
    // Empty sessions retain actual ownership. Captured executions use their
    // immutable plan, never today's opening clock or a newly projected queue.
    // Older confirmed records lack that plan; their original numeric order IDs
    // still require deterministic dated reconstruction before fills can replay.
    const plan=record.executionEvidence||record.fills?.length&&c1ReplayRecordingEvidence(projectC1AccountSession({adoption,baseline:sessions[i-1],opening:{...session,...(record.entryRecheck?{entryRecheck:record.entryRecheck}:{})},observedAt:record.openingObservedAt||session.decisionAt,books,sessions:sessions.slice(0,i),replay,accountCompletionRules:c1CompletionRules(records.slice(0,i),adoption.sourceSessionDate)}),record);
    if(!Array.isArray(record.fills))throw new Error('Account actual fill records required');
    // Saved plans contain broker cash corrections already accepted before
    // their session. The strategy replay retains its original model units;
    // the same corrections are applied once to the returned accounting books.
    const expectedBooks=record.executionEvidence?applyCashReconciliations(books,(cashReconciliations||[]).filter(event=>event.effectiveSessionDate<=sessions[i-1].date)):books;
    if(plan&&(plan.contract!=='c1-actual-account-opening-plan-v1'||plan.date!==session.date||plan.sourceSessionDate!==sessions[i-1].date||accountEconomics(plan.openingBooks)!==accountEconomics(expectedBooks)))throw new Error('Recorded execution evidence does not match the completed account');
    if(plan)c1ReplayRecordingEvidence(plan,{recordingEvidence:plan});
    const accepted=plan?reconcileC1ActualAccountFills({plan:{...plan,openingBooks:books},fills:record.fills,observedAt}):{books,fills:[]};
    for(const id of ids){
      const scale=adoption.seeds[id].actualDollarsPerModelDollar;
      replay[id].sessions.push({date:session.date,fills:accepted.fills.filter(f=>plan.orders.find(o=>o.id===f.orderId).sleeve===id).map(f=>({...f,reason:plan.orders.find(o=>o.id===f.orderId).reason,shares:f.shares/scale,fee:f.fee/scale,...(Number.isFinite(plan.orders.find(o=>o.id===f.orderId).targetShares)?{targetShares:plan.orders.find(o=>o.id===f.orderId).targetShares/scale}:{})}))});
    }
    books=accepted.books;
  }
  const sleeves={};
  for(const id of ids){
    const seed=adoption.seeds[id],scale=seed.actualDollarsPerModelDollar;
    const run=simulatePointInTimePortfolio({sessions},{...C1_FROZEN_OPTIONS[id],startDate:seed.asOfSession,endDate:sessions.at(-1).date,liquidateAtEnd:false,...(records.some(r=>r.completionPolicy)?{accountCompletionRules:c1CompletionRules(records,adoption.sourceSessionDate)}:{})},seed,replay[id]);
    if(Math.abs(run.actualCash*scale-books[id].cash)>1e-6)throw new Error('Continued strategy cash differs from actual fills');
    const held=new Map(run.openPositions.map(p=>[p.symbol,whole(p.shares*scale)]));
    if(held.size!==Object.keys(books[id].positions).length||Object.entries(books[id].positions).some(([symbol,p])=>held.get(symbol)!==p.shares))throw new Error('Continued strategy ownership differs from actual fills');
    sleeves[id]=run;
  }
  const holdingRankings={};
  for(const id of ids)for(const position of sleeves[id].openPositions){
    if(position.rankVerified!==true)continue;
    const eligible=Number.isSafeInteger(position.lastC1Rank)&&position.lastC1Rank>0;
    const eligibleCount=Number.isSafeInteger(position.lastC1EligibleCount)&&position.lastC1EligibleCount>=0?position.lastC1EligibleCount:0;
    if(!holdingRankings[position.symbol])holdingRankings[position.symbol]={};
    holdingRankings[position.symbol][id]={
      rank:eligible?position.lastC1Rank:eligibleCount+1,
      eligible,
      eligibleCount,
      peerCount:eligibleCount,
      source:'authoritative-opportunities'
    };
  }
  books=applyCashReconciliations(books,cashReconciliations);
  const holdingPriceHistory={};
  for(const position of Object.values(sourceAdoption.seeds).flatMap(seed=>seed.positions))if(!holdingPriceHistory[position.symbol])holdingPriceHistory[position.symbol]=c1HistoricalPriceEvidence(position,priceHistory,sessions.at(-1).date);
  return {contract:'c1-actual-account-continuation-v1',sourceSessionDate:sessions.at(-1).date,books,sleeves,replay,holdingRankings,holdingPriceHistory,
    actualCash:ids.reduce((sum,id)=>sum+books[id].cash,0),actualFillsApplied:true,executable:false,providerVerified:false};
}

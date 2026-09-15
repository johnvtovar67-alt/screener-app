import {reconcileC1ActualAccountFills} from './c1AccountExecution';
import {easternMarketClock,marketExecutionState,marketSessionDistance} from './marketSession';
import {C1_FROZEN_OPTIONS} from './c1FrozenOptions';
import {c1AccountHoldingExplanation} from './c1AccountDecision';

const clone=x=>JSON.parse(JSON.stringify(x));
const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const accepted=(plan,fills,now)=>reconcileC1ActualAccountFills({plan,fills,observedAt:now.toISOString()});

// A broker sale is an accounting fact, not a new purchase recommendation.
// Only already-pending exits from the continued account can use this path.
export function c1RecordedExitPlan({continued,now=new Date()}={}){
 const day=easternMarketClock(now)?.key;
 if(!marketExecutionState(now).isOpen||marketSessionDistance(continued.sourceSessionDate,day)!==1)return null;
 const orders=[];
 for(const [sleeve,run] of Object.entries(continued.sleeves)){
  const seen=new Set();
  for(const exit of run.pendingDecisions.filter(o=>o.side==='sell')){
   const held=continued.books[sleeve].positions[exit.symbol];
   if(!held?.shares||seen.has(exit.symbol))continue;
   seen.add(exit.symbol);
   orders.push({id:`recorded-exit:${sleeve}:${day}:${exit.symbol}`,date:day,sleeve,symbol:exit.symbol,side:'sell',shares:held.shares,reason:exit.reason,executable:false});
  }
 }
 return orders.length?{contract:'c1-actual-account-opening-plan-v1',recordingOnly:true,providerVerified:false,executable:false,sourceSessionDate:continued.sourceSessionDate,date:day,observedAt:now.toISOString(),openingBooks:clone(continued.books),orders}:null;
}

// Resolve accounting-only identities against the real observed opening plan.
// Never alter quantities, prices, fees, times, or original sleeve ownership.
export function rebaseC1RecordedExitActivity({activity,plan,now=new Date()}={}){
 if(!activity?.plan.recordingOnly)return activity;
 if(activity.date!==plan.date||activity.plan.sourceSessionDate!==plan.sourceSessionDate)throw new Error('Recorded exit session does not match the observed plan');
 if(JSON.stringify(activity.plan.openingBooks)!==JSON.stringify(plan.openingBooks))throw new Error('Recorded exit opening balances changed');
 const fills=activity.fills.map(fill=>{
  const original=activity.plan.orders.find(o=>o.id===fill.orderId);
  const matches=plan.orders.filter(o=>!o.condition&&o.side==='sell'&&o.sleeve===original?.sleeve&&o.symbol===fill.symbol&&o.reason===original.reason);
  if(matches.length!==1)throw new Error('Recorded exit cannot yet be matched to the observed plan');
  return {...fill,orderId:matches[0].id};
 });
 accepted(plan,fills,now);
 return {...activity,recordingEvidence:activity.plan,plan:clone(plan),fills};
}

// Aggregate broker fills are allocated to the existing sleeve orders, never
// to invented orders or modeled executions. The captured plan is immutable.
export function recordC1IntradayActivity({account,plan,ticket,expectedRevision,now=new Date()}={}){
 const prior=account.intradayActivity;
 const duplicate=prior?.tickets.find(t=>t.id===ticket?.id);
 if(duplicate){if(JSON.stringify(duplicate)!==JSON.stringify(ticket))throw new Error('Conflicting trade reference');return account;}
 if(account.revision!==expectedRevision)throw new Error('Account changed; reload before recording the trade');
 const time=new Date(ticket?.executedAt),clock=easternMarketClock(time);
 if(!ticket||typeof ticket.id!=='string'||!ticket.id||ticket.id.length>100||!['buy','sell'].includes(ticket.side)||!Number.isSafeInteger(ticket.shares)||ticket.shares<=0||!positive(ticket.price)||typeof ticket.fee!=='number'||!Number.isFinite(ticket.fee)||ticket.fee<0||!Number.isFinite(time.getTime())||time>now||clock?.key!==plan?.date||clock.minutes<570||clock.minutes>=960||easternMarketClock(now)?.key!==plan.date)throw new Error('Enter the actual regular-session trade quantity, price, fee and time');
 if(prior&&prior.date!==plan.date)throw new Error('Previous trade session has not finished reconciling');
 const original=prior?.plan||plan;
 if(original.sourceSessionDate!==plan.sourceSessionDate)throw new Error('Trade source session changed');
 const fills=clone(prior?.fills||[]),before=accepted(original,fills,now);
 // Prefer unconditional exits, avoiding duplicate allocation to their stops.
 const candidates=before.outstanding.filter(o=>o.symbol===ticket.symbol&&o.side===ticket.side).sort((a,b)=>Number(Boolean(a.condition))-Number(Boolean(b.condition)));
 const usedSleeves=new Set(),capacities=[];
 for(const order of candidates){
  if(usedSleeves.has(order.sleeve))continue;
  const held=before.books[order.sleeve].positions[ticket.symbol]?.shares||0;
  const shares=ticket.side==='sell'?Math.min(order.shares,held):order.shares;
  if(shares>0){capacities.push({order,shares});usedSleeves.add(order.sleeve);}
 }
 const total=capacities.reduce((n,c)=>n+c.shares,0);
 if(ticket.shares>total)throw new Error('Trade exceeds the remaining C1 quantity');
 let left=ticket.shares;
 const parts=capacities.map(c=>{const shares=Math.floor(ticket.shares*c.shares/total);left-=shares;return {...c,quantity:shares,remainder:ticket.shares*c.shares/total-shares};});
 for(const p of [...parts].sort((a,b)=>b.remainder-a.remainder)){if(left&&p.quantity<p.shares){p.quantity++;left--;}}
 for(const p of parts.filter(p=>p.quantity))fills.push({id:ticket.id+':'+p.order.sleeve,orderId:p.order.id,symbol:ticket.symbol,side:ticket.side,shares:p.quantity,price:ticket.price,fee:ticket.fee*p.quantity/ticket.shares,executedAt:time.toISOString()});
 fills.sort((a,b)=>Date.parse(a.executedAt)-Date.parse(b.executedAt));
 accepted(original,fills,now);
 return {...account,revision:account.revision+1,intradayActivity:{date:original.date,openingObservedAt:original.observedAt,plan:clone(original),tickets:[...(prior?.tickets||[]),clone(ticket)],fills}};
}

export function c1IntradayDecision({decision,activity,revision,now=new Date()}={}){
 if(!activity)return decision;
 const actual=accepted(activity.plan,activity.fills,now),rows=new Map();
 for(const [sleeve,book] of Object.entries(actual.books))for(const [symbol,p] of Object.entries(book.positions)){
  const old=decision.positions.find(r=>r.symbol===symbol);
  if(!rows.has(symbol))rows.set(symbol,{...(old||{symbol,exits:[],reviewRules:[],action:'Hold'}),shares:0,totalCost:0,openedAt:p.openedAt,stops:[]});
  const row=rows.get(symbol);row.shares+=p.shares;row.totalCost+=p.shares*p.avgCost;row.openedAt=row.openedAt<p.openedAt?row.openedAt:p.openedAt;
  const buys=activity.fills.filter(f=>f.symbol===symbol&&f.side==='buy'&&activity.plan.orders.find(o=>o.id===f.orderId)?.sleeve===sleeve);
  const priorStop=old?.stops.find(s=>s.sleeve===sleeve)?.price;
  const entry=buys.length?buys.reduce((n,f)=>n+f.price*f.shares,0)/buys.reduce((n,f)=>n+f.shares,0):p.avgCost;
  row.stops.push({sleeve,shares:p.shares,price:priorStop??entry*(1-C1_FROZEN_OPTIONS[sleeve].minimumInitialStopPct/100)});
 }
 return {...decision,revision,decisionId:decision.decisionId+':fills:'+revision,actualCash:actual.actualCash,
  positions:[...rows.values()].map(row=>{row.avgCost=row.totalCost/row.shares;row.exits=row.exits.filter(e=>actual.books[e.sleeve]?.positions[row.symbol]).map(e=>({...e,shares:actual.books[e.sleeve].positions[row.symbol].shares}));row.action=decision.current?(row.exits.length?'Exit candidate':'Hold'):'Refresh required';return {...row,reason:c1AccountHoldingExplanation(row,decision.sourceSessionDate)};})};
}

// Keep the frozen opening selections and targets. After a recorded execution,
// use actual cash and fresh prices; unfilled sales cannot fund another purchase.
export function c1IntradayRemainingPlan({plan,activity,opening,baseline,decision,now=new Date()}={}){
 if(!activity)return plan;
 const actual=accepted(activity.plan,activity.fills,now),books=clone(actual.books),prices=new Map(opening.prices.map(p=>[p.symbol,p.observedPrice||p.open]));
 const signals=new Map([...(baseline.positionSignals||[]),...(baseline.signals||[])].map(s=>[s.symbol,s]));
 const orders=[],entryReviews=[...(plan.entryReviews||[])];
 const available=new Map(actual.outstanding.map(o=>[o.id,o.shares]));
 for(const order of plan.orders){
  let shares=Math.min(order.shares,available.get(order.id)||0);
  const book=books[order.sleeve];
  if(order.side==='sell'){
   shares=Math.min(shares,actual.books[order.sleeve].positions[order.symbol]?.shares||0);
   if(shares)orders.push({...order,shares});
   continue;
  }
  if(!shares)continue;
  const price=prices.get(order.symbol),config=C1_FROZEN_OPTIONS[order.sleeve],signal=signals.get(order.symbol),reference=signal?.price??signal?.close;
  let reason=null;
  if(!positive(price)||!positive(reference))reason='missing-opening-price';
  else if((price/reference-1)*100>config.maxEntryGapPct)reason='entry-gap';
  const held=book.positions[order.symbol],sector=signal?.sector||'Other';
  if(!held&&Object.keys(book.positions).length>=config.maxPositions)reason='position-limit';
  const sameSector=Object.entries(book.positions).filter(([symbol])=>(signals.get(symbol)?.sector||decision.positions.find(p=>p.symbol===symbol)?.sector||'Other')===sector);
  if(!held&&sameSector.length>=config.maxSectorPositions)reason='sector-position-limit';
  const equity=book.cash+Object.entries(book.positions).reduce((n,[symbol,p])=>n+p.shares*(prices.get(symbol)||0),0);
  const risk=plan.riskBySleeve?.[order.sleeve];
  if(risk?.paused||(positive(risk?.highWater)&&equity<=risk.highWater*(1-config.portfolioDrawdownStopPct/100)))reason='portfolio-cooldown';
  if(Object.keys(book.positions).some(symbol=>!positive(prices.get(symbol))))reason='missing-opening-price';
  const exposure=sameSector.reduce((n,[symbol,p])=>n+p.shares*(prices.get(symbol)||0),0);
  if(!reason)shares=Math.min(shares,Math.floor((book.cash+1e-8)/price),Math.floor(Math.max(0,equity*config.buyMaxPositionPct-(held?.shares||0)*price)/price+1e-9),Math.floor(Math.max(0,equity*config.maxSectorPct-exposure)/price+1e-9));
  if(reason||shares<=0){entryReviews.push({sleeve:order.sleeve,symbol:order.symbol,reason:reason||'cash-or-sizing-limit'});continue;}
  orders.push({...order,shares,estimatedPrice:price});book.cash-=shares*price;book.positions[order.symbol]={shares:(held?.shares||0)+shares};
 }
 return {...plan,orders,entryReviews,openingBooks:actual.books,projectedBooks:books};
}

// Re-evaluate current entry gates before projecting purchases. The original
// observed opens remain intact; blocked, unfilled buys consume no slots or cash.
export function c1IntradayEntryRecheck({account,opening,baseline,now=new Date()}={}){
 const activity=account.intradayActivity;
 if(!activity||activity.date!==opening.date)return opening;
 if(activity.fills.some(f=>f.side==='buy'))return activity.plan.entryRecheck?{...opening,entryRecheck:clone(activity.plan.entryRecheck)}:opening;
 const references=new Map([...(baseline.positionSignals||[]),...(baseline.signals||[])].map(s=>[s.symbol,s.price??s.currentPrice??s.lastPrice??s.close]));
 const blocks=[];
 for(const p of opening.prices){
  const reference=references.get(p.symbol);
  if(!positive(reference)||!positive(p.observedPrice))continue;
  for(const [sleeve,config] of Object.entries(C1_FROZEN_OPTIONS))if((p.observedPrice/reference-1)*100>config.maxEntryGapPct)blocks.push({sleeve,symbol:p.symbol,reason:'entry-gap-limit',observedPrice:p.observedPrice,referencePrice:reference});
 }

 return {...opening,entryRecheck:{contract:'c1-intraday-entry-recheck-v1',date:opening.date,sourceSessionDate:baseline.date,observedAt:opening.receipt.observedAt,blocks}};
}

// Only unfilled purchase plans may be replaced. Already recorded sells retain
// their exact economics, sleeve attribution, and original plan evidence.
export function rebaseC1UnfilledEntryPlan({activity,plan,now=new Date()}={}){
 if(!activity||activity.fills.some(f=>f.side==='buy')||!plan.entryRecheck)return activity;
 if(activity.date!==plan.date||activity.plan.sourceSessionDate!==plan.sourceSessionDate||JSON.stringify(activity.plan.openingBooks)!==JSON.stringify(plan.openingBooks))throw new Error('Refreshed entry plan changed recorded opening balances');
 const fills=activity.fills.map(fill=>{
  const original=activity.plan.orders.find(o=>o.id===fill.orderId);
  const matches=plan.orders.filter(o=>o.side===fill.side&&o.sleeve===original?.sleeve&&o.symbol===fill.symbol&&o.reason===original.reason&&Boolean(o.condition)===Boolean(original.condition));
  if(matches.length!==1)throw new Error('Recorded sale cannot be matched to refreshed entries');
  return {...fill,orderId:matches[0].id};
 });
 const before=accepted(activity.plan,activity.fills,now),after=accepted(plan,fills,now);
 if(JSON.stringify(before.books)!==JSON.stringify(after.books))throw new Error('Refreshed entries changed actual holdings or cash');
 return {...activity,entryPlanEvidence:activity.entryPlanEvidence||clone(activity.plan),plan:clone(plan),fills};
}

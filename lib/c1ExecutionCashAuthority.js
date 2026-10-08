import {c1AccountCashAvailability} from './c1BrokerageCash';

const clone=value=>JSON.parse(JSON.stringify(value));
const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;

// This is an execution overlay, never an input to the C1 model or sleeve
// ledger. Unfilled sales do not replenish this budget. Posted fills are
// already reflected once in both the strategy and brokerage cash sources.
export function capC1ExecutionCash({plan,account,strategyCash,now=new Date()}={}){
 const cash=c1AccountCashAvailability({account,strategyCash,now});
 if(!plan)return plan;
 let remaining=cash.executableCash;
 const orders=[],cashBlockedOrders=[];
 for(const order of plan.orders){
  if(order.side!=='buy'){orders.push({...order});continue;}
  const shares=positive(order.estimatedPrice)?Math.min(order.shares,Math.floor((remaining+1e-8)/order.estimatedPrice)):0;
  if(shares>0){orders.push({...order,shares});remaining=Math.max(0,remaining-shares*order.estimatedPrice);}
  if(shares<order.shares){
   const reason=cash.brokerageCashCurrent?(cash.brokerageCash<strategyCash?'brokerage-cash-insufficient':'insufficient-cash'):'brokerage-cash-'+cash.brokerageCashStatus;
   cashBlockedOrders.push({...order,shares:order.shares-shares,reason,blockReason:reason});
  }
 }
 // Keep projected ownership consistent with the permitted quantities without
 // changing the opening books, order targets, stops, or recorded economics.
 const projectedBooks=clone(plan.openingBooks);
 for(const order of orders){
  const book=projectedBooks[order.sleeve],held=book.positions[order.symbol];
  if(order.condition){order.shares=Math.min(order.shares,held?.shares||0);continue;}
  const delta=order.side==='buy'?order.shares:-order.shares,shares=(held?.shares||0)+delta;
  if(positive(order.estimatedPrice))book.cash-=delta*order.estimatedPrice;
  if(shares>0)book.positions[order.symbol]={...(held||{avgCost:order.estimatedPrice,openedAt:order.date}),shares};
  else delete book.positions[order.symbol];
 }
 return {...plan,...cash,orders:orders.filter(order=>order.shares>0),projectedBooks:cashBlockedOrders.length?projectedBooks:(plan.projectedBooks||projectedBooks),cashBlockedOrders,
  cashAuthority:{contract:'c1-brokerage-cash-execution-cap-v1',...cash,observedAt:now.toISOString(),
   authorizedBuyCost:cash.executableCash-remaining,unrecordedSaleProceedsIncluded:false}};
}

// The recording form subtracts posted fills from a captured plan. Present the
// remaining authority with those fill quantities restored, while preserving
// all original fill identities and opening books for display and replay.
export function c1ExecutionRecordingPlan({plan,authorityPlan,activity}={}){
 if(!activity)return authorityPlan;
 const allowed=new Map(authorityPlan.orders.map(order=>[order.id,order.shares]));
 const filled=new Map();
 for(const fill of activity.fills)filled.set(fill.orderId,(filled.get(fill.orderId)||0)+fill.shares);
 const orders=plan.orders.map(order=>order.side==='buy'?{...order,shares:(filled.get(order.id)||0)+(allowed.get(order.id)||0)}:{...order}).filter(order=>order.shares>0);
 return {...plan,...authorityPlan,openingBooks:plan.openingBooks,orders};
}

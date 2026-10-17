import {buildC1StockScreenSnapshot,classifyC1StockScreen} from './c1StockClassification';
import {easternMarketClock,marketExecutionState} from './marketSession';

export const C1_ADDITIONAL_SWING_CAPACITY='c1-qualified-swing-capacity-v1';

// Reuse the existing three-name rating selection. Opening collection already
// verifies membership/adjusted anchors; its fresh observation supplies only the
// current quote field. Source event/liquidity/momentum rules are unchanged.
export function c1AdditionalSwingCapacity({baseline,historySessions,opening,observedAt}={}){
 const now=new Date(observedAt),clock=easternMarketClock(now),signals=new Map([...(baseline.positionSignals||[]),...(baseline.signals||[])].map(s=>[s.symbol,s]));
 let snapshot;
 try{snapshot=buildC1StockScreenSnapshot(baseline,now,historySessions||[baseline]);}
 catch(error){return {contract:C1_ADDITIONAL_SWING_CAPACITY,sourceSessionDate:baseline.date,symbols:[],reviews:[],unavailableReason:'Additional Swing qualification is unavailable: '+String(error.message).slice(0,160)};}
 const rows=(opening.prices||[]).map(p=>{
  const at=Date.parse(p.observedAt),qclock=easternMarketClock(p.observedAt),source=signals.get(p.symbol)||{},price=p.observedPrice;
  const fresh=marketExecutionState(now).isOpen&&qclock?.key===clock?.key&&qclock.minutes>=570&&Number.isFinite(at)&&at<=now.getTime()&&now.getTime()-at<=120000&&Number.isFinite(price)&&price>0;
  const expert=source.recommendation?.expertDecision||source.expertDecision||{},verified={...expert,metrics:{...(expert.metrics||{}),quoteFreshnessPass:fresh}};
  return {...source,symbol:p.symbol,price,expertDecision:verified,...(source.recommendation?{recommendation:{...source.recommendation,expertDecision:verified}}:{})};
 });
 const ratings=classifyC1StockScreen({snapshot,rows,current:true});
 return {contract:C1_ADDITIONAL_SWING_CAPACITY,sourceSessionDate:baseline.date,
  symbols:ratings.filter(r=>['Buy','Strong Buy'].includes(r.rating)).map(r=>r.symbol),
  reviews:ratings.map(r=>({symbol:r.symbol,rating:r.rating,reason:r.screenReview.why,next:r.screenReview.next}))};
}

export function isC1AdditionalCapacityOrder(plan,order){
 const evidence=order?.additionalCapacityEvidence;
 return order?.side==='buy'&&order.additionalCapacity===true&&evidence?.contract===C1_ADDITIONAL_SWING_CAPACITY&&
  evidence.sourceSessionDate===plan?.sourceSessionDate&&evidence.symbol===order.symbol&&['Buy','Strong Buy'].includes(evidence.rating);
}

// Current permission may withdraw unfilled purchases without erasing the
// captured eligibility of an already executed fill retained during a replan.
export function isC1CurrentAdditionalCapacityOrder(plan,order){
 return isC1AdditionalCapacityOrder(plan,order)&&plan?.additionalSwingCapacity?.contract===C1_ADDITIONAL_SWING_CAPACITY&&
  plan.additionalSwingCapacity.sourceSessionDate===plan.sourceSessionDate&&plan.additionalSwingCapacity.symbols.includes(order.symbol);
}

// Preserve ordinary orders' cash priority. Conditional stops stay after buys
// so their quantity is bounded by the same permitted projected ownership.
export function c1CapacityOrderPriority(orders=[]){
 if(!orders.some(o=>o.additionalCapacity===true))return orders;
 return [...orders.filter(o=>!o.condition&&o.additionalCapacity!==true),
  ...orders.filter(o=>!o.condition&&o.additionalCapacity===true),...orders.filter(o=>o.condition)];
}

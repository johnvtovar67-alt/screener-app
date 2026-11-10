// One prospective instruction per stock. Allocation orders retain their IDs
// and economics for reconciliation; conditional standing stops remain separate.
export const C1_ACCOUNT_ACTIONS='c1-account-actions-v2';
const symbolOf=value=>String(value?.symbol||value||'').replace('-','.').toUpperCase().trim();
const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;
export function c1AccountPolicyActive(policy){return policy?.active===true&&policy?.version==='c1-account-policy-v2';}
export function c1AccountBlockedSymbols(policy){
 return new Set([...(policy?.blockedSymbols||[]),...(policy?.stockCooldowns||[]).filter(row=>row.active===true).map(row=>row.symbol)].map(symbolOf));
}

export function resolveC1AccountActions({orders=[],positions=[],openingBooks,accountPolicy,decisionId=null,activeExitSymbols=[],activeExitInstructions=[]}={}){
 const active=c1AccountPolicyActive(accountPolicy),cooldowns=c1AccountBlockedSymbols(accountPolicy);
 const exits=new Set([...activeExitSymbols,...activeExitInstructions.map(exit=>exit.symbol),...positions.filter(p=>p.exits?.some(exit=>!exit.condition&&positive(exit.shares))).map(p=>p.symbol),
  ...orders.filter(order=>order.side==='sell'&&!order.condition&&positive(order.shares)).map(order=>order.symbol)].map(symbolOf));
 const blockedOrders=[],permitted=[];
 for(const original of orders){
  const order={...original},symbol=symbolOf(order);
  const reason=active&&order.side==='buy'?(accountPolicy.complete!==true?'account-policy-unverified':exits.has(symbol)?'account-active-exit':cooldowns.has(symbol)?'account-stock-cooldown':null):null;
  if(reason)blockedOrders.push({...order,blockReason:reason});else permitted.push(order);
 }
 const groups=new Map(),aggregatedIds=new Map();
 for(const order of permitted){
  if(order.condition||!positive(order.shares))continue;
  if(typeof order.id==='string'&&order.id){
   const identity=JSON.stringify([order.symbol,order.sleeve,order.side,order.shares,order.estimatedPrice,order.phase,order.reason]);
   if(aggregatedIds.has(order.id)){
    if(aggregatedIds.get(order.id)!==identity)throw new Error('Conflicting account order identity');
    continue;
   }
   aggregatedIds.set(order.id,identity);
  }
  const symbol=symbolOf(order);
  // Sell priority is decided before aggregation, never by netting quantities.
  if(active&&order.side==='buy'&&exits.has(symbol))continue;
  const key=symbol+':'+order.side;
  if(!groups.has(key))groups.set(key,{symbol,side:order.side,action:order.side==='sell'?'Sell':positions.some(p=>symbolOf(p)===symbol)?'Add':'Buy',
   shares:0,estimatedValue:0,estimatedPrice:null,conditional:false,activeExit:order.side==='sell',decisionId,
   allocationBreakdown:[],orderIds:[],reasons:[]});
  const group=groups.get(key);group.shares+=order.shares;group.estimatedValue+=positive(order.estimatedPrice)?order.shares*order.estimatedPrice:0;
  group.allocationBreakdown.push({sleeve:order.sleeve,orderId:order.id,shares:order.shares,estimatedPrice:order.estimatedPrice,reason:order.reason});
  group.orderIds.push(order.id);if(!group.reasons.includes(order.reason))group.reasons.push(order.reason);
 }
 for(const group of groups.values())if(group.estimatedValue>0)group.estimatedPrice=group.estimatedValue/group.shares;
 if(active)for(const exit of activeExitInstructions){
  if(!positive(exit.shares)||!Array.isArray(exit.allocationBreakdown))continue;
  const key=symbolOf(exit)+':sell',prior=groups.get(key),breakdown=new Map();
  for(const row of [...(prior?.allocationBreakdown||[]),...exit.allocationBreakdown])if(!breakdown.has(row.sleeve)||breakdown.get(row.sleeve).shares<row.shares)breakdown.set(row.sleeve,{...row});
  groups.set(key,{...prior,...exit,symbol:symbolOf(exit),side:'sell',action:'Sell',activeExit:true,conditional:false,decisionId,
   shares:[...breakdown.values()].reduce((sum,row)=>sum+row.shares,0),allocationBreakdown:[...breakdown.values()],orderIds:prior?.orderIds||[],recommendationOnly:true});
 }
 if(active)for(const group of groups.values())if(group.side==='sell'){
  // Within one allocation these are competing instructions against the same
  // owned shares, not additive sales. Keep the strongest target, prefer a
  // protective reason on ties, and retain every original identity for audit.
  const sources=group.allocationBreakdown.map(row=>({...row})),bySleeve=new Map();
  const protective=reason=>['portfolio-drawdown-stop','initial-stop','invalidation-stop','ratcheted-stop','profit-trailing-stop','verified-current-stop','universe-removal'].includes(reason);
  for(const row of sources){
   const key=row.sleeve||'recorded',prior=bySleeve.get(key);
   if(!prior||row.shares>prior.shares||row.shares===prior.shares&&protective(row.reason)&&!protective(prior.reason))bySleeve.set(key,{...row});
  }
  const breakdown=[];
  for(const [sleeve,row]of bySleeve){
   let bound;
   if(openingBooks&&Object.hasOwn(openingBooks,sleeve))bound=openingBooks[sleeve].positions?.[group.symbol]?.shares||0;
   else{
    const position=positions.find(position=>symbolOf(position)===group.symbol),stop=position?.stops?.find(stop=>stop.sleeve===sleeve);
    if(Number.isSafeInteger(stop?.shares)&&stop.shares>=0)bound=stop.shares;
   }
   const shares=bound===undefined?row.shares:Math.min(row.shares,bound);
   if(shares>0)breakdown.push({...row,shares,orderIds:[...new Set(sources.filter(source=>(source.sleeve||'recorded')===sleeve).map(source=>source.orderId).filter(Boolean))]});
  }
  group.sourceAllocationBreakdown=sources;group.allocationBreakdown=breakdown;
  group.orderIds=[...new Set(group.orderIds.filter(Boolean))];
  group.shares=breakdown.reduce((sum,row)=>sum+row.shares,0);
  group.estimatedValue=breakdown.reduce((sum,row)=>sum+(positive(row.estimatedPrice)?row.estimatedPrice*row.shares:0),0);
  group.estimatedPrice=group.shares&&group.estimatedValue>0?group.estimatedValue/group.shares:null;
  const strongest=breakdown.find(row=>protective(row.reason))||breakdown[0];
  if(strongest)group.reason=strongest.reason;
 }
 const actions=[...groups.values()].filter(group=>group.side!=='sell'||group.shares>0);
 if(active)for(const symbol of cooldowns)if(!actions.some(action=>action.symbol===symbol))actions.push({symbol,side:'blocked',action:'Cooldown',shares:0,conditional:false,activeExit:false,decisionId,
  allocationBreakdown:[],orderIds:[],cooldown:accountPolicy.stockCooldowns?.find(row=>symbolOf(row)===symbol&&row.active)});
 return {contract:C1_ACCOUNT_ACTIONS,policyVersion:accountPolicy?.version||null,decisionId,orders:permitted,blockedOrders,
  accountActions:actions,activeExitSymbols:[...exits].sort(),blockedSymbols:active?[...new Set([...exits,...cooldowns])].sort():[]};
}

export function applyC1AccountActionsToPlan(plan,{accountPolicy=plan?.accountPolicy,decisionId=plan?.actionVersion,positions=[],activeExitSymbols=[]}={}){
 if(!plan||!c1AccountPolicyActive(accountPolicy))return plan;
 const riskDecisionPending=Object.values(plan.riskBySleeve||{}).some(risk=>risk.operationalRisk?.decisionRequired===true);
 const denied=(plan.orders||[]).filter(order=>order.side==='buy'&&(riskDecisionPending||plan.riskBySleeve?.[order.sleeve]?.operationalRisk?.purchaseRiskReady===false));
 if(denied.length){
  const reason=order=>riskDecisionPending?'operational-risk-baseline-decision-required':plan.riskBySleeve[order.sleeve].operationalRisk.status||'operational-risk-evidence-required';
  plan={...plan,orders:plan.orders.filter(order=>!denied.includes(order)),projectedBooks:null,
   actionBlockedOrders:[...(plan.actionBlockedOrders||[]),...denied.map(order=>({...order,blockReason:reason(order)}))],
   entryReviews:[...(plan.entryReviews||[]),...denied.map(order=>({symbol:order.symbol,sleeve:order.sleeve,reason:reason(order)}))]};
 }
 const resolved=resolveC1AccountActions({orders:plan.orders,positions,openingBooks:plan.openingBooks,accountPolicy,decisionId,activeExitSymbols:[...(plan.activeExitSymbols||[]),...activeExitSymbols],activeExitInstructions:plan.verifiedStopExits||[]});
 return {...plan,accountPolicy,actionVersion:decisionId,accountActions:resolved.accountActions,activeExitSymbols:resolved.activeExitSymbols,
  orders:resolved.orders.map(order=>({...order,accountActionVersion:decisionId,accountPolicyVersion:accountPolicy.version})),projectedBooks:resolved.blockedOrders.length?null:plan.projectedBooks,
  actionBlockedOrders:[...(plan.actionBlockedOrders||[]),...resolved.blockedOrders],
  entryReviews:[...(plan.entryReviews||[]),...resolved.blockedOrders.map(order=>({symbol:order.symbol,sleeve:order.sleeve,reason:order.blockReason}))]};
}

// Execution-only account limits. Pending exits do not create cash or capacity.
// Caller supplies verified marks/classification and unchanged policy limits;
// missing evidence cannot be replaced by an invented sector or cost-basis mark.
export function capC1AccountExposure({orders=[],openingBooks={},brokerageCash=0,exposure}={}){
 const buys=orders.some(order=>order.side==='buy');
 if(!buys)return {orders,blockedOrders:[]};
 if(!exposure||!Array.isArray(exposure.holdings)||!exposure.candidates||!positive(exposure.maxPositionPct)||
  !positive(exposure.maxSectorValue)||exposure.maxDistinctPositions!==4||!Number.isSafeInteger(exposure.maxSectorPositions)||!Number.isSafeInteger(exposure.maxIssuerPositions))
  return {orders:orders.filter(order=>order.side!=='buy'),blockedOrders:orders.filter(order=>order.side==='buy').map(order=>({...order,blockReason:'account-exposure-unverified'}))};
 const holdings=new Map(),heldQuantities=new Map();
 for(const book of Object.values(openingBooks))for(const [symbol,position]of Object.entries(book.positions||{}))heldQuantities.set(symbol,(heldQuantities.get(symbol)||0)+position.shares);
 for(const [symbol,shares]of heldQuantities){
  const rows=exposure.holdings.filter(row=>symbolOf(row)===symbol);
  if(!rows.length&&positive(exposure.candidates[symbol]?.price))rows.push({symbol,...exposure.candidates[symbol]});
  if(rows.length!==1||!positive(rows[0].price)||!rows[0].sector||!rows[0].issuer)
   return {orders:orders.filter(order=>order.side!=='buy'),blockedOrders:orders.filter(order=>order.side==='buy').map(order=>({...order,blockReason:'account-exposure-unverified'}))};
  holdings.set(symbol,{...rows[0],shares});
 }
 const equity=brokerageCash+[...holdings.values()].reduce((sum,row)=>sum+row.shares*row.price,0);
 if(!positive(equity))return {orders:orders.filter(order=>order.side!=='buy'),blockedOrders:orders.filter(order=>order.side==='buy').map(order=>({...order,blockReason:'account-exposure-unverified'}))};
 const permitted=[],blocked=[];
 for(const original of orders){
  if(original.side!=='buy'){permitted.push(original);continue;}
  const meta=exposure.candidates[original.symbol],held=holdings.get(original.symbol),price=original.estimatedPrice;
  let reason=null,shares=original.shares;
  if(!meta?.sector||!meta.issuer||!positive(price))reason='account-exposure-unverified';
  else if(held&&(held.sector!==meta.sector||held.issuer!==meta.issuer))reason='account-exposure-unverified';
  else if(!held&&holdings.size>=exposure.maxDistinctPositions)reason='account-position-limit';
  else if([...holdings.values()].filter(row=>row.issuer===meta.issuer&&row.symbol!==original.symbol).length>=exposure.maxIssuerPositions)reason='account-issuer-limit';
  else if([...holdings.values()].filter(row=>row.sector===meta.sector).length>(held?exposure.maxSectorPositions:exposure.maxSectorPositions-1))reason='account-sector-position-limit';
  if(!reason){
   const sectorValue=[...holdings.values()].filter(row=>row.sector===meta.sector).reduce((sum,row)=>sum+row.shares*row.price,0);
   const positionValue=held?held.shares*held.price:0;
   shares=Math.min(shares,Math.floor(Math.max(0,equity*exposure.maxPositionPct-positionValue)/price+1e-9),
    Math.floor(Math.max(0,exposure.maxSectorValue-sectorValue)/price+1e-9));
   if(shares<=0)reason='account-concentration-limit';
  }
  if(!reason){permitted.push({...original,shares});holdings.set(original.symbol,{symbol:original.symbol,sector:meta.sector,issuer:meta.issuer,price,shares:(held?.shares||0)+shares});}
  if(reason||shares<original.shares)blocked.push({...original,shares:reason?original.shares:original.shares-shares,blockReason:reason||'account-concentration-limit'});
 }
 return {orders:permitted,blockedOrders:blocked};
}

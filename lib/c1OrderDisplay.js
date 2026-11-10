// Aggregate only identical instructions for display. Original order IDs and
// sleeve allocations remain unchanged for actual-fill reconciliation.
export function c1OrderDisplayGroups(orders=[]){
 const groups=new Map();
 for(const order of orders){
  const unified=order.accountPolicyVersion==='c1-account-policy-v2'&&!order.condition;
  const key=unified?JSON.stringify([order.accountActionVersion,order.symbol,order.side]):JSON.stringify([order.symbol,order.side,order.condition||null,order.estimatedPrice,order.phase??null,order.reason||null]);
  if(!groups.has(key))groups.set(key,{...order,id:key,shares:0,orderIds:[]});
  const group=groups.get(key),value=group.shares*(group.estimatedPrice||0)+order.shares*(order.estimatedPrice||0);group.shares+=order.shares;group.orderIds.push(order.id);
  if(unified){group.estimatedPrice=value/group.shares;(group.allocationBreakdown??=[]).push({sleeve:order.sleeve,orderId:order.id,shares:order.shares,estimatedPrice:order.estimatedPrice,reason:order.reason});}
 }
 return [...groups.values()];
}

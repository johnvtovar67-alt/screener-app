// Aggregate only identical instructions for display. Original order IDs and
// sleeve allocations remain unchanged for actual-fill reconciliation.
export function c1OrderDisplayGroups(orders=[]){
 const groups=new Map();
 for(const order of orders){
  const key=JSON.stringify([order.symbol,order.side,order.condition||null,order.estimatedPrice,order.phase??null,order.reason||null]);
  if(!groups.has(key))groups.set(key,{...order,id:key,shares:0,orderIds:[]});
  const group=groups.get(key);group.shares+=order.shares;group.orderIds.push(order.id);
 }
 return [...groups.values()];
}

// Server-only proof keyed by the validated financial context. Serialized
// statement flags cannot change account-level completed-investment economics.
const capabilities=new WeakMap();
const finite=value=>typeof value==='number'&&Number.isFinite(value);
export function markC1StatementTradeCash(context,groups){
 if(!context||typeof context!=='object'||!Array.isArray(groups))throw new Error('Validated statement trade cash is required');
 const byFill=new Map();
 for(const group of groups){
  if(!finite(group.cashAdjustment)||!Array.isArray(group.rawFills)||!Number.isSafeInteger(group.quantity)||group.quantity<=0)
   throw new Error('Valid statement trade cash groups are required');
  let allocated=0;
  group.rawFills.forEach((fill,index)=>{
   if(typeof fill.id!=='string'||!Number.isSafeInteger(fill.shares)||fill.shares<=0||byFill.has(fill.id))
    throw new Error('Unique statement trade cash identities are required');
   const amount=index===group.rawFills.length-1?group.cashAdjustment-allocated:group.cashAdjustment*fill.shares/group.quantity;
   allocated+=amount;byFill.set(fill.id,amount);
  });
 }
 capabilities.set(context,byFill);return context;
}
export function c1StatementTradeCash(context){return new Map(capabilities.get(context)||[]);}

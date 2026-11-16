// Retained recommendations are recording evidence, never current execution
// authority. Keep this module browser-safe so the real form uses the same
// quantities as the server. A repeated review is not another trade to fill.
const clone=value=>JSON.parse(JSON.stringify(value));
export const C1_ISSUED_BUY_REASON='recorded-issued-buy';
export const c1IssuedOrderKey=order=>JSON.stringify([order.sleeve,order.symbol]);
function boughtByOrder(activity){
 const quantities=new Map();
 for(const fill of activity?.fills||[]){
  if(fill.side!=='buy')continue;
  const order=activity.plan.orders.find(row=>row.id===fill.orderId);
  if(!order)continue;
  const key=c1IssuedOrderKey(order);quantities.set(key,(quantities.get(key)||0)+fill.shares);
 }
 return quantities;
}

export function retainC1IssuedEntries({account,view}={}){
 const review=view?.manualRecommendations,plan=view?.openingPlan;
 if(review?.date<'2026-11-16'||review?.status!=='ready'||plan?.providerVerified!==true)return account;
 const orders=review.orders.filter(order=>order.side==='buy'&&!order.condition&&order.recordingOnly!==true);
 if(!orders.length)return account;
 const filled=boughtByOrder(account.intradayActivity);
 const capacities=orders.map(order=>({order:clone(order),filledBefore:filled.get(c1IssuedOrderKey(order))||0}));
 const key=JSON.stringify([review.date,review.sourceSessionDate,account.revision,capacities.map(({order,filledBefore})=>[order.id,order.sleeve,order.symbol,order.reason,order.shares,filledBefore])]);
 if(account.issuedC1Entries?.some(entry=>entry.key===key))return account;
 const entry={contract:'c1-issued-entry-log-v1',key,date:review.date,sourceSessionDate:review.sourceSessionDate,issuedAt:review.observedAt,
  validUntil:review.validUntil,accountRevision:account.revision,providerVerified:true,sourceReceipt:clone(plan.sourceReceipt),
  recordingPlan:clone({contract:plan.contract,date:plan.date,sourceSessionDate:plan.sourceSessionDate,observedAt:plan.observedAt,
   openingBooks:plan.openingBooks,orders:[],providerVerified:false,executable:false,recordingOnly:true,
   ...(plan.purchaseFundingPolicy?{purchaseFundingPolicy:plan.purchaseFundingPolicy}:{}),
   ...(plan.completionPolicy?{completionPolicy:plan.completionPolicy}:{}),
   ...(plan.riskBySleeve?{riskBySleeve:plan.riskBySleeve}:{}),
   ...(plan.accountPolicy?{accountPolicy:{version:plan.accountPolicy.version,active:plan.accountPolicy.active,date:plan.accountPolicy.date,identity:plan.accountPolicy.identity}}:{})}),
  purchaseFundingPolicy:plan.purchaseFundingPolicy,brokerageCash:account.brokerageCash?clone(account.brokerageCash):null,
  filledSymbolBefore:Object.fromEntries([...new Set(orders.map(order=>order.symbol))].map(symbol=>[symbol,(account.intradayActivity?.fills||[]).filter(fill=>fill.side==='buy'&&fill.symbol===symbol).reduce((sum,fill)=>sum+fill.shares,0)])),capacities};
 return {...account,issuedC1Entries:[...(account.issuedC1Entries||[]),entry]};
}

export function c1RetainedEntrySession({account,now=new Date()}={}){
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const entry=account.issuedC1Entries?.find(row=>row.date===date&&row.recordingPlan);
 if(!entry)return null;
 const activity=account.intradayActivity?.date===date?account.intradayActivity:null;
 return {date,revision:account.revision,plan:activity?.plan||entry.recordingPlan,fills:activity?.fills||[],tickets:activity?.tickets||[],sellOnly:true};
}

export function c1SessionWithIssuedTrades(session,account){
 if(!session)return null;
 const entries=(account.issuedC1Entries||[]).filter(entry=>entry.date===session.date);
 return {...session,issuedChoices:c1IssuedTradeChoices({entries,date:session.date,activity:{plan:session.plan,fills:session.fills}})};
}

export function c1RetainedTradeSessions({account,now=new Date()}={}){
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 return [...new Set((account.issuedC1Entries||[]).map(entry=>entry.date))].filter(date=>date<today).sort().reverse().flatMap(date=>{
  const entry=account.issuedC1Entries.find(row=>row.date===date),record=account.records.find(row=>row.date===date);
  const activity=account.intradayActivity?.date===date?account.intradayActivity:null;
  const plan=activity?.plan||record?.executionEvidence||record?.recordingEvidence||entry.recordingPlan;
  if(!plan)return [];
  const session=c1SessionWithIssuedTrades({date,revision:account.revision,plan,fills:activity?.fills||record?.fills||[],tickets:activity?.tickets||[],sellOnly:true,historicalIssued:true},account);
  if(!session.issuedChoices.length)return [];
  const finalized=account.records.some(row=>row.date>=date),laterActivity=account.intradayActivity?.date>date;
  return [{...session,...(finalized||laterActivity?{recordingBlockedReason:'A later account record is already saved. This earlier fill needs an explicit historical reconciliation; existing financial records will not be replaced.'}:{})}];
 });
}

export function c1IssuedTradeChoices({entries=[],activity,date}={}){
 const filled=boughtByOrder(activity),groups=new Map();
 for(const entry of entries){
  if(entry.contract!=='c1-issued-entry-log-v1'||entry.date!==date||entry.providerVerified!==true)continue;
  const offered=new Map();
  for(const capacity of entry.capacities||[]){
   const order=capacity.order,key=c1IssuedOrderKey(order),remaining=capacity.filledBefore+order.shares-(filled.get(key)||0);
   if(order.side!=='buy'||order.recordingOnly===true||remaining<=0)continue;
   const group=offered.get(order.symbol)||{symbol:order.symbol,side:'buy',allocations:[]};
   group.allocations.push({order,shares:remaining,entryKey:entry.key,issuedAt:entry.issuedAt});
   offered.set(order.symbol,group);
  }
  for(const [symbol,group]of offered){
   const capacities=entry.capacities.filter(row=>row.order.symbol===symbol),before=entry.filledSymbolBefore?.[symbol]??capacities.reduce((sum,row)=>sum+row.filledBefore,0);
   const posted=(activity?.fills||[]).filter(fill=>fill.side==='buy'&&fill.symbol===symbol).reduce((sum,fill)=>sum+fill.shares,0);
   const remaining=before+capacities.reduce((sum,row)=>sum+row.order.shares,0)-posted;
   const shares=Math.min(remaining,group.allocations.reduce((sum,row)=>sum+row.shares,0));
   // Keep one coherent issued snapshot. Alternative allocation offers cannot
   // be combined into a larger purchase C1 never issued.
   if(shares>0&&(!groups.has(symbol)||groups.get(symbol).shares<shares))groups.set(symbol,{...group,shares});
  }
 }
 return [...groups.values()];
}

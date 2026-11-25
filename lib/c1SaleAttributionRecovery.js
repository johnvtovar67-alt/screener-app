import {createHash} from 'node:crypto';
import {reconcileC1ActualAccountFills} from './c1AccountLedger';
import {c1AccountCashAvailability} from './c1BrokerageCash';
import {easternMarketClock,marketSessionDistance,marketSessionCloseMinutes} from './marketSession';

export const C1_SALE_ATTRIBUTION_CORRECTION='c1-sale-attribution-correction-v1';
const ids=['base','cooldown15','sector40'];
const clone=value=>JSON.parse(JSON.stringify(value));
const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;
const whole=value=>Number.isSafeInteger(value)&&value>0;
const sameAmount=(left,right)=>Number.isFinite(left)&&Number.isFinite(right)&&Math.abs(left-right)<=1e-8;
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const reject=()=>{throw new Error('Unsupported saved sale-attribution evidence');};
const limitations=[
 'This corrects C1 internal allocation accounting only. It does not place a trade or create another broker execution.',
 'Confirm that these completed sales were intended to fill the original planned C1 liquidation, rather than the other allocations\' conditional stops.',
 'The saved tickets do not identify the old form selection or independently prove a recommendation was issued before execution.',
 'Original tickets, execution details and original allocation parts remain in the audit. Aggregate remaining basis can change when original allocation bases differ.',
 'Historical peaks, stops and loss dates are preserved. Any completed-liquidation risk reference still requires the existing verified next-opening process.'
];

function freeze(value){
 if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const item of Object.values(value))freeze(item);Object.freeze(value);}
 return value;
}
function priorCorrection(account,proposalId){
 return Array.isArray(account?.saleAttributionCorrections)?account.saleAttributionCorrections.find(row=>
  row?.contract===C1_SALE_ATTRIBUTION_CORRECTION&&row.proposalId===proposalId):null;
}
function appliedReview(account,date){
 const correction=Array.isArray(account?.saleAttributionCorrections)?account.saleAttributionCorrections.findLast(row=>
  row?.contract===C1_SALE_ATTRIBUTION_CORRECTION&&row.date===date):null;
 if(correction&&(!/^[a-f0-9]{64}$/.test(correction.proposalId)||!correction.summary||
  ['netProceeds','fees','cashBefore','cashAfter','remainingBasisBefore','remainingBasisAfter'].some(key=>!Number.isFinite(correction.summary[key]))))reject();
 return correction?{status:'applied',contract:C1_SALE_ATTRIBUTION_CORRECTION,proposalId:correction.proposalId,date:correction.date,
  revision:account.revision,summary:clone(correction.summary)}:null;
}
function holdings(books){
 const rows=new Map();
 for(const book of Object.values(books))for(const [symbol,position]of Object.entries(book.positions||{})){
  const row=rows.get(symbol)||{shares:0,basis:0};row.shares+=position.shares;row.basis+=position.shares*position.avgCost;rows.set(symbol,row);
 }
 return rows;
}
const basis=books=>[...holdings(books).values()].reduce((sum,row)=>sum+row.basis,0);

// A proposal is reconstructed from the raw saved plan and broker-entered
// tickets. A client never supplies replacement fills or an allocation vector.
function proposal(account,now){
 const time=new Date(now),clock=easternMarketClock(time),activity=account?.intradayActivity,plan=activity?.plan;
 if(account?.contract!=='c1-private-account-v1'||!Number.isSafeInteger(account.revision)||account.revision<0||
  !clock?.isSessionDay||!Number.isFinite(time.getTime())||!activity||activity.attributionCorrectionId||
  activity.date!==clock.key||plan?.date!==activity.date||plan.contract!=='c1-actual-account-opening-plan-v1'||
  !Array.isArray(account.records)||account.records.some(record=>record.date>=activity.date)||
  account.saleAttributionCorrections!==undefined&&!Array.isArray(account.saleAttributionCorrections)||
  !Array.isArray(activity.tickets)||!activity.tickets.length||!Array.isArray(activity.fills)||!activity.fills.length||
  !Array.isArray(plan.orders))return null;
 const source=account.records.at(-1)?.date||account.adoption?.sourceSessionDate;
 if(source!==plan.sourceSessionDate||marketSessionDistance(source,activity.date)!==1)return null;
 if(activity.tickets.some(ticket=>ticket?.side!=='sell')||activity.fills.some(fill=>fill?.side!=='sell'))return null;
 const orders=new Map(),tickets=new Map(),parts=new Map(),fillTickets=new Map();
 for(const order of plan.orders){if(typeof order?.id!=='string'||!order.id||orders.has(order.id))reject();orders.set(order.id,order);}
 for(const ticket of activity.tickets){
  const executed=Date.parse(ticket?.executedAt),executionClock=easternMarketClock(new Date(executed));
  if(typeof ticket?.id!=='string'||!ticket.id||tickets.has(ticket.id)||typeof ticket.symbol!=='string'||!whole(ticket.shares)||
   !positive(ticket.price)||typeof ticket.fee!=='number'||!Number.isFinite(ticket.fee)||ticket.fee<0||
   typeof ticket.executedAt!=='string'||!Number.isFinite(executed)||executed>time.getTime()||executionClock?.key!==activity.date||
   executionClock.minutes<570||executionClock.minutes>=marketSessionCloseMinutes(activity.date))reject();
  tickets.set(ticket.id,ticket);parts.set(ticket.id,[]);
 }
 const seenFills=new Set();
 for(const fill of activity.fills){
  const order=orders.get(fill?.orderId);
  if(!order||!ids.includes(order.sleeve)||typeof fill.id!=='string'||seenFills.has(fill.id))reject();
  const suffix=':'+order.sleeve,ticket=tickets.get(fill.id.endsWith(suffix)?fill.id.slice(0,-suffix.length):null);
  if(!ticket)reject();
  if(fill.symbol!==ticket.symbol||fill.side!==ticket.side||fill.price!==ticket.price||fill.executedAt!==ticket.executedAt||
   !whole(fill.shares)||typeof fill.fee!=='number'||!Number.isFinite(fill.fee)||fill.fee<0)reject();
  parts.get(ticket.id).push(fill);fillTickets.set(fill.id,ticket.id);seenFills.add(fill.id);
 }
 for(const ticket of activity.tickets){
  const fills=parts.get(ticket.id);
  if(fills.reduce((sum,fill)=>sum+fill.shares,0)!==ticket.shares||!sameAmount(fills.reduce((sum,fill)=>sum+fill.fee,0),ticket.fee))reject();
 }
 const before=reconcileC1ActualAccountFills({plan,fills:activity.fills,observedAt:time.toISOString()});
 const symbols=[...new Set(activity.tickets.map(ticket=>ticket.symbol))],targets=new Map();let allocation=null;
 for(const symbol of symbols){
  const group=plan.orders.filter(order=>order.symbol===symbol&&order.side==='sell'&&!order.condition);
  if(!group.some(order=>order.reason==='portfolio-drawdown-stop'))continue;
  const symbolTickets=activity.tickets.filter(ticket=>ticket.symbol===symbol);
  if(group.length!==1||group[0].reason!=='portfolio-drawdown-stop'||
   symbolTickets.some(ticket=>ticket.saleSelection!=null||ticket.recordingReason!=null))return null;
  const order=group[0],opening=plan.openingBooks?.[order.sleeve]?.positions?.[symbol];
  if(!ids.includes(order.sleeve)||!whole(order.shares)||opening?.shares!==order.shares||
   symbolTickets.reduce((sum,ticket)=>sum+ticket.shares,0)!==order.shares||allocation&&allocation!==order.sleeve)return null;
  allocation=order.sleeve;
  let misplaced=false;
  for(const ticket of symbolTickets)for(const fill of parts.get(ticket.id)){
   const original=orders.get(fill.orderId);
   if(original.id===order.id)continue;
   if(original.sleeve===order.sleeve||original.side!=='sell'||original.symbol!==symbol||original.condition!=='stop-triggered')return null;
   misplaced=true;
  }
  if(misplaced)targets.set(symbol,{order,tickets:symbolTickets});
 }
 if(!targets.size||!allocation)return null;
 const replaced=new Set(),correctedFills=[];
 for(const fill of activity.fills){
  const ticket=tickets.get(fillTickets.get(fill.id)),target=targets.get(ticket.symbol);
  if(!target){correctedFills.push(clone(fill));continue;}
  if(replaced.has(ticket.id))continue;
  replaced.add(ticket.id);
  correctedFills.push({id:ticket.id+':'+target.order.sleeve,orderId:target.order.id,symbol:ticket.symbol,side:ticket.side,
   shares:ticket.shares,price:ticket.price,fee:ticket.fee,executedAt:ticket.executedAt});
 }
 const after=reconcileC1ActualAccountFills({plan,fills:correctedFills,observedAt:time.toISOString()});
 if(Object.keys(after.books[allocation].positions).length||!sameAmount(before.actualCash,after.actualCash))return null;
 const heldBefore=holdings(before.books),heldAfter=holdings(after.books);
 if(heldBefore.size!==heldAfter.size||[...heldBefore].some(([symbol,row])=>heldAfter.get(symbol)?.shares!==row.shares))reject();
 const rows=[...targets].map(([symbol,target])=>{
  const allocated=new Map();
  for(const ticket of target.tickets)for(const fill of parts.get(ticket.id)){
   const sleeve=orders.get(fill.orderId).sleeve;allocated.set(sleeve,(allocated.get(sleeve)||0)+fill.shares);
  }
  return {symbol,shares:target.order.shares,allocationsBefore:ids.filter(id=>allocated.has(id)).map(sleeve=>({sleeve,shares:allocated.get(sleeve)})),
   allocationsAfter:[{sleeve:target.order.sleeve,shares:target.order.shares}],remainingShares:heldAfter.get(symbol)?.shares||0,
   basisBefore:heldBefore.get(symbol)?.basis||0,basisAfter:heldAfter.get(symbol)?.basis||0};
 });
 const affectedTickets=activity.tickets.filter(ticket=>targets.has(ticket.symbol));
 const summary={netProceeds:affectedTickets.reduce((sum,ticket)=>sum+ticket.shares*ticket.price-ticket.fee,0),
  fees:affectedTickets.reduce((sum,ticket)=>sum+ticket.fee,0),cashBefore:before.actualCash,cashAfter:after.actualCash,
  remainingBasisBefore:basis(before.books),remainingBasisAfter:basis(after.books)};
 const sourceDigest=digest(account),proposalId=digest({contract:C1_SALE_ATTRIBUTION_CORRECTION,sourceDigest,revision:account.revision,date:activity.date,rows});
 const cash=c1AccountCashAvailability({account,strategyCash:before.actualCash,now:time}),
  cashAccountingRequired=!account.cashAccountingCorrections?.length&&(!cash.brokerageCashCurrent||Math.abs(before.actualCash-cash.brokerageCash)>5);
 return {review:{status:'confirmation-required',contract:C1_SALE_ATTRIBUTION_CORRECTION,proposalId,date:activity.date,revision:account.revision,
  brokerageCash:cash.brokerageCash,cashAccountingRequired,
  rows,summary,limitations:[...limitations]},sourceDigest,correctedFills};
}

export function reviewC1SaleAttribution({account,now=new Date()}={}){
 try{
  const date=easternMarketClock(new Date(now))?.key,applied=appliedReview(account,date);
  return applied||proposal(account,now)?.review||null;
 }catch{return null;}
}

export function correctC1SaleAttribution({account,proposalId,confirmed,expectedRevision,now=new Date()}={}){
 if(confirmed!==true)throw new Error('Confirm the planned-sale allocation correction before saving');
 if(priorCorrection(account,proposalId))return account;
 if(account?.revision!==expectedRevision)throw new Error('The account changed; reload before correcting planned-sale allocation');
 let next;try{next=proposal(account,now);}catch{}
 if(!next)throw new Error('No eligible current-session planned-sale allocation correction is available');
 if(next.review.proposalId!==proposalId)throw new Error('The planned-sale allocation correction changed; reload and review it again');
 const activity=account.intradayActivity,audit=freeze({contract:C1_SALE_ATTRIBUTION_CORRECTION,id:proposalId,proposalId,date:activity.date,
  appliedAt:new Date(now).toISOString(),sourceRevision:account.revision,appliedRevision:account.revision+1,sourceDigest:next.sourceDigest,
  originalPlanDigest:digest(activity.plan),originalTickets:clone(activity.tickets),originalFills:clone(activity.fills),correctedFills:clone(next.correctedFills),
  rows:clone(next.review.rows),summary:clone(next.review.summary),ownerConfirmed:true,brokerageExecutionCreated:false});
 return {...account,revision:account.revision+1,saleAttributionCorrections:[...(account.saleAttributionCorrections||[]),audit],
  intradayActivity:{...activity,fills:clone(next.correctedFills),attributionCorrectionId:proposalId}};
}

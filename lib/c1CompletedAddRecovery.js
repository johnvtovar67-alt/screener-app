import {deriveC1AccountAnalysis,deriveC1CompletedAccount} from './c1AccountService';
import {c1AccountBook} from './c1AccountInput';
import {c1AccountReviewBook} from './c1HeldRankReview';
import {continueC1ActualAccount,reconcileC1ActualAccountFills} from './c1AccountLedger';
import {c1RecordedExitPlan} from './c1IntradayActivity';
import {assertC1NewBuyCash,C1_PURCHASE_FUNDING_POLICY} from './c1BrokerageCash';
import {easternMarketClock,marketSessionCloseMinutes,marketSessionDistance} from './marketSession';
import {c1IssuedTradeChoices,C1_ISSUED_BUY_REASON,assertC1AccountingFillTime} from './c1IssuedTradeLog';

export const C1_COMPLETED_ADD_REASON='owner-confirmed-completed-add';
const clone=value=>JSON.parse(JSON.stringify(value));
const reconcile=(plan,fills,now)=>reconcileC1ActualAccountFills({plan,fills,observedAt:now.toISOString()});

export function c1CompletedAddRecordingSession({account,book,now=new Date()}={}){
 const clock=easternMarketClock(now);
 if(!clock?.isSessionDay||clock.key<'2026-11-16'||clock.minutes<570)return null;
 const prefix=deriveC1CompletedAccount({account,book,now,beforeDate:clock.key});
 const through=prefix.records.at(-1)?.date||prefix.adoption.sourceSessionDate;
 if(marketSessionDistance(through,clock.key)!==1)return null;
 const activity=prefix.intradayActivity;
 if(activity?.date===clock.key)return {date:clock.key,revision:account.revision,plan:activity.plan,fills:activity.fills,tickets:activity.tickets,sellOnly:true};
 const input=c1AccountReviewBook(c1AccountBook(book,prefix.holdingCoverages||prefix.holdingCoverage),prefix.holdingRankReviews);
 const sessions=input.model.sessions.filter(session=>session.date>=prefix.adoption.sourceSessionDate&&session.date<=through);
 const continued=continueC1ActualAccount({adoption:prefix.adoption,sessions,historySessions:input.model.sessions,records:prefix.records,cashReconciliations:prefix.cashReconciliations,observedAt:now});
 if(!Object.values(continued.books).some(book=>Object.keys(book.positions).length))return null;
 const plan=c1RecordedExitPlan({continued,now,sessions,historySessions:input.model.sessions})||{contract:'c1-actual-account-opening-plan-v1',recordingOnly:true,providerVerified:false,executable:false,
  date:clock.key,sourceSessionDate:through,observedAt:now.toISOString(),openingBooks:clone(continued.books),orders:[],
  ...(Object.values(continued.books).some(book=>book.cash<0)?{purchaseFundingPolicy:C1_PURCHASE_FUNDING_POLICY}:{})};
 return {date:clock.key,revision:account.revision,plan,fills:[],tickets:[],sellOnly:true};
}

// An owner-reported broker fill is an accounting fact, not evidence that a
// previous recommendation was issued and never permission for another buy.
// Recovery is restricted to an existing opening holding and an explicitly
// confirmed allocation. No current or historical order is reconstructed.
function recordAccountingPurchase({account,book,ticket,expectedRevision,now=new Date(),issued=false}={}){
 let prior=account.intradayActivity;
 const duplicate=prior?.tickets.find(row=>row.id===ticket?.id);
 if(duplicate){if(JSON.stringify(duplicate)!==JSON.stringify(ticket))throw new Error('Conflicting trade reference');return account;}
 if(account.revision!==expectedRevision)throw new Error('Account changed; reload before recording the trade');
 const time=new Date(ticket?.executedAt),clock=easternMarketClock(time),today=easternMarketClock(now);
 if(!ticket||ticket.recordingReason!==(issued?C1_ISSUED_BUY_REASON:C1_COMPLETED_ADD_REASON)||ticket.side!=='buy'||typeof ticket.id!=='string'||!ticket.id||ticket.id.length>100||
  typeof ticket.symbol!=='string'||!/^[A-Z][A-Z0-9.-]{0,14}$/.test(ticket.symbol)||['MSTR','SCHW'].includes(ticket.symbol)||
  !Number.isSafeInteger(ticket.shares)||ticket.shares<=0||!Number.isFinite(ticket.price)||ticket.price<=0||!Number.isFinite(ticket.fee)||ticket.fee<0||
  !Number.isFinite(time.getTime())||time>now||!clock?.isSessionDay||clock.key>today?.key||(!issued&&clock.key!==today?.key)||clock.minutes<570||clock.minutes>=marketSessionCloseMinutes(clock.key))
  throw new Error('Enter the actual completed addition quantity, price, fee and regular-session execution time');
 if(prior?.tickets.some(row=>row.side==='buy'&&row.symbol===ticket.symbol&&row.shares===ticket.shares&&row.price===ticket.price&&row.fee===ticket.fee&&Date.parse(row.executedAt)===time.getTime()))
  throw new Error('An identical purchase is already saved. Review Saved completed trades before recording again.');
 // Keep today's still-open accounting activity intact even if today's close
 // has since been published. Finalizing it first would strand the late fill.
 account=deriveC1CompletedAccount({account,book,now,beforeDate:clock.key});
 prior=account.intradayActivity;
 if(prior&&prior.date!==clock.key)throw new Error('Previous trade session has not finished reconciling');
 const through=account.records.at(-1)?.date||account.adoption.sourceSessionDate;
 if(through>=clock.key)throw new Error('This session is already finalized; completed-add recovery cannot replace a saved daily record');
 const entries=(account.issuedC1Entries||[]).filter(entry=>entry.date===clock.key&&Date.parse(entry.issuedAt)<=time.getTime());
 const choice=issued?c1IssuedTradeChoices({entries,activity:prior,date:clock.key}).find(row=>row.symbol===ticket.symbol):null;
 if(issued&&(!choice||ticket.shares>choice.shares))throw new Error('The completed purchase exceeds the retained issued quantity available at its execution time');
 let source=prior?.plan||(issued?entries.find(entry=>entry.recordingPlan)?.recordingPlan:null);
 if(!source)source=c1CompletedAddRecordingSession({account,book,now})?.plan;
 if(!source||source.date!==clock.key||marketSessionDistance(source.sourceSessionDate,clock.key)!==1)
  throw new Error('The saved opening holdings for this completed addition are unavailable');
 const input=c1AccountReviewBook(c1AccountBook(book,account.holdingCoverages||account.holdingCoverage),account.holdingRankReviews);
 const sessions=input.model.sessions.filter(session=>session.date>=account.adoption.sourceSessionDate&&session.date<=through);
 const actualOpening=continueC1ActualAccount({adoption:account.adoption,sessions,historySessions:input.model.sessions,records:account.records,cashReconciliations:account.cashReconciliations,observedAt:now}).books;
 const economics=books=>JSON.stringify(['base','cooldown15','sector40'].map(sleeve=>[books[sleeve].cash,Object.entries(books[sleeve].positions).sort(([a],[b])=>a.localeCompare(b)).map(([symbol,row])=>[symbol,row.shares,row.avgCost,row.openedAt])]));
 if(economics(source.openingBooks)!==economics(actualOpening))throw new Error('Saved opening balances changed; this completed fill needs reconciliation before recording');
 const plan=clone(source),previous=clone(prior?.fills||[]);
 const atExecution=reconcile(plan,previous.filter(fill=>Date.parse(fill.executedAt)<=time.getTime()),now);
 let allocations=ticket.allocations;
 if(issued){
  let left=ticket.shares;
  const weight=choice.allocations.reduce((sum,row)=>sum+row.shares,0);
  allocations=choice.allocations.map(row=>{const exact=ticket.shares*row.shares/weight,shares=Math.floor(exact);left-=shares;return {...row,sleeve:row.order.sleeve,shares,remainder:exact-shares};});
  for(const row of [...allocations].sort((a,b)=>b.remainder-a.remainder)){if(left){row.shares++;left--;}}
  allocations=allocations.filter(row=>row.shares>0);
 }
 if(!Array.isArray(allocations)||!allocations.length||allocations.length>3||new Set(allocations.map(row=>row.sleeve)).size!==allocations.length||
  allocations.some(row=>!['base','cooldown15','sector40'].includes(row.sleeve)||!Number.isSafeInteger(row.shares)||row.shares<=0)||
  allocations.reduce((sum,row)=>sum+row.shares,0)!==ticket.shares)
  throw new Error('Identify the actual allocation for every completed share; do not guess the missing recommendation');
 const additions=allocations.map(row=>{
  if(!issued&&(!(plan.openingBooks[row.sleeve]?.positions[ticket.symbol]?.shares>0)||!(atExecution.books[row.sleeve]?.positions[ticket.symbol]?.shares>0)))
   throw new Error('Completed-add recovery requires an existing holding in the selected allocation at execution');
  let owned=plan.openingBooks[row.sleeve].positions[ticket.symbol]?.shares||0;
  for(const fill of previous.filter(fill=>fill.symbol===ticket.symbol&&Date.parse(fill.executedAt)<=time.getTime()&&plan.orders.find(order=>order.id===fill.orderId)?.sleeve===row.sleeve)){
   owned+=fill.side==='buy'?fill.shares:-fill.shares;
   if(!issued&&owned<=0)throw new Error('Completed-add recovery cannot reopen a position that was already closed');
  }
  const id=`completed-add:${ticket.id}:${row.sleeve}`;
  const original=row.order;
  plan.orders.push({id,date:plan.date,sleeve:row.sleeve,symbol:ticket.symbol,side:'buy',shares:row.shares,
   estimatedPrice:ticket.price,reason:issued?C1_ISSUED_BUY_REASON:C1_COMPLETED_ADD_REASON,recordingOnly:true,executable:false,
   ...(issued?{issuedOrderId:original.id,issuedEntryKey:row.entryKey,sourceReason:original.reason,
    ...(Number.isFinite(original.targetShares)?{targetShares:original.targetShares}:{}),
    ...(original.initialSwingStopPolicy?{initialSwingStopPolicy:original.initialSwingStopPolicy,initialSwingStopPct:original.initialSwingStopPct}:{})}:{})});
  return {id:ticket.id+':'+row.sleeve,orderId:id,symbol:ticket.symbol,side:'buy',shares:row.shares,price:ticket.price,fee:ticket.fee*row.shares/ticket.shares,executedAt:time.toISOString()};
 });
 // A retained issue includes its original pre-trade cash observation. An
 // owner-reported legacy fill has no such proof: record the accounting fact
 // without claiming retroactive purchase authorization. Future cash checks
 // remain unchanged and consume the actual debit exactly once.
 const cash=issued?entries.find(entry=>entry.key===allocations[0].entryKey)?.brokerageCash:null;
 if(issued)assertC1NewBuyCash({account:{...account,brokerageCash:cash},strategyCash:atExecution.actualCash,fills:additions,now});
 const fills=[...previous,...additions].sort((a,b)=>Date.parse(a.executedAt)-Date.parse(b.executedAt));
 assertC1AccountingFillTime({account,plan,ticket,fills});
 reconcile(plan,fills,now);
 const next={...account,revision:account.revision+1,intradayActivity:{...(prior?clone(prior):{}),date:plan.date,openingObservedAt:prior?.openingObservedAt||plan.observedAt,
  plan,recordingEvidence:clone(plan),...(cash?{cashAuthorizations:{...(prior?.cashAuthorizations||{}),[ticket.id]:{brokerageCash:clone(cash),recordedAt:now.toISOString()}}}:{}),
  tickets:[...(prior?.tickets||[]),clone(ticket)],fills}};
 // Require the actual application analysis to accept ownership, basis and
 // cash before the caller can persist a new revision.
 deriveC1AccountAnalysis({account:next,book,now});
 return next;
}

export function recordC1CompletedAddRecovery(options){return recordAccountingPurchase(options);}
export function recordC1IssuedBuy(options){return recordAccountingPurchase({...options,issued:true});}

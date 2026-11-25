import {createHash} from 'node:crypto';
import {createC1CashAccounting} from './c1CashAccounting';

export const C1_BROKER_CASH_JOURNAL='c1-owner-reviewed-broker-cash-journal-v1';
const clone=value=>JSON.parse(JSON.stringify(value));
const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const near=(left,right)=>finite(left)&&finite(right)&&Math.abs(left-right)<1e-7;
const fail=()=>{throw new Error('The approved brokerage cash history needs review before new capital can be authorized');};
const allocationIds=['base','cooldown15','sector40'];

function receiptPayload(receipt){
 const {payloadDigest,...payload}=receipt;
 return payload;
}
function flattened(account){
 return [...(account.records||[]).flatMap(record=>(record.fills||[]).map(fill=>({date:record.date,fill}))),
  ...(account.intradayActivity?.fills||[]).map(fill=>({date:account.intradayActivity.date,fill}))];
}
function groupLinks(account,review){
 const tickets=account.intradayActivity?.tickets||[];
 return review.matchedTrades.map(group=>({date:group.date,symbol:group.symbol,side:group.side,
  fillIds:[...group.rawFillIds],ticketIds:tickets.filter(ticket=>ticket.symbol===group.symbol&&ticket.side===group.side&&
   group.rawFillIds.some(id=>allocationIds.some(sleeve=>id===ticket.id+':'+sleeve))).map(ticket=>ticket.id)}));
}

// The private stored receipt is an immutable snapshot of a server-generated
// review. No request-body status flag or supplied replacement fills activate it.
export function appendC1BrokerCashJournal({account,review,reviewId,confirmed=false,expectedRevision,now=new Date()}={}){
 if(confirmed!==true)throw new Error('Confirm the reviewed brokerage cash correction before saving');
 const existing=(account?.cashAccountingCorrections||[]).find(receipt=>receipt.id===reviewId);
 if(existing)return account;
 if(account?.revision!==expectedRevision||review?.revision!==expectedRevision)throw new Error('The account changed; reload before confirming brokerage cash history');
 if(review?.contract!=='c1-broker-statement-review-v1'||review.reviewId!==reviewId||review.bindings?.accountHash!==digest(account)||
  review.financialValid===false||review.remainingRoundedBalanceAdjustment?.allowed!==true||
  !finite(review.currentBrokerAvailability?.brokerageCash)||review.currentBrokerAvailability.brokerageCashCurrent!==true)
  throw new Error('A current server-reviewed brokerage cash correction is required');
 const appliedAt=new Date(now).toISOString(),balance=review.currentBrokerAvailability.brokerageCash;
 if(!near(balance*100,Math.round(balance*100)))throw new Error('A cents-precision confirmed brokerage balance is required');
 const storedReview=clone(review);
 const capsule={contract:C1_BROKER_CASH_JOURNAL,id:reviewId,sourceRevision:account.revision,appliedRevision:account.revision+1,
  recordedAt:appliedAt,ownerConfirmed:true,brokerageExecutionCreated:false,adoptionDigest:digest(account.adoption),
  review:storedReview,reviewPayload:JSON.stringify(storedReview),groupLinks:groupLinks(account,review),
  originalBrokerageCash:account.brokerageCash?clone(account.brokerageCash):null,
  confirmedBrokerageCash:{balance,observedAt:appliedAt,source:'manual-broker-balance'},
  supersedes:account.cashAccountingCorrections?.at(-1)?.id||null};
 const receipt={...capsule,payloadDigest:digest(capsule)};
 return {...account,revision:account.revision+1,cashAccountingCorrections:[...(account.cashAccountingCorrections||[]),receipt],
  brokerageCash:clone(receipt.confirmedBrokerageCash)};
}

export function c1BrokerCashJournalReceipt(account){
 const receipts=account?.cashAccountingCorrections;
 if(receipts==null)return null;
 if(!Array.isArray(receipts)||!receipts.length||receipts.length>100)fail();
 let previous=null;
 for(const receipt of receipts){
  if(receipt?.contract!==C1_BROKER_CASH_JOURNAL||receipt.ownerConfirmed!==true||receipt.brokerageExecutionCreated!==false||
   !/^[a-f0-9]{64}$/.test(receipt.id||'')||receipt.review?.reviewId!==receipt.id||
   receipt.review.contract!=='c1-broker-statement-review-v1'||receipt.adoptionDigest!==digest(account.adoption)||
   !Number.isSafeInteger(receipt.sourceRevision)||receipt.appliedRevision!==receipt.sourceRevision+1||
   !Number.isFinite(Date.parse(receipt.recordedAt))||receipt.supersedes!==previous||
   JSON.stringify(receipt.review)!==receipt.reviewPayload||digest(receiptPayload(receipt))!==receipt.payloadDigest||
   !Array.isArray(receipt.groupLinks)||!Array.isArray(receipt.review.matchedTrades)||
   !finite(receipt.review.remainingRoundedBalanceAdjustment?.amount)||Math.abs(receipt.review.remainingRoundedBalanceAdjustment.amount)>5||
   receipt.review.remainingRoundedBalanceAdjustment.allowed!==true)fail();
  previous=receipt.id;
 }
 return receipts.at(-1);
}

// A current-day planned-sale correction can move a ticket's allocation parts.
// Its broker identity/quantity is stable. Later distinct fills remain outside
// the already reviewed statement, so they cannot get its cash adjustment twice.
export function c1BrokerCashJournalReview(account){
 const receipt=c1BrokerCashJournalReceipt(account);
 if(!receipt)return null;
 const review=c1BrokerCashReviewWithCurrentFills({account,review:receipt.review,links:receipt.groupLinks});
 review.sourceDigest=receipt.payloadDigest;
 review.appliedAt=receipt.recordedAt;
 review.predecessorSourceDigests=account.cashAccountingCorrections.slice(0,-1).map(prior=>digest([prior.review.reviewId,prior.review.bindings]));
 review.recordedReviewId=receipt.id;
 return review;
}

export function c1BrokerCashReviewWithCurrentFills({account,review:input,links:capturedLinks}={}){
 const rows=flattened(account),review=clone(input),seen=new Set(),captures=capturedLinks||groupLinks(account,review);
 review.matchedTrades=review.matchedTrades.map(group=>{
  const links=captures.find(link=>link.date===group.date&&link.symbol===group.symbol&&link.side===group.side);
  if(!links||!Array.isArray(links.fillIds)||!Array.isArray(links.ticketIds))fail();
  const fills=rows.filter(row=>row.date===group.date&&row.fill.symbol===group.symbol&&row.fill.side===group.side&&
   (links.fillIds.includes(row.fill.id)||links.ticketIds.some(id=>allocationIds.some(sleeve=>row.fill.id===id+':'+sleeve))))
   .map(row=>row.fill);
  if(!fills.length||fills.some(fill=>seen.has(fill.id))||fills.reduce((sum,fill)=>sum+fill.shares,0)!==group.quantity)fail();
  for(const fill of fills){
   if(!finite(fill.price)||fill.price<=0||!finite(fill.fee)||fill.fee<0)fail();
   seen.add(fill.id);
  }
  const rawNetCash=fills.reduce((sum,fill)=>sum+(fill.side==='sell'?1:-1)*fill.shares*fill.price-fill.fee,0);
  return {...group,rawFills:clone(fills),rawFillIds:fills.map(fill=>fill.id),rawTicketIds:[...links.ticketIds],rawNetCash,cashAdjustment:group.statementNetCash-rawNetCash};
 });
 review.matchedTradeNetCashAdjustments=review.matchedTrades.filter(group=>Math.abs(group.cashAdjustment)>1e-8);
 review.tradeCashAdjustment=review.matchedTradeNetCashAdjustments.reduce((sum,group)=>sum+group.cashAdjustment,0);
 return review;
}

export function c1CashAccountingForAccount(account){
 const review=c1BrokerCashJournalReview(account);
 const predecessorReviews=review?account.cashAccountingCorrections.slice(0,-1).map(receipt=>({
  review:c1BrokerCashReviewWithCurrentFills({account,review:receipt.review,links:receipt.groupLinks}),
  appliedAt:receipt.recordedAt})):[];
 return review?createC1CashAccounting({review,predecessorSourceDigests:review.predecessorSourceDigests,
  predecessorReviews,
  originalWindowThrough:account.cashAccountingCorrections[0].review.window.through,
  originalAppliedAt:account.cashAccountingCorrections[0].recordedAt}):null;
}

export function c1BrokerCashJournalStatus(account){
 if(!account?.cashAccountingCorrections)return null;
 try{
  const receipt=c1BrokerCashJournalReceipt(account);
  return {status:'applied',reviewId:receipt.id,appliedAt:receipt.recordedAt,
   currentCashSource:'confirmed-brokerage-balance',originalRecordsPreserved:true};
 }catch{return {status:'review-required',currentCashSource:'confirmed-brokerage-balance',
  message:'The approved brokerage cash history needs review before new capital can be authorized'};}
}

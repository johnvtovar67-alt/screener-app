import {createHash} from 'node:crypto';
import {reviewC1BrokerStatement} from './c1BrokerStatementReview';
import {appendC1BrokerCashJournal,c1CashAccountingForAccount,c1BrokerCashJournalReceipt} from './c1BrokerCashJournal';
import {reviewC1SaleAttribution,correctC1SaleAttribution} from './c1SaleAttributionRecovery';
import {deriveC1AccountAnalysis} from './c1AccountService';
import {c1CashAccountingDecisionContinued,reconcileC1FinancialIntraday,reconcileC1FinancialCurrentBooks,createC1CashAccounting} from './c1CashAccounting';
import {reconcileC1ActualAccountFills} from './c1AccountLedger';
import {c1AccountBook} from './c1AccountInput';
import {c1AccountReviewBook} from './c1HeldRankReview';

const ids=['base','cooldown15','sector40'];
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const same=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
const clone=value=>JSON.parse(JSON.stringify(value));
const fail=message=>{throw new Error(message);};

function stage({account,review,attribution,now}){
 const cash=appendC1BrokerCashJournal({account,review,reviewId:review.reviewId,confirmed:true,expectedRevision:account.revision,now});
 if(!attribution)return cash;
 const sale=correctC1SaleAttribution({account,proposalId:attribution.proposalId,confirmed:true,expectedRevision:account.revision,
  cashAccountingContext:createC1CashAccounting({review}),now});
 // Both changes are one owner-confirmed conditional write/revision. Each audit
 // retains its actual original source; these staged objects are never saved by
 // a review request.
 return {...cash,intradayActivity:sale.intradayActivity,saleAttributionCorrections:sale.saleAttributionCorrections};
}

function financialPreview({account,staged,book,now}){
 const view=deriveC1AccountAnalysis({account:staged,book,now}),continued=c1CashAccountingDecisionContinued(view.decision);
 if(!continued?.cashAccounting)fail('The corrected financial replay did not produce a verified account view');
 let books=continued.books;
 if(view.account.intradayActivity){
  const activity=view.account.intradayActivity,originalResult=reconcileC1ActualAccountFills({plan:activity.plan,fills:activity.fills,observedAt:new Date(now).toISOString()});
  books=reconcileC1FinancialIntraday({originalResult,effectiveOpeningBooks:continued.books,completedContinued:continued,
   cashAccounting:c1CashAccountingForAccount(staged),activity,now}).books;
 }else{
  books=reconcileC1FinancialCurrentBooks({completedContinued:continued,cashAccounting:c1CashAccountingForAccount(staged),now}).books;
 }
 const cash=ids.reduce((sum,id)=>sum+books[id].cash,0),broker=view.decision.brokerageCash;
 if(!finite(cash)||!finite(broker)||Math.abs(cash-broker)>0.0100001)fail('The corrected cash does not reconcile to the confirmed brokerage balance');
 for(const field of ['adoption','records','sourceHashes'])if(!same(account[field],staged[field]))fail('The proposed cash correction changed original account history');
 if(account.intradayActivity&&(!same(account.intradayActivity.plan,staged.intradayActivity.plan)||
  !same(account.intradayActivity.tickets,staged.intradayActivity.tickets)))fail('The proposed cash correction changed original broker facts');
 const input=c1AccountReviewBook(c1AccountBook(book,account.holdingCoverages||account.holdingCoverage),account.holdingRankReviews),
  source=input.model.sessions.find(session=>session.date===continued.sourceSessionDate),marks=new Map((source?.prices||[]).map(row=>[row.symbol,row.close]));
 const allocations=ids.map(sleeve=>{
  const scale=staged.adoption.seeds[sleeve].actualDollarsPerModelDollar,run=continued.sleeves[sleeve],original=continued.recordedHistory.sleeves[sleeve],
   rawHistoricalPeak=(original.accountRisk?.historicalHighWater??original.accountRisk?.highWater)*scale,
   adjustedOperationalReference=run.accountRisk?.highWater*scale;
  let currentEquity=books[sleeve].cash;
  for(const [symbol,position]of Object.entries(books[sleeve].positions)){
   const price=marks.get(symbol);if(!finite(price)||price<=0)fail('Accepted holding marks are required for the financial review');
   currentEquity+=position.shares*price;
  }
  if(!finite(rawHistoricalPeak)||!finite(adjustedOperationalReference)||adjustedOperationalReference<=0||!finite(currentEquity))
   fail('The corrected operational risk references are unavailable');
  return {sleeve,rawHistoricalPeak,adjustedOperationalReference,currentEquity,
   currentDrawdownPct:100*(currentEquity/adjustedOperationalReference-1),
   pendingCompletedExit:run.accountRisk?.operationalRisk?.requiresLiquidationEpoch===true,
   appliedEpochCount:run.accountRisk?.operationalRisk?.appliedEpochs?.length||0};
 });
 return {view,preview:{sourceSessionDate:continued.sourceSessionDate,valuationBasis:'accepted-close-and-recorded-fills',
  currentCash:broker,accountingCash:cash,allocations,
  capitalAttribution:'proportional-marked-allocation-equity',capitalRiskTreatment:'proportional-nav-no-reset',
  preserved:['original broker facts','purchase dates and recorded stops','original opening records and in-kind receipt',
   'recorded historical peaks and losses','12% protection and one reset per completed exit episode']}};
}

// A read-only proposal runs the same financial path required before saving.
// A persisted journal cannot be installed by a review request.
export function reviewC1BrokerCashCorrection({account,book,portfolioRecord,statementText,expectedRevision,now=new Date()}={}){
 if(account?.revision!==expectedRevision)fail('The account changed; reload before reviewing brokerage cash history');
 if(!Array.isArray(portfolioRecord?.portfolio)||!portfolioRecord.etag)fail('The saved portfolio identity is required for brokerage cash review');
 if(account.cashAccountingCorrections)c1BrokerCashJournalReceipt(account);
 const proposal=reviewC1BrokerStatement({account,statementText,portfolio:portfolioRecord.portfolio,now});
 if(!proposal.remainingRoundedBalanceAdjustment.allowed)fail(proposal.remainingRoundedBalanceAdjustment.reason);
 const attributionReview=reviewC1SaleAttribution({account,now}),attribution=attributionReview?.status==='confirmation-required'?attributionReview:null,
  staged=stage({account,review:proposal,attribution,now}),{preview}=financialPreview({account,staged,book,now});
 const plannedSaleCorrection=attribution?{proposalId:attribution.proposalId,rows:clone(attribution.rows)}:null;
 const reviewId=digest({contract:'c1-broker-cash-correction-proposal-v1',statementReviewId:proposal.reviewId,
  portfolioEtag:portfolioRecord.etag,financialPreview:preview,plannedSaleCorrection});
 return {...proposal,reviewId,statementReviewId:proposal.reviewId,portfolioEtag:portfolioRecord.etag,
  financialValid:true,financialPreview:preview,...(plannedSaleCorrection?{plannedSaleCorrection}:{})};
}

export function confirmC1BrokerCashCorrection({account,book,portfolioRecord,statementText,reviewId,expectedRevision,confirmed=false,
 attributionConfirmed=false,now=new Date()}={}){
 if(confirmed!==true)fail('Confirm the reviewed brokerage cash correction before saving');
 if((account.cashAccountingCorrections||[]).some(receipt=>receipt.id===reviewId))return account;
 const review=reviewC1BrokerCashCorrection({account,book,portfolioRecord,statementText,expectedRevision,now});
 if(review.reviewId!==reviewId)fail('The brokerage cash correction changed; review it again before confirming');
 if(review.plannedSaleCorrection&&attributionConfirmed!==true)fail('Confirm the already completed planned-sale allocation correction');
 const attribution=review.plannedSaleCorrection?reviewC1SaleAttribution({account,now}):null,
  staged=stage({account,review,attribution,now});
 // Re-evaluate with the final bound journal identity before any storage write.
 financialPreview({account,staged,book,now});
 return staged;
}

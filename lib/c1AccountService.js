import {c1IntradayDecision} from './c1IntradayActivity';
import {buildC1StockScreenSnapshot} from './c1StockClassification';
import {c1AccountReviewBook} from './c1HeldRankReview';
import {recordC1PositionContext} from './c1PositionContext';
import {createC1ProspectiveSeeds} from './c1AccountSeed';
import {continueC1ActualAccount,c1CompletionPolicy} from './c1AccountLedger';
import {buildC1AccountDecision,c1AccountHoldingExplanation} from './c1AccountDecision';
import {latestCompletedMarketSessionDay,isUsMarketSessionDay} from './marketSession';
import {adoptLegacyC1Capital} from './c1LegacyCapitalAdoption';
import {c1AccountBook,assertC1AccountRevisionCoverage} from './c1AccountInput';

export function adoptC1Account({portfolio,capitalRecord,book,holdingCoverage,now=new Date(),prospectiveLegacyAdoptionConfirmed=false}={}) {
 book=c1AccountBook(book,holdingCoverage);
 const baseline=book.model.sessions.at(-1);
 if(book.universe!=='sp500'||baseline.date!==latestCompletedMarketSessionDay(now))throw new Error('Current observed S&P 500 input required');
 let capitalHistory=null;
 if(prospectiveLegacyAdoptionConfirmed===true){
  const prospective=adoptLegacyC1Capital({portfolio,record:capitalRecord,confirmed:true,asOfSession:baseline.date});
  capitalRecord=prospective.capitalRecord;capitalHistory=prospective.receipt;
 }
 const adoption=createC1ProspectiveSeeds({portfolio,baseline,capitalRecord,adoptionConfirmed:true});
 if(capitalHistory)adoption.capitalHistory=capitalHistory;
 return {contract:'c1-private-account-v1',revision:0,adoption,records:[],...(holdingCoverage?{holdingCoverage:JSON.parse(JSON.stringify(holdingCoverage))}:{}),sourceHashes:[{date:baseline.date,hash:book.captures.find(c=>c.sessionDate===baseline.date)?.hash}],createdAt:now.toISOString()};
}
export function evaluateC1Account({account,book,now=new Date()}={}) {
 if(account?.contract!=='c1-private-account-v1'||book?.universe!=='sp500')throw new Error('Stored C1 account and S&P input required');
 book=c1AccountReviewBook(c1AccountBook(book,account.holdingCoverages||account.holdingCoverage),account.holdingRankReviews);
 const through=account.records.at(-1)?.date||account.adoption.sourceSessionDate;
 assertC1AccountRevisionCoverage(book,account,through);
 const sessions=book.model.sessions.filter(s=>s.date>=account.adoption.sourceSessionDate&&s.date<=through);
 for(const accepted of account.sourceHashes){if(!accepted.hash||book.captures.find(c=>c.sessionDate===accepted.date)?.hash!==accepted.hash)throw new Error('An accepted account input changed; original account retained');}
 const continued=continueC1ActualAccount({adoption:account.adoption,sessions,historySessions:book.model.sessions,records:account.records,cashReconciliations:account.cashReconciliations,observedAt:now});
 const sourceHash=book.captures.find(c=>c.sessionDate===sessions.at(-1).date)?.hash;
 let stockScreen=null;
 try{stockScreen=buildC1StockScreenSnapshot(sessions.at(-1),now);}catch{stockScreen={contract:'c1-stock-screen-v1',sourceSessionDate:sessions.at(-1).date,candidates:[]};}
 const decision=buildC1AccountDecision({continued,sourceHash,revision:account.revision,now,positionContext:account.positionContext});
 const latest=book.model.sessions.at(-1).date,required=latestCompletedMarketSessionDay(now);
 const updateReason=decision.current?null:latest<required?
  `Market-data update pending for ${required}. Last completed C1 analysis: ${through}. Reload after the update completes.`:
  `Confirm completed-session activity in Account settings to update C1 beyond ${through}.`;
 return {stockScreen,...decision,updateReason,
  positions:decision.positions.map(p=>{
   const hit=p.exits.some(e=>e.reason==='initial-stop')?sessions.flatMap(s=>{
    const bar=s.prices.find(r=>r.symbol===p.symbol);
    return p.stops.filter(stop=>Number.isFinite(bar?.low)&&bar.low<=stop.price&&s.date>=p.openedAt)
     .map(stop=>({date:s.date,low:bar.low,stop:stop.price}));
   })[0]:null;
   const row={...p,...(hit?{stopTriggerEvidence:hit}:{})};
   return {...row,reason:decision.current?c1AccountHoldingExplanation(row,through):updateReason};
  }),
  ...(account.adoption.capitalHistory?{capitalHistory:account.adoption.capitalHistory}:{})};
}

// Derive completed ownership from verified daily inputs and immutable posted
// fills. These carry records are analysis inputs, never broker confirmations
// or durable account writes. Opening verification belongs to execution only.
export function deriveC1CompletedAccount({account,book,now=new Date(),beforeDate}={}) {
 if(account?.contract!=='c1-private-account-v1'||book?.universe!=='sp500')throw new Error('Stored C1 account and S&P input required');
 book=c1AccountReviewBook(c1AccountBook(book,account.holdingCoverages||account.holdingCoverage),account.holdingRankReviews);
 const through=account.records.at(-1)?.date||account.adoption.sourceSessionDate,limit=latestCompletedMarketSessionDay(now);
 const sessions=book.model.sessions.filter(s=>s.date>through&&s.date<=limit&&(!beforeDate||s.date<beforeDate));
 let derived=account;
 for(const session of sessions){
  const capture=book.captures.find(c=>c.sessionDate===session.date);
  if(!capture?.hash)throw new Error('Observed session input missing');
  const activity=derived.intradayActivity?.date===session.date?derived.intradayActivity:null;
  const record={date:session.date,openingObservedAt:activity?.openingObservedAt||capture.observedAt,complete:true,
   basis:activity?'recorded-intraday-fills':'recorded-holdings-carry-forward',fills:activity?.fills||[],
   completionPolicy:activity?.plan?.completionPolicy||c1CompletionPolicy(account.positionContext),
   ...(activity?{executionEvidence:activity.plan}:{}),
   ...(activity?.recordingEvidence?{recordingEvidence:activity.recordingEvidence}:{}),
   ...(activity?.plan?.entryRecheck?{entryRecheck:activity.plan.entryRecheck}:{}),
   ...(activity?.entryPlanEvidence?{entryPlanEvidence:activity.entryPlanEvidence}:{})};
  const {intradayActivity,...closed}=derived,current=activity?closed:derived;
  derived={...current,records:[...current.records,record],sourceHashes:[...current.sourceHashes,{date:record.date,hash:capture.hash}]};
 }
 return derived;
}

// Opportunities, Watch and Portfolio receive this one account decision. A
// still-open session can overlay posted economics without opening planning.
export function deriveC1AccountAnalysis({account,book,now=new Date()}={}) {
 const completed=deriveC1CompletedAccount({account,book,now});
 const decision=evaluateC1Account({account:completed,book,now});
 return {account:completed,decision:c1IntradayDecision({decision,activity:completed.intradayActivity,revision:completed.revision,now})};
}
export function appendC1AccountSession({account,record,book,expectedRevision,now=new Date()}={}) {
 if(record?.executionEvidence)throw new Error('Completed execution evidence must come from saved server-recorded activity');
 if(account?.revision!==expectedRevision)throw new Error('Account changed; refresh before recording activity');
 const capture=book.captures.find(c=>c.sessionDate===record?.date);
 if(!capture)throw new Error('Observed session input missing');
 const next={...account,revision:account.revision+1,records:[...account.records,record],sourceHashes:[...account.sourceHashes,{date:record.date,hash:capture.hash}]};
 evaluateC1Account({account:next,book,now});
 return next;
}

// A factual date correction is not a purchase, sale or account reset. Replay
// must still reconcile every accepted actual fill before the change is saved.
export function correctC1AccountOpenedAt({account,symbol,openedAt,expectedRevision,book,now=new Date()}={}) {
 if(account?.revision!==expectedRevision)throw new Error('Account changed; refresh before correcting the date');
 if(typeof openedAt!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(openedAt)||!Number.isFinite(Date.parse(openedAt))||new Date(openedAt).toISOString().slice(0,10)!==openedAt||!isUsMarketSessionDay(openedAt)||openedAt>account.adoption.sourceSessionDate)throw new Error('A valid first-purchase date on or before account adoption is required');
 const original=Object.values(account.adoption.seeds).flatMap(s=>s.positions).filter(p=>p.symbol===symbol);
 if(!original.length)throw new Error('Only an adopted holding has an opening date to correct');
 if(original.every(p=>p.openedAt===openedAt))return account;
 const before=evaluateC1Account({account,book,now}),next=JSON.parse(JSON.stringify(account));
 for(const seed of Object.values(next.adoption.seeds))for(const position of seed.positions)if(position.symbol===symbol)position.openedAt=openedAt;
 next.revision++;
 next.corrections=[...(next.corrections||[]),{type:'first-purchase-date',symbol,previousDates:[...new Set(original.map(p=>p.openedAt))],openedAt,at:now.toISOString(),revision:next.revision}];
 const after=evaluateC1Account({account:next,book,now});
 const ownership=d=>JSON.stringify({cash:d.actualCash,positions:d.positions.map(p=>[p.symbol,p.shares,p.avgCost])});
 if(ownership(before)!==ownership(after))throw new Error('Date correction changed reconciled ownership; original account preserved');
 return next;
}

export function importC1PositionContext({account,context,expectedRevision,book,now=new Date()}={}){
 let next=recordC1PositionContext({account,context,expectedRevision,now});
 for(const position of next.positionContext){
  if(context.contract==='c1-position-stage-v1'||!position.purchases?.length)continue;
  next=correctC1AccountOpenedAt({account:next,symbol:position.symbol,openedAt:position.purchases[0].date,expectedRevision:next.revision,book,now});
 }
 evaluateC1Account({account:next,book,now});
 return next;
}

// Cash reconciliation records a broker-confirmed balance difference without
// rewriting any trade, fill, holding, cost basis, stop, or risk history.
export function reconcileC1BrokerCash({account,brokerCash,expectedRevision,book,now=new Date()}={}){
 if(account?.revision!==expectedRevision)throw new Error('Account changed; refresh before reconciling cash');
 if(typeof brokerCash!=='number'||!Number.isFinite(brokerCash)||brokerCash<0||Math.abs(Math.round(brokerCash*100)-brokerCash*100)>1e-7)throw new Error('Broker cash balance must be entered in cents');
 const before=evaluateC1Account({account,book,now}),amount=Math.round((brokerCash-before.actualCash)*100)/100;
 if(!amount)return account;
 if(Math.abs(amount)>5)throw new Error('Cash reconciliation above $5 requires transaction-level evidence');
 const revision=account.revision+1,event={contract:'c1-broker-cash-reconciliation-v1',revision,amount,balanceBefore:before.actualCash,balanceAfter:brokerCash,
  effectiveSessionDate:before.sourceSessionDate,recordedAt:now.toISOString(),source:'broker-statement-balance'};
 const next={...account,revision,cashReconciliations:[...(account.cashReconciliations||[]),event]};
 const after=evaluateC1Account({account:next,book,now});
 if(Math.abs(after.actualCash-brokerCash)>.000001)throw new Error('Cash reconciliation did not reach the broker balance');
 const ownership=value=>JSON.stringify(value.positions.map(p=>({symbol:p.symbol,shares:p.shares,avgCost:p.avgCost,openedAt:p.openedAt,stops:p.stops,highWatermark:p.highWatermark})));
 if(ownership(before)!==ownership(after))throw new Error('Cash reconciliation changed recorded holdings; original account preserved');
 return next;
}

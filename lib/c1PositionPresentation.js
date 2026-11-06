import {c1AccountHoldingExplanation} from './c1AccountDecision';
import {verifyC1Quote} from './c1QuoteVerification';
import {c1ManualReviewCurrent} from './c1ManualRecommendations';
import {c1RecentMomentumNeedsReview,c1RecentMomentumIntradayExplanation} from './c1RecentMomentumLivePolicy';
import {latestCompletedMarketSessionDay,easternMarketClock,marketSessionCloseMinutes,marketExecutionState} from './marketSession';

const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;
const symbolOf=value=>String(value?.symbol||value?.ticker||'').replace('-','.').toUpperCase();
const stale=value=>value?.stale===true||value?.staleFallback===true||value?.staleVerification===true||
 value?.clientSnapshotFallback===true||value?.dataFeedSnapshotStale===true||value?.current===false||value?.freshness?.stale===true;
const exitReasons={
 'recent-momentum-deterioration':'Recent momentum exit confirmed.',
 'recent-momentum-profit-protection':'Profit-protection exit confirmed.',
 'rank-deterioration':'Holding rank no longer qualifies.',
 'early-rank-deterioration':'Holding rank no longer qualifies.',
 'profit-rank-deterioration':'Profit-protection exit confirmed.',
 'portfolio-drawdown-stop':'Portfolio loss limit triggered.',
 'universe-removal':'Outside the C1 investment universe.',
 'time-stop':'Holding-time exit confirmed.'
};

function activeQuoteValidUntil(stamp,lifetime,now){
 const clock=easternMarketClock(now);
 const closeAt=now.getTime()+((marketSessionCloseMinutes(clock.key)-clock.minutes)*60-clock.second)*1000-now.getUTCMilliseconds();
 return new Date(Math.min(stamp+lifetime,closeAt)).toISOString();
}

function verifiedPositionQuote({decision,position,executionDecision,stock,now}){
 const candidates=[],rejected=[];
 // This advisory was created from the account's verified opening observation.
 // Reuse its existing display-time expiry; it does not create a close or streak.
 const executionPosition=executionDecision?.contract===decision.contract&&executionDecision.current===true&&
  executionDecision.sourceSessionDate===decision.sourceSessionDate&&executionDecision.revision===decision.revision?
  executionDecision.positions?.find(row=>symbolOf(row)===symbolOf(position)):null;
 for(const observed of [executionPosition,position]){
  const advisory=observed?.intradayMomentumAdvisory;
  if(!stale(observed)&&!stale(advisory)&&advisory?.sourceSessionDate===decision.sourceSessionDate&&
   advisory.completedConfirmationsUnchanged===true&&c1RecentMomentumIntradayExplanation(observed,now))
   candidates.push({price:advisory.price,observedAt:advisory.observedAt,
    validUntil:activeQuoteValidUntil(Date.parse(advisory.observedAt),120000,now),source:'verified-account-observation'});
  else if(advisory){
   const at=Date.parse(advisory.observedAt);
   rejected.push({observedAt:Number.isFinite(at)?advisory.observedAt:null,reason:Number.isFinite(at)&&now.getTime()-at>120000?
    'The account quote expired after 120 seconds; verify a new regular-session quote.':
    'The account quote does not match the current session, ownership revision or verification evidence.'});
  }
 }
 // A cached freshness boolean or a bare displayed number is insufficient.
 // These are the same timestamp/session and fallback checks as c1HoldingRisk.
 const value=Number(stock?.price??stock?.currentPrice??stock?.lastPrice),verified=verifyC1Quote(stock,now);
 if(symbolOf(stock)===symbolOf(position)&&positive(value)&&verified.verifiedRegularSession)
  candidates.push({price:value,observedAt:verified.quoteAt,validUntil:verified.validUntil,source:'current-stock-quote'});
 candidates.sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt));
 if(candidates.some(candidate=>candidate.observedAt===candidates[0]?.observedAt&&candidate.price!==candidates[0]?.price))
  return {quote:null,quoteAt:candidates[0].observedAt,reason:'Conflicting prices have the same quote timestamp; verify a consistent current quote.'};
 if(candidates.length)return {quote:candidates[0],quoteAt:candidates[0].observedAt,reason:null};
 const accountFailure=rejected.sort((a,b)=>Date.parse(b.observedAt||0)-Date.parse(a.observedAt||0))[0];
 const reason=accountFailure?.observedAt&&!verified.quoteAt?accountFailure.reason:
  !symbolOf(stock)?'A current provider quote for this holding is unavailable.':
  symbolOf(stock)!==symbolOf(position)?'The quote symbol does not match this recorded holding.':
  stock?.error?'The provider quote request failed; current stop verification is unavailable.':
  !positive(value)?'A current quote price is missing or invalid.':
  !verified.quoteAt?'The provider quote timestamp is missing or invalid.':
  verified.status!=='unverified'?verified.reason:
  !stock?._fmpQuoteObservation?'The bound provider quote observation is missing.':
  'The provider quote provenance does not match its symbol, price, timestamp or fetch evidence.';
 return {quote:null,quoteAt:verified.quoteAt||accountFailure?.observedAt||null,reason};
}

const sameOrder=(a,b)=>a?.id===b?.id&&a.symbol===b.symbol&&a.side===b.side&&a.shares===b.shares&&
 a.sleeve===b.sleeve&&a.condition===b.condition&&a.estimatedPrice===b.estimatedPrice&&a.reason===b.reason;

// Display only. The account decision, checked quantities and execution paths
// remain authoritative and untouched. Both Portfolio and held Opportunities
// use this same holding action; any checked Add remains a separate proposal.
export function c1PositionPresentation({decision,position,symbol=position?.symbol,stock,
 executionDecision=decision,openingPlan,manualRecommendations,requireOpeningReview=false,checkedAddOrders=[],now=new Date()}={}){
 if(stock?.role==='Core'||position?.role==='Core')return null;
 const row=position||(decision?.positions||[]).find(p=>p.symbol===symbol);
 const valid=decision?.contract==='c1-account-decision-v1'&&row&&symbolOf(row)===String(symbol||row.symbol).replace('-','.').toUpperCase();
 const unavailable='Reconciled holding and stop evidence are unavailable; verify the account ownership before acting.';
 const empty={action:'Review',label:'STOP STATUS UNVERIFIED',reason:unavailable,verificationReason:unavailable,detail:'',urgent:false,
  stopTriggered:false,stopStatusVerified:false,verifyStopNeeded:true,quoteVerified:false,quotePrice:null,quoteAt:verifyC1Quote(stock,now).quoteAt,quoteValidUntil:null,canAdd:false,addOrders:[]};
 if(!valid)return empty;
 const verification=verifiedPositionQuote({decision,position:row,executionDecision,stock,now}),quote=verification.quote;
 const quoteStatus=verifyC1Quote(stock,now),published=stock?.quoteVerification;
 const quoteContext=quote?'regular session':quoteStatus.status==='previous-close'?'previous-close price · current verification unavailable':
  quoteStatus.quotePhase==='premarket'?'premarket price · current verification unavailable':
  quoteStatus.quotePhase==='after-hours'?'after-hours price · current verification unavailable':'current verification unavailable';
 const lastVerifiedQuoteAt=quote?.observedAt||(published?.contract==='c1-quote-verification-v1'&&published.verifiedRegularSession===true&&
  published.symbol===symbolOf(row)&&published.price===Number(stock?.price)&&published.quoteAt===quoteStatus.quoteAt?published.quoteAt:null);
 const manualCurrent=Boolean(openingPlan)&&c1ManualReviewCurrent(manualRecommendations,executionDecision,now);
 const alignedPlan=manualCurrent&&decision.current===true&&executionDecision.revision===decision.revision&&
  openingPlan.providerVerified===true&&openingPlan.date===manualRecommendations.date&&
  openingPlan.sourceSessionDate===decision.sourceSessionDate&&openingPlan.observedAt===manualRecommendations.observedAt&&
  Array.isArray(openingPlan.orders)&&Array.isArray(manualRecommendations.orders);
 const currentOrders=alignedPlan?manualRecommendations.orders.filter(order=>
  openingPlan.orders.some(checked=>sameOrder(order,checked))):[];
 const isHoldingSell=order=>order?.symbol===row.symbol&&order.side==='sell'&&!order.condition;
 const matchingSells=currentOrders.filter(isHoldingSell);
 const completeOpening=alignedPlan&&[openingPlan.orders,manualRecommendations.orders].every(orders=>
  orders.filter(isHoldingSell).every(order=>matchingSells.some(checked=>sameOrder(order,checked))));
 const openingExits=completeOpening?matchingSells:[];
 const pendingExits=[...(row.exits||[]),...openingExits];
 const pendingStop=pendingExits.some(exit=>exit.reason==='initial-stop');
 const stops=(row.stops||[]).map(stop=>stop.price).filter(positive);
 const breachedStop=quote?stops.filter(stop=>quote.price<=stop).sort((a,b)=>b-a)[0]:null;
 const stopTriggered=pendingStop||positive(breachedStop);
 const addOrders=checkedAddOrders.filter(order=>order.symbol===row.symbol&&order.side==='buy'&&!order.condition&&
  currentOrders.some(checked=>sameOrder(order,checked)));
 const detail=row.reason||c1AccountHoldingExplanation({...row,stops:row.stops||[],exits:row.exits||[]},decision.sourceSessionDate);
 const stopsComplete=Array.isArray(row.stops)&&row.stops.length>0&&row.stops.every(stop=>positive(stop.price));
 const verificationReason=!stopsComplete?'One or more recorded sleeve stop levels are missing or invalid.':verification.reason;
 const base={...empty,detail,verificationReason,stopStatusVerified:Boolean(quote)&&stopsComplete,verifyStopNeeded:!quote||!stopsComplete,quoteVerified:Boolean(quote),quotePrice:quote?.price||null,quoteAt:verification.quoteAt,lastVerifiedQuoteAt,quoteStatus,quoteContext,
  quoteValidUntil:quote?.validUntil||null,stopTriggered,openingExits,
  canAdd:false,addOrders:[]};
 if(stopTriggered)return {...base,action:'Sell',label:'SELL — STOP TRIGGERED',verifyStopNeeded:false,reason:pendingStop?
  'Recorded stop was breached; a Sell signal requires action. No Schwab order is confirmed.':
  'Verified price reached the recorded stop; a Sell signal requires action. No Schwab order is confirmed.'};
 if(pendingExits.length){
  const reason=pendingExits[0].reason;
  const label=['recent-momentum-profit-protection','profit-rank-deterioration'].includes(reason)?'SELL — PROFIT PROTECTION':
   ['recent-momentum-deterioration','rank-deterioration','early-rank-deterioration'].includes(reason)?'SELL — MOMENTUM EXIT':'SELL';
  const portfolioStops=pendingExits.filter(exit=>exit.reason==='portfolio-drawdown-stop');
  const reviewedPosition=manualCurrent?executionDecision?.positions?.find(held=>held.symbol===row.symbol):null;
  const evidence=portfolioStops.map(exit=>exit.portfolioStopEvidence||
   reviewedPosition?.exits?.find(hit=>hit.reason===exit.reason&&hit.sleeve===exit.sleeve)?.portfolioStopEvidence);
  return {...base,action:'Sell',label,portfolioStopEvidence:[...new Set(evidence.filter(Boolean))],verifyStopNeeded:false,reason:exitReasons[reason]||'An existing exit signal requires action; no Schwab order is confirmed.'};
 }
 const current=decision.current===true&&decision.sourceSessionDate===latestCompletedMarketSessionDay(now);
 const missingRecent=(row.recentMomentumReviews||[]).some(review=>review.available!==true);
 const needsReview=c1RecentMomentumNeedsReview(row)||['Review','Price/stop review','Stop review'].includes(row.action);
 const displayedPrice=Number(stock?.price??stock?.currentPrice??stock?.lastPrice);
 const unverifiedStop=!quote&&positive(displayedPrice)&&stops.some(stop=>displayedPrice<=stop);
 if(unverifiedStop)return {...base,action:'Review',label:'VERIFY STOP URGENTLY',urgent:true,
  reason:`Displayed price is at or below the stop. ${verificationReason}`};
 if(!quote||!stopsComplete)return {...base,reason:verificationReason};
 if(requireOpeningReview&&marketExecutionState(now).isOpen&&!completeOpening)
  return {...base,action:'Review',label:'EXIT REVIEW PENDING',
   reason:'The current opening review is unavailable. C1 cannot confirm the holding action.'};
 const reason=!current?'Completed-session review is stale; no additions.':
  missingRecent?'Recent momentum unavailable; no additions.':
  needsReview?'Momentum needs review; no exit confirmed.':
  'No sell rule is confirmed.';
 const addVisible=current&&!needsReview&&!missingRecent&&!unverifiedStop;
 return {...base,action:'Hold',label:'HOLD',reason,canAdd:addVisible&&addOrders.length>0,addOrders:addVisible?addOrders:[]};
}

// Display recorded ownership separately from broker execution. Do not turn a
// partial sleeve exit into a full-account sale or invent a missing quantity.
export function c1RecordedSellInstruction(position,presentation){
 if(presentation?.action!=='Sell')return null;
 const whole=n=>Number.isSafeInteger(n)&&n>0;
 const held=whole(position?.shares)?position.shares:null;
 const exits=position?.exits||[],stops=position?.stops||[];
 const triggered=[...exits,...(presentation.openingExits||[]),...stops.filter(stop=>presentation.quoteVerified&&presentation.quotePrice<=stop.price)];
 const quantities=new Map();
 for(const row of triggered){
  const bound=stops.find(stop=>stop.sleeve===row.sleeve)?.shares;
  if(whole(row.shares))quantities.set(row.sleeve||'recorded',Math.max(quantities.get(row.sleeve||'recorded')||0,Math.min(row.shares,whole(bound)?bound:row.shares)));
 }
 const total=[...quantities.values()].reduce((sum,n)=>sum+n,0),shares=held&&total?Math.min(held,total):null;
 return {recordedShares:held,shares,next:shares?
  `Sell ${shares} ${shares===1?'share':'shares'} in Schwab after confirming the current execution price. Record the actual fill in C1 only after Schwab confirms execution.`:
  'Verify the exit quantity against the recorded sleeve holdings in Schwab, then record the actual fill after execution.',
  status:'Sell instruction only; C1 has not submitted or confirmed a Schwab order.'};
}

import {c1AccountHoldingExplanation} from './c1AccountDecision';
import {verifyC1Quote} from './c1QuoteVerification';
import {c1ManualReviewCurrent} from './c1ManualRecommendations';
import {c1RecentMomentumNeedsReview,c1RecentMomentumIntradayExplanation} from './c1RecentMomentumLivePolicy';
import {latestCompletedMarketSessionDay,easternMarketClock,marketSessionCloseMinutes} from './marketSession';

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
 const candidates=[];
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
 }
 // A cached freshness boolean or a bare displayed number is insufficient.
 // These are the same timestamp/session and fallback checks as c1HoldingRisk.
 const value=Number(stock?.price??stock?.currentPrice??stock?.lastPrice),verified=verifyC1Quote(stock,now);
 if(symbolOf(stock)===symbolOf(position)&&positive(value)&&verified.verifiedRegularSession)
  candidates.push({price:value,observedAt:verified.quoteAt,validUntil:verified.validUntil,source:'current-stock-quote'});
 candidates.sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt));
 if(candidates.some(candidate=>candidate.observedAt===candidates[0]?.observedAt&&candidate.price!==candidates[0]?.price))return null;
 return candidates[0]||null;
}

const sameOrder=(a,b)=>a?.id===b?.id&&a.symbol===b.symbol&&a.side===b.side&&a.shares===b.shares&&
 a.condition===b.condition&&a.estimatedPrice===b.estimatedPrice&&a.reason===b.reason;

// Display only. The account decision, checked quantities and execution paths
// remain authoritative and untouched. Both Portfolio and held Opportunities
// use this same holding action; any checked Add remains a separate proposal.
export function c1PositionPresentation({decision,position,symbol=position?.symbol,stock,
 executionDecision=decision,openingPlan,manualRecommendations,checkedAddOrders=[],now=new Date()}={}){
 if(stock?.role==='Core'||position?.role==='Core')return null;
 const row=position||(decision?.positions||[]).find(p=>p.symbol===symbol);
 const valid=decision?.contract==='c1-account-decision-v1'&&row&&symbolOf(row)===String(symbol||row.symbol).replace('-','.').toUpperCase();
 const empty={action:'Hold',label:'HOLD',reason:'Account review unavailable; no additions.',detail:'',urgent:false,
  stopTriggered:false,quoteVerified:false,quotePrice:null,quoteValidUntil:null,canAdd:false,addOrders:[]};
 if(!valid)return empty;
 const quote=verifiedPositionQuote({decision,position:row,executionDecision,stock,now});
 const quoteStatus=verifyC1Quote(stock,now),published=stock?.quoteVerification;
 const quoteContext=quote?'regular session':quoteStatus.status==='previous-close'?'previous-close price · current verification unavailable':
  quoteStatus.quotePhase==='premarket'?'premarket price · current verification unavailable':
  quoteStatus.quotePhase==='after-hours'?'after-hours price · current verification unavailable':'current verification unavailable';
 const lastVerifiedQuoteAt=quote?.observedAt||(published?.contract==='c1-quote-verification-v1'&&published.verifiedRegularSession===true&&
  published.symbol===symbolOf(row)&&published.price===Number(stock?.price)&&published.quoteAt===quoteStatus.quoteAt?published.quoteAt:null);
 const manualCurrent=Boolean(openingPlan)&&c1ManualReviewCurrent(manualRecommendations,executionDecision,now);
 const currentOrders=manualCurrent?(manualRecommendations.orders||[]).filter(order=>
  (openingPlan.orders||[]).some(checked=>sameOrder(order,checked))):[];
 const pendingExits=[...(row.exits||[]),...currentOrders.filter(order=>
  order.symbol===row.symbol&&order.side==='sell'&&!order.condition)];
 const pendingStop=pendingExits.some(exit=>exit.reason==='initial-stop');
 const stops=(row.stops||[]).map(stop=>stop.price).filter(positive);
 const breachedStop=quote?stops.filter(stop=>quote.price<=stop).sort((a,b)=>b-a)[0]:null;
 const stopTriggered=pendingStop||positive(breachedStop);
 const addOrders=checkedAddOrders.filter(order=>order.symbol===row.symbol&&order.side==='buy'&&!order.condition&&
  currentOrders.some(checked=>sameOrder(order,checked)));
 const detail=row.reason||c1AccountHoldingExplanation({...row,stops:row.stops||[],exits:row.exits||[]},decision.sourceSessionDate);
 const base={...empty,detail,quoteVerified:Boolean(quote),quotePrice:quote?.price||null,quoteAt:quote?.observedAt||null,lastVerifiedQuoteAt,quoteStatus,quoteContext,
  quoteValidUntil:quote?.validUntil||null,stopTriggered,
  canAdd:false,addOrders:[]};
 if(stopTriggered)return {...base,action:'Sell',label:'SELL — STOP TRIGGERED',reason:pendingStop?
  'Recorded stop was breached; sale remains pending.':
  'Verified price reached the recorded stop; sale remains pending.'};
 if(pendingExits.length){
  const reason=pendingExits[0].reason;
  const label=['recent-momentum-profit-protection','profit-rank-deterioration'].includes(reason)?'SELL — PROFIT PROTECTION':
   ['recent-momentum-deterioration','rank-deterioration','early-rank-deterioration'].includes(reason)?'SELL — MOMENTUM EXIT':'SELL';
  return {...base,action:'Sell',label,reason:exitReasons[reason]||'An existing exit is pending.'};
 }
 const current=decision.current===true&&decision.sourceSessionDate===latestCompletedMarketSessionDay(now);
 const missingRecent=(row.recentMomentumReviews||[]).some(review=>review.available!==true);
 const needsReview=c1RecentMomentumNeedsReview(row)||['Review','Price/stop review','Stop review'].includes(row.action);
 const displayedPrice=Number(stock?.price??stock?.currentPrice??stock?.lastPrice);
 const unverifiedStop=!quote&&positive(displayedPrice)&&stops.some(stop=>displayedPrice<=stop);
 if(unverifiedStop)return {...base,action:'Review',label:'VERIFY STOP URGENTLY',urgent:true,
  reason:'Displayed price is at or below the stop; verify a current regular-session quote.'};
 const reason=!current?'Completed-session review is stale; no additions.':
  missingRecent?'Recent momentum unavailable; no additions.':
  needsReview?'Momentum needs review; no exit confirmed.':
  'No sell rule is confirmed.';
 const addVisible=current&&!needsReview&&!missingRecent&&!unverifiedStop;
 return {...base,reason,canAdd:addVisible&&addOrders.length>0,addOrders:addVisible?addOrders:[]};
}

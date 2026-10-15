import {c1AccountHoldingExplanation} from './c1AccountDecision';
import {quoteFreshness} from './expertDecision';
import {c1ManualReviewCurrent} from './c1ManualRecommendations';
import {c1RecentMomentumNeedsReview,c1RecentMomentumIntradayExplanation} from './c1RecentMomentumLivePolicy';
import {latestCompletedMarketSessionDay,easternMarketClock,marketSessionCloseMinutes} from './marketSession';

const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;
const symbolOf=value=>String(value?.symbol||value?.ticker||'').replace('-','.').toUpperCase();
const stale=value=>value?.stale===true||value?.staleFallback===true||value?.staleVerification===true||
 value?.clientSnapshotFallback===true||value?.dataFeedSnapshotStale===true||value?.current===false||value?.freshness?.stale===true;
const exitReasons={
 'recent-momentum-deterioration':'Recent price weakness has confirmed an exit.',
 'recent-momentum-profit-protection':'Profit protection has confirmed an exit.',
 'rank-deterioration':'The stock no longer meets the holding rules.',
 'early-rank-deterioration':'The stock no longer meets the holding rules.',
 'profit-rank-deterioration':'Profit protection has confirmed an exit.',
 'portfolio-drawdown-stop':'The portfolio loss limit has triggered an exit.',
 'universe-removal':'The stock has left the strategy’s investment universe.',
 'time-stop':'The holding-time rule has confirmed an exit.'
};

function activeQuoteValidUntil(stamp,lifetime,now){
 const clock=easternMarketClock(now);
 const closeAt=now.getTime()+((marketSessionCloseMinutes(clock.key)-clock.minutes)*60-clock.second)*1000-now.getUTCMilliseconds();
 return new Date(Math.min(stamp+lifetime,closeAt)).toISOString();
}

function verifiedPositionQuote({decision,position,executionDecision,stock,now}){
 if(decision?.current!==true||decision.sourceSessionDate!==latestCompletedMarketSessionDay(now))return null;
 // This advisory was created from the account's verified opening observation.
 // Reuse its existing display-time expiry; it does not create a close or streak.
 const executionPosition=executionDecision?.contract===decision.contract&&executionDecision.current===true&&
  executionDecision.sourceSessionDate===decision.sourceSessionDate&&executionDecision.revision===decision.revision?
  executionDecision.positions?.find(row=>symbolOf(row)===symbolOf(position)):null;
 for(const observed of [executionPosition,position]){
  const advisory=observed?.intradayMomentumAdvisory;
  if(!stale(observed)&&!stale(advisory)&&advisory?.sourceSessionDate===decision.sourceSessionDate&&
   advisory.completedConfirmationsUnchanged===true&&c1RecentMomentumIntradayExplanation(observed,now))
   return {price:advisory.price,observedAt:advisory.observedAt,
    validUntil:activeQuoteValidUntil(Date.parse(advisory.observedAt),120000,now),source:'verified-account-observation'};
 }
 // A cached freshness boolean or a bare displayed number is insufficient.
 // These are the same timestamp/session and fallback checks as c1HoldingRisk.
 const value=Number(stock?.price??stock?.currentPrice??stock?.lastPrice),timestamp=Number(stock?.timestamp);
 const quoteMs=timestamp>1e12?timestamp:timestamp*1000;
 // Some stock serializers omit the provider cache status. Its absence cannot
 // prove that a retained quote came from a successful current observation.
 const freshness=quoteFreshness(stock,now);
 if(symbolOf(stock)!==symbolOf(position)||!positive(value)||stock?.error||stale(stock)||
  !['live','fresh-memory'].includes(stock?._fmpQuoteCache)||!positive(quoteMs)||quoteMs>now.getTime()||
  !freshness.pass)return null;
 return {price:value,observedAt:new Date(quoteMs).toISOString(),
  validUntil:freshness.marketOpen?activeQuoteValidUntil(quoteMs,15*60000,now):null,source:'current-stock-quote'};
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
 const empty={action:'Hold',label:'HOLD',reason:'The account review is unavailable, so hold without adding.',detail:'',
  stopTriggered:false,quoteVerified:false,quoteValidUntil:null,canAdd:false,addOrders:[]};
 if(!valid)return empty;
 const quote=verifiedPositionQuote({decision,position:row,executionDecision,stock,now});
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
 const base={...empty,detail,quoteVerified:Boolean(quote),quoteAt:quote?.observedAt||null,quoteValidUntil:quote?.validUntil||null,stopTriggered,
  canAdd:false,addOrders:[]};
 if(stopTriggered)return {...base,action:'Sell',label:'SELL — STOP TRIGGERED',reason:pendingStop?
  'The existing stop has triggered; the sale is still pending.':
  `Verified price $${quote.price.toFixed(2)} is at or below the existing $${breachedStop.toFixed(2)} stop.`};
 if(pendingExits.length)return {...base,action:'Sell',label:'SELL',reason:
  exitReasons[pendingExits[0].reason]||'An existing exit is pending.'};
 const current=decision.current===true&&decision.sourceSessionDate===latestCompletedMarketSessionDay(now);
 const missingRecent=(row.recentMomentumReviews||[]).some(review=>review.available!==true);
 const needsReview=c1RecentMomentumNeedsReview(row)||['Review','Price/stop review','Stop review'].includes(row.action);
 const displayedPrice=Number(stock?.price??stock?.currentPrice??stock?.lastPrice);
 const unverifiedStop=!quote&&positive(displayedPrice)&&stops.some(stop=>displayedPrice<=stop);
 const reason=unverifiedStop?'The displayed price is at or below the recorded stop but remains unverified, so hold without adding until it is checked.':
  !current?'Hold without adding until the account review is updated.':
  missingRecent?'Hold without adding while the recent price checks are incomplete.':
  needsReview?'Hold without adding while momentum needs watching and no sell rule is confirmed.':
  'Keep holding because no sell rule is confirmed.';
 const addVisible=current&&!needsReview&&!missingRecent&&!unverifiedStop;
 return {...base,reason,canAdd:addVisible&&addOrders.length>0,addOrders:addVisible?addOrders:[]};
}

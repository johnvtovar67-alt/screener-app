import {readC1RecentMomentum} from './c1RecentMomentumGate';
import {isUsMarketSessionDay,marketExecutionState,easternMarketClock,latestCompletedMarketSessionDay,marketSessionDistance} from './marketSession';

// Owner-authorized prospective release. Earlier recorded decisions and fills
// remain governed by their accepted execution evidence.
export const C1_RECENT_MOMENTUM_LIVE_SOURCE_DATE='2026-10-14';
export const c1RecentMomentumLiveApplies=date=>typeof date==='string'&&
 date>=C1_RECENT_MOMENTUM_LIVE_SOURCE_DATE&&isUsMarketSessionDay(date);

export function c1RecentMomentumScreenGate(sessions,symbol,date){
 const review=readC1RecentMomentum({sessions,sessionIndex:sessions.findIndex(s=>s.date===date),symbol});
 return {contract:review.contract,sourceSessionDate:review.sourceSessionDate,available:review.available,
  entryAllowed:review.entryAllowed,metrics:review.metrics,limitations:review.limitations};
}
export function c1RecentMomentumNeedsReview(position={}){
 return (position.recentMomentumReviews||[]).some(review=>review.available!==true||review.entryAllowed!==true||
  review.state?.streak>0||review.state?.profitGivebackStreak>0);
}
export function c1RecentMomentumExplanation(position={}){
 const reviews=position.recentMomentumReviews||[];
 if(!reviews.length)return null;
 const unavailable=reviews.find(review=>review.available!==true);
 if(unavailable)return 'Recent-momentum evidence is incomplete or stale. Fresh purchases and additions are paused; missing evidence cannot confirm a new momentum exit.';
 const review=reviews[0],m=review.metrics;
 if(!m)return 'Recent-momentum review is unavailable; no new capital is authorized.';
 const pct=value=>`${value>=0?'+':''}${value.toFixed(2)}%`;
 const parts=[`Completed-session price returns: 1 session ${pct(m.ret1)}, 3 sessions ${pct(m.ret3)}, 5 sessions ${pct(m.ret5)}; MACD ${m.macdImproving?'improving':'not improving'}.`];
 if(reviews.some(r=>r.exitReason))parts.push('Recent-momentum exit confirmed. Review the next regular-session opening sale; existing stops and portfolio loss controls take priority.');
 else if(c1RecentMomentumNeedsReview(position))parts.push('Recent momentum does not support an unqualified Hold or fresh capital. Confirmation is pending; this is not a fixed-percentage sell rule.');
 else parts.push('Recent momentum supports holding; any Buy or Add still requires all existing account and opening checks.');
 const armed=reviews.find(r=>r.state?.profitProtectionArmed);
 if(armed){
  parts.push('The 12% peak-gain activation is latched for this ownership lifecycle. Profit protection requires two completed confirmations; ordinary deterioration requires three.');
  if(armed.metrics?.verifiedPeak&&Number.isFinite(armed.metrics.gainGivebackFraction))parts.push(`Verified peak-gain giveback: ${(armed.metrics.gainGivebackFraction*100).toFixed(1)}% of the earned peak gain. Giving back at least half can qualify the additional two-close profit-protection path when the latest return is negative and MACD is not improving.`);
 }else parts.push('Ordinary deterioration requires three completed-session confirmations.');
 return parts.join(' ');
}

// Called only with an already server-verified opening observation. This is a
// disposable advisory: no close, peak, streak, eligibility or order is changed.
export function withC1RecentMomentumIntradayAdvisories(decision,opening,now=new Date()){
 const stale=value=>value?.stale===true||value?.staleFallback===true||value?.staleVerification===true||
  value?.clientSnapshotFallback===true||value?.dataFeedSnapshotStale===true||value?.current===false||value?.freshness?.stale===true;
 if(!decision?.current||!c1RecentMomentumLiveApplies(decision.sourceSessionDate)||
  decision.sourceSessionDate!==latestCompletedMarketSessionDay(now)||!marketExecutionState(now).isOpen||
  opening?.date!==easternMarketClock(now)?.key||marketSessionDistance(decision.sourceSessionDate,opening.date)!==1||
  stale(opening)||opening.receipt?.provider!=='FMP'||opening.receipt.membershipCheckedTwice!==true||
  opening.receipt.previousAdjustedClosesUnchanged!==true)return decision;
 return {...decision,positions:decision.positions.map(position=>{
  const rows=(opening.prices||[]).filter(row=>row.symbol===position.symbol),row=rows.length===1?rows[0]:null;
  const stamp=typeof row?.observedAt==='string'?Date.parse(row.observedAt):NaN;
  const close=position.recentMomentumReviews?.find(review=>review.available===true)?.metrics?.close;
  if(row?.adjusted!==true||stale(row)||(row.date!=null&&row.date!==opening.date)||
   (row.asOf!=null&&(typeof row.asOf!=='string'||row.asOf.slice(0,10)!==opening.date))||
   !(typeof row.observedPrice==='number'&&Number.isFinite(row.observedPrice)&&row.observedPrice>0)||
   !(typeof close==='number'&&Number.isFinite(close)&&close>0)||
   !Number.isFinite(stamp)||stamp>now.getTime()||now.getTime()-stamp>120000||
   easternMarketClock(new Date(stamp))?.key!==opening.date)return position;
  return {...position,intradayMomentumAdvisory:{kind:'intraday-advisory',observedAt:row.observedAt,
   sourceSessionDate:decision.sourceSessionDate,price:row.observedPrice,
   changeFromCompletedClosePct:(row.observedPrice/close-1)*100,completedConfirmationsUnchanged:true}};
 })};
}
export function c1RecentMomentumIntradayExplanation(position,now=new Date()){
 const evidence=position?.intradayMomentumAdvisory,stamp=Date.parse(evidence?.observedAt);
 if(evidence?.kind!=='intraday-advisory'||!Number.isFinite(stamp)||stamp>now.getTime()||now.getTime()-stamp>120000||
  !marketExecutionState(now).isOpen||evidence.sourceSessionDate!==latestCompletedMarketSessionDay(now)||
   !Number.isFinite(evidence.changeFromCompletedClosePct)||!Number.isFinite(evidence.price)||evidence.price<=0)return null;
 return `Intraday advisory at ${evidence.observedAt}: verified price $${evidence.price.toFixed(2)}, ${evidence.changeFromCompletedClosePct>=0?'+':''}${evidence.changeFromCompletedClosePct.toFixed(2)}% versus the ${evidence.sourceSessionDate} close. This observation does not confirm a completed-session exit or update the recorded peak.`;
}

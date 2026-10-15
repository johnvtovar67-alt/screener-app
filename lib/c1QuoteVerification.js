import {quoteFreshness} from './expertDecision';
import {easternMarketClock,marketExecutionState,marketSessionCloseMinutes,latestCompletedMarketSessionDay} from './marketSession';

const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;
const stale=row=>row?.stale===true||row?.staleFallback===true||row?.staleVerification===true||
 row?.clientSnapshotFallback===true||row?.dataFeedSnapshotStale===true||row?.current===false||row?.freshness?.stale===true;
const phase=clock=>!clock?.isSessionDay?'closed':clock.minutes<570?'premarket':
 clock.minutes>=marketSessionCloseMinutes(clock.key)?'after-hours':'regular-session';

// Recheck the provider observation itself at the time it is used. A serialized
// verified boolean cannot extend a quote's age, session or fallback authority.
// The account already uses a 120-second current-quote limit; expert screening's
// separate fifteen-minute quoteFreshness rule is left unchanged.
export function verifyC1Quote(stock={},now=new Date(),{maximumAgeMs=120000}={}){
 const state=marketExecutionState(now),clock=state.clock;
 const timestamp=Number(stock.timestamp),quoteMs=timestamp>1e12?timestamp:timestamp*1000;
 const candidate=positive(quoteMs)?new Date(quoteMs):null,stamp=candidate&&Number.isFinite(candidate.getTime())?candidate:null;
 const qclock=stamp?easternMarketClock(stamp):null;
 const fetchedMs=Date.parse(stock._fmpQuoteFetchedAt),price=Number(stock.price??stock.currentPrice??stock.lastPrice);
 const cacheStatus=stock._fmpQuoteCache||null,request=stock._fmpQuoteRequest||{};
 const provider=stock._fmpQuoteProvider==='FMP'&&stock._fmpQuoteEndpoint==='quote';
 const symbol=String(stock.symbol||stock.ticker||'').replace('-','.').toUpperCase(),observation=stock._fmpQuoteObservation;
 const bound=observation?.provider==='FMP'&&observation.endpoint==='stable/quote'&&observation.symbol===symbol&&
  observation.price===price&&observation.timestamp===timestamp&&observation.fetchedAt===stock._fmpQuoteFetchedAt;
 const provenance=provider&&bound&&['live','fresh-memory'].includes(cacheStatus)&&Number.isFinite(fetchedMs)&&
  quoteMs<=fetchedMs&&fetchedMs<=now.getTime();
 const quotePhase=phase(qclock),marketPhase=phase(clock),ageMs=stamp?now.getTime()-quoteMs:null;
 const sameSession=Boolean(qclock&&clock&&qclock.key===clock.key);
 const validTimestamp=stamp&&quoteMs<=now.getTime(),usable=positive(price)&&validTimestamp&&!stock.error&&!stale(stock);
 const regular=Boolean(provenance&&usable&&state.isOpen&&quotePhase==='regular-session'&&sameSession&&
  positive(maximumAgeMs)&&ageMs<=maximumAgeMs&&quoteFreshness(stock,now).pass);
 const prior=Boolean(provenance&&usable&&!state.isOpen&&quotePhase==='regular-session'&&
  qclock.key===latestCompletedMarketSessionDay(now));
 let status='unverified',reason='Provider quote provenance or timestamp is unavailable; current prices are unverified.';
 if(String(cacheStatus||'').startsWith('stale')||stale(stock)){
  status='fallback-unverified';reason='Retained or fallback prices cannot verify a current trading instruction.';
 }else if(stamp&&quoteMs>now.getTime()){
  status='future-quote';reason='The provider quote timestamp is in the future and cannot be used.';
 }else if(regular){status='verified-regular-session';reason='Current regular-session price verified from FMP.';
 }else if(prior){status='previous-close';reason='This is a previous completed-session quote, not a current regular-session price.';
 }else if(provenance&&usable&&quotePhase==='premarket'){
  status='premarket';reason='Premarket prices cannot confirm a regular-session stop.';
 }else if(provenance&&usable&&quotePhase==='after-hours'){
  status='after-hours';reason='After-hours prices cannot confirm a regular-session stop.';
 }else if(provenance&&usable&&state.isOpen&&(!sameSession||ageMs>maximumAgeMs)){
  status='stale-quote';reason='The quote is outside the existing account current-price verification window.';
 }
 const closeAt=regular?now.getTime()+((marketSessionCloseMinutes(clock.key)-clock.minutes)*60-clock.second)*1000-now.getUTCMilliseconds():null;
 return {contract:'c1-quote-verification-v1',provider:provider?'FMP':null,endpoint:provider?'stable/quote':null,
  symbol,price:positive(price)?price:null,
  status,verifiedRegularSession:regular,quoteAt:stamp?.toISOString()||null,
  fetchedAt:Number.isFinite(fetchedMs)?new Date(fetchedMs).toISOString():null,
  validUntil:regular?new Date(Math.min(quoteMs+maximumAgeMs,closeAt)).toISOString():null,
  sessionDay:qclock?.key||null,marketPhase,quotePhase,cacheStatus,
  providerAttempted:request.providerAttempted===true,newDataAccepted:request.newDataAccepted===true,
  refreshRequested:request.refreshRequested===true,refreshStatus:request.refreshStatus||null,
  retryAt:request.retryAt||null,reason};
}

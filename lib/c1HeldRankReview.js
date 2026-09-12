import {buildHistoricalQuote,attachCrossSectionalResearchFactors} from './historicalSignalEvaluator';
import {analyzeEntryTiming} from './entryTiming';
import {c1AccountRankEligible} from './c1AccountSimulator';
import {C1_FROZEN_OPTIONS} from './c1FrozenOptions';
import {marketSessionDistance,isUsMarketSessionDay} from './marketSession';

// Existing holdings can be reviewed against the dated index reference pool
// without becoming index members or fresh-entry candidates. The same momentum
// formula, eligibility filters, tie break and holding rules are used.
export function compileC1HeldRankReview({baseline,sourceHash,symbol,history,observedAt}={}){
 const classification=baseline?.legacyHoldingSignals?.find(s=>s.symbol===symbol);
 const accepted=baseline?.prices?.find(p=>p.symbol===symbol);
 if(!sourceHash||!classification||baseline.universeSymbols.includes(symbol)||!Number.isFinite(Date.parse(observedAt)))throw new Error('Dated outside holding and source identity required');
 const bars=history?.slice(-253);
 if(bars?.length!==253||bars.at(-1).date!==baseline.date||bars.some((b,i)=>b.adjusted!==true||!isUsMarketSessionDay(b.date)||!['open','high','low','close','volume'].every(k=>Number.isFinite(b[k])&&b[k]>0)||b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close)||(i&&marketSessionDistance(bars[i-1].date,b.date)!==1)))throw new Error('Complete adjusted holding history required');
 if(!accepted||['open','high','low','close','volume'].some(k=>Math.abs(bars.at(-1)[k]-accepted[k])>1e-7))throw new Error('Holding history differs from the accepted account close');
 const peers=[...new Map([...(baseline.positionSignals||[]),...(baseline.signals||[])].map(s=>[s.symbol,s])).values()];
 if(!peers.length||peers.some(s=>!s.sector||!['return120Ex20','return60Ex5'].every(k=>Number.isFinite(s.researchFactors?.[k]))))throw new Error('Dated momentum reference inputs unavailable');
 const quote=buildHistoricalQuote({profile:{...classification,symbol},bar:bars.at(-1),history:bars,decisionAt:baseline.decisionAt});
 quote.entryTiming=analyzeEntryTiming(symbol,bars.slice(-220));
 const compiled=attachCrossSectionalResearchFactors([...peers.map(s=>({...s,...s.researchFactors})),quote]);
 const signal=compiled.find(s=>s.symbol===symbol),ranks={};
 for(const [id,config] of Object.entries(C1_FROZEN_OPTIONS)){
  const eligible=compiled.filter(s=>c1AccountRankEligible(s,config)&&!config.blockedSymbols.includes(s.symbol)).sort((a,b)=>b.researchFactors.momentumPercentile-a.researchFactors.momentumPercentile||a.symbol.localeCompare(b.symbol));
  const index=eligible.findIndex(s=>s.symbol===symbol);
  ranks[id]={rank:index>=0?index+1:eligible.length+1,eligible:index>=0,eligibleCount:eligible.length,peerCount:peers.length};
 }
 return {symbol,signal,ranks,close:accepted.close,sourceSessionDate:baseline.date,sourceHash,observedAt,historyFrom:bars[0].date,historyRows:bars.length};
}

export function c1AccountReviewBook(book,reviews=[]){
 if(!reviews.length)return book;
 if(!Array.isArray(reviews)||new Set(reviews.map(r=>r.sourceSessionDate)).size!==reviews.length||reviews.some(r=>!book.model.sessions.some(s=>s.date===r.sourceSessionDate)))throw new Error('Invalid private review session history');
 const dates=new Set();
 return {...book,model:{...book.model,sessions:book.model.sessions.map(session=>{
  const review=reviews.find(r=>r.sourceSessionDate===session.date);
  if(!review)return session;
  if(dates.has(session.date)||review.sourceHash!==book.captures.find(c=>c.sessionDate===session.date)?.hash||!Array.isArray(review.rows))throw new Error('Accepted holding rank input changed');
  dates.add(session.date);
  const seen=new Set();
  for(const row of review.rows){
   if(seen.has(row.symbol)||row.sourceHash!==review.sourceHash||row.sourceSessionDate!==session.date||row.signal?.symbol!==row.symbol||row.close!==session.prices.find(p=>p.symbol===row.symbol)?.close||session.universeSymbols.includes(row.symbol)||!session.legacyHoldingSignals?.some(s=>s.symbol===row.symbol)||!Object.keys(C1_FROZEN_OPTIONS).every(id=>Number.isSafeInteger(row.ranks?.[id]?.rank)&&row.ranks[id].rank>0))throw new Error('Invalid private holding rank review');
   seen.add(row.symbol);
  }
  return {...session,accountHoldingRanks:Object.fromEntries(review.rows.map(r=>[r.symbol,r.ranks])),accountHoldingSignals:review.rows.map(r=>r.signal)};
 })}};
}

import {useEffect,useState} from 'react';
import {c1ManualReviewCurrent} from '../lib/c1ManualRecommendations';
export default function C1AccountOpportunities({decision,openingPlan,openingError,manualRecommendations}){
 const [,expire]=useState(0);
 useEffect(()=>{
  const remaining=Date.parse(manualRecommendations?.validUntil)-Date.now();
  if(!Number.isFinite(remaining)||remaining<0)return;
  const timer=setTimeout(()=>expire(n=>n+1),Math.min(remaining+1,120001));
  return ()=>clearTimeout(timer);
 },[manualRecommendations?.validUntil]);
 const ready=Boolean(openingPlan)&&c1ManualReviewCurrent(manualRecommendations,decision);
 return <section className="card" aria-label="C1 account opportunities">
  <h2>C1 manual recommendations</h2>
  <p>Session: {decision.sourceSessionDate}. Available account cash: {decision.actualCash.toLocaleString('en-US',{style:'currency',currency:'USD'})}.</p>
  <p>{decision.explanation}</p>
  {decision.capitalHistory&&<details><summary>Account tracking started {decision.capitalHistory.asOfSession}</summary><p>{decision.capitalHistory.explanation}</p><p>Retained capital peak: ${decision.capitalHistory.retainedPeak.toFixed(2)}.</p></details>}
  {ready?<div><h3>Trades to review</h3><p>{manualRecommendations.reason}</p><p>Opening prices observed {manualRecommendations.observedAt}. Review expires {manualRecommendations.validUntil}. Refresh to recheck. No brokerage orders are submitted by this app.</p>
   {manualRecommendations.orders.length?<ul>{manualRecommendations.orders.map(o=><li key={o.id}>{o.condition?'Conditional stop — only if triggered: ':''}{o.side==='buy'?'Buy':'Sell'} {o.shares} {o.symbol} · {o.condition?'stop':'estimated opening'} price ${o.estimatedPrice.toFixed(2)}</li>)}</ul>:<p>No opening trades are recommended for this account.</p>}
  </div>:<p>{manualRecommendations?.status==='ready'?'Refresh to recheck the account and opening prices before reviewing quantities.':manualRecommendations?.reason||'Refresh for the current manual account review.'}</p>}
  {openingError&&<p>Opening plan unavailable: {openingError}</p>}
  {!decision.current?<p>Record outstanding session activity and refresh to update C1.</p>:decision.opportunities.length?
   <ol>{decision.opportunities.map(row=><li key={row.symbol}><strong>{row.symbol}</strong> — Entry candidate in {row.sleeves.length} C1 {row.sleeves.length===1?'sleeve':'sleeves'}; subject to opening checks.</li>)}</ol>:<p>No new entry is queued by C1 for this account.</p>}
 </section>;
}

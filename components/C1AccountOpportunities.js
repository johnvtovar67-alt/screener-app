import {useEffect,useState} from 'react';
import {c1ManualReviewCurrent,c1ManualOrdersForView} from '../lib/c1ManualRecommendations';
export default function C1AccountOpportunities({decision,openingPlan,openingError,manualRecommendations,view="opportunities"}){
 const [,expire]=useState(0);
 useEffect(()=>{
  const remaining=Date.parse(manualRecommendations?.validUntil)-Date.now();
  if(!Number.isFinite(remaining)||remaining<0)return;
  const timer=setTimeout(()=>expire(n=>n+1),Math.min(remaining+1,120001));
  return ()=>clearTimeout(timer);
 },[manualRecommendations?.validUntil]);
 const ready=Boolean(openingPlan)&&c1ManualReviewCurrent(manualRecommendations,decision);
 const portfolioOnly=view==='portfolio';
 const orders=c1ManualOrdersForView({review:manualRecommendations,decision,openingPlan,view});
 if(portfolioOnly&&!orders.length)return null;
 return <section className="card" aria-label="C1 account opportunities">
  <h2>{portfolioOnly?'C1 buys to review':'C1 Opportunities'}</h2>
  <p>Session: {decision.sourceSessionDate}. Available account cash: {decision.actualCash.toLocaleString('en-US',{style:'currency',currency:'USD'})}.</p>
  {!portfolioOnly&&<p>{decision.explanation}</p>}
  {!portfolioOnly&&decision.capitalHistory&&<details><summary>Account tracking started {decision.capitalHistory.asOfSession}</summary><p>{decision.capitalHistory.explanation}</p><p>Retained capital peak: ${decision.capitalHistory.retainedPeak.toFixed(2)}.</p></details>}
  {ready?<div><h3>Trades to review</h3><p>{manualRecommendations.reason}</p><p>Opening prices observed {manualRecommendations.observedAt}. Review expires {manualRecommendations.validUntil}. Refresh to recheck. No brokerage orders are submitted by this app.</p>
   {orders.length?<div className="c1Tiles">{orders.map(o=><article className="c1Tile" key={o.id}>
    <div className="c1TileHead"><h3>{o.symbol}</h3><span className={o.condition?'c1Label':'c1Label c1Checked'}>{o.condition?'Conditional stop':o.side==='buy'?'Buy · checks passed':'Sell · checks passed'}</span></div>
    <p className="c1Quantity">{o.shares} {o.shares===1?'share':'shares'}</p>
    <p>{o.condition?'Stop price':'Estimated opening price'}: ${o.estimatedPrice.toFixed(2)}</p>
    <p>{o.condition?'Only if the stop is triggered.':'Confirm the current execution price before placing your order.'}</p>
   </article>)}</div>:<p>No opening trades are recommended for this account.</p>}
  </div>:<p>{manualRecommendations?.status==='ready'?'Refresh to recheck the account and opening prices before reviewing quantities.':manualRecommendations?.reason||'Refresh for the current manual account review.'}</p>}
  {openingError&&<p>Opening plan unavailable: {openingError}</p>}
  {!portfolioOnly&&(!decision.current?<p>Record outstanding session activity and refresh to update C1.</p>:decision.opportunities.length?
   <div className="c1Tiles">{decision.opportunities.map(row=><article className="c1Tile" key={row.symbol}>
    <div className="c1TileHead"><h3>{row.symbol}</h3><span className="c1Label">Entry candidate</span></div>
    <p>Selected in {row.sleeves.length} C1 {row.sleeves.length===1?'sleeve':'sleeves'}.</p>
    <p>Awaiting opening price, cash and concentration checks.</p>
   </article>)}</div>:<p>No new entry is queued by C1 for this account.</p>)}
  <style jsx>{`
   .c1Tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:14px;margin:16px 0}
   .c1Tile{min-width:0;padding:18px;border:1px solid #dbe3ee;border-radius:14px;background:#fff;box-shadow:0 2px 6px #0f172a08}
   .c1TileHead{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
   .c1Tile h3{margin:0;font-size:22px;color:#111827}
   .c1Tile p{margin:12px 0 0;line-height:1.45;color:#53657f}
   .c1Label{border-radius:999px;padding:5px 9px;background:#eff6ff;color:#1e40af;font-size:12px;font-weight:700}
   .c1Checked{background:#dcfce7;color:#166534}
   .c1Tile .c1Quantity{font-size:24px;font-weight:800;color:#111827}
  `}</style>
 </section>;
}

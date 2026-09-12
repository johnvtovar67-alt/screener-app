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
 const buys=orders.filter(order=>order.side==='buy'&&!order.condition);
 const watch=decision.current&&!decision.accountMismatch?(decision.opportunities||[]).filter(row=>!buys.some(order=>order.symbol===row.symbol)):[];
 const otherOrders=orders.filter(order=>order.side!=='buy'||order.condition);
 if(portfolioOnly&&!buys.length)return null;
 const waitingReason=decision.accountMismatch?'Resolve the account differences above.':openingError?'Opening checks unavailable: '+openingError:manualRecommendations?.status==='ready'?'Refresh to recheck the account and opening prices.':manualRecommendations?.reason||'Refresh for the current account review.';
 return <section className="card" aria-label="C1 account opportunities">
  <h2>{portfolioOnly?'Buys to review':'Opportunities'}</h2>
  <p className="sub">Session: {decision.sourceSessionDate} · Available cash: {decision.actualCash.toLocaleString('en-US',{style:'currency',currency:'USD'})}</p>
  {buys.length?<>
   <div className="grid buyGrid">{buys.map(o=><article className="idea green" key={o.id}>
    <div className="top"><h3>{o.symbol}</h3><b className="pill green">Buy</b></div>
    <div className="price"><b>${o.estimatedPrice.toFixed(2)}</b><small>Opening price</small></div>
    <p className="why">Account, cash and opening checks passed for this quantity.</p>
    <div className="decision"><div><small>Timing</small><b>Review now</b></div><div><small>Size</small><b>{o.shares} {o.shares===1?'share':'shares'}</b></div><div><small>Execution</small><b>Manual</b></div></div>
    <div className="plan"><small>Plan</small><b>Confirm the current execution price and available cash before placing your order.</b></div>
   </article>)}</div>
  </>:<div className="emptyState"><b>No Buy recommendation is ready.</b><span>{ready?'No new purchase passed the account opening checks.':waitingReason}</span></div>}
  {!portfolioOnly&&watch.length>0&&<div className="watchList"><h3>Watch</h3><ul>{watch.map(row=><li key={row.symbol}><strong>{row.symbol}</strong><span>Awaiting account and opening checks</span></li>)}</ul></div>}
  {!portfolioOnly&&otherOrders.length>0&&<div><h3>Existing position actions</h3><ul>{otherOrders.map(o=><li key={o.id}>{o.symbol}: {o.condition?'conditional stop — only if triggered, ':''}{o.side==='sell'?'sell':'buy'} {o.shares} {o.shares===1?'share':'shares'} at {o.condition?'stop':'estimated opening'} price ${o.estimatedPrice.toFixed(2)}.</li>)}</ul></div>}
  {ready&&orders.length>0&&<p className="sub">Review expires {new Date(manualRecommendations.validUntil).toLocaleTimeString([], {hour:'numeric',minute:'2-digit',second:'2-digit'})}. Refresh to recheck. Orders are placed manually.</p>}
  <style jsx>{`.buyGrid{grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))}.price small{font-size:12px;color:#64748b}.watchList{margin-top:22px}.watchList ul{list-style:none;padding:0;margin:0}.watchList li{display:flex;justify-content:space-between;gap:14px;padding:10px 0;border-top:1px solid #dbe3ee}.watchList span{font-size:13px;color:#53657f;text-align:right}`}</style>
 </section>;
}

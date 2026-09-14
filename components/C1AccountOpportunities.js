import {classifyC1StockScreen} from '../lib/c1StockClassification';
import {c1WatchPresentation,c1OpportunityPresentation} from '../lib/c1EntryReview';
import {useEffect,useState} from 'react';
import {c1OrderDisplayGroups} from '../lib/c1OrderDisplay';
import {c1ManualReviewCurrent,c1ManualOrdersForView} from '../lib/c1ManualRecommendations';
export default function C1AccountOpportunities({decision,openingPlan,openingError,manualRecommendations,screenRows=[],screenCurrent=false,view="opportunities"}){
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
 const buys=c1OrderDisplayGroups(orders.filter(order=>order.side==='buy'&&!order.condition));
 const positionOrders=portfolioOnly?c1OrderDisplayGroups(c1ManualOrdersForView({review:manualRecommendations,decision,openingPlan,view:'opportunities'}).filter(order=>order.side==='sell'&&!order.condition)):[];
 const exits=positionOrders;
 if(portfolioOnly&&!buys.length&&!positionOrders.length)return null;
 const waitingReason=decision.accountMismatch?'Resolve the differences in Account settings.':openingError?'Opening checks unavailable: '+openingError:manualRecommendations?.status==='ready'?'Refresh to recheck the account and opening prices.':manualRecommendations?.reason||'Refresh for the current account review.';
 const ratedRows=classifyC1StockScreen({snapshot:decision.stockScreen,rows:screenRows,current:screenCurrent&&decision.current&&decision.stockScreen?.sourceSessionDate===decision.sourceSessionDate});
 const ratedDecision={...decision,opportunities:ratedRows};
 const presentation=c1OpportunityPresentation({decision:ratedDecision,buys,plan:openingPlan,ready,waitingReason});
 const watch=presentation.watch;
 const watchView=c1WatchPresentation({rows:watch,plan:openingPlan,ready,waitingReason});
 return <><section className={portfolioOnly?"card rotationBox":"card"} aria-label={portfolioOnly?"Portfolio actions":"C1 account opportunities"}>
  <h2>{portfolioOnly?'Portfolio actions':'Opportunities'}</h2>
  <p className="sub">Model close: {decision.sourceSessionDate} · Available cash: {decision.actualCash.toLocaleString('en-US',{style:'currency',currency:'USD'})}</p>
  {!portfolioOnly&&presentation.tiles.length>0?<div className="grid buyGrid">{presentation.tiles.map(tile=><article className="idea green" key={tile.symbol}>
   <div className="top"><h3>{tile.symbol}</h3><b className="pill green">{tile.rating}</b></div>
   <p className="sub">{tile.entryEvidence?.sector||'Sector unavailable'} · C1 rating as of {decision.sourceSessionDate}</p>
   <div className="price"><b>{Number.isFinite(tile.entryEvidence?.close)?'$'+tile.entryEvidence.close.toFixed(2):'Unavailable'}</b><small>Model close</small></div>
   <p className="why">Momentum score: {Number.isFinite(tile.entryEvidence?.momentumScore)?tile.entryEvidence.momentumScore.toFixed(1)+'/100':'Unavailable'}</p>
   <div className="plan"><small>Your next action</small><b>{tile.accountAction}</b><p>{tile.detail}</p>{tile.order&&<p>Estimated price ${tile.order.estimatedPrice.toFixed(2)}. Confirm the current execution price before placing your order.</p>}</div>
  </article>)}</div>:portfolioOnly&&buys.length?<>
   <div className="grid buyGrid">{buys.map(o=><article className="idea green" key={o.id}>
    <div className="top"><h3>{o.symbol}</h3><b className="pill green">{decision.positions.some(p=>p.symbol===o.symbol)?'Add':'Buy'}</b></div>
    <div className="price"><b>${o.estimatedPrice.toFixed(2)}</b><small>Opening price</small></div>
    <p className="why">Account, cash and opening checks passed for this quantity.</p>
    <div className="decision"><div><small>Timing</small><b>Review now</b></div><div><small>Size</small><b>{o.shares} {o.shares===1?'share':'shares'}</b></div><div><small>Execution</small><b>Manual</b></div></div>
    <div className="plan"><small>Plan</small><b>Confirm the current execution price and available cash before placing your order.</b></div>
   </article>)}</div>
  </>:!portfolioOnly&&<div className="emptyState"><b>No C1 Buy ratings right now.</b>{!ready&&<span>{waitingReason}</span>}</div>}
  {exits.length>0&&<div><h3>Exits to review</h3><ul>{exits.map(o=><li key={o.id}><b>{o.symbol}</b>: sell {o.shares} {o.shares===1?'share':'shares'}; estimated opening price ${o.estimatedPrice.toFixed(2)}. Check the current broker price.</li>)}</ul></div>}
  {ready&&(buys.length>0||positionOrders.length>0)&&<p className="sub">Checked quantities expire {new Date(manualRecommendations.validUntil).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}. Refresh to recheck.</p>}
 </section>
 {!portfolioOnly&&<section className="card" aria-label="Watch opportunities">
  <h2>🟡 Watch</h2>
  <p className="sub">Candidates awaiting a C1 Buy rating · {decision.sourceSessionDate}</p>
  {watchView.shared&&<p className="sub"><b>{watchView.shared.why}</b> {watchView.shared.next}</p>}
  {watch.length?<div className="scroll"><table><thead><tr><th>Priority</th><th>Stock / Sector</th><th>Momentum score</th><th>Model close</th>{!watchView.shared&&<th>Entry check</th>}</tr></thead><tbody>{watchView.rows.map(row=><tr key={row.symbol}><td>{row.priority}</td><td><b>{row.symbol}</b><div>{row.sector}</div></td><td>{row.momentum}</td><td>{row.close}</td>{!watchView.shared&&<td>{row.review.why} {row.review.next}</td>}</tr>)}</tbody></table></div>:<div className="emptyState"><b>{decision.current&&!decision.accountMismatch?'No additional Watch candidates.':'Watch list unavailable until the account analysis is current.'}</b></div>}

 </section>}
 <style jsx>{`.buyGrid{grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))}.price small{font-size:12px;color:#64748b}`}</style>
 </>;
}

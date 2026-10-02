import {classifyC1StockScreen} from '../lib/c1StockClassification';
import {c1WatchPresentation,c1OpportunityPresentation} from '../lib/c1EntryReview';
import {useEffect,useState} from 'react';
import {c1OrderDisplayGroups} from '../lib/c1OrderDisplay';
import {c1ManualReviewCurrent,c1ManualOrdersForView} from '../lib/c1ManualRecommendations';
export default function C1AccountOpportunities({decision,openingPlan,openingError,manualRecommendations,screenRows=[],screenCurrent=false,portfolio=[],view="opportunities"}){
 const [,expire]=useState(0);
 useEffect(()=>{
  const remaining=Date.parse(manualRecommendations?.validUntil)-Date.now();
  if(!Number.isFinite(remaining)||remaining<0)return;
  const timer=setTimeout(()=>expire(n=>n+1),Math.min(remaining+1,120001));
  return ()=>clearTimeout(timer);
 },[manualRecommendations?.validUntil]);
 const ready=Boolean(openingPlan)&&c1ManualReviewCurrent(manualRecommendations,decision);
 const portfolioOnly=view==='portfolio';
 const ratedRows=classifyC1StockScreen({snapshot:decision.stockScreen,rows:screenRows,current:screenCurrent&&decision.current&&decision.stockScreen?.sourceSessionDate===decision.sourceSessionDate});
 const currentBuySymbols=new Set(ratedRows.filter(row=>['Buy','Strong Buy'].includes(row.rating)).map(row=>row.symbol));
 const orders=c1ManualOrdersForView({review:manualRecommendations,decision,openingPlan,view});
 const rawBuys=orders.filter(order=>order.side==='buy'&&!order.condition);
 const buys=c1OrderDisplayGroups(portfolioOnly?rawBuys.filter(order=>currentBuySymbols.has(order.symbol)):rawBuys);
 const positionOrders=portfolioOnly?c1OrderDisplayGroups(c1ManualOrdersForView({review:manualRecommendations,decision,openingPlan,view:'opportunities'}).filter(order=>order.side==='sell'&&!order.condition)):[];
 const exits=positionOrders;
 if(portfolioOnly&&!buys.length&&!positionOrders.length)return null;
 const waitingReason=decision.accountMismatch?'Resolve the differences in Account settings.':openingError?'Opening checks unavailable: '+openingError:manualRecommendations?.status==='ready'?'Refresh to recheck the account and opening prices.':manualRecommendations?.reason||'Refresh for the current account review.';
 const ratedDecision={...decision,opportunities:ratedRows};
 const presentation=c1OpportunityPresentation({decision:ratedDecision,buys,plan:openingPlan,ready,waitingReason});
 const watch=presentation.watch;
 const screenSymbols=new Set(screenRows.map(row=>String(row?.symbol||row?.ticker||'').toUpperCase()));
 const verifiedScreen=screenCurrent===true;
 const currentWatch=watch.filter(row=>screenSymbols.has(row.symbol));
 const priorWatch=verifiedScreen?watch.filter(row=>!screenSymbols.has(row.symbol)):[];
 const pendingWatch=verifiedScreen?[]:watch.filter(row=>!screenSymbols.has(row.symbol));
 const pendingWatchView=c1WatchPresentation({rows:pendingWatch,plan:openingPlan,ready:false,waitingReason:'Current screen verification is pending.'});
 const currentWatchView=c1WatchPresentation({rows:currentWatch,plan:openingPlan,ready,waitingReason});
 const priorWatchView=c1WatchPresentation({rows:priorWatch,plan:openingPlan,ready,waitingReason});
 const heldSymbols=new Set([
  ...(decision.positions||[]).map(position=>String(position?.symbol||'').toUpperCase()),
  ...(portfolio||[]).filter(position=>position?.role==='Swing'&&Number(position?.shares)>0).map(position=>String(position?.symbol||'').toUpperCase())
 ]);
 let nextWatchPriority=presentation.tiles.length;
 const watchView={
  shared:null,
  rows:[
   ...currentWatchView.rows.map((row,index)=>{
    const held=heldSymbols.has(String(row.symbol||'').toUpperCase());
    const momentumRankText=held&&currentWatch[index]?.screenReview?.why?currentWatch[index].screenReview.why.split(';')[0]+'.':'';
    return {...row,priority:held?'Held':++nextWatchPriority,review:held?{why:['Current C1 holding.',momentumRankText].filter(Boolean).join(' '),next:'Portfolio rules govern Hold/Add/Exit; this is not a new-entry queue position.'}:row.review};
   }),
   ...priorWatchView.rows.map((row,index)=>({...row,priority:'—',review:{why:'Prior signal #'+(priorWatch[index]?.priority+1)+' — currently ineligible.',next:'Does not currently qualify for a new C1 entry.'}})),
   ...pendingWatchView.rows.map(row=>({...row,priority:'—',review:{why:'Last verified C1 signal retained — current verification is pending.',next:'No eligibility change is recorded until a complete verified screen succeeds.'}}))
  ]
 };
 return <><section className={portfolioOnly?"card rotationBox":"card"} aria-label={portfolioOnly?"Portfolio actions":"C1 account opportunities"}>
  <h2>{portfolioOnly?'Portfolio actions':'Opportunities'}</h2>
  <p className="sub">Signals based on {decision.sourceSessionDate} close · Available cash: {decision.actualCash.toLocaleString('en-US',{style:'currency',currency:'USD'})}</p>
  {exits.length>0&&<div><h3>Exits to review</h3><ul>{exits.map(o=><li key={o.id}><b>{o.symbol}</b>: sell {o.shares} {o.shares===1?'share':'shares'}; estimated opening price ${o.estimatedPrice.toFixed(2)}. Check the current broker price.</li>)}</ul></div>}
  {ready&&buys.length>0&&(exits.length>0||orders.some(order=>order.side==='sell'&&!order.condition))&&<p className="actionHelp">Complete the C1 exits before replacement purchases. Buy quantities assume those sales; check the proceeds and current prices first.</p>}
  {!portfolioOnly&&presentation.tiles.length>0?<div className="grid buyGrid">{presentation.tiles.map(tile=><article className="idea green" key={tile.symbol}>
   <div className="top"><h3>{tile.symbol}</h3><b className="pill green">{tile.rating}</b></div>
   <p className="sub">{tile.entryEvidence?.sector||'Sector unavailable'} · C1 rating as of {decision.sourceSessionDate}</p>
   <div className="price"><b>{Number.isFinite(tile.entryEvidence?.close)?'$'+tile.entryEvidence.close.toFixed(2):'Unavailable'}</b><small>Signal closing price</small></div>
   <p className="why">Momentum score: {Number.isFinite(tile.entryEvidence?.momentumScore)?tile.entryEvidence.momentumScore.toFixed(1)+'/100':'Unavailable'}</p>
   <div className="plan"><small>Your next action</small><b>{tile.accountAction}</b><p>{tile.accountAction==='Hold'&&heldSymbols.has(String(tile.symbol||'').toUpperCase())?'Current C1 holding. The stock remains Buy-rated, but no additional purchase quantity is authorized right now. Any Add must pass the current account and opening checks during regular market hours.':tile.detail}</p>{tile.order&&<p>Estimated price ${tile.order.estimatedPrice.toFixed(2)}. Confirm the current execution price before placing your order.</p>}</div>
  </article>)}</div>:portfolioOnly&&buys.length?<>
   <div className="grid buyGrid">{buys.map(o=><article className="idea green" key={o.id}>
    <div className="top"><h3>{o.symbol}</h3><b className="pill green">{decision.positions.some(p=>p.symbol===o.symbol)?'Add':'Buy'}</b></div>
    <div className="price"><b>${o.estimatedPrice.toFixed(2)}</b><small>Opening reference price</small></div>
    <p className="why">Account, cash and opening checks passed for this quantity.</p>
    <div className="plan"><small>C1 recommendation</small><b>{decision.positions.some(p=>p.symbol===o.symbol)?'Add':'Buy'} {o.shares} {o.shares===1?'share':'shares'} of {o.symbol}</b></div>
    <p>Check the current price and available cash at your broker before submitting. After purchase, record the shares and fill price in the screener.</p>
   </article>)}</div>
  </>:!portfolioOnly&&<div className="emptyState"><b>{decision.current?'No C1 Buy ratings right now.':'C1 ratings awaiting update.'}</b>{!ready&&<span>{waitingReason}</span>}</div>}

  {ready&&(buys.length>0||positionOrders.length>0)&&<p className="sub">Refresh after {new Date(manualRecommendations.validUntil).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})} to update the recommendation.</p>}
 </section>
 {!portfolioOnly&&<section className="card" aria-label="Watch opportunities">
  <h2>🟡 Watch</h2>
  <p className="sub">Candidates awaiting a C1 Buy rating · {decision.sourceSessionDate}</p>
  {watch.length?<div className="scroll"><table><thead><tr><th>Priority</th><th>Stock / Sector</th><th>Momentum score</th><th>Signal closing price</th><th>Entry check</th></tr></thead><tbody>{watchView.rows.map(row=><tr key={row.symbol}><td>{row.priority}</td><td><b>{row.symbol}</b><div>{row.sector}</div></td><td>{row.momentum}</td><td>{row.close}</td><td>{row.review.why} {row.review.next}</td></tr>)}</tbody></table></div>:<div className="emptyState"><b>{decision.current&&!decision.accountMismatch?'No additional Watch candidates.':'Watch list unavailable until the account analysis is current.'}</b></div>}

 </section>}
 <style jsx>{`.buyGrid{grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))}.price small{font-size:12px;color:#64748b}`}</style>
 </>;
}

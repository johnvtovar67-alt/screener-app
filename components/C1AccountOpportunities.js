import {c1ScreenEvidenceKey,readC1ScreenEvidence,writeC1ScreenEvidence,resolveC1ScreenEvidence} from '../lib/c1ScreenEvidence';
import {c1WatchPresentation,c1OpportunityPresentation} from '../lib/c1EntryReview';
import {useEffect,useRef,useState} from 'react';
import {c1OrderDisplayGroups} from '../lib/c1OrderDisplay';
import {c1ManualReviewCurrent,c1ManualOrdersForView} from '../lib/c1ManualRecommendations';
import {c1PositionPresentation} from '../lib/c1PositionPresentation';
export default function C1AccountOpportunities({decision,executionDecision=decision,openingPlan,openingError,manualRecommendations,screenRows=[],positionRows=[],screenCurrent=false,portfolio=[],view="opportunities"}){
 const [,expire]=useState(0);
 useEffect(()=>{
  const remaining=Date.parse(manualRecommendations?.validUntil)-Date.now();
  if(!Number.isFinite(remaining)||remaining<0)return;
  const timer=setTimeout(()=>expire(n=>n+1),Math.min(remaining+1,120001));
  return ()=>clearTimeout(timer);
 },[manualRecommendations?.validUntil]);
 const lastVerified=useRef(null);
 const sourceKey=c1ScreenEvidenceKey(decision);
 const [restored,setRestored]=useState({key:null,value:null});
 const cacheReady=typeof window==='undefined'||restored.key===sourceKey;
 useEffect(()=>{if(typeof window!=='undefined'){let value=null;try{value=readC1ScreenEvidence(window.localStorage,decision);}catch{}setRestored({key:sourceKey,value});}},[sourceKey]);
 const evidence=resolveC1ScreenEvidence({decision,rows:screenRows,current:screenCurrent&&cacheReady,previous:lastVerified.current?.key===sourceKey?lastVerified.current:restored.value});
 useEffect(()=>{if(evidence.verified){lastVerified.current=evidence;if(typeof window!=='undefined')try{writeC1ScreenEvidence(window.localStorage,evidence);}catch{}}},[evidence]);
 const ready=!evidence.pending&&Boolean(openingPlan)&&c1ManualReviewCurrent(manualRecommendations,executionDecision);
 const portfolioOnly=view==='portfolio';
 const ratedRows=evidence.ratings;
 const currentBuySymbols=new Set(evidence.buySymbols);
 const orders=c1ManualOrdersForView({review:manualRecommendations,decision:executionDecision,openingPlan,view});
 const rawBuys=orders.filter(order=>order.side==='buy'&&!order.condition&&currentBuySymbols.has(order.symbol));
 const buys=c1OrderDisplayGroups(portfolioOnly?rawBuys.filter(order=>currentBuySymbols.has(order.symbol)):rawBuys);
 const positionOrders=portfolioOnly?c1OrderDisplayGroups(c1ManualOrdersForView({review:manualRecommendations,decision:executionDecision,openingPlan,view:'opportunities'}).filter(order=>order.side==='sell'&&!order.condition)):[];
 const exits=positionOrders;
 if(portfolioOnly&&!buys.length&&!positionOrders.length)return null;
 const waitingReason=evidence.pending?evidence.reason:decision.accountMismatch?'Resolve the differences in Account settings.':openingError?'Opening checks unavailable: '+openingError:manualRecommendations?.status==='ready'?'Refresh to recheck the account and opening prices.':manualRecommendations?.reason||'Refresh for the current account review.';
 const ratedDecision={...decision,opportunities:ratedRows};
 const presentation=c1OpportunityPresentation({decision:ratedDecision,buys,plan:openingPlan,ready,waitingReason});
 const heldSymbols=new Set([
  ...(decision.positions||[]).map(position=>String(position?.symbol||'').toUpperCase()),
  ...(portfolio||[]).filter(position=>position?.role==='Swing'&&Number(position?.shares)>0).map(position=>String(position?.symbol||'').toUpperCase())
 ]);
 const holdingPresentation=symbol=>heldSymbols.has(String(symbol||'').toUpperCase())?c1PositionPresentation({decision,
  position:decision.positions?.find(position=>position.symbol===symbol),symbol,
  stock:positionRows.find(row=>(row.symbol||row.ticker)===symbol)||screenRows.find(row=>(row.symbol||row.ticker)===symbol),
  executionDecision,openingPlan,manualRecommendations,checkedAddOrders:rawBuys,now:new Date()}):null;
 // A stock rating is not purchase authority. Keep the original ranked selection
 // intact, but show a green opportunity only for an existing checked quantity.
 const actionableTiles=presentation.tiles.filter(tile=>{
  const held=holdingPresentation(tile.symbol);
  return ready&&tile.order&&(!held||held.canAdd);
 });
 const actionableSymbols=new Set(actionableTiles.map(tile=>tile.symbol));
 const watch=[...presentation.tiles.filter(tile=>!actionableSymbols.has(tile.symbol)).map(tile=>({...tile,
  screenReview:{why:tile.detail,next:''}})),...presentation.watch];
 const currentWatchView=c1WatchPresentation({rows:watch,plan:openingPlan,ready,waitingReason});
 let nextWatchPriority=actionableTiles.length;
 const watchView={rows:currentWatchView.rows.map((row,index)=>({
  ...row,rating:watch[index]?.rating,priority:heldSymbols.has(String(row.symbol||'').toUpperCase())?'Held':++nextWatchPriority,
  holding:holdingPresentation(row.symbol),review:evidence.pending?{why:evidence.reason,next:'Fresh capital is paused.'}:row.review
 }))};
 return <><section className={portfolioOnly?"card rotationBox":"card"} aria-label={portfolioOnly?"Portfolio actions":"C1 account opportunities"}>
  <h2>{portfolioOnly?'Portfolio actions':'Opportunities'}</h2>
  {!portfolioOnly&&evidence.pending&&<p role="status">{evidence.reason}</p>}
  <p className="sub">Signals based on {decision.sourceSessionDate} close · C1 strategy cash: {Number.isFinite(decision.strategyCash)?decision.strategyCash.toLocaleString('en-US',{style:'currency',currency:'USD'}):'Unavailable'} · Brokerage cash: {Number.isFinite(decision.brokerageCash)?decision.brokerageCash.toLocaleString('en-US',{style:'currency',currency:'USD'}):'Not entered'} · Available to deploy: {Number.isFinite(decision.executableCash)?decision.executableCash.toLocaleString('en-US',{style:'currency',currency:'USD'}):'$0.00'}</p>
  {decision.brokerageCashCurrent===false&&<p role="status">{decision.brokerageCashReason||'Update brokerage cash in My Portfolio before a new C1 purchase.'}</p>}
  {exits.length>0&&<div><h3>Sell decisions</h3><ul>{exits.map(o=>{const held=holdingPresentation(o.symbol);return <li key={o.id}><b>{o.symbol}: {held?.label||'SELL'}</b><p>{held?.reason||'An existing exit is pending.'}</p><details><summary>Details</summary><p>Sell {o.shares} {o.shares===1?'share':'shares'}; estimated opening price ${o.estimatedPrice.toFixed(2)}.</p><p>{held?.detail}</p><p>Check the current broker price; no broker order has been placed by C1.</p></details></li>;})}</ul></div>}
  {ready&&buys.length>0&&(exits.length>0||orders.some(order=>order.side==='sell'&&!order.condition))&&<p className="actionHelp">Complete the C1 exits before replacement purchases. Buy quantities assume those sales; check the proceeds and current prices first.</p>}
  {!portfolioOnly&&actionableTiles.length>0?<div className="grid buyGrid">{actionableTiles.map(tile=>{const held=holdingPresentation(tile.symbol);return <article className="idea green" key={tile.symbol}>
   <div className="top"><h3>{tile.symbol}</h3><b className="pill green">{held?'ADD':tile.rating.toUpperCase()}</b></div>
   <p className="sub">Ranked {tile.rating} · {tile.entryEvidence?.sector||'Sector unavailable'}</p>
   <div className="price"><b>${tile.order.estimatedPrice.toFixed(2)}</b><small>Verified opening reference</small></div>
   <div className="plan"><b>{held?'ADD':'BUY'} {tile.order.shares} {tile.order.shares===1?'share':'shares'} of {tile.symbol}</b><p>Account, cash and opening checks passed for this quantity.</p></div>
   {held&&<p className="holdingAction"><b>{held.label}</b> · {held.reason}</p>}
   <details><summary>Details</summary><p>Signal close {Number.isFinite(tile.entryEvidence?.close)?'$'+tile.entryEvidence.close.toFixed(2):'unavailable'} · Momentum score {Number.isFinite(tile.entryEvidence?.momentumScore)?tile.entryEvidence.momentumScore.toFixed(1)+'/100':'unavailable'} · {decision.sourceSessionDate}</p><p>Check the current broker price and cash before placing an order; C1 has not placed a broker order.</p></details>
  </article>;})}</div>:portfolioOnly&&buys.length?<>
   <div className="grid buyGrid">{buys.map(o=>{const held=holdingPresentation(o.symbol);if(held&&!held.canAdd)return null;return <article className="idea green" key={o.id}>
    <div className="top"><h3>{o.symbol}</h3><b className="pill green">{held?'ADD':'BUY'}</b></div>
    <div className="price"><b>${o.estimatedPrice.toFixed(2)}</b><small>Verified opening reference</small></div>
    <div className="plan"><b>{held?'ADD':'BUY'} {o.shares} {o.shares===1?'share':'shares'} of {o.symbol}</b><p>Account, cash and opening checks passed for this quantity.</p></div>
    {held&&<p className="holdingAction"><b>{held.label}</b> · {held.reason}</p>}
    <details><summary>Details</summary><p>Check the current price and available cash at your broker before submitting; after purchase, record the shares and fill price in the screener.</p></details>
   </article>;})}</div>
  </>:!portfolioOnly&&<div className="emptyState"><b>{decision.current?'No actionable C1 purchases right now.':'C1 ratings awaiting update.'}</b>{!ready&&<span>{waitingReason}</span>}</div>}

  {ready&&(buys.length>0||positionOrders.length>0)&&<p className="sub">Refresh after {new Date(manualRecommendations.validUntil).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})} to update the recommendation.</p>}
 </section>
 {!portfolioOnly&&<section className="card" aria-label="Watch opportunities">
  <h2>🟡 Watch</h2>
  <p className="sub">Rankings remain visible when signal or account checks do not authorize a purchase · {decision.sourceSessionDate}</p>
  {watch.length?<div className="scroll watchScroll"><table className="watchTable"><thead><tr><th>Priority</th><th>Stock / Sector</th><th>Momentum score</th><th>Signal closing price</th><th>Action / Entry check</th></tr></thead><tbody>{watchView.rows.map(row=><tr key={row.symbol}><td>{row.priority}</td><td><b>{row.symbol}</b><div>{row.sector}</div><small>Ranked {row.rating||'Watch'}</small><small className="watchMobileEvidence">Score {row.momentum} · Signal {row.close}</small></td><td>{row.momentum}</td><td>{row.close}</td><td className={row.holding?.label==='VERIFY STOP URGENTLY'?'urgentAction':''}><b>{row.holding?.label||'WATCH / NO PURCHASE'}</b><div>{row.holding?.reason||row.review.why}</div>{row.holding&&<small className="quoteTime">Last verified quote: {row.holding.lastVerifiedQuoteAt?new Date(row.holding.lastVerifiedQuoteAt).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit'}):'unavailable'}{row.holding.quoteVerified?' · regular session':' · current verification unavailable'}</small>}{row.holding?.label==='VERIFY STOP URGENTLY'&&<strong>URGENT VERIFICATION REQUIRED</strong>}{row.holding?.detail&&row.holding.detail!==row.holding.reason&&<details><summary>Details</summary><p>{row.holding.detail}</p></details>}</td></tr>)}</tbody></table></div>:<div className="emptyState"><b>{decision.current&&!decision.accountMismatch?'No additional Watch candidates.':'Watch list unavailable until the account analysis is current.'}</b></div>}

 </section>}
 <style jsx>{`.buyGrid{grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))}.price small{font-size:12px;color:#64748b}.holdingAction{font-size:12px;color:#475569}.quoteTime{display:block;font-size:11px;color:#64748b;overflow-wrap:anywhere}details summary{cursor:pointer;color:#475569;font-size:12px}details p{font-size:12px;color:#475569}.urgentAction{background:#fff1f2;color:#9f1239}.urgentAction strong{display:block;font-size:11px}.watchMobileEvidence{display:none}@media(max-width:700px){.watchScroll{width:100%;min-width:0;max-width:100%}.watchTable{table-layout:fixed;width:100%;min-width:0}.watchTable th,.watchTable td{padding:8px 6px;white-space:normal;overflow-wrap:anywhere}.watchTable th:nth-child(1),.watchTable td:nth-child(1),.watchTable th:nth-child(3),.watchTable td:nth-child(3),.watchTable th:nth-child(4),.watchTable td:nth-child(4){display:none}.watchTable th:nth-child(2),.watchTable td:nth-child(2){width:30%}.watchTable th:nth-child(5),.watchTable td:nth-child(5){width:70%}.watchMobileEvidence{display:block;font-size:11px;color:#64748b}}`}</style>
 </>;
}

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
 const watch=presentation.watch;
 const currentWatch=watch;
 const currentWatchView=c1WatchPresentation({rows:currentWatch,plan:openingPlan,ready,waitingReason});
 const heldSymbols=new Set([
  ...(decision.positions||[]).map(position=>String(position?.symbol||'').toUpperCase()),
  ...(portfolio||[]).filter(position=>position?.role==='Swing'&&Number(position?.shares)>0).map(position=>String(position?.symbol||'').toUpperCase())
 ]);
 const holdingPresentation=symbol=>heldSymbols.has(String(symbol||'').toUpperCase())?c1PositionPresentation({decision,
  position:decision.positions?.find(position=>position.symbol===symbol),symbol,
  stock:positionRows.find(row=>(row.symbol||row.ticker)===symbol)||screenRows.find(row=>(row.symbol||row.ticker)===symbol),
  executionDecision,openingPlan,manualRecommendations,checkedAddOrders:rawBuys,now:new Date()}):null;
 let nextWatchPriority=presentation.tiles.length;
 const watchView={
  shared:null,
  rows:[
   ...currentWatchView.rows.map((row,index)=>{
    const held=heldSymbols.has(String(row.symbol||'').toUpperCase());
    return {...row,priority:held?'Held':++nextWatchPriority,holding:holdingPresentation(row.symbol),review:evidence.pending?{why:evidence.reason,next:'Fresh capital is paused.'}:row.review};
   }),
  ]
 };
 return <><section className={portfolioOnly?"card rotationBox":"card"} aria-label={portfolioOnly?"Portfolio actions":"C1 account opportunities"}>
  <h2>{portfolioOnly?'Portfolio actions':'Opportunities'}</h2>
  {!portfolioOnly&&evidence.pending&&<p role="status">{evidence.reason}</p>}
  <p className="sub">Signals based on {decision.sourceSessionDate} close · C1 strategy cash: {Number.isFinite(decision.strategyCash)?decision.strategyCash.toLocaleString('en-US',{style:'currency',currency:'USD'}):'Unavailable'} · Brokerage cash: {Number.isFinite(decision.brokerageCash)?decision.brokerageCash.toLocaleString('en-US',{style:'currency',currency:'USD'}):'Not entered'} · Available to deploy: {Number.isFinite(decision.executableCash)?decision.executableCash.toLocaleString('en-US',{style:'currency',currency:'USD'}):'$0.00'}</p>
  {decision.brokerageCashCurrent===false&&<p role="status">{decision.brokerageCashReason||'Update brokerage cash in My Portfolio before a new C1 purchase.'}</p>}
  {exits.length>0&&<div><h3>Sell decisions</h3><ul>{exits.map(o=>{const held=holdingPresentation(o.symbol);return <li key={o.id}><b>{o.symbol}: {held?.label||'SELL'}</b><p>{held?.reason||'An existing exit is pending.'}</p><details><summary>Details</summary><p>Sell {o.shares} {o.shares===1?'share':'shares'}; estimated opening price ${o.estimatedPrice.toFixed(2)}.</p><p>{held?.detail}</p><p>Check the current broker price; no broker order has been placed by C1.</p></details></li>;})}</ul></div>}
  {ready&&buys.length>0&&(exits.length>0||orders.some(order=>order.side==='sell'&&!order.condition))&&<p className="actionHelp">Complete the C1 exits before replacement purchases. Buy quantities assume those sales; check the proceeds and current prices first.</p>}
  {!portfolioOnly&&presentation.tiles.length>0?<div className="grid buyGrid">{presentation.tiles.map(tile=>{const held=holdingPresentation(tile.symbol);return <article className="idea" key={tile.symbol}>
   <div className="top"><h3>{tile.symbol}</h3><b className={`pill ${held?.action==='Sell'?'red':held?'yellow':'green'}`}>{held?.label||tile.accountAction.toUpperCase()}</b></div>
   <p>{held?.reason||(tile.order?'Account, cash and opening checks passed for this purchase.':'No purchase quantity is authorized by the current account checks.')}</p>
   {tile.order&&(!held||held.canAdd)&&<div className="plan"><b>{held?'ADD':'BUY'} {tile.order.shares} {tile.order.shares===1?'share':'shares'} of {tile.symbol}</b><p>Check the current broker price and cash before placing this separate capital proposal.</p></div>}
   <details><summary>Details</summary><p>{tile.rating} · {tile.entryEvidence?.sector||'Sector unavailable'} · C1 rating as of {decision.sourceSessionDate}</p>
    <p>Signal closing price: {Number.isFinite(tile.entryEvidence?.close)?'$'+tile.entryEvidence.close.toFixed(2):'Unavailable'} · Momentum score: {Number.isFinite(tile.entryEvidence?.momentumScore)?tile.entryEvidence.momentumScore.toFixed(1)+'/100':'Unavailable'}</p>
    <p>{held?.detail||tile.detail}</p>{tile.order&&<p>Estimated price ${tile.order.estimatedPrice.toFixed(2)}; confirm the current execution price before placing your order.</p>}
   </details>
  </article>;})}</div>:portfolioOnly&&buys.length?<>
   <div className="grid buyGrid">{buys.map(o=>{const held=holdingPresentation(o.symbol);if(held&&!held.canAdd)return null;return <article className="idea green" key={o.id}>
    <div className="top"><h3>{o.symbol}</h3><b className="pill green">{held?'ADD':'BUY'} {o.shares} {o.shares===1?'share':'shares'}</b></div>
    <p>Account, cash and opening checks passed for this {held?'separate addition':'purchase'}.</p>
    <details><summary>Details</summary><p>Opening reference price ${o.estimatedPrice.toFixed(2)}.</p><p>Check the current price and available cash at your broker before submitting; after purchase, record the shares and fill price in the screener.</p></details>
   </article>;})}</div>
  </>:!portfolioOnly&&<div className="emptyState"><b>{decision.current?'No C1 Buy ratings right now.':'C1 ratings awaiting update.'}</b>{!ready&&<span>{waitingReason}</span>}</div>}

  {ready&&(buys.length>0||positionOrders.length>0)&&<p className="sub">Refresh after {new Date(manualRecommendations.validUntil).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})} to update the recommendation.</p>}
 </section>
 {!portfolioOnly&&<section className="card" aria-label="Watch opportunities">
  <h2>🟡 Watch</h2>
  <p className="sub">Candidates awaiting a C1 Buy rating · {decision.sourceSessionDate}</p>
  {watch.length?<div className="scroll"><table><thead><tr><th>Priority</th><th>Stock</th><th>Decision</th><th>Details</th></tr></thead><tbody>{watchView.rows.map(row=><tr key={row.symbol}><td>{row.priority}</td><td><b>{row.symbol}</b></td><td><b>{row.holding?.label||'NO PURCHASE'}</b><p>{row.holding?.reason||'The stock does not currently qualify for a purchase.'}</p></td><td><details><summary>Details</summary><p>{row.sector} · Momentum score: {row.momentum} · Signal closing price: {row.close}</p><p>{row.holding?.detail||row.review.why} {row.review.next}</p></details></td></tr>)}</tbody></table></div>:<div className="emptyState"><b>{decision.current&&!decision.accountMismatch?'No additional Watch candidates.':'Watch list unavailable until the account analysis is current.'}</b></div>}

 </section>}
 <style jsx>{`.buyGrid{grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))}details summary{cursor:pointer;color:#475569}details p{font-size:13px;color:#475569}`}</style>
 </>;
}

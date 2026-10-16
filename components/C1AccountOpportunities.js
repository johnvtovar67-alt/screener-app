import {c1ScreenEvidenceKey,readC1ScreenEvidence,writeC1ScreenEvidence,resolveC1ScreenEvidence} from '../lib/c1ScreenEvidence';
import {c1WatchPresentation,c1OpportunityPresentation} from '../lib/c1EntryReview';
import {useEffect,useRef,useState} from 'react';
import {c1OrderDisplayGroups} from '../lib/c1OrderDisplay';
import {c1ManualReviewCurrent,c1ManualOrdersForView} from '../lib/c1ManualRecommendations';
import {c1PositionPresentation} from '../lib/c1PositionPresentation';
import {c1PlainDecisionReason,c1DecisionTrigger} from '../lib/c1DecisionCopy';
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
 const positionOrders=c1OrderDisplayGroups(c1ManualOrdersForView({review:manualRecommendations,decision:executionDecision,openingPlan,view:'opportunities'}).filter(order=>order.side==='sell'&&!order.condition));
 const exits=positionOrders;
 const waitingReason=decision.accountMismatch?'Resolve the differences in Account settings.':evidence.pending?evidence.reason:openingError?'Opening checks unavailable: '+openingError:manualRecommendations?.status==='ready'?'Refresh to recheck the account and opening prices.':manualRecommendations?.reason||'Refresh for the current account review.';
 const ratedDecision={...decision,opportunities:ratedRows};
 const presentation=c1OpportunityPresentation({decision:ratedDecision,buys,plan:openingPlan,ready,waitingReason});
 const heldSymbols=new Set([
  ...(decision.positions||[]).map(position=>String(position?.symbol||'').toUpperCase()),
  ...(portfolio||[]).filter(position=>position?.role==='Swing'&&Number(position?.shares)>0).map(position=>String(position?.symbol||'').toUpperCase())
 ]);
 const holdingPresentation=symbol=>heldSymbols.has(String(symbol||'').toUpperCase())?c1PositionPresentation({decision:decision.accountMismatch?null:decision,
  position:decision.positions?.find(position=>position.symbol===symbol),symbol,
  stock:positionRows.find(row=>(row.symbol||row.ticker)===symbol)||screenRows.find(row=>(row.symbol||row.ticker)===symbol),
  executionDecision,openingPlan,manualRecommendations,checkedAddOrders:rawBuys,now:new Date()}):null;
 // A historical Buy rating is not an authorized purchase. Only verified,
 // currently executable orders belong in the green opportunity cards.
 const actionableTiles=presentation.tiles.filter(tile=>{
  const held=holdingPresentation(tile.symbol);
  return ready&&Boolean(tile.order)&&(!held||held.canAdd);
 });
 const actionableBuys=buys.filter(order=>actionableTiles.some(tile=>tile.symbol===order.symbol));
 const blockedTiles=presentation.tiles.filter(tile=>!actionableTiles.includes(tile)).map(tile=>({
  ...tile,
  screenReview:{why:tile.detail||'No purchase currently authorized.',next:tile.next}
 }));
 const watch=[...blockedTiles,...presentation.watch];
 const currentWatch=watch;
 const currentWatchView=c1WatchPresentation({rows:currentWatch,plan:openingPlan,ready,waitingReason});
 const actionTone=(held,canPurchase)=>held?.action==='Sell'?'red':held?.urgent?'orange':held?'yellow':canPurchase?'green':'gray';
 const plainReason=(symbol,action,reason,presentation)=>c1PlainDecisionReason({action,reason,presentation,position:decision.positions?.find(position=>position.symbol===symbol),opportunity:ratedRows.find(row=>row.symbol===symbol),sourceCandidate:decision.stockScreen?.candidates?.find(row=>row.symbol===symbol),evidence:decision.positions?.find(row=>row.symbol===symbol)?.momentumEvidence});
 let nextWatchPriority=actionableTiles.length;
 const watchView={
  shared:null,
  rows:[
   ...currentWatchView.rows.map((row,index)=>{
    const held=heldSymbols.has(String(row.symbol||'').toUpperCase());
    const holding=held?holdingPresentation(row.symbol):null;
    return {...row,holding,priority:held?'Held':++nextWatchPriority,review:holding?{why:holding.reason,next:row.review.next}:evidence.pending?{why:evidence.reason,next:'Fresh capital is paused.'}:row.review};
   }),
  ]
 };
 // Group existing presentations for display only; never calculate an action or quantity.
 const heldActions=[...heldSymbols].map(symbol=>({symbol,holding:holdingPresentation(symbol),position:decision.positions?.find(row=>row.symbol===symbol)})).filter(row=>row.holding);
 const sellActions=heldActions.filter(row=>row.holding.action==='Sell');
 const verifyActions=heldActions.filter(row=>row.holding.urgent);
 const holdActions=heldActions.filter(row=>row.holding.action==='Hold'&&decision.current&&!decision.accountMismatch&&row.position&&!actionableTiles.some(tile=>tile.symbol===row.symbol));
 const waitActions=watchView.rows.filter(row=>!heldSymbols.has(row.symbol));
 const waitSummary=!ready?{why:waitingReason,next:'Refresh for the current account and opening review.'}:
  waitActions.length?(currentWatchView.shared||{why:'Some purchases remain blocked.',next:'See Watch for individual restrictions and next steps.'}):
  !sellActions.length&&!verifyActions.length&&!actionableBuys.length&&!holdActions.length?{why:'No checked purchase is authorized.',next:'Refresh for the current account review.'}:null;
 return <><section className={portfolioOnly?"card rotationBox":"card"} aria-label={portfolioOnly?"Portfolio actions":"C1 account opportunities"}>
  <h2>{portfolioOnly?'Portfolio actions':'Opportunities'}</h2>
  {!portfolioOnly&&evidence.pending&&<p role="status">{c1PlainDecisionReason({action:'NO PURCHASE',reason:evidence.reason})}</p>}
  <p className="sub">Signals based on {decision.sourceSessionDate} close · C1 strategy cash: {Number.isFinite(decision.strategyCash)?decision.strategyCash.toLocaleString('en-US',{style:'currency',currency:'USD'}):'Unavailable'} · Brokerage cash: {Number.isFinite(decision.brokerageCash)?decision.brokerageCash.toLocaleString('en-US',{style:'currency',currency:'USD'}):'Not entered'} · Available to deploy: {Number.isFinite(decision.executableCash)?decision.executableCash.toLocaleString('en-US',{style:'currency',currency:'USD'}):'$0.00'}</p>
  {presentation.cashReason&&<p role="status">{presentation.cashReason}</p>}
  <div className="plan" aria-label="C1 action summary">
   <small>C1 action summary · signals and checked recommendations, not Schwab orders</small>
   {sellActions.length>0&&<h3>Sell decisions</h3>}
   <ul>
    {sellActions.map(row=><li key={'sell:'+row.symbol} data-action="SELL"><span className="pill red">{row.symbol}: {row.holding.label}</span> {plainReason(row.symbol,row.holding.label,row.holding.reason,row.holding)}{(!row.holding.stopTriggered||(row.position?.stops||[]).length>1)&&<span> Recorded stops: {(row.position?.stops||[]).filter(stop=>Number.isFinite(stop.price)&&stop.price>0).map(stop=>'$'+stop.price.toFixed(2)).join(', ')||'unavailable'}.</span>} {positionOrders.filter(order=>order.symbol===row.symbol).map(order=><span key={order.id}>Checked recommendation: sell {order.shares} {order.shares===1?'share':'shares'}; opening reference ${order.estimatedPrice.toFixed(2)}. </span>)}{!positionOrders.some(order=>order.symbol===row.symbol)&&<span>No checked sell quantity is available; verify the account and execution review.</span>}</li>)}
    {verifyActions.map(row=><li key={'verify:'+row.symbol} data-action="VERIFY"><span className="pill orange">VERIFY — {row.symbol}</span> {plainReason(row.symbol,row.holding.label,row.holding.reason,row.holding)}</li>)}
    {actionableBuys.map(order=>{const held=holdingPresentation(order.symbol);return <li key={'buy:'+order.id} data-action={held?'ADD':'BUY'}><span className="pill green">{held?'ADD':'BUY'} — {order.symbol}</span> {held?'Add':'Buy'} {order.shares} {order.shares===1?'share':'shares'}; opening reference ${order.estimatedPrice.toFixed(2)}. Confirm current broker price and cash before placing an order.{held&&<span> Holding decision: {held.label}; {c1DecisionTrigger({action:held.label,position:decision.positions?.find(row=>row.symbol===order.symbol)})}</span>}</li>;})}
    {holdActions.map(row=>{const blocked=blockedTiles.find(tile=>tile.symbol===row.symbol),watchRow=watchView.rows.find(watch=>watch.symbol===row.symbol);return <li key={'hold:'+row.symbol} data-action="HOLD"><span className="pill yellow">HOLD — {row.symbol}</span> {plainReason(row.symbol,'HOLD',row.holding.reason,row.holding)} {c1DecisionTrigger({action:'HOLD',position:row.position})}{blocked&&!blocked.order&&<span> Purchase blocked: {plainReason(row.symbol,'WATCH',blocked.detail)}</span>}{watchRow?.review.next&&<span> Next: {watchRow.review.next}</span>}</li>;})}
    {waitSummary&&<li data-action="WAIT"><span className="pill gray">WAIT</span> {waitSummary.why} <span>Next: {waitSummary.next}</span></li>}
   </ul>
  </div>
  {ready&&buys.length>0&&(exits.length>0||orders.some(order=>order.side==='sell'&&!order.condition))&&<p className="actionHelp">Complete the listed sales before buying replacements.</p>}
  {!portfolioOnly&&actionableTiles.length>0?<div className="grid buyGrid">{actionableTiles.map(tile=>{const held=holdingPresentation(tile.symbol),canPurchase=ready&&tile.order&&(!held||held.canAdd);return <article className="idea green" key={tile.symbol}>
   <div className="top"><h3>{tile.symbol}</h3><b className={`pill ${actionTone(held,canPurchase)}`}>{held?.label||(canPurchase?tile.rating:'NO PURCHASE')}</b></div>
   <p className="sub">{tile.entryEvidence?.sector||'Sector unavailable'} · {tile.rating} rating as of {decision.sourceSessionDate}</p>
   <div className="price"><b>{Number.isFinite(tile.entryEvidence?.close)?'$'+tile.entryEvidence.close.toFixed(2):'Unavailable'}</b><small>Signal closing price</small></div>
   <p className="why">Momentum score: {Number.isFinite(tile.entryEvidence?.momentumScore)?tile.entryEvidence.momentumScore.toFixed(1)+'/100':'Unavailable'}</p>
   <div className="plan"><small>Your next action</small><b>{canPurchase?'Checked recommendation listed above':held?.label||'NO PURCHASE'}</b><p>{plainReason(tile.symbol,held?.label||(canPurchase?tile.accountAction:'NO PURCHASE'),held?.reason||tile.detail,held)}</p>{canPurchase&&<p>Opening reference ${tile.order.estimatedPrice.toFixed(2)}; confirm the current broker price.</p>}</div>
  </article>;})}</div>:portfolioOnly&&buys.length?<>
   <div className="grid buyGrid">{buys.map(o=>{const held=holdingPresentation(o.symbol);if(held&&!held.canAdd)return null;return <article className={held?'idea':'idea green'} key={o.id}>
    <div className="top"><h3>{o.symbol}</h3><b className={`pill ${actionTone(held,true)}`}>{held?.label||'Buy'}</b></div>
    <div className="price"><b>${o.estimatedPrice.toFixed(2)}</b><small>Opening reference price</small></div>
    <p className="why">{plainReason(o.symbol,held?.label||'Buy',held?.reason||'Account, cash and opening checks passed for this quantity.',held)}</p>
    <div className="plan"><small>C1 recommendation</small><b>Checked recommendation listed above</b></div>
    <p>Confirm price and cash at your broker, then record only the actual fill.</p>
   </article>;})}</div>
  </>:!portfolioOnly&&<div className="emptyState"><b>{decision.current?'No purchases currently authorized.':'C1 ratings awaiting update.'}</b>{!ready&&<span>{c1PlainDecisionReason({action:'NO PURCHASE',reason:waitingReason})}</span>}</div>}

  {ready&&(buys.length>0||positionOrders.length>0)&&<p className="sub">Refresh after {new Date(manualRecommendations.validUntil).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})} to update the recommendation.</p>}
 </section>
 {!portfolioOnly&&<section className="card" aria-label="Watch opportunities">
  <h2>🟡 Watch</h2>
  <p className="sub">Includes blocked Buy-rated candidates and candidates awaiting a Buy rating · {decision.sourceSessionDate}</p>
  {watch.length?<div className="scroll"><table><thead><tr><th>Priority</th><th>Stock / Sector</th><th>Momentum score</th><th>Signal closing price</th><th>Entry check</th></tr></thead><tbody>{watchView.rows.map(row=><tr key={row.symbol}><td>{row.priority}</td><td><b>{row.symbol}</b><div>{row.sector}</div><small>{ratedRows.find(r=>r.symbol===row.symbol)?.rating} rating</small></td><td>{row.momentum}</td><td>{row.close}</td><td><b className={`pill ${row.holding?actionTone(row.holding,false):'gray'}`}>{row.holding?.label||'WATCH'}</b> {plainReason(row.symbol,row.holding?.label||'WATCH',row.review.why,row.holding)}{row.review.next&&<div><small>Next: {row.review.next}</small></div>}</td></tr>)}</tbody></table></div>:<div className="emptyState"><b>{decision.current&&!decision.accountMismatch?'No additional Watch candidates.':'Watch list unavailable until the account analysis is current.'}</b></div>}

 </section>}
 <style jsx>{`.buyGrid{grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))}.price small{font-size:12px;color:#64748b}`}</style>
 </>;
}

import {c1HoldPillLabel,c1HoldPillStyle} from '../lib/c1HoldPill';
import {c1ScreenEvidenceKey,readC1ScreenEvidence,writeC1ScreenEvidence,resolveC1ScreenEvidence} from '../lib/c1ScreenEvidence';
import {c1WatchPresentation,c1OpportunityPresentation} from '../lib/c1EntryReview';
import {useEffect,useRef,useState} from 'react';
import {c1OrderDisplayGroups} from '../lib/c1OrderDisplay';
import {c1ManualReviewCurrent,c1ManualOrdersForView} from '../lib/c1ManualRecommendations';
import {c1PositionPresentation,c1RecordedSellInstruction} from '../lib/c1PositionPresentation';
import {c1PlainDecisionReason} from '../lib/c1DecisionCopy';
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
 const evidence=resolveC1ScreenEvidence({decision,rows:screenRows,current:screenCurrent&&cacheReady,previous:lastVerified.current?.key===sourceKey?lastVerified.current:restored.value,reviewCurrent:Boolean(openingPlan)&&c1ManualReviewCurrent(manualRecommendations,executionDecision)});
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
 const heldActions=[...heldSymbols].map(symbol=>{
  const position=decision.positions?.find(row=>row.symbol===symbol);
  return {symbol,holding:holdingPresentation(symbol),sellInstruction:c1RecordedSellInstruction(position,holdingPresentation(symbol)),stops:[...new Set((position?.stops||[]).map(stop=>stop.price).filter(price=>Number.isFinite(price)&&price>0))]};
 }).filter(row=>row.holding);
 const sellActions=heldActions.filter(row=>row.holding.action==='Sell');
 const verifyActions=heldActions.filter(row=>row.holding.urgent);
 if(portfolioOnly&&!sellActions.length&&!verifyActions.length&&!actionableBuys.length)return null;
 return <><section className={portfolioOnly?"card rotationBox":"card"} aria-label={portfolioOnly?"Portfolio actions":"C1 account opportunities"}>
  <h2>{portfolioOnly?'Portfolio Action':'Opportunities'}</h2>
  {!portfolioOnly&&evidence.pending&&<p role="status">{c1PlainDecisionReason({action:'NO PURCHASE',reason:evidence.reason})}</p>}
  {!portfolioOnly&&<><p className="sub">Signals based on {decision.sourceSessionDate} close · Schwab cash available to trade: {Number.isFinite(decision.brokerageCash)?decision.brokerageCash.toLocaleString('en-US',{style:'currency',currency:'USD'}):'Not entered'}</p>
  {presentation.cashReason&&<p role="status">{presentation.cashReason}</p>}</>}
  {portfolioOnly&&<div className="plan" aria-label="C1 action summary">
   <small>C1 action summary · signals and checked recommendations, not Schwab orders</small>
   <ul>
    {sellActions.map(row=><li key={'sell:'+row.symbol} data-action="SELL"><span className="pill red">{row.symbol}: {row.holding.label}</span> {plainReason(row.symbol,row.holding.label,row.holding.reason,row.holding)}{(!row.holding.stopTriggered||row.stops.length>1)&&<span> Recorded stops: {row.stops.map(price=>'$'+price.toFixed(2)).join(', ')||'unavailable'}.</span>} {positionOrders.filter(order=>order.symbol===row.symbol).map(order=><span key={order.id}>Checked recommendation: sell {order.shares} {order.shares===1?'share':'shares'}; opening reference ${order.estimatedPrice.toFixed(2)}. </span>)}{row.sellInstruction&&<span> Recorded holding: {row.sellInstruction.recordedShares??'Unavailable'} shares. {row.sellInstruction.next} {row.sellInstruction.status}</span>}</li>)}
    {actionableBuys.map(order=>{const held=holdingPresentation(order.symbol);return <li key={'buy:'+order.id} data-action={held?'ADD':'BUY'}><span className="pill green">{held?'ADD':'BUY'} — {order.symbol}</span> {held?'Add':'Buy'} {order.shares} {order.shares===1?'share':'shares'}; opening reference ${order.estimatedPrice.toFixed(2)}. Confirm current broker price and cash before placing an order.</li>;})}
   </ul>
   {sellActions.length>0&&!actionableBuys.length&&<p>After any confirmed sale is executed, keep the proceeds unallocated pending a verified C1 Buy. No replacement purchase is currently authorized.</p>}
   {verifyActions.length>0&&<><h3>Urgent verification — not authorized trades</h3><ul>{verifyActions.map(row=><li key={'verify:'+row.symbol} data-action="VERIFY"><span className="pill orange">VERIFY — {row.symbol}</span> {plainReason(row.symbol,row.holding.label,row.holding.reason,row.holding)}</li>)}</ul></>}
  </div>}
  {ready&&actionableBuys.length>0&&(exits.length>0||orders.some(order=>order.side==='sell'&&!order.condition))&&<p className="actionHelp">{portfolioOnly?'Complete the listed sales before buying replacements.':'Complete C1 sales listed in My Portfolio before buying replacements.'}</p>}
  {!portfolioOnly&&actionableTiles.length>0?<div className="grid buyGrid">{actionableTiles.map(tile=>{const held=holdingPresentation(tile.symbol),canPurchase=ready&&tile.order&&(!held||held.canAdd);return <article className="idea green" key={tile.symbol}>
   <div className="top"><h3>{tile.symbol}</h3><b className={`pill ${actionTone(held,canPurchase)}`} style={c1HoldPillStyle(held?.label||(canPurchase?tile.rating:'NO PURCHASE'))} >{c1HoldPillLabel(held?.label||(canPurchase?tile.rating:'NO PURCHASE'))}</b></div>
   <p className="sub">{tile.entryEvidence?.sector||'Sector unavailable'} · {tile.rating} rating as of {decision.sourceSessionDate}</p>
   <div className="price"><b>{Number.isFinite(tile.entryEvidence?.close)?'$'+tile.entryEvidence.close.toFixed(2):'Unavailable'}</b><small>Signal closing price</small></div>
   <p className="why">Momentum score: {Number.isFinite(tile.entryEvidence?.momentumScore)?tile.entryEvidence.momentumScore.toFixed(1)+'/100':'Unavailable'}</p>
   <div className="plan"><small>Your next action</small><b>{canPurchase?<>{actionableBuys.filter(order=>order.symbol===tile.symbol).map(order=><span key={order.id}>{held?'Add':'Buy'} {order.shares} {order.shares===1?'share':'shares'}; opening reference ${order.estimatedPrice.toFixed(2)}. </span>)}</>:held?.label||'NO PURCHASE'}</b><p>{plainReason(tile.symbol,held?.label||(canPurchase?tile.accountAction:'NO PURCHASE'),held?.reason||tile.detail,held)}</p>{canPurchase&&<p>Confirm current broker price and cash before placing an order.</p>}</div>
  </article>;})}</div>:!portfolioOnly&&<div className="emptyState"><b>{decision.current?'No purchases currently authorized.':'C1 ratings awaiting update.'}</b>{!ready&&<span> {openingError?'Opening checks unavailable: '+openingError:c1PlainDecisionReason({action:'NO PURCHASE',reason:waitingReason})}</span>}</div>}

  {ready&&(buys.length>0||positionOrders.length>0)&&<p className="sub">Refresh after {new Date(manualRecommendations.validUntil).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})} to update the recommendation.</p>}
 </section>
 {!portfolioOnly&&<section className="card" aria-label="Watch opportunities">
  <h2>🟡 Watch</h2>
  <p className="sub">Includes blocked Buy-rated candidates and candidates awaiting a Buy rating · {decision.sourceSessionDate}</p>
  {watch.length?<div className="scroll"><table><thead><tr><th>Priority</th><th>Stock / Sector</th><th>Momentum score</th><th>Signal closing price</th><th>Entry check</th></tr></thead><tbody>{watchView.rows.map(row=><tr key={row.symbol}><td>{row.priority}</td><td><b>{row.symbol}</b><div>{row.sector}</div><small>{ratedRows.find(r=>r.symbol===row.symbol)?.rating} rating</small></td><td>{row.momentum}</td><td>{row.close}</td><td><b className={`pill ${row.holding?actionTone(row.holding,false):'gray'}`} style={c1HoldPillStyle(row.holding?.label||'WATCH')} >{c1HoldPillLabel(row.holding?.label||'WATCH')}</b> {row.holding?plainReason(row.symbol,row.holding.label,row.review.why,row.holding):row.review.why||plainReason(row.symbol,'WATCH',row.review.why)}{row.review.next&&<div><small>Next: {row.review.next}</small></div>}</td></tr>)}</tbody></table></div>:<div className="emptyState"><b>{decision.current&&!decision.accountMismatch?'No additional Watch candidates.':'Watch list unavailable until the account analysis is current.'}</b></div>}

 </section>}
 <style jsx>{`.buyGrid{grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))}.price small{font-size:12px;color:#64748b}`}</style>
 </>;
}

import {c1ScreenEvidenceKey,readC1ScreenEvidence,writeC1ScreenEvidence,resolveC1ScreenEvidence} from '../lib/c1ScreenEvidence';
import {c1WatchPresentation,c1OpportunityPresentation} from '../lib/c1EntryReview';
import {useEffect,useRef,useState} from 'react';
import {c1OrderDisplayGroups} from '../lib/c1OrderDisplay';
import {c1ManualReviewCurrent,c1ManualOrdersForView} from '../lib/c1ManualRecommendations';
import {c1PositionPresentation} from '../lib/c1PositionPresentation';
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
 // A historical Buy rating is not an authorized purchase. Only verified,
 // currently executable orders belong in the green opportunity cards.
 const actionableTiles=presentation.tiles.filter(tile=>{
  const held=holdingPresentation(tile.symbol);
  return ready&&Boolean(tile.order)&&(!held||held.canAdd);
 });
 const blockedTiles=presentation.tiles.filter(tile=>!actionableTiles.includes(tile)).map(tile=>({
  ...tile,
  screenReview:{why:tile.detail||'No purchase currently authorized.',next:''}
 }));
 const watch=[...blockedTiles,...presentation.watch];
 const currentWatch=watch;
 const currentWatchView=c1WatchPresentation({rows:currentWatch,plan:openingPlan,ready,waitingReason});
 const actionTone=(held,canPurchase)=>held?.action==='Sell'?'red':held?.urgent?'orange':held?'yellow':canPurchase?'green':'gray';
 const plainReason=(symbol,action,reason,presentation)=>c1PlainDecisionReason({action,reason,presentation,position:decision.positions?.find(position=>position.symbol===symbol),opportunity:ratedRows.find(row=>row.symbol===symbol),sourceCandidate:decision.stockScreen?.candidates?.find(row=>row.symbol===symbol)});
 let nextWatchPriority=actionableTiles.length;
 const watchView={
  shared:null,
  rows:[
   ...currentWatchView.rows.map((row,index)=>{
    const held=heldSymbols.has(String(row.symbol||'').toUpperCase());
    const holding=held?holdingPresentation(row.symbol):null;
    return {...row,holding,priority:held?'Held':++nextWatchPriority,review:holding?{why:holding.reason,next:''}:evidence.pending?{why:evidence.reason,next:'Fresh capital is paused.'}:row.review};
   }),
  ]
 };
 return <><section className={portfolioOnly?"card rotationBox":"card"} aria-label={portfolioOnly?"Portfolio actions":"C1 account opportunities"}>
  <h2>{portfolioOnly?'Portfolio actions':'Opportunities'}</h2>
  {!portfolioOnly&&evidence.pending&&<p role="status">{c1PlainDecisionReason({action:'NO PURCHASE',reason:evidence.reason})}</p>}
  <p className="sub">Signals based on {decision.sourceSessionDate} close · C1 strategy cash: {Number.isFinite(decision.strategyCash)?decision.strategyCash.toLocaleString('en-US',{style:'currency',currency:'USD'}):'Unavailable'} · Brokerage cash: {Number.isFinite(decision.brokerageCash)?decision.brokerageCash.toLocaleString('en-US',{style:'currency',currency:'USD'}):'Not entered'} · Available to deploy: {Number.isFinite(decision.executableCash)?decision.executableCash.toLocaleString('en-US',{style:'currency',currency:'USD'}):'$0.00'}</p>
  {decision.brokerageCashCurrent===false&&<p role="status">{c1PlainDecisionReason({action:'NO PURCHASE',reason:decision.brokerageCashReason||'Update brokerage cash before buying.'})}</p>}
  {exits.length>0&&<div><h3>Sell decisions</h3><ul>{exits.map(o=>{const held=holdingPresentation(o.symbol),sell=held?.action==='Sell'?held:null;return <li key={o.id}><b>{o.symbol}: {sell?.label||'SELL'}</b>: sell {o.shares} {o.shares===1?'share':'shares'}; opening reference ${o.estimatedPrice.toFixed(2)}. {plainReason(o.symbol,sell?.label||'SELL',sell?.reason||o.reason,sell)}</li>;})}</ul></div>}
  {ready&&buys.length>0&&(exits.length>0||orders.some(order=>order.side==='sell'&&!order.condition))&&<p className="actionHelp">Complete the listed sales before buying replacements.</p>}
  {!portfolioOnly&&actionableTiles.length>0?<div className="grid buyGrid">{actionableTiles.map(tile=>{const held=holdingPresentation(tile.symbol),canPurchase=ready&&tile.order&&(!held||held.canAdd);return <article className="idea green" key={tile.symbol}>
   <div className="top"><h3>{tile.symbol}</h3><b className={`pill ${actionTone(held,canPurchase)}`}>{held?.label||(canPurchase?tile.rating:'NO PURCHASE')}</b></div>
   <p className="sub">{tile.entryEvidence?.sector||'Sector unavailable'} · {tile.rating} rating as of {decision.sourceSessionDate}</p>
   <div className="price"><b>{Number.isFinite(tile.entryEvidence?.close)?'$'+tile.entryEvidence.close.toFixed(2):'Unavailable'}</b><small>Signal closing price</small></div>
   <p className="why">Momentum score: {Number.isFinite(tile.entryEvidence?.momentumScore)?tile.entryEvidence.momentumScore.toFixed(1)+'/100':'Unavailable'}</p>
   <div className="plan"><small>Your next action</small><b>{canPurchase?`${held?'Add':'Buy'} ${tile.order.shares} ${tile.order.shares===1?'share':'shares'}`:held?.label||'NO PURCHASE'}</b><p>{plainReason(tile.symbol,held?.label||(canPurchase?tile.accountAction:'NO PURCHASE'),held?.reason||tile.detail,held)}</p>{canPurchase&&<p>Opening reference ${tile.order.estimatedPrice.toFixed(2)}; confirm the current broker price.</p>}</div>
  </article>;})}</div>:portfolioOnly&&buys.length?<>
   <div className="grid buyGrid">{buys.map(o=>{const held=holdingPresentation(o.symbol);if(held&&!held.canAdd)return null;return <article className={held?'idea':'idea green'} key={o.id}>
    <div className="top"><h3>{o.symbol}</h3><b className={`pill ${actionTone(held,true)}`}>{held?.label||'Buy'}</b></div>
    <div className="price"><b>${o.estimatedPrice.toFixed(2)}</b><small>Opening reference price</small></div>
    <p className="why">{plainReason(o.symbol,held?.label||'Buy',held?.reason||'Account, cash and opening checks passed for this quantity.',held)}</p>
    <div className="plan"><small>C1 recommendation</small><b>{decision.positions.some(p=>p.symbol===o.symbol)?'Add':'Buy'} {o.shares} {o.shares===1?'share':'shares'} of {o.symbol}</b></div>
    <p>Confirm price and cash at your broker, then record only the actual fill.</p>
   </article>;})}</div>
  </>:!portfolioOnly&&<div className="emptyState"><b>{decision.current?'No C1 Buy ratings right now.':'C1 ratings awaiting update.'}</b>{!ready&&<span>{c1PlainDecisionReason({action:'NO PURCHASE',reason:waitingReason})}</span>}</div>}

  {ready&&(buys.length>0||positionOrders.length>0)&&<p className="sub">Refresh after {new Date(manualRecommendations.validUntil).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})} to update the recommendation.</p>}
 </section>
 {!portfolioOnly&&<section className="card" aria-label="Watch opportunities">
  <h2>🟡 Watch</h2>
  <p className="sub">Candidates awaiting a C1 Buy rating · {decision.sourceSessionDate}</p>
  {watch.length?<div className="scroll"><table><thead><tr><th>Priority</th><th>Stock / Sector</th><th>Momentum score</th><th>Signal closing price</th><th>Entry check</th></tr></thead><tbody>{watchView.rows.map(row=><tr key={row.symbol}><td>{row.priority}</td><td><b>{row.symbol}</b><div>{row.sector}</div></td><td>{row.momentum}</td><td>{row.close}</td><td><b className={`pill ${row.holding?actionTone(row.holding,false):'gray'}`}>{row.holding?.label||'WATCH'}</b> {plainReason(row.symbol,row.holding?.label||'WATCH',row.review.why,row.holding)}</td></tr>)}</tbody></table></div>:<div className="emptyState"><b>{decision.current&&!decision.accountMismatch?'No additional Watch candidates.':'Watch list unavailable until the account analysis is current.'}</b></div>}

 </section>}
 <style jsx>{`.buyGrid{grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))}.price small{font-size:12px;color:#64748b}`}</style>
 </>;
}

import {c1ScreenEvidenceKey,readC1ScreenEvidence,writeC1ScreenEvidence,resolveC1ScreenEvidence} from '../lib/c1ScreenEvidence';
import {c1WatchPresentation,c1OpportunityPresentation} from '../lib/c1EntryReview';
import {useEffect,useRef,useState} from 'react';
import {c1OrderDisplayGroups} from '../lib/c1OrderDisplay';
import {c1ManualReviewCurrent,c1ManualOrdersForView} from '../lib/c1ManualRecommendations';
import {c1PositionPresentation} from '../lib/c1PositionPresentation';
import C1PositionDetails from './C1PositionDetails';
import {c1DisplaySector} from '../lib/c1DisplayFormat';
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
 const stockFor=symbol=>positionRows.find(row=>(row.symbol||row.ticker)===symbol)||screenRows.find(row=>(row.symbol||row.ticker)===symbol);
 const positionFor=symbol=>decision.positions?.find(row=>row.symbol===symbol);
 const entryReason=text=>{
  const value=String(text||'');
  if(/all three.*slots|position slots/i.test(value))return 'All position slots are allocated.';
  if(/brokerage cash.*insufficient|insufficient.*cash|allocation cash cannot fund/i.test(value))return 'Insufficient cash for a purchase.';
  if(/brokerage cash.*(required|update|balance)|enter.*brokerage cash/i.test(value))return 'Update brokerage cash before buying.';
  if(/recent.*(unavailable|missing|incomplete)|six consecutive/i.test(value))return 'Recent momentum data needs verification.';
  if(/recent.*momentum|MACD/i.test(value))return 'Recent momentum does not clear the entry checks.';
  if(/below the three selected|rank.*below/i.test(value))return 'Outside the selected entry ranks.';
  if(/verification.*pending|refresh|unavailable|paused/i.test(value))return 'Current checks do not authorize a purchase.';
  if(!value)return 'No purchase is authorized.';
  const sentence=value.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim()||value;
  return sentence.length<=130?sentence:'The current entry checks do not authorize a purchase.';
 };
 const toneFor=(held,order)=>held?.action==='Sell'?'red':held?.urgent||held?.label?.startsWith('VERIFY')?'orange':held?'yellow':order?'green':'gray';
 const renderCard=(row,order=null,held=holdingPresentation(row.symbol))=>{
  const stock=stockFor(row.symbol),position=positionFor(row.symbol),entry=row.entryEvidence||{};
  const sourceCandidate=decision.stockScreen?.candidates?.find(candidate=>candidate.symbol===row.symbol);
  const close=Number.isFinite(entry.close)?'$'+entry.close.toFixed(2):row.close||'Unavailable';
  const score=Number.isFinite(entry.momentumScore)?entry.momentumScore.toFixed(1)+'/100':row.momentum||'Unavailable';
  const rating=row.rating||'Unavailable',tone=toneFor(held,order);
  const label=held?.label||(order?(rating==='Strong Buy'?'STRONG BUY':'BUY'):['Buy','Strong Buy'].includes(rating)?'NO PURCHASE':'WATCH');
  const why=held?.reason||(order?`BUY ${order.shares} ${order.shares===1?'share':'shares'}; opening checks passed.`:entryReason(row.review?.why||row.detail));
  return <article className={`idea opportunityCard ${order&&!held?'green':''}`} key={row.symbol}>
   <div className="top"><h3>{row.symbol}</h3><b className={`pill ${tone}`}>{label}</b></div>
   <p className="sub opportunityMeta">{c1DisplaySector(stock,position,entry,row)} · {decision.sourceSessionDate}</p>
   <div className="price"><b>{close}<small>Signal close</small></b><span className="momentumScore">{score}<small>Momentum score</small></span></div>
   <p className="compactReason">{why}</p>
   {held&&order&&<small className="checkedCapital">ADD {order.shares} {order.shares===1?'share':'shares'}; opening checks passed.</small>}
   <C1PositionDetails position={position} decision={decision} stock={stock} presentation={held} evidence={{...entry,recentMomentumGate:sourceCandidate?.recentMomentumGate}}><small>Investment rating: {rating}</small>{order&&<small>Opening reference: ${order.estimatedPrice.toFixed(2)}</small>}{!held&&(row.review?.why||row.detail)&&(row.review?.why||row.detail)!==why&&<small>Entry check: {row.review?.why||row.detail}</small>}</C1PositionDetails>
  </article>;
 };
 return <><section className={portfolioOnly?"card rotationBox":"card"} aria-label={portfolioOnly?"Portfolio actions":"C1 account opportunities"}>
  <h2>{portfolioOnly?'Portfolio actions':'Opportunities'}</h2>
  {!portfolioOnly&&evidence.pending&&<p role="status">{evidence.reason}</p>}
  <p className="sub">Signals based on {decision.sourceSessionDate} close · C1 strategy cash: {Number.isFinite(decision.strategyCash)?decision.strategyCash.toLocaleString('en-US',{style:'currency',currency:'USD'}):'Unavailable'} · Brokerage cash: {Number.isFinite(decision.brokerageCash)?decision.brokerageCash.toLocaleString('en-US',{style:'currency',currency:'USD'}):'Not entered'} · Available to deploy: {Number.isFinite(decision.executableCash)?decision.executableCash.toLocaleString('en-US',{style:'currency',currency:'USD'}):'$0.00'}</p>
  {decision.brokerageCashCurrent===false&&<p role="status">{decision.brokerageCashReason||'Update brokerage cash in My Portfolio before a new C1 purchase.'}</p>}
  {exits.length>0&&<div><h3>Sell decisions</h3><div className="grid buyGrid">{exits.map(o=>{const held=holdingPresentation(o.symbol);return <article className="idea opportunityCard" key={o.id}>
   <div className="top"><h3>{o.symbol}</h3><b className={`pill ${held?toneFor(held):'red'}`}>{held?.label||'SELL'}</b></div>
   <p className="compactReason">{held?.reason||'An existing exit is pending.'}</p>
   <small className="checkedCapital">Sell {o.shares} {o.shares===1?'share':'shares'} · opening reference ${o.estimatedPrice.toFixed(2)}</small>
   <C1PositionDetails position={positionFor(o.symbol)} decision={decision} stock={stockFor(o.symbol)} presentation={held}/>
  </article>;})}</div></div>}
  {ready&&buys.length>0&&(exits.length>0||orders.some(order=>order.side==='sell'&&!order.condition))&&<p className="actionHelp">Complete the C1 exits before replacement purchases. Buy quantities assume those sales; check the proceeds and current prices first.</p>}
  {!portfolioOnly&&actionableTiles.length>0?<div className="grid buyGrid">{actionableTiles.map(tile=>renderCard(tile,tile.order))}</div>:portfolioOnly&&buys.length?<div className="grid buyGrid">{buys.map(o=>{const held=holdingPresentation(o.symbol);if(held&&!held.canAdd)return null;return renderCard(ratedRows.find(row=>row.symbol===o.symbol)||{symbol:o.symbol},o,held);})}</div>:!portfolioOnly&&<div className="emptyState"><b>{decision.current?'No actionable C1 purchases right now.':'C1 ratings awaiting update.'}</b>{!ready&&<span>{waitingReason}</span>}</div>}
  {ready&&(buys.length>0||positionOrders.length>0)&&<p className="sub">Refresh after {new Date(manualRecommendations.validUntil).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})} to update the recommendation.</p>}
 </section>
 {!portfolioOnly&&<section className="card" aria-label="Watch opportunities">
  <h2>🟡 Watch</h2>
  <p className="sub">Rankings remain visible when signal or account checks do not authorize a purchase · {decision.sourceSessionDate}</p>
  {watch.length?<div className="grid buyGrid">{watchView.rows.map(row=>renderCard(row))}</div>:<div className="emptyState"><b>{decision.current&&!decision.accountMismatch?'No additional Watch candidates.':'Watch list unavailable until the account analysis is current.'}</b></div>}
 </section>}
 <style jsx global>{`.opportunityCard{padding:12px}.opportunityCard .top{gap:8px;align-items:flex-start}.opportunityCard .pill{font-size:11px;max-width:65%;text-align:center;white-space:normal;overflow-wrap:anywhere}.opportunityCard .opportunityMeta{font-size:12px;margin:5px 0 0}.opportunityCard .price{margin:8px 0;font-size:14px;gap:12px}.opportunityCard .price small{display:block;font-size:11px;font-weight:400;color:#64748b}.opportunityCard .momentumScore{text-align:right;font-size:14px;font-weight:800}.opportunityCard .compactReason{font-size:13px;margin:0 0 6px;line-height:1.35}.opportunityCard .checkedCapital{display:block;font-size:12px;margin:0 0 8px;color:#475569}.opportunityCard details{margin-top:8px}.opportunityCard details summary{cursor:pointer;color:#475569;font-size:12px}`}</style>
 </>;
}

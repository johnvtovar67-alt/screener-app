import {c1HoldPillLabel,c1HoldPillStyle} from '../lib/c1HoldPill';
import {c1PlainDecisionReason} from '../lib/c1DecisionCopy';
// Hook-free synchronous rendering keeps time-sensitive callbacks in the parent render.
export function renderC1AccountOpportunitiesView({portfolioOnly,evidence,openingError,manualRecommendations,ready,decision,presentation,sellActions,plainReason,positionOrders,actionableBuys,holdingPresentation,verifyActions,exits,orders,ratedTiles,waitingReason,actionTone,buys,watch,watchView,ratedRows}){
 return <><section className={portfolioOnly?"card rotationBox":"card"} aria-label={portfolioOnly?"Portfolio actions":"C1 account opportunities"}>
  <h2>{portfolioOnly?'Portfolio Action':'Opportunities'}</h2>
  {!portfolioOnly&&evidence.pending&&<div role="status" aria-label="Entry verification details"><p>{c1PlainDecisionReason({action:'NO PURCHASE',reason:evidence.reason})}</p><ul>{evidence.issues.map(issue=><li key={issue}>{issue}</li>)}</ul>{!ready&&<p>Account/opening review: {openingError||manualRecommendations?.reason||'No checked opening review has returned. Tap Reload to request it.'}</p>}</div>}
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
  {!portfolioOnly&&ratedTiles.length>0&&!ready?<p role="status">{waitingReason}</p>:null}
 {!portfolioOnly&&ratedTiles.length>0?<div className="grid buyGrid">{ratedTiles.map(tile=>{const held=holdingPresentation(tile.symbol),canPurchase=ready&&tile.order&&(!held||held.canAdd);return <article className="idea green" key={tile.symbol}>
   <div className="top"><h3>{tile.symbol}</h3><b className={`pill ${actionTone(held,canPurchase)}`} style={c1HoldPillStyle(held?.label||tile.rating)} >{c1HoldPillLabel(held?.label||tile.rating)}</b></div>
   <p className="sub">{tile.entryEvidence?.sector||'Sector unavailable'} · {tile.rating} rating as of {decision.sourceSessionDate}</p>
   <div className="price"><b>{Number.isFinite(tile.entryEvidence?.close)?'$'+tile.entryEvidence.close.toFixed(2):'Unavailable'}</b><small>Signal closing price</small></div>
   <p className="why">Momentum score: {Number.isFinite(tile.entryEvidence?.momentumScore)?tile.entryEvidence.momentumScore.toFixed(1)+'/100':'Unavailable'}</p>
   <div className="plan"><small>{held?'Your position':'Purchase check'}</small><b>{canPurchase?<>{actionableBuys.filter(order=>order.symbol===tile.symbol).map(order=><span key={order.id}>{held?'Add':'Buy'} {order.shares} {order.shares===1?'share':'shares'}; opening reference ${order.estimatedPrice.toFixed(2)}. </span>)}</>:held?.label||'NO PURCHASE'}</b><p>{plainReason(tile.symbol,held?.label||(canPurchase?tile.accountAction:'NO PURCHASE'),held?.reason||tile.detail,held)}</p>{canPurchase&&<p>Confirm current broker price and cash before placing an order.</p>}</div>
  </article>;})}</div>:!portfolioOnly&&<div className="emptyState"><b>{decision.current?'No purchases currently authorized.':'C1 ratings awaiting update.'}</b>{!ready&&<span> {waitingReason}</span>}</div>}

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

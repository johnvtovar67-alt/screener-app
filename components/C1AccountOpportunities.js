export default function C1AccountOpportunities({decision,openingPlan,openingError}){
 return <section className="card" aria-label="C1 account opportunities">
  <h2>C1 Opportunities</h2>
  <p>Session: {decision.sourceSessionDate}. Available account cash: {decision.actualCash.toLocaleString('en-US',{style:'currency',currency:'USD'})}.</p>
  <p>{decision.explanation}</p>
  {openingPlan&&<div><h3>Today's opening plan</h3><p>Uses regular-session opening prices; these are not current-price orders. Observed {openingPlan.observedAt}. Refresh before acting.</p><ul>{openingPlan.orders.map(o=><li key={o.id}>{o.condition?'Conditional stop: ':''}{o.side} {o.shares} {o.symbol} · estimated ${o.estimatedPrice.toFixed(2)}</li>)}</ul></div>}
  {openingError&&<p>Opening plan unavailable: {openingError}</p>}
  {!decision.current?<p>Record outstanding session activity and refresh to update C1.</p>:decision.opportunities.length?
   <ol>{decision.opportunities.map(row=><li key={row.symbol}><strong>{row.symbol}</strong> — Entry candidate in {row.sleeves.length} C1 {row.sleeves.length===1?'sleeve':'sleeves'}.</li>)}</ol>:<p>No new entry is queued by C1 for this account.</p>}
 </section>;
}

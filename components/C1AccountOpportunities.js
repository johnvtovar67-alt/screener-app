export default function C1AccountOpportunities({decision}){
 return <section className="card" aria-label="C1 account opportunities">
  <h2>C1 Opportunities</h2>
  <p>Session: {decision.sourceSessionDate}. Available account cash: {decision.actualCash.toLocaleString('en-US',{style:'currency',currency:'USD'})}.</p>
  <p>{decision.explanation}</p>
  {!decision.current?<p>Record outstanding session activity and refresh to update C1.</p>:decision.opportunities.length?
   <ol>{decision.opportunities.map(row=><li key={row.symbol}><strong>{row.symbol}</strong> — Entry candidate in {row.sleeves.length} C1 {row.sleeves.length===1?'sleeve':'sleeves'}.</li>)}</ol>:<p>No new entry is queued by C1 for this account.</p>}
 </section>;
}

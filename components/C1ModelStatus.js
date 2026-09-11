export default function C1ModelStatus({decision}) {
  if(!decision)return null;
  const labels={base:'Base',cooldown15:'Extended cooldown',sector40:'Sector cap'};
  return <section className="card" aria-label="Shared C1 model status">
    <h2>C1 model status</h2>
    <p><b>Trading release incomplete.</b> {decision.explanation}</p>
    <p>Completed session: {decision.sourceSessionDate||'Unavailable'}. Opportunities and Portfolio use this same model result.</p>
    <ul>{decision.issues.map(issue=><li key={issue.code}>{issue.message}</li>)}</ul>
    {decision.status==='diagnostic-only'&&<details><summary>View diagnostic model holdings and queue</summary>
      <p>Weights describe the model’s closing holdings. They are not allocation targets. A queued name may never become an order.</p>
      {decision.symbols.length?<div className="scroll"><table><thead><tr><th>Symbol</th><th>In model</th><th>Closing weight</th><th>Next-session queue</th></tr></thead>
        <tbody>{decision.symbols.map(row=><tr key={row.symbol}><td>{row.symbol}</td><td>{row.modelPresence==='present'?'Yes':'No'}</td>
          <td>{row.observedWeightPct.toFixed(2)}%</td><td>{row.pending.length?row.pending.map((p,i)=><div key={i}>{labels[p.sleeve]||p.sleeve}: {p.side==='buy'?'entry candidate':'exit candidate'}</div>):'None'}</td></tr>)}</tbody></table></div>:<p>No model holdings or queued candidates.</p>}
      {Number.isFinite(decision.cashWeightPct)&&<p>Diagnostic model cash: {decision.cashWeightPct.toFixed(2)}%.</p>}
    </details>}
  </section>;
}

export default function C1ModelStatus({decision}) {
  if(!decision)return null;
  return <section className="card" aria-label="Portfolio setup">
    <h2>Connect your portfolio</h2>
    <p>Open My Portfolio to connect your saved holdings and start account-specific recommendations.</p>
    {decision.sourceSessionDate&&<p>Latest completed session: {decision.sourceSessionDate}.</p>}
  </section>;
}

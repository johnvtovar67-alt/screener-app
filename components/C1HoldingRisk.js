import { c1HoldingRisk } from '../lib/c1HoldingRisk';

const dollars = value => Number.isFinite(value)
  ? value.toLocaleString('en-US', {style:'currency', currency:'USD', maximumFractionDigits:2}) : 'Unavailable';
const labels = { 'basis-required':'Enter average cost', 'quote-unverified':'Verify price',
  'at-or-below-reference':'At or below loss reference', 'above-reference':'Above loss reference' };

export default function C1HoldingRisk({ positions, current }) {
  if (!positions?.length) return null;
  const rows = c1HoldingRisk(positions);
  if (!rows.length) return null;
  return <section className="card" aria-label="Current holding risk references">
    <h2>Your existing Swing positions</h2>
    {!current ? <p>Holdings changed. Analyze My Portfolio again to update these references.</p> : <>
      <p>Original C1 loss reference: 14% below your entered average cost. Check actual protective orders in your brokerage account.</p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(230px, 1fr))',gap:12}}>
        {rows.map(row => <article key={row.symbol} style={{border:'1px solid #555',borderRadius:10,padding:14}}>
          <h3>{row.symbol} · {row.shares ?? 'Unknown'} shares</h3>
          <p><b>{labels[row.status]}</b></p>
          <p>Entered average cost: <b>{dollars(row.averageCost)}</b><br/>
            14% loss reference: <b>{dollars(row.referencePrice)}</b><br/>
            Observed price: <b>{dollars(row.price)}</b></p>
          {row.quoteAt && <p><small>Quote: {new Date(row.quoteAt).toLocaleString()}</small></p>}
          {row.status==='above-reference' && <p>{row.downsideToReferencePct.toFixed(2)}% below the observed price to reach the reference.</p>}
          {row.status==='quote-unverified' && <p>A current price is not verified. Check your broker before acting.</p>}
          {row.status==='at-or-below-reference' && <p>The observed price reaches the original loss reference. Verify the price and your protective orders promptly.</p>}
        </article>)}
      </div>
      <p><small>These are price-risk references, not C1 buy, hold or sell recommendations. Separate purchase lots, past stop triggers and fills are not reconstructed.</small></p>
    </>}
  </section>;
}

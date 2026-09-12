import {c1AccountDifferences} from '../lib/c1AccountDifferences';
export default function C1AccountDifferences({decision,portfolio,onCorrectDate,busy}){
 const issues=c1AccountDifferences(decision,portfolio);
 if(!issues.length)return null;
 const datesOnly=issues.every(row=>row.dateOnly);
 return <section className="card" aria-label="C1 account differences">
  <h2>Account details to reconcile</h2>
  <p>{datesOnly?'Shares, average costs and cash match. The first-purchase dates below differ.':'These entered portfolio details differ from the saved C1 account.'}</p>
  {issues.map(row=><article key={`${row.symbol}:${row.field}`} style={{borderTop:'1px solid #dbe3ee',padding:'14px 0'}}>
   <h3>{row.symbol} · {row.field}</h3>
   <p>Portfolio entry: <strong>{String(row.entered)}</strong><br/>C1 account: <strong>{String(row.recorded)}</strong></p>
   {datesOnly&&/^\d{4}-\d{2}-\d{2}$/.test(row.entered)&&<button disabled={busy} onClick={()=>onCorrectDate(row.symbol,row.entered)}>Use {row.entered} for {row.symbol}</button>}
  </article>)}
  <p>{datesOnly?'If the portfolio date is correct, use it to update the C1 date record. The correction keeps shares, cash and transaction history.':'If an entry is a typo, correct it in My Portfolio. Record account activity only for trades or cash movements that actually occurred.'}</p>
 </section>;
}

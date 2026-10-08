import {useEffect,useState} from 'react';

const money=value=>Number.isFinite(value)?value.toLocaleString('en-US',{style:'currency',currency:'USD'}):'Not entered';

export default function C1BrokerageCash({decision,onSave,busy=false}){
 const [balance,setBalance]=useState(''),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 useEffect(()=>{
  setBalance(Number.isFinite(decision?.brokerageCash)?decision.brokerageCash.toFixed(2):'');
 },[decision?.revision,decision?.brokerageCash]);
 async function submit(event){
  event.preventDefault();setError('');setSaved(false);
  const value=Number(balance);
  if(!balance.trim()||!Number.isFinite(value)||value<0||Math.abs(value*100-Math.round(value*100))>1e-7){setError('Enter a nonnegative brokerage cash balance with cents precision.');return;}
  try{await onSave(value,decision.revision);setSaved(true);}catch(cause){setError(cause.message);}
 }
 return <section className="card" aria-label="Brokerage cash">
  <h2>Brokerage cash</h2>
  <p><b>Brokerage cash: {money(decision?.brokerageCash)}</b> · C1 strategy cash: {money(decision?.strategyCash)} · Available to deploy: {money(decision?.executableCash)}</p>
  {decision?.brokerageCashObservedAt&&<p className="sub">Broker balance observed {new Date(decision.brokerageCashObservedAt).toLocaleString()} · {decision.brokerageCashCurrent?'Current':'Update required'}</p>}
  <p className="sub">Enter the spendable cash shown at Schwab after any Core or other account activity. This updates the broker balance without changing C1 strategy cash or performance.</p>
  {!decision?.brokerageCashCurrent&&<p role="status">{decision?.brokerageCashReason||'Enter a current brokerage balance before a new C1 purchase.'}</p>}
  <form className="inputs" onSubmit={submit}>
   <label>Actual brokerage cash <input aria-label="Actual brokerage cash" type="number" min="0" step="0.01" value={balance} onChange={event=>{setBalance(event.target.value);setSaved(false);}} disabled={busy||!decision}/></label>
   <button type="submit" disabled={busy||!decision}>{busy?'Saving brokerage cash…':'Update Brokerage Cash'}</button>
  </form>
  {!decision&&<p role="status">Connect and load the saved C1 account to update brokerage cash.</p>}
  {error&&<p role="alert">{error}</p>}
  {saved&&<p role="status">Brokerage cash saved. C1 strategy accounting is unchanged.</p>}
 </section>;
}

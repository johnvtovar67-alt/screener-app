import {useState} from 'react';
export default function C1AccountActivity({pending,pendingSessions=[],onSave,busy}){
 const [selectedDate,setSelectedDate]=useState(pending.date);
 const selected=pendingSessions.find(s=>s.date===selectedDate)||pending;
 return <><label>Trade session <select value={selected.date} onChange={e=>setSelectedDate(e.target.value)}>{(pendingSessions.length?pendingSessions:[pending]).map(s=><option key={s.date} value={s.date}>{s.date}</option>)}</select></label><ActivityForm key={selected.date} pending={selected} onSave={onSave} busy={busy}/></>;
}
function ActivityForm({pending,onSave,busy}){
 const [fills,setFills]=useState([]),[orderId,setOrderId]=useState(''),[shares,setShares]=useState(''),[price,setPrice]=useState(''),[fee,setFee]=useState(''),[time,setTime]=useState(''),[complete,setComplete]=useState(false),[error,setError]=useState('');
 const verifiedOrderPlan=pending.plan.providerVerified===true&&pending.plan.executable===true;
 const recordableOrders=pending.plan.orders.filter(order=>order.side!=='buy'||verifiedOrderPlan);
 function add(){
  const order=recordableOrders.find(o=>o.id===orderId),at=new Date(time);
  if(!order||!Number.isSafeInteger(+shares)||+shares<=0||+price<=0||fee===''||+fee<0||!Number.isFinite(at.getTime())){setError('Select the order and enter quantity, execution price, fee and execution time.');return;}
  setFills(rows=>[...rows,{id:globalThis.crypto.randomUUID(),orderId,symbol:order.symbol,side:order.side,shares:+shares,price:+price,fee:+fee,executedAt:at.toISOString()}]);setShares('');setPrice('');setFee('');setError('');setComplete(false);
 }
 return <section className="card" aria-label="C1 actual activity">
  <h3>Record activity for {pending.date}</h3>
  <p>This prior-session plan is reconstructed from dated model inputs. It does not prove what the live screener displayed or that an order was authorized. Reconstructed buys are hidden. Record only Schwab fills that actually occurred; if none filled, confirm no activity and save.</p>
  {!verifiedOrderPlan&&<p role="status">No prior-session Buy is verified as issued, so reconstructed purchase candidates are not listed here.</p>}
  <label>Order <select value={orderId} onChange={e=>setOrderId(e.target.value)}><option value="">Select an order</option>{recordableOrders.map(o=><option key={o.id} value={o.id}>{o.condition?'C1 stop candidate: ':o.side==='buy'?'Verified C1 purchase: ':'C1 sale candidate: '}{o.symbol} · {o.shares} shares · {o.sleeve} · record only if Schwab filled</option>)}</select></label>
  <div className="inputs"><label>Shares<input type="number" min="1" step="1" value={shares} onChange={e=>setShares(e.target.value)}/></label><label>Execution price<input type="number" min="0" step="any" value={price} onChange={e=>setPrice(e.target.value)}/></label><label>Fee ($)<input type="number" min="0" step="any" value={fee} onChange={e=>setFee(e.target.value)}/></label><label>Execution time (your local time)<input type="datetime-local" value={time} onChange={e=>setTime(e.target.value)}/></label></div>
  <button disabled={busy} onClick={add}>Add completed fill</button>
  {fills.map(f=><p key={f.id}>{f.side} {f.shares} {f.symbol} at ${f.price} · fee ${f.fee} <button disabled={busy} onClick={()=>{setFills(rows=>rows.filter(r=>r.id!==f.id));setComplete(false);}}>Remove</button></p>)}
  {error&&<p role="alert">{error}</p>}
  <p><label><input type="checkbox" checked={complete} onChange={e=>setComplete(e.target.checked)}/> All actual activity for this session is included{!fills.length?' — no orders filled':''}.</label></p>
  {!complete&&<p>Check the confirmation above to enable saving this session.</p>}
  <button disabled={busy||!complete} onClick={()=>onSave({date:pending.date,openingObservedAt:pending.openingObservedAt,complete:true,...(pending.plan.completionPolicy?{completionPolicy:pending.plan.completionPolicy}:{}),fills:[...fills].sort((a,b)=>a.executedAt.localeCompare(b.executedAt))},pending.revision)}>{busy?'Saving…':'Save activity and update C1'}</button>
 </section>;
}

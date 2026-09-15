import {useMemo,useState} from 'react';

export default function C1IntradayActivity({session,onSave,busy}){
 const [selection,setSelection]=useState(''),[shares,setShares]=useState(''),[price,setPrice]=useState(''),[fee,setFee]=useState('0'),[time,setTime]=useState(''),[confirmed,setConfirmed]=useState(false),[error,setError]=useState(''),[ticketId,setTicketId]=useState(null);
 const choices=useMemo(()=>{
  const groups=new Map(),unconditional=new Set(session.plan.orders.filter(o=>o.side==='sell'&&!o.condition).map(o=>o.symbol+':'+o.sleeve));
  for(const order of session.plan.orders){
   if(session.sellOnly&&order.side!=='sell')continue;
   if(order.condition&&unconditional.has(order.symbol+':'+order.sleeve))continue;
   let remaining=order.shares-session.fills.filter(f=>f.orderId===order.id).reduce((n,f)=>n+f.shares,0);
   if(order.side==='sell'){
    const held=(session.plan.openingBooks[order.sleeve].positions[order.symbol]?.shares||0)+session.fills.filter(f=>f.symbol===order.symbol&&session.plan.orders.find(o=>o.id===f.orderId)?.sleeve===order.sleeve).reduce((n,f)=>n+(f.side==='buy'?f.shares:-f.shares),0);
    remaining=Math.min(remaining,held);
   }
   if(remaining<=0)continue;
   const key=order.side+':'+order.symbol,prior=groups.get(key)||{key,symbol:order.symbol,side:order.side,shares:0};prior.shares+=remaining;groups.set(key,prior);
  }
  return [...groups.values()];
 },[session]);
 const choice=choices.find(c=>c.key===selection);
 function edit(setter,value){setter(value);setTicketId(null);setConfirmed(false);setError('');}
 async function submit(event){
  event.preventDefault();setError('');
  const at=new Date(time);
  if(!choice||!confirmed||!Number.isSafeInteger(+shares)||+shares<=0||+shares>choice.shares||!(+price>0)||fee===''||+fee<0||!Number.isFinite(at.getTime())){setError('Select the completed trade and enter its actual quantity, price, fee and execution time.');return;}
  const id=ticketId||globalThis.crypto.randomUUID();setTicketId(id);
  try{await onSave({id,symbol:choice.symbol,side:choice.side,shares:+shares,price:+price,fee:+fee,executedAt:at.toISOString()},session.revision);setSelection('');setShares('');setPrice('');setTime('');setConfirmed(false);setTicketId(null);}
  catch(e){setError(e.message);}
 }
 return <section className="card" aria-label="Record today's completed trade">
  <h3>Record a completed trade — {session.date}</h3>
  <p>Enter a trade already filled at Schwab. Saving updates your holdings and cash, then checks C1 for the next action.</p>
  <form onSubmit={submit}>
   <label>Completed trade <select aria-label="Completed trade" value={selection} onChange={e=>edit(setSelection,e.target.value)}><option value="">Select a trade</option>{choices.map(c=><option key={c.key} value={c.key}>{c.side==='sell'?'Sold':'Bought'} {c.symbol} · up to {c.shares} shares</option>)}</select></label>
   <div className="inputs"><label>Shares filled<input aria-label="Shares filled" type="number" min="1" step="1" value={shares} onChange={e=>edit(setShares,e.target.value)}/></label><label>Execution price<input aria-label="Execution price" type="number" min="0" step="any" value={price} onChange={e=>edit(setPrice,e.target.value)}/></label><label>Fee ($)<input aria-label="Fee" type="number" min="0" step="any" value={fee} onChange={e=>edit(setFee,e.target.value)}/></label><label>Execution time (your local time)<input aria-label="Execution time" type="datetime-local" value={time} onChange={e=>edit(setTime,e.target.value)}/></label></div>
   <p><label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> This trade has filled at Schwab.</label></p>
   <button type="submit" disabled={busy||!confirmed}>{busy?'Saving trade…':'Save trade and update C1'}</button>
   {error&&<p role="alert">{error}</p>}
  </form>
  {session.tickets.length>0&&<p role="status">{session.tickets.length} completed {session.tickets.length===1?'trade':'trades'} saved today. Holdings and cash include these fills.</p>}
 </section>;
}

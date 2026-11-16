import {useMemo,useState} from 'react';

const localInput=value=>{const d=new Date(value),pad=n=>String(n).padStart(2,'0');return Number.isFinite(d.getTime())?`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`:'';};
const allocationName={base:'Base',cooldown15:'15-session allocation',sector40:'40% sector allocation'};
const completedAddReason='owner-confirmed-completed-add';

export default function C1IntradayActivity({session,onSave,onCorrectDetails,busy}){
 const [selection,setSelection]=useState(''),[shares,setShares]=useState(''),[price,setPrice]=useState(''),[fee,setFee]=useState('0'),[time,setTime]=useState(''),[confirmed,setConfirmed]=useState(false),[error,setError]=useState(''),[ticketId,setTicketId]=useState(null),[receipt,setReceipt]=useState(null);
 const [correcting,setCorrecting]=useState(null),[correctedPrice,setCorrectedPrice]=useState(''),[correctedFee,setCorrectedFee]=useState(''),[correctedTime,setCorrectedTime]=useState(''),[correctionMessage,setCorrectionMessage]=useState('');
 const [allocationShares,setAllocationShares]=useState({});
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
   const kind=order.condition?'stop':'planned',key=kind+':'+order.side+':'+order.symbol,prior=groups.get(key)||{key,kind,symbol:order.symbol,side:order.side,shares:0};prior.shares+=remaining;groups.set(key,prior);
  }
  const held=new Map();
  for(const book of Object.values(session.plan.openingBooks))for(const [symbol,position] of Object.entries(book.positions))held.set(symbol,(held.get(symbol)||0)+position.shares);
  for(const fill of session.fills)held.set(fill.symbol,(held.get(fill.symbol)||0)+(fill.side==='buy'?fill.shares:-fill.shares));
  for(const [symbol,shares] of held)if(shares>0)groups.set('owner-exit:'+symbol,{key:'owner-exit:'+symbol,kind:'owner-exit',recordingReason:'owner-discretionary-exit',symbol,side:'sell',shares});
  for(const issued of session.issuedChoices||[]){
   groups.delete('planned:buy:'+issued.symbol);
   groups.set('issued:buy:'+issued.symbol,{...issued,key:'issued:buy:'+issued.symbol,kind:'issued',recordingReason:'recorded-issued-buy'});
  }
  for(const [symbol,shares] of session.date>='2026-11-16'?held:[]){
   if(shares<=0||['MSTR','SCHW'].includes(symbol))continue;
   const allocations=Object.entries(session.plan.openingBooks).flatMap(([sleeve,book])=>{
    const opening=book.positions[symbol]?.shares||0;
    const current=opening+session.fills.filter(fill=>fill.symbol===symbol&&session.plan.orders.find(order=>order.id===fill.orderId)?.sleeve===sleeve).reduce((sum,fill)=>sum+(fill.side==='buy'?fill.shares:-fill.shares),0);
    return opening>0&&current>0?[{sleeve,shares:current}]:[];
   });
   if(allocations.length)groups.set('completed-add:'+symbol,{key:'completed-add:'+symbol,kind:'completed-add',recordingReason:completedAddReason,symbol,side:'buy',shares:Number.MAX_SAFE_INTEGER,allocations});
  }
  return [...groups.values()];
 },[session]);
 const choice=choices.find(c=>c.key===selection);
 function edit(setter,value){setter(value);setTicketId(null);setConfirmed(false);setError('');setReceipt(null);}
 function proposeAllocation(){
  if(!choice||!Number.isSafeInteger(+shares)||+shares<=0)return;
  const held=choice.allocations.reduce((sum,row)=>sum+row.shares,0);
  let left=+shares;
  const rows=choice.allocations.map(row=>{const exact=+shares*row.shares/held,quantity=Math.floor(exact);left-=quantity;return {...row,quantity,remainder:exact-quantity};});
  for(const row of [...rows].sort((a,b)=>b.remainder-a.remainder)){if(left){row.quantity++;left--;}}
  edit(setAllocationShares,Object.fromEntries(rows.map(row=>[row.sleeve,String(row.quantity)])));
 }
 async function submit(event){
  event.preventDefault();setError('');
  if(session.recordingBlockedReason){setError(session.recordingBlockedReason);return;}
  const at=new Date(time);
  if(!choice||!confirmed||!Number.isSafeInteger(+shares)||+shares<=0||+shares>choice.shares||!(+price>0)||fee===''||+fee<0||!Number.isFinite(at.getTime())){setError('Select the completed trade and enter its actual quantity, price, fee and execution time.');return;}
  const allocations=choice.kind==='completed-add'?(choice.allocations.length===1?[{sleeve:choice.allocations[0].sleeve,shares:+shares}]:choice.allocations.map(row=>({sleeve:row.sleeve,shares:Number(allocationShares[row.sleeve]||0)})).filter(row=>row.shares!==0)):null;
  if(allocations&&(!allocations.length||allocations.some(row=>!Number.isSafeInteger(row.shares)||row.shares<=0)||allocations.reduce((sum,row)=>sum+row.shares,0)!==+shares)){setError(`The C1 group boxes must total ${+shares} added shares. Tap “Propose using existing holding proportions”, review the boxes, then check the confirmation again.`);return;}
  const id=ticketId||globalThis.crypto.randomUUID();setTicketId(id);
  try{
   const result=await onSave({id,symbol:choice.symbol,side:choice.side,shares:+shares,price:+price,fee:+fee,executedAt:at.toISOString(),...(choice.recordingReason?{recordingReason:choice.recordingReason}:{}),...(allocations?{allocations}:{})},session.revision);
   if(result?.ticket?.id!==id)throw new Error('C1 did not return a saved-trade receipt. Nothing was cleared; reload the saved account before retrying.');
   setReceipt({side:choice.side,symbol:choice.symbol,shares:+shares,price:+price,cash:result.view.decision.brokerageCash,warning:result.warning||''});
   setSelection('');setShares('');setPrice('');setTime('');setConfirmed(false);setTicketId(null);setAllocationShares({});
  }
  catch(e){setError(e.message);}
 }
 async function correctDetails(event){
  event.preventDefault();setError('');setCorrectionMessage('');
  const at=new Date(correctedTime);
  if(!correcting||!(+correctedPrice>0)||correctedFee===''||+correctedFee<0||!Number.isFinite(at.getTime())){setError('Enter the actual execution price, fee and time.');return;}
  try{await onCorrectDetails(correcting,+correctedPrice,+correctedFee,at.toISOString(),session.revision);setCorrecting(null);setCorrectedPrice('');setCorrectedFee('');setCorrectedTime('');setCorrectionMessage('Trade details corrected. Shares and transaction identity were unchanged.');}
  catch(e){setError(e.message);}
 }
 return <section className="card c1TradeRecorder" aria-label={session.historicalIssued?`Record a completed trade for ${session.date}`:"Record today's completed trade"}>
  <h3>Record a completed trade — {session.date}</h3>
  <p>This form records only a trade you already placed and Schwab filled. A planned purchase, planned sale, or stop level in the selector is not proof of a fill or a Buy instruction. Do not record an unfilled order. Saving a confirmed fill updates your holdings and cash, then checks C1 for the next action.</p>
  {session.recordingBlockedReason&&<p role="status">{session.recordingBlockedReason}</p>}
  <form onSubmit={submit}>
   <label>Completed trade <select aria-label="Completed trade" value={selection} onChange={e=>{setAllocationShares({});edit(setSelection,e.target.value);}}><option value="">Select a trade</option>{choices.map(c=><option key={c.key} value={c.key}>{c.kind==='issued'?'Retained C1 buy (record only if already filled)':c.kind==='completed-add'?'Recover an already filled addition':c.kind==='owner-exit'?'Other completed sale (filled)':c.kind==='stop'?'C1 stop-triggered sale (record only if filled)':c.side==='sell'?'Planned C1 sale (record only if filled)':'Planned C1 buy (record only if filled)'}: {c.symbol}{c.kind!=='completed-add'&&<> · up to {c.shares} shares</>}</option>)}</select></label>
   {choice?.kind==='issued'&&<p>This buy was retained when C1 issued it. Record only the shares Schwab already filled. A retained entry remains recordable after refresh or withdrawal; it is not current permission to buy.</p>}
   <div className="inputs"><label>Shares filled<input aria-label="Shares filled" type="number" min="1" step="1" value={shares} onChange={e=>edit(setShares,e.target.value)}/></label><label>Execution price<input aria-label="Execution price" type="number" min="0" step="any" value={price} onChange={e=>edit(setPrice,e.target.value)}/></label><label>Fee ($)<input aria-label="Fee" type="number" min="0" step="any" value={fee} onChange={e=>edit(setFee,e.target.value)}/></label><label>Execution time (your local time)<input aria-label="Execution time" type="datetime-local" step="1" value={time} onChange={e=>edit(setTime,e.target.value)}/></label></div>
   {choice?.kind==='completed-add'&&<fieldset className="c1RecoveryAllocation"><legend>Where to record the added shares inside C1</legend><p>This only assigns the shares you already bought. It does not change earlier purchases or place another order.</p>{choice.allocations.length===1?<p>Record this addition in {allocationName[choice.allocations[0].sleeve]}, the group already holding these shares. The existing purchase date and stop are retained.</p>:<><p>The original action’s split is unavailable. Fill the three boxes below so they total <b>{shares||'the number of'} added shares</b>. Enter 0 for a group receiving none.</p><button type="button" disabled={busy||!Number.isSafeInteger(+shares)||+shares<=0} onClick={proposeAllocation}>Propose using existing holding proportions</button><p>Review the proposed split, then check the confirmation below. This is your recovery attribution, not a verified reconstruction of the original action.</p><div className="c1RecoveryFields">{choice.allocations.map(row=><label key={row.sleeve}><span>{allocationName[row.sleeve]} <small>({row.shares} shares already held)</small></span><input aria-label={`Filled shares for ${allocationName[row.sleeve]}`} type="number" min="0" step="1" value={allocationShares[row.sleeve]||''} onChange={e=>edit(setAllocationShares,{...allocationShares,[row.sleeve]:e.target.value})}/></label>)}</div></>}</fieldset>}
   <p><label className="c1TradeConfirmation"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> This trade has filled at Schwab.{choice?.kind==='completed-add'&&' I approve the recovery allocation shown above.'}</label></p>
   <button className="c1TradeSave" type="submit" disabled={busy||!confirmed||Boolean(session.recordingBlockedReason)}>{busy?'Saving trade…':'Save trade and update C1'}</button>
   {error&&<p role="alert">{error}</p>}
   {receipt&&<p role="status"><b>Saved in C1:</b> {receipt.side==='buy'?'Bought':'Sold'} {receipt.shares} {receipt.symbol} at ${receipt.price.toFixed(2)}. Schwab cash available to trade: {Number.isFinite(receipt.cash)?'$'+receipt.cash.toFixed(2):'Update required'}.{receipt.warning&&<> {receipt.warning}</>}</p>}
  </form>
  {session.tickets.length>0&&<div className="savedTrades"><h4>Saved completed trades</h4>{session.tickets.map(ticket=><div key={ticket.id}><p><b>{ticket.side==='buy'?'Bought':'Sold'} {ticket.shares} {ticket.symbol}</b> at ${ticket.price.toFixed(2)} · {new Date(ticket.executedAt).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</p>{correcting===ticket.id?<form onSubmit={correctDetails}><p>Shares are locked at {ticket.shares}. Correct only the broker-reported details below.</p><div className="inputs"><label>Correct execution price<input aria-label={`Correct ${ticket.symbol} execution price`} type="number" min="0" step="any" value={correctedPrice} onChange={e=>{setCorrectedPrice(e.target.value);setError('');setCorrectionMessage('');}}/></label><label>Correct fee ($)<input aria-label={`Correct ${ticket.symbol} fee`} type="number" min="0" step="any" value={correctedFee} onChange={e=>{setCorrectedFee(e.target.value);setError('');setCorrectionMessage('');}}/></label><label>Correct execution time (your local time)<input aria-label={`Correct ${ticket.symbol} execution time`} type="datetime-local" step="1" value={correctedTime} onChange={e=>{setCorrectedTime(e.target.value);setError('');setCorrectionMessage('');}}/></label></div><button type="submit" disabled={busy}>{busy?'Saving correction…':'Save corrected details'}</button><button type="button" disabled={busy} onClick={()=>{setCorrecting(null);setCorrectedPrice('');setCorrectedFee('');setCorrectedTime('');setError('');}}>Cancel</button></form>:!session.historicalIssued&&<button type="button" disabled={busy} onClick={()=>{setCorrecting(ticket.id);setCorrectedPrice(String(ticket.price));setCorrectedFee(String(ticket.fee));setCorrectedTime(localInput(ticket.executedAt));setError('');setCorrectionMessage('');}}>Correct details</button>}</div>)}<p role="status">{session.tickets.length} completed {session.tickets.length===1?'trade':'trades'} saved {session.historicalIssued?`for ${session.date}`:'today'}. Holdings and cash include these fills.</p></div>}
  {correctionMessage&&<p role="status">{correctionMessage}</p>}
 </section>;
}

import {useState} from 'react';

export default function C1NonCashAdoption({decision,portfolio,onReview,onConfirm,busy=false,ready=false}){
 const [review,setReview]=useState(null),[confirmed,setConfirmed]=useState(false),[error,setError]=useState(''),[working,setWorking]=useState(false);
 const receipt=decision?.nonCashAdoptions?.[0];
 if(receipt)return <section className="card" aria-label="MRNA adoption receipt"><h3>MRNA adoption recorded</h3><p>{receipt.original.shares} existing shares adopted with original average cost ${String(receipt.original.avgCost)} and purchase date {String(receipt.original.openedAt).slice(0,10)}. Adoption itself recorded no brokerage trade and changed cash by $0.00.</p><p>Current recorded Swing ownership: {decision.positions.find(p=>p.symbol==='MRNA')?.shares||0} shares. Subsequent confirmed fills remain separate in trade history.</p></section>;
 if(!decision||!portfolio.some(p=>p.symbol==='MRNA'&&p.role==='Core'))return null;
 const valid=review?.accountRevision===decision.revision;
 async function preview(){setWorking(true);setError('');setReview(null);setConfirmed(false);try{setReview(await onReview(decision.revision));}catch(e){setError(e.message);}finally{setWorking(false);}}
 async function apply(){if(!valid||!confirmed)return;setWorking(true);setError('');try{await onConfirm(review.reviewId,decision.revision);setReview(null);setConfirmed(false);}catch(e){setError(e.message);setReview(null);setConfirmed(false);}finally{setWorking(false);}}
 return <section className="card" aria-label="Adopt existing MRNA"><h3>Bring existing MRNA under C1 Swing management</h3>
  <p>Adopt the saved Core shares without buying or selling. Original purchase facts and Schwab cash stay unchanged. Review between regular sessions after reconciling the latest close. C1 will apply its existing holding and exit rules after adoption.</p>
  <button onClick={preview} disabled={!ready||busy||working}>{working?'Checking…':'Review MRNA adoption'}</button>
  {review&&<div><p><b>MRNA: Core → Swing</b></p><p>{review.original.shares} shares · average cost ${String(review.original.avgCost)} · original purchase date {String(review.original.openedAt).slice(0,10)} · cost basis ${(Number(review.original.shares)*Number(review.original.avgCost)).toFixed(2)}</p>
   <p>Sleeve shares: base {review.allocations.base}, cooldown15 {review.allocations.cooldown15}, sector40 {review.allocations.sector40}. Non-cash contribution ${review.value.toFixed(2)} at the verified {review.effectiveSessionDate} close. Brokerage cash change: $0.00.</p>
   {review.finalizedSessions?.length>0&&<p>Already-recorded completed activity will be retained through {review.effectiveSessionDate}; no execution details will change.</p>}
   <p>No order or fill will be created. Existing stops and exit rules may subsequently require a sale. Original purchase history is retained; confirmed fills must still be recorded separately.</p>
   <label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} disabled={!valid||busy||working}/>I confirm these are my existing MRNA shares and authorize this one-time Core-to-Swing adoption.</label>
   <button onClick={apply} disabled={!ready||!valid||!confirmed||busy||working}>Confirm MRNA adoption</button>
   <button onClick={()=>{setReview(null);setConfirmed(false);}} disabled={working}>Cancel</button>
   {!valid&&<p role="status">Account changed. Review the adoption again.</p>}
  </div>}
  {error&&<p role="alert">{error}</p>}
 </section>;
}

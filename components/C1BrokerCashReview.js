import {useRef,useState} from 'react';

export const C1_BROKER_STATEMENT_MAX_BYTES=500*1024;
const money=value=>Number.isFinite(value)?value.toLocaleString('en-US',{style:'currency',currency:'USD'}):'Unavailable';
const percent=value=>Number.isFinite(value)?value.toFixed(2)+'%':null;
const allocationName={base:'Base',cooldown15:'15-session allocation',sector40:'40% sector allocation'};
const amount=rows=>(rows||[]).filter(row=>row.shares>0).map(row=>`${row.shares} ${allocationName[row.sleeve]||row.sleeve}`).join(', ')||'None';
const byteLength=value=>new TextEncoder().encode(value).byteLength;
const cashEventName={journal:'Transfer / journal','core-purchase':'Core purchase','core-sale':'Core sale',interest:'Interest',fee:'Fee'};

export default function C1BrokerCashReview({decision,onReview,onConfirm,busy=false}){
 const [statementText,setStatementText]=useState(''),[fileName,setFileName]=useState(''),[reviewState,setReviewState]=useState(null);
 const [confirmedId,setConfirmedId]=useState(null),[attributionId,setAttributionId]=useState(null),[invalidId,setInvalidId]=useState(null);
 const [working,setWorking]=useState(''),[error,setError]=useState(''),[receipt,setReceipt]=useState(null);
 const generation=useRef(0),currentRevision=useRef(decision?.revision),operation=useRef(false);
 currentRevision.current=decision?.revision;
 const review=reviewState?.proposal,revision=decision?.revision,accountReady=Number.isSafeInteger(revision)&&revision>=0;
 const valid=Boolean(review&&reviewState.revision===revision&&reviewState.statementText===statementText&&reviewState.generation===generation.current&&invalidId!==review.reviewId);
 const plannedRows=Array.isArray(review?.plannedSaleCorrection?.rows)?review.plannedSaleCorrection.rows:[],requiresAttribution=plannedRows.length>0;
 const confirmed=Boolean(valid&&confirmedId===review.reviewId),attributionConfirmed=Boolean(valid&&attributionId===review.reviewId);
 const saved=Boolean(review&&receipt?.reviewId===review.reviewId),blocked=busy||Boolean(working);
 const canConfirm=Boolean(valid&&!saved&&review.financialValid!==false&&review.remainingRoundedBalanceAdjustment?.allowed===true&&confirmed&&(!requiresAttribution||attributionConfirmed)&&onConfirm&&!blocked);

 function edit(value,name=''){
  generation.current++;setStatementText(value);setFileName(name);setConfirmedId(null);setAttributionId(null);setError('');setReceipt(null);
 }
 async function upload(event){
  const file=event.target.files?.[0];event.target.value='';
  if(!file||operation.current||busy)return;
  if(file.size>C1_BROKER_STATEMENT_MAX_BYTES){setError('Choose a statement no larger than 500 KB. Your current text is retained.');return;}
  const expectedGeneration=++generation.current;operation.current=true;setWorking('upload');setError('');setConfirmedId(null);setAttributionId(null);
  try{
   const text=await file.text();
   if(byteLength(text)>C1_BROKER_STATEMENT_MAX_BYTES)throw new Error('Choose a statement no larger than 500 KB. Your current text is retained.');
   if(generation.current===expectedGeneration)edit(text,file.name);
  }catch(failure){setError(failure.message||'The statement could not be read. Paste its CSV or TSV text instead.');}
  finally{operation.current=false;setWorking('');}
 }
 async function preview(event){
  event.preventDefault();
  if(operation.current||busy||!accountReady||!onReview)return;
  setError('');
  if(!statementText.trim()){setError('Choose a Schwab CSV or TSV statement, or paste its text.');return;}
  if(byteLength(statementText)>C1_BROKER_STATEMENT_MAX_BYTES){setError('The statement must be no larger than 500 KB. Your text is retained.');return;}
  const sourceText=statementText,sourceRevision=revision,sourceGeneration=generation.current;
  operation.current=true;setWorking('review');setConfirmedId(null);setAttributionId(null);setReceipt(null);
  try{
   const proposal=await onReview(sourceText,sourceRevision);
   if(!proposal||typeof proposal.reviewId!=='string'||!proposal.reviewId||proposal.revision!==sourceRevision)throw new Error('C1 did not return a matching statement review. Reload the saved account before retrying.');
   if(generation.current!==sourceGeneration||currentRevision.current!==sourceRevision){setError('The statement or account changed during review. Review the current text again.');return;}
   setReviewState({proposal,statementText:sourceText,revision:sourceRevision,generation:sourceGeneration});setInvalidId(null);
  }catch(failure){setError(failure.message||'The statement review is unavailable. Your text is retained.');}
  finally{operation.current=false;setWorking('');}
 }
 async function apply(){
  if(operation.current||!canConfirm)return;
  const source=reviewState;
  operation.current=true;setWorking('confirm');setError('');
  try{
   const result=await onConfirm({reviewId:review.reviewId,statementText:source.statementText,expectedRevision:source.revision,confirmed:true,attributionConfirmed:requiresAttribution&&attributionConfirmed});
   if(result?.reviewId!==review.reviewId)throw new Error('C1 did not confirm this statement correction. Reload the saved account before retrying.');
   setReceipt({reviewId:result.reviewId,warning:result.warning||''});setConfirmedId(null);setAttributionId(null);
  }catch(failure){setInvalidId(review.reviewId);setConfirmedId(null);setAttributionId(null);setError((failure.message||'The save result is unconfirmed.')+' Your statement text is retained. Reload the saved account and review again before retrying a save.');}
  finally{operation.current=false;setWorking('');}
 }
 const allocations=Array.isArray(review?.financialPreview?.allocations)?review.financialPreview.allocations:[];
 const preserved=Array.isArray(review?.financialPreview?.preserved)?review.financialPreview.preserved.filter(value=>typeof value==='string'):[];
 return <section className="card c1TradeRecorder" aria-label="Review brokerage cash and statement">
  <h3>Review brokerage cash and account activity</h3>
  <p>Current Schwab cash available to trade: <strong>{money(decision?.brokerageCash)}</strong>.</p>
  {decision?.brokerageCashObservedAt&&<p className="sub">Broker balance observed {new Date(decision.brokerageCashObservedAt).toLocaleString()} · {decision.brokerageCashCurrent?'Current':'Update required'}</p>}
  <p>Use your Schwab activity export to review transfers, Core trades, income, fees and C1 trade cash. C1 has no live Schwab connection. Review first, then confirm the accounting correction. No new broker trade is placed or recorded.</p>
  <form onSubmit={preview}>
   <label>Private Schwab statement (CSV or TSV, up to 500 KB)<input aria-label="Private Schwab statement file" type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" disabled={blocked||!accountReady} onChange={upload}/></label>
   {fileName&&<p className="sub">Loaded {fileName}. Review is required before saving.</p>}
   <label>Or paste the statement text<textarea aria-label="Schwab statement text" rows="8" value={statementText} disabled={blocked||!accountReady} onChange={event=>edit(event.target.value)} spellCheck={false} style={{width:'100%',maxWidth:'100%',boxSizing:'border-box',resize:'vertical',fontSize:16}}/></label>
   <p className="sub">Keep the header and dated activity rows. The original financial records are retained for audit; uploading or pasting alone saves no correction.</p>
   <button type="submit" disabled={blocked||!accountReady||!onReview}>{working==='upload'?'Reading statement…':working==='review'?'Reviewing statement…':'Review statement'}</button>
  </form>
  {!accountReady&&<p role="status">Connect and load the saved C1 account before reviewing a statement.</p>}
  {review&&<fieldset className="c1RecoveryAllocation"><legend>Review before confirming</legend>
   {!valid&&!saved&&<p role="status">This review is no longer current. Your statement text is retained. Review it again before confirming.</p>}
   {review.window&&<p>Statement window: {review.window.from} through {review.window.through}.{Number.isSafeInteger(review.statement?.rowCount)&&<> {review.statement.rowCount} activity rows reviewed.</>}</p>}
   <dl>
    {Number.isFinite(review.externalCapitalNet)&&<><dt>Net transfers and Core cash activity</dt><dd>{money(review.externalCapitalNet)}</dd></>}
    {Number.isFinite(review.pnlCashNet)&&<><dt>Net income and fees</dt><dd>{money(review.pnlCashNet)}</dd></>}
    {Number.isFinite(review.tradeCashAdjustment)&&<><dt>C1 trade cash differences from the statement</dt><dd>{money(review.tradeCashAdjustment)}</dd></>}
    {Number.isFinite(review.remainingRoundedBalanceAdjustment?.amount)&&<><dt>Remaining minor balance adjustment</dt><dd>{money(review.remainingRoundedBalanceAdjustment.amount)}</dd></>}
   </dl>
   {review.remainingRoundedBalanceAdjustment?.reason&&<p>{review.remainingRoundedBalanceAdjustment.reason}</p>}
   {Array.isArray(review.externalCapitalFlows)&&review.externalCapitalFlows.length>0&&<details><summary>Transfers and Core cash activity</summary><ul>{review.externalCapitalFlows.map((row,index)=><li key={index}>{row.date}: {cashEventName[row.kind]||'Capital activity'}{row.symbol?' · '+row.symbol:''} · {money(row.netCash)}</li>)}</ul></details>}
   {Array.isArray(review.pnlCashEvents)&&review.pnlCashEvents.length>0&&<details><summary>Interest and fees</summary><ul>{review.pnlCashEvents.map((row,index)=><li key={index}>{row.date}: {cashEventName[row.kind]||'Income / expense'} · {money(row.netCash)}</li>)}</ul></details>}
   {Array.isArray(review.matchedTradeNetCashAdjustments)&&review.matchedTradeNetCashAdjustments.length>0&&<details><summary>Recorded trade cash differences</summary><ul>{review.matchedTradeNetCashAdjustments.map((row,index)=><li key={index}>{row.date}: {row.symbol} {row.side} · {money(row.cashAdjustment)}</li>)}</ul></details>}
   {(Number.isFinite(review.originalLedgerCash)||Number.isFinite(review.afterKnownEventsCash))&&<details><summary>Historical reconciliation audit</summary><p>These figures explain the correction. They are historical accounting calculations, not additional cash available to spend.</p><dl>{Number.isFinite(review.originalLedgerCash)&&<><dt>Original unreconciled accounting total</dt><dd>{money(review.originalLedgerCash)}</dd></>}{Number.isFinite(review.afterKnownEventsCash)&&<><dt>Accounting total after known statement events</dt><dd>{money(review.afterKnownEventsCash)}</dd></>}</dl></details>}
   {allocations.length>0&&<div><h4>Operational risk review</h4>{allocations.map((row,index)=><div className="c1RecoveryAllocation" key={row.sleeve||index}><b>{allocationName[row.sleeve]||'Allocation'}</b><dl>{Number.isFinite(row.rawHistoricalPeak)&&<><dt>Original historical peak retained</dt><dd>{money(row.rawHistoricalPeak)}</dd></>}{Number.isFinite(row.adjustedOperationalReference)&&<><dt>Cash-flow adjusted operational reference</dt><dd>{money(row.adjustedOperationalReference)}</dd></>}{Number.isFinite(row.currentEquity)&&<><dt>Current allocation equity</dt><dd>{money(row.currentEquity)}</dd></>}{Number.isFinite(row.currentDrawdownPct)&&<><dt>Current drawdown</dt><dd>{percent(row.currentDrawdownPct)}</dd></>}</dl></div>)}<p>Capital movements adjust the operational reference to preserve the drawdown percentage at the flow. The same 12% loss protection remains. A reference reset still requires a completed recorded exit and the next eligible exchange opening, once per exit episode. This correction creates no new reset or purchase permission.</p></div>}
   {preserved.length>0&&<p>Preserved: {preserved.join(', ')}.</p>}
   {plannedRows.length>0&&<div><h4>Already completed planned sales</h4><p>These shares were already sold. This also corrects their C1 allocation assignments; do not execute the repeat notices or enter another sale.</p>{plannedRows.map(row=><p key={row.symbol}><b>{row.symbol}: {row.shares} shares already sold</b><br/>Recorded sale split: {amount(row.allocationsBefore)}.<br/>Corrected sale split: {amount(row.allocationsAfter)}.{Number.isSafeInteger(row.remainingShares)&&<><br/>Remaining account holding: {row.remainingShares} shares.</>}{Number.isFinite(row.basisBefore)&&Number.isFinite(row.basisAfter)&&<><br/>Calculated remaining C1 cost basis: {money(row.basisBefore)} → {money(row.basisAfter)}.</>}</p>)}<label className="c1TradeConfirmation"><input aria-label="Confirm planned sale correction" type="checkbox" checked={attributionConfirmed} disabled={!valid||saved||blocked} onChange={event=>setAttributionId(event.target.checked?review.reviewId:null)}/>These were the planned C1 sales I selected. I approve the corrected allocation assignments shown above and have not executed the repeat sale notices.</label></div>}
   {review.financialValid===false&&<p role="status">The financial replay has not passed validation. This review cannot be saved.</p>}
   <p>This confirms accounting evidence, not a brokerage order. Original execution records, purchase dates, stops and historical audit records are retained. The review corrects derived cash and net profit or loss; any changed remaining allocation basis is shown above.</p>
   <label className="c1TradeConfirmation"><input aria-label="Confirm statement correction" type="checkbox" checked={confirmed} disabled={!valid||saved||blocked||review.financialValid===false||review.remainingRoundedBalanceAdjustment?.allowed!==true} onChange={event=>setConfirmedId(event.target.checked?review.reviewId:null)}/>I have reviewed the statement activity, Core classifications, current brokerage balance and the correction above, including any permitted minor balance adjustment.</label>
   <button className="c1TradeSave" type="button" onClick={apply} disabled={!canConfirm}>{working==='confirm'?'Saving statement correction…':'Confirm account correction'}</button>
  </fieldset>}
  {error&&<p role="alert">{error}</p>}
  {receipt&&<p role="status">Statement correction saved in C1. No new broker trade was recorded. {receipt.warning}</p>}
 </section>;
}

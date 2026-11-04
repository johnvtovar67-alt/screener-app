// Explicit, read-only risk observations are separate from the atomic account
// refresh. Bind every observation to the reconciled ownership that requested it.
export function c1StopDecisionIdentity(decision){
 return decision?.contract==='c1-account-decision-v1'?JSON.stringify([decision.revision,decision.decisionId,decision.sourceSessionDate,decision.positions]):null;
}

export function c1StopVerificationBinding({decision,portfolio=[],reconciled=false,accountOwner,portfolioOwner}={}){
 if(!reconciled||decision?.contract!=='c1-account-decision-v1'||!Array.isArray(decision.positions)||
  !Number.isSafeInteger(decision.revision)||!decision.sourceSessionDate)return null;
 return JSON.stringify([accountOwner,portfolioOwner,decision.revision,decision.decisionId,decision.sourceSessionDate,
  decision.positions,portfolio]);
}

export function c1StopVerificationCurrent(context,{accountOwner,portfolioOwner,observedDecision,enteredPortfolio}={}){
 if(!context?.binding||context.accountOwner!==accountOwner||context.portfolioOwner!==portfolioOwner||
  context.decisionIdentity!==observedDecision||context.portfolioSignature!==enteredPortfolio)return null;
 return context.binding;
}

export function createC1StopVerification(readCurrent){
 let generation=0;
 const requests=new Map();
 return {
  cancel(){generation++;},
  async verify({symbol,collect,publish}){
   const request={},epoch=generation,binding=readCurrent();
   requests.set(symbol,request);
   if(!binding)return {status:'unavailable'};
   const stock=await collect(symbol);
   if(epoch!==generation||requests.get(symbol)!==request||readCurrent()!==binding)return {status:'superseded'};
   publish({symbol,binding,stock});
   return {status:'published'};
  }
 };
}

// Bound the entire response, including stalled JSON bodies. Abort alone is not
// sufficient for a transport that never settles after cancellation.
export async function requestC1StopQuote(symbol,{fetcher=fetch,timeoutMs=12000}={}){
 const controller=new AbortController();
 let timer;
 try{
  return await Promise.race([
   (async()=>{
    const response=await fetcher('/api/c1-stop-quote?symbol='+encodeURIComponent(symbol),{cache:'no-store',signal:controller.signal});
    if(!response.ok)throw new Error('Current quote unavailable. Retry Verify stop now.');
    const data=await response.json();
    if(data?.contract!=='c1-stop-quote-v1'||data.stock?.symbol!==symbol||!Number.isFinite(data.stock.price)||data.stock.price<=0)
     throw new Error('Quote response was incomplete. Retry Verify stop now.');
    return data.stock;
   })(),
   new Promise((_,reject)=>{timer=setTimeout(()=>{
    reject(new Error('Quote verification timed out. Retry Verify stop now.'));
    controller.abort();
   },timeoutMs);})
  ]);
 }finally{clearTimeout(timer);controller.abort();}
}

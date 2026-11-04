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
 return {
  cancel(){generation++;},
  async verify({symbol,collect,publish}){
   const request=++generation,binding=readCurrent();
   if(!binding)return {status:'unavailable'};
   const stock=await collect(symbol);
   if(request!==generation||readCurrent()!==binding)return {status:'superseded'};
   publish({symbol,binding,stock});
   return {status:'published'};
  }
 };
}

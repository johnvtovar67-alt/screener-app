const PERSONAL_NO_BUY={
  SCHW:'Personal concentration block: do not buy SCHW. Existing SCHW exposure outside this trading portfolio is already approximately $5 million, so no screener signal may authorize additional capital.',
};

const symbolOf=stock=>String(stock?.symbol||stock?.ticker||'').replace('-','.').toUpperCase().trim();

export function applyPersonalCapitalPolicy(stock={}){
  const symbol=symbolOf(stock),message=PERSONAL_NO_BUY[symbol];
  if(!message)return stock;
  const decision=stock.finalDecision&&typeof stock.finalDecision==='object'?stock.finalDecision:{},analyticalAction=String(decision.action||stock.action||stock.recommendation?.displayLabel||stock.recommendation?.label||'Unknown');
  return{...stock,personalCapitalBlock:{blocked:true,symbol,reason:message,analyticalAction},finalDecision:{...decision,action:'Avoid',timing:'Do Not Buy',size:'None',priority:'Personal Concentration Block',reason:`${message} Underlying analytical signal: ${analyticalAction}.`,nextTrigger:'No price or technical trigger overrides this personal concentration block.',planText:'No additional SCHW capital.',source:'personal-concentration-block',capitalConfirmed:false,personalCapitalBlocked:true,analyticalAction}};
}

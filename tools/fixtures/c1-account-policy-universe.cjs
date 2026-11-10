// Operational/browser fixture only. Extend the existing real-handler workflow
// through its shared synthetic arrays; no production data or provider access.
function applyAccountPolicyUniverseFixture(workflow){
 const symbols=workflow.sessions[0].universeSymbols;
 while(symbols.length<30)symbols.push('X'+String(symbols.length-12).padStart(2,'0'));
 for(const session of workflow.sessions){
  const priceTemplate=session.prices.find(row=>row.symbol==='BBB');
  for(const symbol of symbols)if(!session.prices.some(row=>row.symbol===symbol))session.prices.push({...priceTemplate,symbol});
  for(const field of ['signals','positionSignals']){
   const template=session[field].find(row=>row.symbol==='BBB');
   for(const symbol of symbols)if(!session[field].some(row=>row.symbol===symbol))session[field].push(JSON.parse(JSON.stringify({...template,symbol})));
   for(const signal of session[field]){
    const index=symbols.indexOf(signal.symbol);if(index<0)continue;
    signal.sector=signal.symbol==='MRNA'?'Healthcare':signal.symbol==='DELL'?'Technology':'Sector'+index;
    signal.issuer=signal.symbol;
    signal.price=session.prices.find(row=>row.symbol===signal.symbol).close;
    signal.researchFactors={...signal.researchFactors,momentumPercentile:100-index,volatility60Pct:index<24?200:20};
    signal.entryTiming={...signal.entryTiming,symbol:signal.symbol,available:true,asOf:session.date,macdImproving:true,liquidityPass:true,averageDollarVolume20:500000000};
   }
  }
 }
 return {symbols:[...symbols],expectedSelected:symbols.slice(24,27),blockedLeaders:symbols.slice(0,24)};
}
module.exports={applyAccountPolicyUniverseFixture};

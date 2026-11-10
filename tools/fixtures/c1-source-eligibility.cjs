// Synthetic accepted-source defect: an unpurchasable healthcare leader must
// not reserve its sector or consume the bounded qualified candidate queue.
function applySourceEligibilityFixture(workflow){
 for(const session of workflow.sessions){
  for(const field of ['signals','positionSignals'])for(const signal of session[field]){
   signal.entryTiming.macdImproving=true;
   if(['MRNA','BBB','CCC'].includes(signal.symbol))signal.sector='Healthcare';
   if(signal.symbol==='MRNA')signal.researchFactors.volatility60Pct=375.71;
  }
 }
 return workflow;
}
module.exports={applySourceEligibilityFixture};

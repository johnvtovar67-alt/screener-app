// Descriptive opportunity diagnostics, NEVER attainable counterfactual alpha.
function opportunity(run,dataset){
 const sessions=dataset.sessions,index=new Map(sessions.map((s,i)=>[s.date,i]));let cashBenchmarkPnl=0,eligibleNotPurchased=0,priced=0,sum=0,wins=0;
 for(let i=1;i<run.curve.length;i++){
  const before=run.curve[i-1],s=sessions[i],prev=sessions[i-1],spy=s.prices.find(p=>p.symbol==='SPY').close,prior=prev.prices.find(p=>p.symbol==='SPY').close;
  cashBenchmarkPnl+=before.cash*(spy/prior-1);
 }
 for(const a of run.audit){const i=index.get(a.date),bought=new Set(a.fills.filter(f=>f.side==='buy').map(f=>f.symbol));
  for(const symbol of a.eligibleSymbols||[]){if(a.heldBefore.includes(symbol)||bought.has(symbol))continue;eligibleNotPurchased++;
   if(i+4>=sessions.length)continue;const entry=sessions[i].prices.find(p=>p.symbol===symbol)?.open,end=sessions[i+4].prices.find(p=>p.symbol===symbol)?.close;if(!(entry>0&&end>0))continue;
   const ret=end*(1-run.cost/10000)/(entry*(1+run.cost/10000))-1;priced++;sum+=ret;if(ret>0)wins++;
  }
 }
 return {eligibleNotPurchasedNameDays:eligibleNotPurchased,forwardFiveSessionObservableNameDays:priced,meanForwardFiveSessionNetPriceReturn:priced?sum/priced:null,forwardFiveSessionWinShare:priced?wins/priced:null,descriptiveCashTimesSpyPriceReturnDollars:cashBenchmarkPnl,limitations:'Overlapping descriptive returns; eligibility alone does not prove capacity, sleeve/risk/issuer/sector permission or attainable execution. Cash-times-SPY is an alternative exposure diagnostic, not realized loss or a trading recommendation.'};
}
module.exports={opportunity};

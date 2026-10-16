const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const sd=a=>a.length<2?0:Math.sqrt(a.reduce((s,x)=>s+(x-mean(a))**2,0)/(a.length-1));
function metrics(run){
 const c=run.curve;if(c.length<2||c.some(x=>!(x.equity>0)))throw Error('Positive equity path of at least two dates required');
 const returns=c.slice(1).map((x,i)=>x.equity/c[i].equity-1),years=(Date.parse(c.at(-1).date)-Date.parse(c[0].date))/86400000/365.25;
 if(!(years>0))throw Error('Positive chronological interval required');let peak=c[0].equity,dd=0;
 for(const x of c){peak=Math.max(peak,x.equity);dd=Math.min(dd,x.equity/peak-1);}
 const cash=c.map(x=>x.cash/x.equity),trades=run.trades||[],notional=trades.reduce((s,t)=>s+Math.abs(t.shares*t.price),0);
 const skipped=Object.entries(run.sleeves||{}).flatMap(([sleeve,r])=>(r.skippedOrders||[]).map(x=>({...x,sleeve}))),reasons={};for(const x of skipped)reasons[x.reason]=(reasons[x.reason]||0)+1;
 const impact=run.cost/10000,estimatedCosts=trades.filter(t=>t.reason!=='delisting-outcome').reduce((sum,t)=>sum+t.shares*(t.side==='buy'?t.price-t.price/(1+impact):t.price/(1-impact)-t.price),0);
 const capacityBlockedOpportunityDays=new Set([...(run.screenDecisions||[]).filter(x=>/below the three selected/.test(x.screenReview?.why||'')).map(x=>x.date+'|'+x.symbol),...skipped.filter(x=>x.reason==='position-limit').map(x=>x.date+'|'+x.symbol)]).size;
 const holdingAge={};for(const t of trades.filter(t=>t.side==='sell')){const h=t.holdingSessions;if(!Number.isFinite(h))continue;const bin=h<5?'0-4':h<30?'5-29':h<60?'30-59':'60+';const b=holdingAge[bin]??={sales:0,realizedPnl:0};b.sales++;b.realizedPnl+=t.realizedPnl||0;}
 const cashSorted=[...cash].sort((a,b)=>a-b),cashPercentiles=Object.fromEntries([.1,.5,.9].map(q=>[q,cashSorted[Math.min(cashSorted.length-1,Math.floor(q*cashSorted.length))]]));
 const blockedOpportunityDays=new Set(skipped.filter(t=>t.side==='buy').map(t=>t.date+'|'+t.symbol)).size;
 return {holdingAge,cashPercentiles,blockedOpportunityDays,capacityBlockedOpportunityDays,cashUtilization:1-mean(cash),liquidationAdjustedTotalReturn:(c.at(-1).equity-(c.at(-1).equity-c.at(-1).cash)*impact)/c[0].equity-1,totalReturn:c.at(-1).equity/c[0].equity-1,cagr:(c.at(-1).equity/c[0].equity)**(1/years)-1,sharpe:sd(returns)>0?Math.sqrt(252)*mean(returns)/sd(returns):null,maxDrawdown:dd,twoSidedAnnualTurnover:notional/mean(c.map(x=>x.equity))/years,transactionCount:trades.length,meanCashWeight:mean(cash),medianCashWeight:[...cash].sort((a,b)=>a-b)[Math.floor(cash.length/2)],estimatedCostFromFillAssumptions:estimatedCosts,blockedByReason:reasons,returns};
}
function seeded(seed){let state=seed>>>0;return()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};}
function bootstrapDifferences(control,candidates,{replicates=10000,block=20,seed=20261016,years=control.length/252}={}){
 const names=Object.keys(candidates),n=control.length;if(n<2||!(years>0)||names.some(k=>candidates[k].length!==n)||[control,...Object.values(candidates)].some(a=>a.some(x=>!Number.isFinite(x)||x<=-1)))throw Error('Aligned valid paired returns required');
 const random=seeded(seed),samples=Object.fromEntries(names.map(k=>[k,{mean:[],cagr:[],sharpe:[],drawdown:[]}]));
 const empty=()=>({sum:0,sq:0,log:0,wealth:1,peak:1,dd:0});
 const add=(s,r)=>{s.sum+=r;s.sq+=r*r;s.log+=Math.log1p(r);s.wealth*=1+r;s.peak=Math.max(s.peak,s.wealth);s.dd=Math.min(s.dd,s.wealth/s.peak-1);};
 const finish=s=>{const variance=Math.max(0,(s.sq-s.sum*s.sum/n)/(n-1));return {mean:s.sum/n,cagr:Math.exp(s.log/years)-1,sharpe:variance>0?Math.sqrt(252)*(s.sum/n)/Math.sqrt(variance):null,drawdown:s.dd};};
 for(let b=0;b<replicates;b++){
  let j=Math.floor(random()*n);const sums=Object.fromEntries(names.map(k=>[k,empty()])),base=empty();
  for(let i=0;i<n;i++){if(i&&random()<1/block)j=Math.floor(random()*n);add(base,control[j]);for(const k of names)add(sums[k],candidates[k][j]);j=(j+1)%n;}
  const baseline=finish(base);for(const k of names){const values=finish(sums[k]);for(const field of Object.keys(samples[k]))if(values[field]!==null&&baseline[field]!==null)samples[k][field].push(values[field]-baseline[field]);}
 }
 const result={};for(const k of names){const a=samples[k].mean.sort((a,b)=>a-b),observed=mean(candidates[k].map((x,i)=>x-control[i]));
  const p=(1+a.filter(x=>x-observed>=observed).length)/(replicates+1),intervals={};
  for(const [field,values] of Object.entries(samples[k])){values.sort((a,b)=>a-b);intervals[field]={ci95:values.length?[values[Math.floor(.025*values.length)],values[Math.min(values.length-1,Math.floor(.975*values.length))]]:null,finiteReplicates:values.length};}
  result[k]={meanDailyReturnDifference:observed,ci95:intervals.mean.ci95,intervals,pValue:p};}
 const ordered=names.sort((a,b)=>result[a].pValue-result[b].pValue);let adjusted=0;ordered.forEach((k,i)=>{adjusted=Math.max(adjusted,Math.min(1,result[k].pValue*(names.length-i)));result[k].holmAdjustedP=adjusted;});return result;
}
module.exports={metrics,bootstrapDifferences};

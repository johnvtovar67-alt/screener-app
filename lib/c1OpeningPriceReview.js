import {planC1ContinuedAccountOpening,c1CompletionPolicy} from './c1AccountExecution';

// Keep the original observed thesis. A vendor revision can cross this gate only
// when actual account history was unexposed and both bases give identical plans.
export function reviewC1OpeningPriceRevisions({account,sessions,opening,plan,now=new Date()}={}){
 const revisions=opening.priceBasisRevisions||[];
 if(!revisions.length)return plan;
 const reject=message=>{throw new Error('Price revision requires review: '+message);};
 const prior=sessions.at(-1),seen=new Set(),owned=new Set(['SPY','QQQ',...Object.values(account.adoption.seeds).flatMap(s=>s.positions.map(p=>p.symbol)),...account.records.flatMap(r=>(r.fills||[]).map(f=>f.symbol))]);
 const revised=JSON.parse(JSON.stringify(sessions)),latest=revised.at(-1);
 for(const r of revisions){
  const old=prior.prices.find(p=>p.symbol===r.symbol),bar=r.observedBar;
  if(seen.has(r.symbol)||owned.has(r.symbol))reject(r.symbol+' affects account history');
  seen.add(r.symbol);
  if(!old||old.close!==r.savedClose||bar?.date!==prior.date||r.rechecked!==true||!['open','high','low','close'].every(k=>Number.isFinite(bar[k])&&bar[k]>0)||bar.low>Math.min(bar.open,bar.close)||bar.high<Math.max(bar.open,bar.close))reject(r.symbol+' lacks consistent provider evidence');
  Object.assign(latest.prices.find(p=>p.symbol===r.symbol),{open:bar.open,high:bar.high,low:bar.low,close:bar.close});
  for(const list of [latest.signals||[],latest.positionSignals||[]])for(const signal of list)if(signal.symbol===r.symbol){
   for(const field of ['price','currentPrice','lastPrice','close'])if(Number.isFinite(signal[field]))signal[field]=bar.close;
  }
 }
 const make=(source,prices)=>planC1ContinuedAccountOpening({adoption:account.adoption,sessions:source,records:account.records,opening:{...opening,prices},observedAt:opening.receipt.observedAt,completionPolicy:c1CompletionPolicy(account.positionContext)});
 const economic=p=>JSON.stringify({orders:p.orders,blockedOrders:p.blockedOrders,entryReviews:p.entryReviews,openingBooks:p.openingBooks,projectedBooks:p.projectedBooks,riskBySleeve:p.riskBySleeve});
 if(economic(plan)!==economic(make(revised,opening.prices)))reject('the revised close changes opening orders or limits');
 const current=opening.prices.map(p=>{if(!Number.isFinite(p.observedPrice)||p.observedPrice<=0)reject('current quote is missing');return {...p,open:p.observedPrice};});
 if(economic(make(sessions,current))!==economic(make(revised,current)))reject('the revised close changes current-price orders or limits');
 return {...plan,sourceReceipt:{...plan.sourceReceipt,priceBasisReview:{contract:'c1-unexposed-opening-price-review-v1',sourceSessionDate:prior.date,observedAt:opening.receipt.observedAt,originalInputsPreserved:true,identicalOpeningPlan:true,identicalCurrentPricePlan:true,unexposedAccountHistory:true,revisions}}};
}

export function verifiedC1OpeningPriceBasis(receipt){
 if(receipt?.previousAdjustedClosesUnchanged===true)return true;
 const r=receipt?.priceBasisReview;
 return receipt?.previousAdjustedClosesUnchanged===false&&r?.contract==='c1-unexposed-opening-price-review-v1'&&r.observedAt===receipt.observedAt&&r.originalInputsPreserved===true&&r.identicalOpeningPlan===true&&r.identicalCurrentPricePlan===true&&r.unexposedAccountHistory===true&&Array.isArray(r.revisions)&&r.revisions.length>0&&r.revisions.every(x=>x.rechecked===true);
}

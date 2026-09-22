import {planC1ContinuedAccountOpening,c1CompletionPolicy} from './c1AccountExecution';

// Keep the original observed thesis and actual fills immutable. A repeat-verified
// vendor revision can cross this gate when replay still reconciles the recorded
// account and both bases produce the same actionable opening decisions. A held
// symbol is not, by itself, a reason to disable every opening check.
export function reviewC1OpeningPriceRevisions({account,sessions,opening,plan,now=new Date()}={}){
 const revisions=opening.priceBasisRevisions||[];
 if(!revisions.length)return plan;
 const reject=message=>{throw new Error('Price revision requires review: '+message);};
 const prior=sessions.at(-1),seen=new Set();
 const exposed=new Set([...Object.values(account.adoption.seeds).flatMap(s=>s.positions.map(p=>p.symbol)),
  ...account.records.flatMap(r=>(r.fills||[]).map(f=>f.symbol)),...(account.intradayActivity?.fills||[]).map(f=>f.symbol)]);
 const acceptedRevisions=[];
 const revised=JSON.parse(JSON.stringify(sessions)),latest=revised.at(-1);
 for(const r of revisions){
  const old=prior.prices.find(p=>p.symbol===r.symbol),bar=r.observedBar;
  if(seen.has(r.symbol))reject(r.symbol+' has duplicate provider evidence');
  seen.add(r.symbol);
  if(!old||old.close!==r.savedClose||bar?.date!==prior.date||r.rechecked!==true||!['open','high','low','close'].every(k=>Number.isFinite(bar[k])&&bar[k]>0)||bar.low>Math.min(bar.open,bar.close)||bar.high<Math.max(bar.open,bar.close))reject(r.symbol+' lacks consistent provider evidence');
  // Actual holdings and fills keep the close that governed their recorded
  // history. The verified provider correction is acknowledged in the receipt,
  // but is not allowed to rewrite the adoption or execution basis.
  if(exposed.has(r.symbol)){
   acceptedRevisions.push({...r,accountTreatment:'preserved-recorded-basis'});
   continue;
  }
  Object.assign(latest.prices.find(p=>p.symbol===r.symbol),{open:bar.open,high:bar.high,low:bar.low,close:bar.close});
  acceptedRevisions.push({...r,accountTreatment:'verified-parity-overlay'});
  for(const list of [latest.signals||[],latest.positionSignals||[]])for(const signal of list)if(signal.symbol===r.symbol){
   for(const field of ['price','currentPrice','lastPrice','close'])if(Number.isFinite(signal[field]))signal[field]=bar.close;
  }
 }
 const make=(source,prices)=>planC1ContinuedAccountOpening({adoption:account.adoption,sessions:source,records:account.records,opening:{...opening,prices},observedAt:opening.receipt.observedAt,completionPolicy:c1CompletionPolicy(account.positionContext)});
 // High-water marks may legitimately move with a corrected official close. They
 // are informational here unless they change the pause state or an actual order.
 const actionable=p=>JSON.stringify({orders:p.orders,blockedOrders:p.blockedOrders,entryReviews:p.entryReviews,
  openingBooks:p.openingBooks,projectedBooks:p.projectedBooks,
  riskBySleeve:Object.fromEntries(Object.entries(p.riskBySleeve).map(([id,risk])=>[id,{paused:risk.paused}]))});
 const revisedPlan=make(revised,opening.prices);
 if(actionable(plan)!==actionable(revisedPlan))reject('the revised close changes opening orders or limits');
 const current=opening.prices.map(p=>{if(!Number.isFinite(p.observedPrice)||p.observedPrice<=0)reject('current quote is missing');return {...p,open:p.observedPrice};});
 if(actionable(make(sessions,current))!==actionable(make(revised,current)))reject('the revised close changes current-price orders or limits');
 return {...plan,...revisedPlan,providerVerified:plan.providerVerified,quoteValidUntil:plan.quoteValidUntil,
  sourceReceipt:{...plan.sourceReceipt,priceBasisReview:{contract:'c1-verified-opening-price-review-v2',sourceSessionDate:prior.date,
   observedAt:opening.receipt.observedAt,provider:'FMP',endpoint:'historical-price-eod/dividend-adjusted',originalInputsPreserved:true,
   recordedAccountReplayPreserved:true,identicalOpeningPlan:true,identicalCurrentPricePlan:true,revisions:acceptedRevisions}}};
}

export function verifiedC1OpeningPriceBasis(receipt){
 if(receipt?.previousAdjustedClosesUnchanged===true)return true;
 const r=receipt?.priceBasisReview;
 const legacy=r?.contract==='c1-unexposed-opening-price-review-v1'&&r.unexposedAccountHistory===true;
 const verified=r?.contract==='c1-verified-opening-price-review-v2'&&r.provider==='FMP'&&r.endpoint==='historical-price-eod/dividend-adjusted'&&r.recordedAccountReplayPreserved===true;
 return receipt?.previousAdjustedClosesUnchanged===false&&(legacy||verified)&&r.observedAt===receipt.observedAt&&r.originalInputsPreserved===true&&r.identicalOpeningPlan===true&&r.identicalCurrentPricePlan===true&&Array.isArray(r.revisions)&&r.revisions.length>0&&r.revisions.every(x=>x.rechecked===true&&
  (legacy||['preserved-recorded-basis','verified-parity-overlay'].includes(x.accountTreatment)));
}

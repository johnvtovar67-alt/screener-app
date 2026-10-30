import {planC1ContinuedAccountOpening} from './c1AccountExecution';
import {c1CompletionPolicy} from './c1AccountLedger';
import {C1_PURCHASE_FUNDING_POLICY} from './c1BrokerageCash';
import {C1_ADDITIONAL_SWING_CAPACITY} from './c1AdditionalSwingCapacity';
import {compareC1OpeningPlans,verifiedC1OpeningPlanComparison} from './c1OpeningPlanComparison';

// Keep the original observed thesis and actual fills immutable. A repeat-verified
// vendor revision can cross this gate when replay still reconciles the recorded
// account and both bases produce the same actionable opening decisions. A held
// symbol is not, by itself, a reason to disable every opening check.
export function reviewC1OpeningPriceRevisions({account,sessions,historySessions,opening,plan,now=new Date()}={}){
 const revisions=opening.priceBasisRevisions||[];
 if(!revisions.length)return plan;
 const reject=message=>{throw new Error('Price revision requires review: '+message);};
 const prior=sessions.at(-1),{revised,acceptedRevisions}=c1OpeningRevisionSources({account,sessions,opening});
 // Compare the same plan contract on both price bases. Legacy plans retain
 // their defaults; current plans retain their server-produced funding/capacity
 // policies. Dropping those policies manufactures an unrelated order difference.
 const make=(source,prices)=>planC1ContinuedAccountOpening({adoption:account.adoption,sessions:source,historySessions:historySessions||sessions,records:account.records,cashReconciliations:account.cashReconciliations,opening:{...opening,prices},observedAt:opening.receipt.observedAt,completionPolicy:c1CompletionPolicy(account.positionContext),
  purchaseFundingIndependent:plan.purchaseFundingPolicy===C1_PURCHASE_FUNDING_POLICY,additionalSwingCapacity:plan.additionalSwingCapacity?.contract===C1_ADDITIONAL_SWING_CAPACITY});
 // Compare authority, not the incidental list/order of rejected backup names.
 // Recorded intraday order symbols remain protected through a refresh/rebase.
 const protectedSymbols=(account.intradayActivity?.plan?.orders||[]).map(order=>order.symbol);
 const revisedPlan=make(revised,opening.prices);
 const atOpen=compareC1OpeningPlans(plan,revisedPlan,{protectedSymbols});
 if(!atOpen.equivalent)reject(c1OpeningRevisionFailure('opening',atOpen.original,atOpen.revised));
 const current=opening.prices.map(p=>{if(!Number.isFinite(p.observedPrice)||p.observedPrice<=0)reject('current quote is missing');return {...p,open:p.observedPrice};});
 const currentPlan=make(sessions,current),revisedCurrentPlan=make(revised,current);
 const atCurrent=compareC1OpeningPlans(currentPlan,revisedCurrentPlan,{protectedSymbols});
 if(!atCurrent.equivalent)reject(c1OpeningRevisionFailure('current-price',atCurrent.original,atCurrent.revised));
 const reportsChanged=!atOpen.evidence.identicalEntryReviews||!atCurrent.evidence.identicalEntryReviews;
 const {contract:reviewContract,...proof}=reportsChanged?{contract:'c1-verified-opening-price-review-v3',
  identicalOpeningTradingAuthority:true,identicalCurrentPriceTradingAuthority:true,
  entryReviewComparison:{contract:'c1-opening-trading-authority-v1',opening:atOpen.evidence,currentPrice:atCurrent.evidence}}:
  {contract:'c1-verified-opening-price-review-v2',identicalOpeningPlan:true,identicalCurrentPricePlan:true};
 if(reportsChanged)try{console.info('C1_OPENING_REVISION_PARITY',JSON.stringify({code:'TRADING_AUTHORITY_UNCHANGED',
  openingReviewDifferences:atOpen.evidence.nonAuthorizingReviewDifferenceCount,currentPriceReviewDifferences:atCurrent.evidence.nonAuthorizingReviewDifferenceCount}));}catch{}
 return {...plan,...revisedPlan,providerVerified:plan.providerVerified,quoteValidUntil:plan.quoteValidUntil,
  sourceReceipt:{...plan.sourceReceipt,priceBasisReview:{contract:reviewContract,sourceSessionDate:prior.date,
   observedAt:opening.receipt.observedAt,provider:'FMP',endpoint:'historical-price-eod/dividend-adjusted',originalInputsPreserved:true,
   recordedAccountReplayPreserved:true,...proof,revisions:acceptedRevisions}}};
}

// Explain only the first difference already detected by the unchanged gate.
// Values and account/order identities never enter logs. Symbols appear only in
// the existing authenticated account error response, never in shared telemetry.
export function c1OpeningRevisionFailure(basis,left,right){
 const message='the revised close changes '+(basis==='current-price'?'current-price':'opening')+' orders or limits';
 let detail={category:'comparison',field:'unavailable',symbols:[]};
 const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const symbol=value=>typeof value==='string'&&/^[A-Z][A-Z0-9.-]{0,14}$/.test(value)?value:null;
 const symbols=(...values)=>[...new Set(values.map(symbol).filter(Boolean))];
 try{
  let found=false;
  for(const category of ['orders','blockedOrders','entryReviews']){
   if(equal(left[category],right[category]))continue;
   const a=left[category]||[],b=right[category]||[],index=Array.from({length:Math.max(a.length,b.length)},(_,i)=>i).find(i=>!equal(a[i],b[i]));
   const fields=['symbol','side','sleeve','shares','targetShares','estimatedPrice','condition','reason','blockReason','phase','sequence','id','additionalCapacity','additionalCapacityEvidence','minimumTradeDollars','executable'];
   detail={category,field:!a[index]||!b[index]?'membership':fields.find(k=>!equal(a[index][k],b[index][k]))||'other-evidence',symbols:symbols(a[index]?.symbol,b[index]?.symbol)};
   found=true;break;
  }
  for(const category of ['openingBooks','projectedBooks']){
   if(found||equal(left[category],right[category]))continue;
   for(const sleeve of ['base','cooldown15','sector40']){
    const a=left[category]?.[sleeve],b=right[category]?.[sleeve];
    if(equal(a,b))continue;
    detail={category,field:'book-evidence',symbols:[]};
    if(!equal(a?.cash,b?.cash))detail.field='cash';
    else for(const name of new Set([...Object.keys(a?.positions||{}),...Object.keys(b?.positions||{})])){
     const pa=a?.positions?.[name],pb=b?.positions?.[name];if(equal(pa,pb))continue;
     detail.field=!pa||!pb?'position-membership':['shares','avgCost','openedAt'].find(k=>!equal(pa[k],pb[k]))||'position-evidence';
     detail.symbols=symbols(name);break;
    }
    found=true;break;
   }
  }
  if(!found&&['base','cooldown15','sector40'].some(id=>left.riskBySleeve?.[id]?.paused!==right.riskBySleeve?.[id]?.paused))detail={category:'riskBySleeve',field:'paused',symbols:[]};
  if(!found&&detail.category==='comparison'&&!equal(left.additionalSwingCapacity,right.additionalSwingCapacity))detail={category:'additionalSwingCapacity',field:'selection',symbols:[]};
 }catch{} // Explanatory failure cannot replace or clear the rejection.
 try{console.warn('C1_OPENING_REVISION_DIFFERENCE',JSON.stringify({basis:basis==='current-price'?'CURRENT_PRICE':'OPENING',category:detail.category,field:detail.field}));}catch{}
 return message+' ('+[detail.category,...detail.symbols,detail.field].join(' ')+')';
}

// Shared immutable correction overlay for planning and quote requirements.
export function c1OpeningRevisionSources({account,sessions,opening}){
 const revisions=opening.priceBasisRevisions||[];
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
 return {revised,acceptedRevisions};
}

export function verifiedC1OpeningPriceBasis(receipt){
 if(receipt?.previousAdjustedClosesUnchanged===true)return true;
 const r=receipt?.priceBasisReview;
 const legacy=r?.contract==='c1-unexposed-opening-price-review-v1'&&r.unexposedAccountHistory===true;
 const verified=r?.contract==='c1-verified-opening-price-review-v2'&&r.provider==='FMP'&&r.endpoint==='historical-price-eod/dividend-adjusted'&&r.recordedAccountReplayPreserved===true;
 const authority=r?.contract==='c1-verified-opening-price-review-v3'&&r.provider==='FMP'&&r.endpoint==='historical-price-eod/dividend-adjusted'&&r.recordedAccountReplayPreserved===true&&
  r.identicalOpeningTradingAuthority===true&&r.identicalCurrentPriceTradingAuthority===true&&verifiedC1OpeningPlanComparison(r.entryReviewComparison);
 return receipt?.previousAdjustedClosesUnchanged===false&&(legacy||verified||authority)&&r.observedAt===receipt.observedAt&&r.originalInputsPreserved===true&&(authority||r.identicalOpeningPlan===true&&r.identicalCurrentPricePlan===true)&&Array.isArray(r.revisions)&&r.revisions.length>0&&r.revisions.every(x=>x.rechecked===true&&
  (legacy||['preserved-recorded-basis','verified-parity-overlay'].includes(x.accountTreatment)));
}

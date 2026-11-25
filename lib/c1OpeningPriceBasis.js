import {verifiedC1OpeningPlanComparison,verifiedC1OpeningPolicyComparison} from './c1OpeningPlanComparison';

// Shared receipt validation is browser-safe. Account replay stays server-side.
export function verifiedC1OpeningPriceBasis(receipt){
 if(receipt?.previousAdjustedClosesUnchanged===true)return true;
 const r=receipt?.priceBasisReview;
 const legacy=r?.contract==='c1-unexposed-opening-price-review-v1'&&r.unexposedAccountHistory===true;
 const verified=r?.contract==='c1-verified-opening-price-review-v2'&&r.provider==='FMP'&&r.endpoint==='historical-price-eod/dividend-adjusted'&&r.recordedAccountReplayPreserved===true;
 const authority=r?.contract==='c1-verified-opening-price-review-v3'&&r.provider==='FMP'&&r.endpoint==='historical-price-eod/dividend-adjusted'&&r.recordedAccountReplayPreserved===true&&
  r.identicalOpeningTradingAuthority===true&&r.identicalCurrentPriceTradingAuthority===true&&verifiedC1OpeningPlanComparison(r.entryReviewComparison);
 const policyAuthority=r?.contract==='c1-verified-opening-price-review-v4'&&r.provider==='FMP'&&r.endpoint==='historical-price-eod/dividend-adjusted'&&r.recordedAccountReplayPreserved===true&&
  r.identicalOpeningTradingAuthority===true&&r.identicalCurrentPriceTradingAuthority===true&&verifiedC1OpeningPolicyComparison(r.policyBlockComparison,r.entryReviewComparison);
 return receipt?.previousAdjustedClosesUnchanged===false&&(legacy||verified||authority||policyAuthority)&&r.observedAt===receipt.observedAt&&r.originalInputsPreserved===true&&(authority||policyAuthority||r.identicalOpeningPlan===true&&r.identicalCurrentPricePlan===true)&&Array.isArray(r.revisions)&&r.revisions.length>0&&r.revisions.every(x=>x.rechecked===true&&
  (legacy||['preserved-recorded-basis','verified-parity-overlay'].includes(x.accountTreatment)));
}

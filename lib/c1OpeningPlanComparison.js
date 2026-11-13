// A rejected backup is an explanation, not permission to trade. Compare the
// complete executable contract and every review concerning an actual holding,
// order or selected candidate before accepting any explanatory difference.
const ids=new Set(['base','cooldown15','sector40']);
const negativeReasons=new Set(['portfolio-cooldown','excluded-symbol','recent-momentum-entry-blocked-at-open',
 'position-limit','sector-position-limit','issuer-concentration-limit','entry-invalidated-at-open','existing-stop-or-exit',
 'entry-gap-limit','portfolio-contribution-gate','trade-size-limit','whole-share-limit','insufficient-cash',
 'portfolio-allowance-block','delisted','universe-removal','already-held','completion-closed','target-complete',
 'purchase-target-missing','not-in-entry-queue','recent-momentum-entry-blocked','recent-momentum-entry-evidence-unavailable']);
const json=value=>JSON.stringify(value);
const multiset=rows=>rows.map(json).sort();
const validSymbol=symbol=>typeof symbol==='string'&&/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol);
const reviewOnly=row=>row&&Object.keys(row).sort().join(',')==='reason,sleeve,symbol'&&
 ids.has(row.sleeve)&&validSymbol(row.symbol)&&negativeReasons.has(row.reason);

function compareC1OpeningPlansBeforePolicyDifference(original,revised,{protectedSymbols=[]}={}){
 const active=new Set(protectedSymbols);
 for(const plan of [original,revised]){
  for(const order of [...(plan.orders||[]),...(plan.blockedOrders||[])])active.add(order.symbol);
  for(const books of [plan.openingBooks,plan.projectedBooks])for(const book of Object.values(books||{}))
   for(const symbol of Object.keys(book.positions||{}))active.add(symbol);
  for(const symbol of plan.additionalSwingCapacity?.symbols||[])active.add(symbol);
 }
 const split=plan=>{
  // Unknown/malformed/extended review records remain in the exact comparison.
  const kept=[],background=[];
  for(const row of plan.entryReviews||[])(reviewOnly(row)&&!active.has(row.symbol)?background:kept).push(row);
  return {kept:multiset(kept),background:multiset(background)};
 };
 const left=split(original),right=split(revised);
 const capacity=plan=>{
  const value=plan.additionalSwingCapacity;
  if(!value)return value;
  return {...value,reviews:(value.reviews||[]).filter(row=>active.has(row.symbol))};
 };
 const authority=(plan,split)=>{
  // Collector provenance is checked separately. Preserve every other field,
  // including unknown future limits, rather than maintaining a partial list.
  const {providerVerified,sourceReceipt,quoteValidUntil,riskBySleeve,entryReviews,additionalSwingCapacity,...rest}=plan;
  return {...rest,
   riskBySleeve:Object.fromEntries(Object.entries(riskBySleeve||{}).map(([id,{highWater,...risk}])=>[id,risk])),
   additionalSwingCapacity:capacity(plan),entryReviews:split.kept.map(row=>JSON.parse(row))};
 };
 const a=authority(original,left),b=authority(revised,right);
 const counts=new Map();
 for(const row of left.background)counts.set(row,(counts.get(row)||0)+1);
 for(const row of right.background)counts.set(row,(counts.get(row)||0)-1);
 const differences=[...counts.values()].reduce((sum,count)=>sum+Math.abs(count),0);
 const identicalEntryReviews=json(original.entryReviews)===json(revised.entryReviews);
 return {equivalent:json(a)===json(b),original:a,revised:b,
  evidence:{originalReviewCount:(original.entryReviews||[]).length,revisedReviewCount:(revised.entryReviews||[]).length,
   protectedReviewsIdentical:json(left.kept)===json(right.kept),identicalEntryReviews,
   nonAuthorizingReviewDifferenceCount:differences,orderingOnly:!identicalEntryReviews&&differences===0}};
}

// Validate the explicit v3 proof; do not relabel changed reports as identical.
export function verifiedC1OpeningPlanComparison(value){
 if(value?.contract!=='c1-opening-trading-authority-v1')return false;
 const valid=row=>row&&row.protectedReviewsIdentical===true&&typeof row.identicalEntryReviews==='boolean'&&
  typeof row.orderingOnly==='boolean'&&['originalReviewCount','revisedReviewCount','nonAuthorizingReviewDifferenceCount']
   .every(key=>Number.isSafeInteger(row[key])&&row[key]>=0)&&
  row.nonAuthorizingReviewDifferenceCount<=row.originalReviewCount+row.revisedReviewCount&&
  (row.identicalEntryReviews?row.nonAuthorizingReviewDifferenceCount===0&&row.orderingOnly===false&&row.originalReviewCount===row.revisedReviewCount:
   row.orderingOnly===(row.nonAuthorizingReviewDifferenceCount===0));
 return Boolean(valid(value.opening)&&valid(value.currentPrice)&&
  (!value.opening.identicalEntryReviews||!value.currentPrice.identicalEntryReviews));
}

const clone=value=>JSON.parse(JSON.stringify(value));
const negative=new Set(['not-in-entry-queue','account-position-limit','account-issuer-limit','account-sector-position-limit',
 'account-concentration-limit','brokerage-cash-insufficient','account-allocation-whole-share-limit','account-allocation-trade-size-limit',
 'entry-gap-limit','entry-invalidated-at-open']);
const norm=value=>String(value||'').replace('-','.').toUpperCase().trim();
const symbol=value=>typeof value==='string'&&/^[A-Z][A-Z0-9.]{0,14}$/.test(value)&&value===norm(value);
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
function completeEvidence(plan){
 const policy=plan.accountPolicy,capacity=plan.additionalSwingCapacity,scan=capacity?.scan;
 return plan.contract==='c1-actual-account-opening-plan-v1'&&policy?.contract==='c1-account-policy-v2'&&policy.version===policy.contract&&
  policy.active===true&&policy.complete===true&&policy.purchaseEligibilityComplete===true&&policy.date===plan.date&&
  capacity?.contract==='c1-qualified-swing-capacity-v1'&&capacity.sourceSessionDate===plan.sourceSessionDate&&
  scan?.sourceSessionDate===plan.sourceSessionDate&&scan.complete===true&&scan.sourceComplete===true&&scan.evidenceComplete===true&&scan.accountEvidenceComplete===true&&
  ['unverifiedSymbols','missingQuoteSymbols','unverifiedEventSymbols','unverifiedHistorySymbols','unverifiedAccountSymbols'].every(key=>Array.isArray(scan[key])&&scan[key].length===0)&&
  Array.isArray(capacity.reviews)&&plain(policy.purchaseBlocks);
}
function protectedNames(plans,prior=[]){
 const active=new Set(prior.map(norm));
 for(const plan of plans){
  for(const row of [...(plan.orders||[]),...(plan.blockedOrders||[]),...(plan.actionBlockedOrders||[]),...(plan.accountActions||[])])active.add(norm(row.symbol));
  for(const books of [plan.openingBooks,plan.projectedBooks])for(const book of Object.values(books||{}))for(const name of Object.keys(book.positions||{}))active.add(norm(name));
  for(const name of [...(plan.additionalSwingCapacity?.symbols||[]),...(plan.additionalSwingCapacity?.eligibleSymbols||[]),...(plan.activeExitSymbols||[]),...(plan.accountPolicy?.activeExitSymbols||[])])active.add(norm(name));
  for(const row of plan.additionalSwingCapacity?.reviews||[])if(['Buy','Strong Buy'].includes(row.rating))active.add(norm(row.symbol));
 }
 return active;
}
export function compareC1OpeningPlans(original,revised,{protectedSymbols=[]}={}){
 const old=compareC1OpeningPlansBeforePolicyDifference(original,revised,{protectedSymbols});
 if(old.equivalent)return old;
 const a=original.accountPolicy?.purchaseBlocks,b=revised.accountPolicy?.purchaseBlocks;
 if(!plain(a)||!plain(b))return old;
 const names=[...new Set([...Object.keys(a),...Object.keys(b)])].filter(name=>json(a[name])!==json(b[name]));
 if(!names.length)return old;
 const reject=guard=>({...old,policyBlockRejection:{guard}});
 if(!completeEvidence(original)||!completeEvidence(revised))return reject('INCOMPLETE_EVIDENCE');
 const active=protectedNames([original,revised],protectedSymbols);
 for(const name of names){
  if(!symbol(name)||active.has(norm(name)))return reject('PROTECTED_CANDIDATE');
  if([a,b].some(blocks=>Object.hasOwn(blocks,name)&&!negative.has(blocks[name])))return reject('UNKNOWN_PURCHASE_BLOCK');
  // Explicitly prove this is an unselected Watch backup in each input. An
  // absent, duplicated or unclassified candidate cannot gain an exception.
  for(const plan of [original,revised]){
   const reviews=plan.additionalSwingCapacity.reviews.filter(row=>norm(row.symbol)===name);
   if(reviews.length!==1||reviews[0].rating!=='Watch')return reject('WATCH_NOT_VERIFIED');
  }
 }
 const strip=plan=>{const copy=clone(plan);for(const name of names)delete copy.accountPolicy.purchaseBlocks[name];return copy;};
 const compared=compareC1OpeningPlansBeforePolicyDifference(strip(original),strip(revised),{protectedSymbols});
 if(!compared.equivalent)return reject('OTHER_AUTHORITY_DIFFERENCE');
 // Only comparison copies omit these background explanations. The caller
 // retains the actual revised policy and records an explicit v4 proof.
 return {...compared,policyBlockEvidence:{
  protectedPurchaseBlocksIdentical:true,otherPolicyAndPlanFieldsIdentical:true,sourceAndCurrentEvidenceComplete:true,
  originalCount:Object.keys(a).length,revisedCount:Object.keys(b).length,nonAuthorizingDifferenceCount:names.length}};
}


export function c1OpeningPolicyComparisonEvidence(original,revised,comparison){
 if(comparison.policyBlockEvidence)return comparison.policyBlockEvidence;
 return {protectedPurchaseBlocksIdentical:comparison.equivalent===true,otherPolicyAndPlanFieldsIdentical:comparison.equivalent===true,
  sourceAndCurrentEvidenceComplete:completeEvidence(original)&&completeEvidence(revised),
  originalCount:Object.keys(original.accountPolicy?.purchaseBlocks||{}).length,revisedCount:Object.keys(revised.accountPolicy?.purchaseBlocks||{}).length,
  nonAuthorizingDifferenceCount:0};
}
export function verifiedC1OpeningPolicyComparison(value,entries){
 if(value?.contract!=='c1-opening-background-policy-comparison-v1'||Object.keys(value).sort().join(',')!=='contract,currentPrice,opening'||
  entries?.contract!=='c1-opening-trading-authority-v1')return false;
 const fields=['protectedPurchaseBlocksIdentical','otherPolicyAndPlanFieldsIdentical','sourceAndCurrentEvidenceComplete','originalCount','revisedCount','nonAuthorizingDifferenceCount'];
 const policy=row=>row&&Object.keys(row).sort().join(',')===[...fields].sort().join(',')&&
  fields.slice(0,3).every(key=>row[key]===true)&&fields.slice(3).every(key=>Number.isSafeInteger(row[key])&&row[key]>=0&&row[key]<=10000)&&
  row.nonAuthorizingDifferenceCount<=row.originalCount+row.revisedCount&&
  Math.abs(row.originalCount-row.revisedCount)<=row.nonAuthorizingDifferenceCount&&
  (row.nonAuthorizingDifferenceCount!==0||row.originalCount===row.revisedCount);
 const entry=row=>row&&row.protectedReviewsIdentical===true&&typeof row.identicalEntryReviews==='boolean'&&typeof row.orderingOnly==='boolean'&&
  ['originalReviewCount','revisedReviewCount','nonAuthorizingReviewDifferenceCount'].every(key=>Number.isSafeInteger(row[key])&&row[key]>=0)&&
  row.nonAuthorizingReviewDifferenceCount<=row.originalReviewCount+row.revisedReviewCount&&
  (row.identicalEntryReviews?row.nonAuthorizingReviewDifferenceCount===0&&row.orderingOnly===false&&row.originalReviewCount===row.revisedReviewCount:
   row.orderingOnly===(row.nonAuthorizingReviewDifferenceCount===0));
 return Boolean(policy(value.opening)&&policy(value.currentPrice)&&entry(entries.opening)&&entry(entries.currentPrice)&&
  value.opening.nonAuthorizingDifferenceCount+value.currentPrice.nonAuthorizingDifferenceCount>0);
}

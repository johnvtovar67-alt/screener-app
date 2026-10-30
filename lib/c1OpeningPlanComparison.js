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

export function compareC1OpeningPlans(original,revised,{protectedSymbols=[]}={}){
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

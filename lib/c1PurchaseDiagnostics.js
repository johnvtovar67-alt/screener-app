import {C1_FROZEN_OPTIONS} from './c1FrozenOptions';

// Read-only projection of this request's existing observations and outcomes.
// Component comparisons explain evidence; they never grant trading authority.
const targets=['MRNA','CRWD'],finite=value=>typeof value==='number'&&Number.isFinite(value);
const number=value=>finite(value)?value:null,positive=value=>finite(value)&&value>0?value:null;
const bool=value=>typeof value==='boolean'?value:null;
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value?value:null;
const time=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&date(value.slice(0,10))&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
const enumeration=(value,allowed)=>typeof value==='string'&&allowed.includes(value.toUpperCase())?value.toUpperCase():'UNAVAILABLE';
const rows=value=>Array.isArray(value)?value:[],own=(value,key)=>Boolean(value&&typeof value==='object'&&Object.hasOwn(value,key));
const entryReasons=new Set(['recorded-exit-required','recent-momentum-entry-blocked','recent-momentum-entry-evidence-unavailable','recent-momentum-entry-blocked-at-open','position-limit','portfolio-cooldown','sector-position-limit','issuer-concentration-limit','entry-gap-limit','entry-invalidated-at-open','existing-stop-or-exit','trade-size-limit','whole-share-limit','insufficient-cash','brokerage-cash-insufficient','brokerage-cash-missing','brokerage-cash-stale','brokerage-cash-invalid','portfolio-allowance-block','portfolio-contribution-gate','target-complete','purchase-target-missing','not-in-entry-queue','completion-closed','already-held','universe-removal','delisted']);
const reasonCodes=items=>[...new Set(items.map(row=>entryReasons.has(row?.reason)?row.reason.toUpperCase().replace(/-/g,'_'):'UNAVAILABLE'))];
function capacityCode(reason){
 const exact={
  'Current quote verification is incomplete; fresh capital is paused.':'QUOTE_VERIFICATION_INCOMPLETE',
  'A current material-event block prevents fresh capital.':'MATERIAL_EVENT_BLOCK',
  'Recent 1-, 3- and 5-session momentum does not clear the Buy/Add gate; historical rank alone cannot authorize fresh capital.':'RECENT_MOMENTUM_BLOCK',
  'Verified recent-momentum evidence is unavailable; fresh purchases and additions are paused.':'RECENT_MOMENTUM_UNAVAILABLE',
  'The current momentum rank is unavailable; fresh capital is paused.':'SOURCE_MOMENTUM_UNAVAILABLE',
  'Trailing 20-session dollar liquidity has not cleared the $300 million floor.':'LIQUIDITY_FLOOR',
  'The current price is below the C1 fresh-capital floor.':'PRICE_FLOOR',
  'This symbol is outside the active-swing mandate.':'EXCLUDED_SYMBOL',
  'Current screen verification is unavailable.':'SCREEN_UNAVAILABLE',
  'A higher-ranked stock from this sector is already selected.':'SECTOR_SELECTION',
  'Another share class from this issuer is already selected.':'ISSUER_SELECTION'
 };
 if(typeof reason!=='string')return 'UNAVAILABLE';
 if(Object.hasOwn(exact,reason))return exact[reason];
 if(/^The price is -?\d+(?:\.\d+)?% above the source-session close, beyond the 3% opening-gap limit\.$/.test(reason))return 'OPENING_GAP_LIMIT';
 if(/^Selected C1 opportunity #\d+; momentum rank #\d+\.$/.test(reason))return 'SELECTED';
 if(/^Momentum rank #\d+; below the three selected opportunities\.$/.test(reason))return 'RANK_SELECTION';
 return 'UNAVAILABLE';
}
function capacityReview(plan,symbol){
 const found=rows(plan?.additionalSwingCapacity?.reviews).filter(row=>row?.symbol===symbol),review=found.length===1?found[0]:null;
 const code=capacityCode(review?.reason),later=['RECENT_MOMENTUM_BLOCK','RECENT_MOMENTUM_UNAVAILABLE','SOURCE_MOMENTUM_UNAVAILABLE','LIQUIDITY_FLOOR','PRICE_FLOOR','EXCLUDED_SYMBOL','OPENING_GAP_LIMIT','SELECTED','RANK_SELECTION','SECTOR_SELECTION','ISSUER_SELECTION'].includes(code);
 return {status:review?'AVAILABLE':'UNAVAILABLE',rating:enumeration(review?.rating,['BUY','STRONG BUY','WATCH']),reasonCode:code,
  quoteVerdict:code==='QUOTE_VERIFICATION_INCOMPLETE'?'BLOCKED':code==='MATERIAL_EVENT_BLOCK'||later?'PASS_FROM_REASON_PRIORITY':'UNAVAILABLE',
  eventVerdict:code==='MATERIAL_EVENT_BLOCK'?'BLOCKED':later?'PASS_FROM_REASON_PRIORITY':'UNAVAILABLE',
  verdictBasis:code!=='UNAVAILABLE'&&code!=='SCREEN_UNAVAILABLE'?'ACTUAL_CAPACITY_REASON_PRIORITY':'UNAVAILABLE'};
}
function failureCode(value){
 if(typeof value!=='string'||!value)return 'UNAVAILABLE';
 if(/^Fresh opening quote missing for (MRNA|CRWD)$/.test(value))return 'TARGET_OPENING_QUOTE_UNAVAILABLE';
 if(/^Fresh opening quote missing for [A-Z][A-Z0-9.-]{0,15}$/.test(value))return 'OPENING_QUOTE_UNAVAILABLE';
 if(value==='Opening market-data request failed')return 'PROVIDER_REQUEST_FAILED';
 if(value==='Opening market-data response was empty')return 'PROVIDER_RESPONSE_EMPTY';
 if(value==='Market data provider is not configured')return 'PROVIDER_NOT_CONFIGURED';
 if(value==='A current regular-session opening and prior completed account session are required')return 'OPENING_SESSION_UNAVAILABLE';
 if(value.startsWith('Adjusted account price basis changed for '))return 'PRICE_BASIS_UNAVAILABLE';
 if(value.startsWith('Adjusted price revision is not stable for '))return 'PRICE_REVISION_UNSTABLE';
 if(value.startsWith('Index membership changed'))return 'MEMBERSHIP_UNVERIFIED';
 if(value.startsWith('Account sector classification changed for '))return 'SECTOR_CHANGED';
 return 'UNAVAILABLE';
}
function manualCode(value){
 const exact={
  'Manual quantities become available during the regular session after opening checks pass.':'OUTSIDE_REGULAR_SESSION',
  'Refresh for verified account opening prices and membership.':'OPENING_REVIEW_REQUIRED',
  'Account order checks did not pass.':'ACCOUNT_ORDER_CHECKS_FAILED',
  'Manual review enabled. Quantities use verified opening prices; confirm the current execution price and available cash before placing each order.':'READY',
  'Confirm completed-session activity in Account settings.':'COMPLETION_REQUIRED',
  'Market-data update pending. Reload after the update completes.':'SOURCE_PENDING'
 };
 if(typeof value!=='string')return 'UNAVAILABLE';
 if(Object.hasOwn(exact,value))return exact[value];
 if(value.startsWith('Opening checks did not pass: '))return 'OPENING_CHECKS_FAILED';
 if(value.startsWith('Market-data update pending for '))return 'SOURCE_PENDING';
 if(value.startsWith('Confirm completed-session activity in Account settings to update C1 beyond '))return 'COMPLETION_REQUIRED';
 return 'UNAVAILABLE';
}
function eventProjection(signal,baseline){
 const event=signal?.eventRisk||signal?.preTradeCheck||signal?.recommendation?.eventRisk||signal?.recommendation?.preTradeCheck||{};
 return {status:enumeration(event.status,['CLEAR','PASSED','BLOCKED','MANUAL','CAUTION']),blockNewCapital:bool(event.blockNewCapital),
  manualCheckRequired:bool(event.manualCheckRequired),checkComplete:bool(event.checkComplete),earningsCheckComplete:bool(event.earningsCheckComplete),
  mergerCheckComplete:bool(event.mergerCheckComplete),newsCheckComplete:bool(event.newsCheckComplete),eventRiskVerified:bool(signal?.eventRiskVerified),
  coverageAsOfPresent:own(baseline,'eventCoverageAsOf'),coverageAsOf:time(baseline?.eventCoverageAsOf),
  eventRiskAvailableAtPresent:own(signal,'eventRiskAvailableAt'),eventRiskAvailableAt:time(signal?.eventRiskAvailableAt),
  independentCurrentEvidence:'UNAVAILABLE'};
}
function reconciliationProjection(audits,symbol){
 const relevant=rows(audits).filter(a=>rows(a?.mismatches).some(row=>row?.symbol===symbol)),last=relevant.at(-1);
 const mismatch=rows(last?.mismatches).find(row=>row?.symbol===symbol),correction=rows(last?.correctedPrices).find(row=>row?.symbol===symbol),deferred=rows(audits).at(-1)?.deferredRevisionCount;
 return {appliedMismatchPresent:Array.isArray(audits)?Boolean(mismatch):null,appliedCorrectionPresent:Array.isArray(audits)?Boolean(mismatch&&correction):null,
  previousClose:number(mismatch?.previous?.close??mismatch?.previousClose),revisedClose:number(mismatch?.revised?.close??mismatch?.observedPriorClose),correctedClose:mismatch?number(correction?.close):null,
  latestRelevantSessionDate:date(last?.currentSessionDate),aggregateDeferredRevisionCount:Number.isSafeInteger(deferred)&&deferred>=0?deferred:null,perTickerDeferredState:'UNAVAILABLE'};
}
export function buildC1PurchaseDiagnostics({baseline,sourceBasis,sourceCapture,decision,requestedSymbols,collectionStatus,collectedOpening,plan,openingError,manualRecommendations,requestObservedAt,observedAt,commit,reconciliations}={}){
 const sourceDate=date(baseline?.date),at=time(observedAt),collection=enumeration(collectionStatus,['NOT_ATTEMPTED','REQUESTED','RETURNED','NO_OBSERVATION','FAILED']);
 const returned=collection==='RETURNED',requested=Array.isArray(requestedSymbols)?new Set(requestedSymbols):null;
 const selected=new Map([...rows(baseline?.positionSignals).map(signal=>[signal?.symbol,{signal,kind:'POSITION_SIGNALS'}]),...rows(baseline?.signals).map(signal=>[signal?.symbol,{signal,kind:'SIGNALS'}])]);
 const maximums=[...new Set(Object.values(C1_FROZEN_OPTIONS).map(config=>number(config.maxVolatility60Pct)))];
 const maxAge=Math.min(positive(collectedOpening?.receipt?.quoteMaximumAgeSeconds)??120,120);
 return {contract:'c1-purchase-diagnostics-v1',status:sourceDate?'AVAILABLE':'UNAVAILABLE',executable:false,
  requestObservedAt:time(requestObservedAt),observedAt:at,deployedCommit:typeof commit==='string'&&/^[a-f0-9]{7,40}$/.test(commit)?commit:'UNAVAILABLE',
  source:{sessionDate:sourceDate||'UNAVAILABLE',basis:enumeration(sourceBasis,['ACCEPTED_INDEX','REQUEST_ACCOUNT_BASELINE']),decisionAt:time(baseline?.decisionAt),captureObservedAt:sourceCapture?.sessionDate===sourceDate?time(sourceCapture?.observedAt):null},
  collection:{status:collection,receiptObservedAt:returned?time(collectedOpening?.receipt?.observedAt):null},
  review:{manualStatus:enumeration(manualRecommendations?.status,['READY','WAITING']),manualReasonCode:manualCode(manualRecommendations?.reason),openingPlanAvailable:Boolean(plan),providerVerified:bool(plan?.providerVerified),openingErrorPresent:Boolean(openingError),openingFailureCode:failureCode(openingError)},
  tickers:targets.map(symbol=>{
   const chosen=selected.get(symbol),signal=chosen?.signal,volatility=number(signal?.researchFactors?.volatility60Pct);
   const observations=rows(collectedOpening?.prices).filter(row=>row?.symbol===symbol),quote=returned&&observations.length===1?observations[0]:null;
   const stamp=time(quote?.observedAt),age=stamp&&at?(Date.parse(at)-Date.parse(stamp))/1000:null;
   const observationAvailable=returned&&Array.isArray(collectedOpening?.prices),present=observationAvailable?observations.length>0:null;
   return {symbol,source:{signalSource:chosen?.kind||'UNAVAILABLE',signalPresent:chosen?true:Array.isArray(baseline?.signals)||Array.isArray(baseline?.positionSignals)?false:null,price:positive(signal?.price??signal?.currentPrice??signal?.lastPrice??signal?.close),
    momentumPercentile:number(signal?.researchFactors?.momentumPercentile),volatility60Pct:volatility,
    volatilityLimits:maximums.map(max=>({maxVolatility60Pct:max,componentPredicatePass:volatility===null||max===null?null:volatility<=max})),event:eventProjection(signal,baseline)},
    nativeQueueIncluded:Array.isArray(decision?.opportunities)?decision.opportunities.some(row=>row?.symbol===symbol):null,
    opening:{requested:requested?requested.has(symbol):null,observed:present,status:!observationAvailable?'UNAVAILABLE':observations.length>1?'AMBIGUOUS':present?'OBSERVED':requested&&!requested.has(symbol)?'NOT_REQUESTED':'MISSING',
     open:positive(quote?.open),observedPrice:positive(quote?.observedPrice),providerObservedAt:stamp,ageSeconds:number(age),ageMaximumSeconds:maxAge,ageScope:'PROVIDER_TIMESTAMP_AGE_ONLY',ageWithinLimitPass:age===null?null:age>=0&&age<=maxAge},
    capacityReview:capacityReview(plan,symbol),entryReviewsAvailable:Array.isArray(plan?.entryReviews),entryReviewCodes:reasonCodes(rows(plan?.entryReviews).filter(row=>row?.symbol===symbol)),
    recheckCodes:reasonCodes(rows(plan?.entryRecheck?.blocks).filter(row=>row?.symbol===symbol)),reconciliation:reconciliationProjection(reconciliations,symbol)};
  })};
}
export function unavailableC1PurchaseDiagnostics({requestObservedAt,observedAt,commit,sourceSessionDate}={}){
 const report=buildC1PurchaseDiagnostics({requestObservedAt,observedAt,commit,collectionStatus:'UNAVAILABLE'});
 report.source.sessionDate=date(sourceSessionDate)||'UNAVAILABLE';
 report.review.openingPlanAvailable=null;report.review.openingErrorPresent=null;
 return report;
}

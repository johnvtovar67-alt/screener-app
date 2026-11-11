import {C1_WATCH_REASON_TEXT} from './c1CurrentWatchSelection';

const numeric=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
const boolean=value=>typeof value==='boolean'?value:null;
const text=value=>typeof value==='string'?value.slice(0,80):null;
const codes=new Set([...Object.keys(C1_WATCH_REASON_TEXT),'already-held','active-account-exit','account-stock-cooldown','verified-corporate-event-block',
 ...['rank','momentum','source-price','liquidity','factor-coverage','volatility','mandate'].map(reason=>'dated-'+reason),
 'source-version-mismatch','dated-source-not-current','source-date-mismatch','source-universe-unverified']);
const reasons=value=>Array.isArray(value)?value.filter(reason=>codes.has(reason)):[];
const numbers=(value,fields)=>Object.fromEntries(fields.map(field=>[field,numeric(value?.[field])]));
const booleans=(value,fields)=>Object.fromEntries(fields.map(field=>[field,boolean(value?.[field])]));
const reasonCounts=value=>Object.fromEntries(Object.entries(value||{}).filter(([key,count])=>codes.has(key)&&Number.isSafeInteger(count)&&count>=0));
const reasonDefinitions={...C1_WATCH_REASON_TEXT,
 'already-held':'This stock is already held and belongs in Portfolio.',
 'active-account-exit':'An active account exit excludes this monitoring candidate.',
 'account-stock-cooldown':'A known account-wide stock cooldown excludes this candidate.',
 'verified-corporate-event-block':'A currently verified corporate event excludes this candidate.',
 'source-version-mismatch':'The captured source or revision differs from the display frame.',
 'dated-source-not-current':'The captured server decision does not verify a current dated source.',
 'source-date-mismatch':'The snapshot, scan and decision source dates do not agree.',
 'source-universe-unverified':'Complete coverage of the accepted dated universe is unverified.',
 ...Object.fromEntries(['rank','momentum','source-price','liquidity','factor-coverage','volatility','mandate'].map(field=>['dated-'+field,
  'Accepted '+field.replaceAll('-',' ')+' must be verified and satisfy the existing structural requirements.']))};

// Explicit allowlist at the download boundary: never serialize raw props,
// account identities, balances, fills, ledger records or browser storage.
export function buildC1WatchDetails(selection={}){
 return {contract:'c1-watch-monitoring-details-v1',sourceSessionDate:/^\d{4}-\d{2}-\d{2}$/.test(selection.sourceSessionDate||'')?selection.sourceSessionDate:null,
  exportedAt:typeof selection.exportedAt==='string'&&Number.isFinite(Date.parse(selection.exportedAt))?new Date(selection.exportedAt).toISOString():null,
  note:'Dated monitoring facts and loaded execution-check statuses only. This file cannot authorize a purchase and does not change the account.',
  source:{verified:boolean(selection.verified),complete:boolean(selection.sourceComplete),provisional:boolean(selection.provisional),
   ...numbers(selection,['totalUniverse','candidateCount','limit','totalEligible']),problems:reasons(selection.sourceProblems)},
  counts:numbers(selection.counts,['candidates','monitoringEligible','displayed','omittedInOpportunities','excluded','datedUnverified','waiting']),
  rejectionCounts:reasonCounts(selection.rejectionCounts),unknownCounts:reasonCounts(selection.unknownCounts),waitCounts:reasonCounts(selection.waitCounts),
  reasonDefinitions,
  commonWaitReasons:reasons(selection.commonWaitReasons),
  executionReadiness:booleans(selection.executionReadiness,['previousSelectorCurrent','decisionCurrent','displayDecisionMasked','displayDecisionCurrent','serverDatedCurrent','accountMismatch','evidencePending','evidenceVerified',
   'openingPresent','reviewCurrent','marketOpen','accountPolicyComplete','purchaseEligibilityComplete']),
  candidates:(selection.diagnostics||[]).map(row=>({
   symbol:typeof row.symbol==='string'&&/^[A-Z0-9][A-Z0-9.]{0,14}$/.test(row.symbol)?row.symbol:null,sector:text(row.sector),
   ...numbers(row,['researchRank','policyScore','momentumPercentile','sourcePrice','factorCoverage','volatility60Pct','return120Ex20','return60Ex5']),
   sourceTiming:{...booleans(row.sourceTiming,['available','pass','strongPass','liquidityPass']),averageDollarVolume20:numeric(row.sourceTiming?.averageDollarVolume20)},
   recentMomentum:booleans(row.recentMomentum,['available','entryAllowed']),
   rating:['Buy','Strong Buy','Watch'].includes(row.rating)?row.rating:null,
   status:['displayed','shown-in-opportunities','excluded','dated-unverified','monitor'].includes(row.status)?row.status:null,
   eligible:boolean(row.eligible),omittedInOpportunities:boolean(row.omittedInOpportunities),
   rejectionReasons:reasons(row.rejectionReasons),unknownReasons:reasons(row.unknownReasons),waitReasons:reasons(row.waitReasons),
   currentChecks:{...booleans(row.currentChecks,['rowPresent','clientSnapshotFallback','dataFeedSnapshotStale','entryPass','openingUnverified']),
    event:['VERIFIED_CLEAR','VERIFIED_BLOCKED','UNVERIFIED'].includes(row.currentChecks?.event)?row.currentChecks.event:null,
    purchaseBlock:codes.has(row.currentChecks?.purchaseBlock)?row.currentChecks.purchaseBlock:null,
    entryChecks:booleans(row.currentChecks?.entryChecks,['sourcePurchaseEligible','recentMomentumClear','quoteVerified','eventClear','momentumAvailable',
     'liquidityVerified','priceFloor','excludedSymbol','openingGapClear'])}
  }))};
}

export function downloadC1WatchDetails(selection){
 const report=buildC1WatchDetails(selection),url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
 const link=document.createElement('a');link.href=url;link.download='C1-Watch-details-'+(report.sourceSessionDate||'unavailable')+'.json';
 document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}

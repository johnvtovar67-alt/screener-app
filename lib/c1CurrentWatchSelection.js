import {c1DatedWatchChecks,c1CurrentWatchExecutionChecks} from './c1StockClassification';
import {marketExecutionState} from './marketSession';

export const C1_CURRENT_WATCH_LIMIT=10;
const symbolOf=value=>String(value?.symbol||value?.ticker||value||'').replace('-','.').toUpperCase().trim();
const purchaseReasons=new Set(['not-in-entry-queue','brokerage-cash-insufficient','account-position-limit','account-sector-position-limit',
 'account-concentration-limit','account-issuer-limit','account-allocation-whole-share-limit','account-allocation-trade-size-limit',
 'account-exposure-unverified','entry-gap-limit','entry-invalidated-at-open']);
const countReasons=(rows,key)=>rows.reduce((counts,row)=>{for(const reason of row[key])counts[reason]=(counts[reason]||0)+1;return counts;},{});
export const C1_WATCH_REASON_TEXT={
 'market-closed':'The market is closed; execution checks wait for a regular session.',
 'quote-unverified':'A current verified quote is unavailable.',
 'event-unverified':'Current company-event verification is unavailable.',
 'recent-entry-trigger-wait':'Recent momentum has not cleared the Buy/Add trigger.',
 'recent-momentum-unavailable':'Recent entry-momentum evidence is unavailable.',
 'entry-timing-unavailable':'Accepted entry timing is unavailable.',
 'entry-trigger-wait':'Accepted-close timing is not confirmed; this is an informational monitoring state.',
 'opening-checks-unavailable':'Opening execution checks are unavailable.',
 'opening-review-not-current':'The account/opening review is not executable.',
 'live-screen-checks-pending':'Live entry verification is pending.',
 'account-verification-required':'Account verification is required before buying.',
 'account-policy-unverified':'Stock-cooldown evidence requires verification.',
 'current-entry-evidence-unverified':'Current quote, event or opening evidence is incomplete.',
 'not-in-entry-queue':'No current internal Buy/Add target exists.',
 'brokerage-cash-insufficient':'Available brokerage cash does not currently fund a purchase.',
 'account-position-limit':'Current account position capacity blocks buying.',
 'account-sector-position-limit':'Current sector capacity blocks buying.',
 'account-concentration-limit':'Current account concentration blocks buying.',
 'account-issuer-limit':'Current issuer capacity blocks buying.',
 'account-allocation-whole-share-limit':'Current allocation sizing cannot fund a whole share.',
 'account-allocation-trade-size-limit':'Current sizing does not meet the minimum trade.',
 'account-exposure-unverified':'Current account exposure is unverified.',
 'entry-gap-limit':'The current opening gap blocks buying.',
 'entry-invalidated-at-open':'The current opening price invalidates the entry setup.',
 'other-purchase-restriction':'A current purchase restriction requires review.'
};

export function watchWaitText(waitReasons=[],commonWaitReasons=[]){
 // Event evidence is a final purchase gate, but it is intentionally collected
 // only for candidates that can still become actionable. Do not report a
 // missing event receipt as the row's blocker when another check already
 // prevents entry; retain it in structured waitReasons for diagnostics.
 const otherReasons=waitReasons.filter(reason=>reason!=='event-unverified');
 const visibleReasons=otherReasons.length?otherReasons:waitReasons;
 const specific=visibleReasons.filter(reason=>!commonWaitReasons.includes(reason)),shared=visibleReasons.filter(reason=>commonWaitReasons.includes(reason));
 const detail=[...specific,...shared].slice(0,3).map(reason=>C1_WATCH_REASON_TEXT[reason]||'Current Buy/Add checks are not cleared.');
 return 'WAIT — '+(detail.length?detail.join(' '):'Dated monitoring only; no Buy/Add is currently authorized.');
}

// Accepted dated facts admit monitoring candidates. Live failures explain WAIT;
// this presentation neither changes Buy authority nor recalculates a ranking.
export function selectC1CurrentWatch({rows=[],decision,screenRows=[],heldSymbols=[],omittedSymbols=[],selectionEvidence=decision?.selectionEvidence,
 current=false,executionCurrent=false,displayDecisionMasked=false,displayDecisionCurrent=decision?.current===true,serverDatedCurrent=decision?.current===true,
 openingPlan=null,reviewCurrent=false,evidencePending=false,evidenceVerified=false,now=new Date()}={}){
 const snapshot=decision?.stockScreen,policy=decision?.accountPolicy,candidates=snapshot?.candidates||[];
 const observed=new Map(screenRows.map(row=>[symbolOf(row),row])),ratings=new Map(rows.map(row=>[symbolOf(row),row]));
 const held=new Set([...heldSymbols].map(symbolOf)),omitted=new Set([...omittedSymbols].map(symbolOf));
 const unverified=new Set((selectionEvidence?.unverifiedSymbols||[]).map(symbolOf));
 const exits=new Set([...(policy?.activeExitSymbols||[]),...(decision?.activeExitSymbols||[]),
  ...(decision?.accountActions||[]).filter(action=>action.side==='sell'&&action.conditional!==true).map(symbolOf)].map(symbolOf));
 const cooldowns=new Set((policy?.blockedSymbols||[]).map(symbolOf)),sourceComplete=snapshot?.scan?.complete===true;
 const verified=Boolean(current&&decision?.current===true&&snapshot?.sourceSessionDate===decision.sourceSessionDate&&
  snapshot?.scan?.sourceSessionDate===snapshot.sourceSessionDate&&sourceComplete);
 const marketOpen=marketExecutionState(now).isOpen;
 const commonWaitReasons=[...(!marketOpen?['market-closed']:[]),...(!openingPlan?['opening-checks-unavailable']:[]),
  ...(!reviewCurrent?['opening-review-not-current']:[]),...(evidencePending||!evidenceVerified?['live-screen-checks-pending']:[]),
  ...(decision?.accountMismatch?['account-verification-required']:[]),...(policy?.complete!==true?['account-policy-unverified']:[]),
  ...(policy?.purchaseEligibilityComplete===false?['account-exposure-unverified']:[])];
 const sourceProblems=[...(!current?['source-version-mismatch']:[]),...(decision?.current!==true?['dated-source-not-current']:[]),
  ...(snapshot?.sourceSessionDate!==decision?.sourceSessionDate||snapshot?.scan?.sourceSessionDate!==snapshot?.sourceSessionDate?['source-date-mismatch']:[]),
  ...(!sourceComplete?['source-universe-unverified']:[])];
 const diagnostics=candidates.map(candidate=>{
  const symbol=symbolOf(candidate),row=observed.get(symbol),rated=ratings.get(symbol),dated=c1DatedWatchChecks(candidate);
  const execution=c1CurrentWatchExecutionChecks({row,candidate,snapshot,now});
  const rejected=dated.rejected.map(reason=>'dated-'+reason),unknown=dated.unknown.map(reason=>'dated-'+reason);
  if(held.has(symbol))rejected.push('already-held');
  if(exits.has(symbol))rejected.push('active-account-exit');
  if(cooldowns.has(symbol))rejected.push('account-stock-cooldown');
  if(execution.event==='VERIFIED_BLOCKED')rejected.push('verified-corporate-event-block');
  const wait=[];
  if(!marketOpen)wait.push('market-closed');
  if(!row||row.clientSnapshotFallback||row.dataFeedSnapshotStale||!execution.checks.quoteVerified)wait.push('quote-unverified');
  if(execution.event==='UNVERIFIED')wait.push('event-unverified');
  if(candidate.recentMomentumGate?.available!==true)wait.push('recent-momentum-unavailable');
  else if(candidate.recentMomentumGate.entryAllowed!==true)wait.push('recent-entry-trigger-wait');
  if(candidate.sourceTiming?.available!==true)wait.push('entry-timing-unavailable');
  else if(candidate.sourceTiming.pass!==true)wait.push('entry-trigger-wait');
  if(!openingPlan)wait.push('opening-checks-unavailable');
  if(!reviewCurrent)wait.push('opening-review-not-current');
  if(evidencePending||!evidenceVerified)wait.push('live-screen-checks-pending');
  if(decision?.accountMismatch)wait.push('account-verification-required');
  if(policy?.complete!==true)wait.push('account-policy-unverified');
  if(policy?.purchaseEligibilityComplete===false)wait.push('account-exposure-unverified');
  if(unverified.has(symbol))wait.push('current-entry-evidence-unverified');
  const purchaseBlock=policy?.purchaseBlocks?.[symbol],block=purchaseBlock?(purchaseReasons.has(purchaseBlock)?purchaseBlock:'other-purchase-restriction'):null;
  if(block)wait.push(block);
  if(!execution.checks.openingGapClear&&!wait.includes('entry-gap-limit'))wait.push('entry-gap-limit');
  const eligible=dated.eligible&&rejected.length===0,omittedInOpportunities=eligible&&omitted.has(symbol);
  return {symbol,researchRank:candidate.researchRank,policyScore:candidate.policyScore,momentumPercentile:candidate.momentumPercentile,
   sourcePrice:candidate.sourcePrice,sector:candidate.sector,factorCoverage:candidate.factorCoverage,volatility60Pct:candidate.volatility60Pct,
   return120Ex20:candidate.return120Ex20,return60Ex5:candidate.return60Ex5,
   sourceTiming:{available:candidate.sourceTiming?.available,pass:candidate.sourceTiming?.pass,strongPass:candidate.sourceTiming?.strongPass,
    liquidityPass:candidate.sourceTiming?.liquidityPass,averageDollarVolume20:candidate.sourceTiming?.averageDollarVolume20},
   recentMomentum:{available:candidate.recentMomentumGate?.available,entryAllowed:candidate.recentMomentumGate?.entryAllowed},
   rating:rated?.rating||null,datedChecks:{eligible:dated.eligible,rejected:dated.rejected,unknown:dated.unknown},
   currentChecks:{rowPresent:Boolean(row),clientSnapshotFallback:row?.clientSnapshotFallback===true,dataFeedSnapshotStale:row?.dataFeedSnapshotStale===true,
    event:execution.event,entryPass:execution.pass,entryChecks:execution.checks,purchaseBlock:block,openingUnverified:unverified.has(symbol)},
   eligible,omittedInOpportunities,rejectionReasons:rejected,unknownReasons:unknown,waitReasons:[...new Set(wait)],
   status:unknown.length?'dated-unverified':rejected.length?'excluded':omittedInOpportunities?'shown-in-opportunities':'monitor'};
 });
 const eligible=diagnostics.filter(row=>row.eligible&&!row.omittedInOpportunities).sort((left,right)=>left.researchRank-right.researchRank||left.symbol.localeCompare(right.symbol));
 const unique=[...new Map(eligible.map(row=>[row.symbol,row])).values()],selected=verified?unique.slice(0,C1_CURRENT_WATCH_LIMIT):[];
 const selectedNames=new Set(selected.map(row=>row.symbol));
 for(const row of diagnostics)if(selectedNames.has(row.symbol))row.status='displayed';
 const unknownCount=diagnostics.filter(row=>row.unknownReasons.length).length;
  return {rows:selected.map(row=>({symbol:row.symbol,rating:'Watch',priority:row.researchRank-1,
   entryEvidence:{sector:row.sector,momentumScore:row.momentumPercentile,close:row.sourcePrice},monitoring:true,waitReasons:row.waitReasons,
   screenReview:{why:watchWaitText(row.waitReasons,commonWaitReasons),
    next:'Monitor the setup. A Buy/Add still needs every current account and execution check.'}})),
  limit:C1_CURRENT_WATCH_LIMIT,verified,totalEligible:verified?unique.length:null,sourceComplete,totalUniverse:snapshot?.scan?.totalUniverse??null,
  candidateCount:candidates.length,sourceSessionDate:snapshot?.sourceSessionDate||null,exportedAt:new Date(now).toISOString(),
  provisional:unknownCount>0,sourceProblems,diagnostics,commonWaitReasons,
  counts:{candidates:candidates.length,monitoringEligible:verified?unique.length:null,displayed:selected.length,
   omittedInOpportunities:diagnostics.filter(row=>row.omittedInOpportunities).length,excluded:diagnostics.filter(row=>row.rejectionReasons.length).length,
   datedUnverified:unknownCount,waiting:diagnostics.filter(row=>row.eligible&&row.waitReasons.length).length},
  rejectionCounts:countReasons(diagnostics,'rejectionReasons'),unknownCounts:countReasons(diagnostics,'unknownReasons'),waitCounts:countReasons(diagnostics,'waitReasons'),
  executionReadiness:{previousSelectorCurrent:executionCurrent,decisionCurrent:decision?.current===true,displayDecisionMasked,displayDecisionCurrent,serverDatedCurrent,accountMismatch:decision?.accountMismatch===true,
   evidencePending,evidenceVerified,openingPresent:Boolean(openingPlan),reviewCurrent,marketOpen,
   accountPolicyComplete:policy?.complete===true,purchaseEligibilityComplete:policy?.purchaseEligibilityComplete===true}};
}

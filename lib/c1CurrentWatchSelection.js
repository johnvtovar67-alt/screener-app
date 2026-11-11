import {c1CurrentWatchEntryChecks} from './c1StockClassification';

export const C1_CURRENT_WATCH_LIMIT=10;
const symbolOf=value=>String(value?.symbol||value?.ticker||value||'').replace('-','.').toUpperCase().trim();

// The complete accepted/provider/purchase universe remains upstream. This
// bounded list is only the current Watch presentation; no appearance history,
// additional ranking formula, quantity, sector slot or issuer slot is created.
export function selectC1CurrentWatch({rows=[],decision,screenRows=[],heldSymbols=[],selectionEvidence=decision?.selectionEvidence,current=false,now=new Date()}={}){
 const snapshot=decision?.stockScreen,policy=decision?.accountPolicy;
 const candidates=new Map((snapshot?.candidates||[]).map(row=>[symbolOf(row),row]));
 const observed=new Map(screenRows.map(row=>[symbolOf(row),row]));
 const held=new Set([...heldSymbols].map(symbolOf));
 const unverified=new Set((selectionEvidence?.unverifiedSymbols||[]).map(symbolOf));
 const forbidden=new Set([...(policy?.blockedSymbols||[]),...(policy?.activeExitSymbols||[]),...(decision?.activeExitSymbols||[]),
  ...(decision?.accountActions||[]).filter(action=>action.side==='sell'&&action.conditional!==true).map(symbolOf)].map(symbolOf));
 const verified=current&&decision?.current===true&&!decision.accountMismatch&&snapshot?.sourceSessionDate===decision.sourceSessionDate&&
  snapshot?.scan?.complete===true&&policy?.complete===true&&policy.purchaseEligibilityComplete!==false;
 const eligible=verified?rows.filter(row=>{
  const symbol=symbolOf(row),candidate=candidates.get(symbol),observation=observed.get(symbol);
  // No current Buy/Add target can mean an entry trigger is still pending.
  // Concrete account/cash/sizing restrictions remain hard exclusions.
  const block=policy.purchaseBlocks?.[symbol];
  return row.rating==='Watch'&&!held.has(symbol)&&!forbidden.has(symbol)&&!unverified.has(symbol)&&(!block||block==='not-in-entry-queue')&&
   !observation?.clientSnapshotFallback&&!observation?.dataFeedSnapshotStale&&
   c1CurrentWatchEntryChecks({row:observation,candidate,snapshot,now});
 }).sort((left,right)=>candidates.get(symbolOf(left)).researchRank-candidates.get(symbolOf(right)).researchRank||symbolOf(left).localeCompare(symbolOf(right))):[];
 const unique=[...new Map(eligible.map(row=>[symbolOf(row),row])).values()];
 return {rows:unique.slice(0,C1_CURRENT_WATCH_LIMIT),limit:C1_CURRENT_WATCH_LIMIT,verified:Boolean(verified),totalEligible:verified?unique.length:null,
  sourceComplete:snapshot?.scan?.complete===true,totalUniverse:snapshot?.scan?.totalUniverse??null,candidateCount:candidates.size};
}

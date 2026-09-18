import { C1_SESSION_REVISION_REVIEW } from './c1SessionRevisionReview';

// A reviewed provider finalization, bound to one immutable book and two archived
// captures. This is not a tolerance or a general corporate-action exemption.
export function reconcileC1ReviewedSession(prior,input,now,digest,advance,observations) {
 const review=C1_SESSION_REVISION_REVIEW;
 if(prior.recordHash!==review.priorRecordHash||input.sourceSessionDate!==review.currentSessionDate)return null;
 const reject=()=>{throw new Error('Reviewed session revision evidence or economic parity failed');};
 const {recordHash,...saved}=prior;
 if(digest(saved)!==recordHash||prior.universe!=='sp500'||input.sourceReceipt?.provider!=='FMP'||
  input.priceEvidence?.endpoint!=='historical-price-eod/dividend-adjusted')reject();
 const rows=payload=>payload.priceEvidence.rows.filter(r=>r.date===review.previousSessionDate)
  .map(r=>({...r,symbol:({'BRK-B':'BRK.B','BF-B':'BF.B'})[r.symbol]||r.symbol})).sort((a,b)=>a.symbol.localeCompare(b.symbol));
 const evidence=rows(input);
 if(digest(evidence)!==review.evidenceHash)reject();
 const confirmed=review.observations.map(hash=>observations.find(o=>o.observationHash===hash));
 if(confirmed.some(o=>!o||digest(rows(o.payload))!==review.evidenceHash)||new Set(confirmed.map(o=>o.observedAt)).size!==2)reject();
 const revised=JSON.parse(JSON.stringify(prior.model)),previous=revised.sessions.at(-1);
 if(previous.date!==review.previousSessionDate)reject();
 const correctedPrices=previous.prices.map(p=>{
  const matches=evidence.filter(r=>r.symbol===p.symbol);if(matches.length!==1)reject();
  const r=matches[0],bar={...p,open:r.adjOpen,high:r.adjHigh,low:r.adjLow,close:r.adjClose,volume:r.volume};
  if(!['open','high','low','close'].every(k=>Number.isFinite(bar[k])&&bar[k]>0)||!Number.isFinite(bar.volume)||bar.volume<0||bar.low>Math.min(bar.open,bar.close)||bar.high<Math.max(bar.open,bar.close))reject();
  return bar;
 });
 previous.prices=correctedPrices;
 const original=advance(prior.model,[input.session],now,{completedCloseQueue:true});
 const corrected=advance(revised,[input.session],now,{completedCloseQueue:true});
 for(const k of ['ledger','pendingBySleeve','paperExecution','paperExecutionStatus','summary'])if(digest(original[k])!==digest(corrected[k]))reject();
 if(original.paperExecutionStatus?.status==='blocked')reject();
 return {model:original,audit:{contract:'c1-reviewed-session-revision-v1',priorRecordHash:recordHash,
  previousSessionDate:review.previousSessionDate,currentSessionDate:review.currentSessionDate,
  evidenceHash:review.evidenceHash,observations:review.observations,correctedPrices,
  originalInputsPreserved:true,identicalModelEconomics:true,economicAdjustments:[],eligibleForAlphaClaim:false}};
}

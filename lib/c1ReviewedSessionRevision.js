import { C1_SESSION_REVISION_REVIEW } from './c1SessionRevisionReview';

const aliases = { 'BRK-B': 'BRK.B', 'BF-B': 'BF.B' };
const economicFields = ['ledger','pendingBySleeve','paperExecution','paperExecutionStatus','summary'];
const validBar = bar => ['open','high','low','close'].every(k=>Number.isFinite(bar[k])&&bar[k]>0)&&
 Number.isFinite(bar.volume)&&bar.volume>=0&&bar.low<=Math.min(bar.open,bar.close)&&bar.high>=Math.max(bar.open,bar.close);

// FMP can finalize adjusted history after C1 first observes a session. Two
// independently archived observations must agree on the complete replacement
// bar set, and both the virtual model and each private account must replay to
// the identical result. The accepted as-observed session is never rewritten;
// the correction and its evidence are appended as an audit receipt.
export function reconcileC1VerifiedProviderRevision(prior,input,now,digest,advance,observations=[]) {
 const reject=()=>{throw new Error('Verified provider revision evidence or economic parity failed');};
 const {recordHash,...saved}=prior,previous=prior.model.sessions.at(-1);
 if(digest(saved)!==recordHash||prior.universe!=='sp500'||prior.model.ledger?.kind!=='virtual-model'||
  input.sourceReceipt?.provider!=='FMP'||input.sourceReceipt?.membershipCheckedTwice!==true||
  input.priceEvidence?.contract!=='c1-provider-price-fields-v1'||
  input.priceEvidence?.endpoint!=='historical-price-eod/dividend-adjusted'||!previous||
  input.priorSessionPrices?.date!==previous.date)reject();
 const rows=payload=>{
  if(payload?.sourceReceipt?.provider!=='FMP'||payload.priceEvidence?.contract!=='c1-provider-price-fields-v1'||
   payload.priceEvidence?.endpoint!=='historical-price-eod/dividend-adjusted'||
   payload.sourceSessionDate!==input.sourceSessionDate||payload.priorSessionPrices?.date!==previous.date)return null;
  const selected=payload.priceEvidence.rows.filter(r=>r.date===previous.date)
   .map(r=>({...r,symbol:aliases[r.symbol]||r.symbol})).sort((a,b)=>a.symbol.localeCompare(b.symbol));
  if(selected.length!==previous.prices.length||new Set(selected.map(r=>r.symbol)).size!==selected.length)return null;
  return selected;
 };
 const evidence=rows(input);if(!evidence)reject();
 const evidenceHash=digest(evidence),confirmed=observations.filter(o=>rows(o.payload)&&digest(rows(o.payload))===evidenceHash);
 if(!confirmed.some(o=>o.payload?.observedAt===input.observedAt)||
  new Set(confirmed.map(o=>o.observedAt)).size<2||new Set(confirmed.map(o=>o.observationHash)).size<2)reject();
 const bySymbol=new Map(evidence.map(r=>[r.symbol,r])),correctedPrices=[],mismatches=[];
 for(const price of previous.prices){
  const row=bySymbol.get(price.symbol);if(!row)reject();
  const corrected={...price,open:row.adjOpen,high:row.adjHigh,low:row.adjLow,close:row.adjClose,volume:row.volume};
  if(!validBar(corrected))reject();
  const changed=['open','high','low','close','volume'].filter(k=>price[k]!==corrected[k]);
  if(changed.length)mismatches.push({symbol:price.symbol,fields:changed,previous:Object.fromEntries(changed.map(k=>[k,price[k]])),
   revised:Object.fromEntries(changed.map(k=>[k,corrected[k]]))});
  correctedPrices.push(corrected);
 }
 if(!mismatches.length)reject();
 const revised=JSON.parse(JSON.stringify(prior.model));revised.sessions.at(-1).prices=correctedPrices;
 const original=advance(prior.model,[input.session],now,{completedCloseQueue:true});
 const corrected=advance(revised,[input.session],now,{completedCloseQueue:true});
 for(const key of economicFields)if(digest(original[key])!==digest(corrected[key]))reject();
 if(original.paperExecutionStatus?.status==='blocked')reject();
 return {model:original,audit:{contract:'c1-provider-revision-reconciliation-v1',priorRecordHash:recordHash,
  provider:'FMP',endpoint:'historical-price-eod/dividend-adjusted',previousSessionDate:previous.date,
  currentSessionDate:input.sourceSessionDate,evidenceHash,observations:confirmed.map(o=>o.observationHash),
  mismatches,correctedPrices,originalInputsPreserved:true,identicalModelEconomics:true,
  comparisonHash:digest(Object.fromEntries(economicFields.map(k=>[k,original[k]]))),
  economicAdjustments:[],executable:false,eligibleForAlphaClaim:false}};
}

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
  .map(r=>({...r,symbol:aliases[r.symbol]||r.symbol})).sort((a,b)=>a.symbol.localeCompare(b.symbol));
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

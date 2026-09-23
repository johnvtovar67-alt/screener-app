import { continueC1ActualAccount, planC1ContinuedAccountOpening, c1CompletionPolicy } from './c1AccountExecution';
import { C1_SESSION_REVISION_REVIEW } from './c1SessionRevisionReview';

// Supplemental observations belong to the private account, never the index.
// They fill absent holding prices without adding index members or replacing
// accepted prices. Held-stock momentum reviews are a separate private overlay.
export function c1AccountBook(book, coverage) {
 if(!coverage)return book;
 if(Array.isArray(coverage))return coverage.reduce((current,item)=>c1AccountBook(current,item),book);
 const baseline=book.model.sessions.find(s=>s.date===coverage.sourceSessionDate);
 if(coverage.contract!=='c1-held-price-coverage-v1'||!baseline||!Array.isArray(coverage.rows)||!coverage.rows.length)throw new Error('Invalid supplemental account input');
 const seen=new Set(),prices=[...baseline.prices],legacyHoldingSignals=[...(baseline.legacyHoldingSignals||[])];
 for(const row of coverage.rows){
  const p=row.price;
  if(seen.has(row.symbol)||row.status!=='verified'||row.date!==baseline.date||p?.symbol!==row.symbol||p.date!==baseline.date||p.adjusted!==true||
   !['open','high','low','close'].every(k=>Number.isFinite(p[k])&&p[k]>0)||p.low>Math.min(p.open,p.close)||p.high<Math.max(p.open,p.close)||
   row.source?.provider!=='FMP'||row.source.endpoint!=='historical-price-eod/dividend-adjusted'||!Number.isFinite(Date.parse(row.source.observedAt)))throw new Error('Invalid verified holding observation');
  if(!baseline.universeSymbols.includes(row.symbol)){
   const c=row.classification;
   if(c?.symbol!==row.symbol||c.provider!=='FMP'||c.endpoint!=='profile'||typeof c.sector!=='string'||!c.sector.trim()||typeof c.issuer!=='string'||!c.issuer||!Number.isFinite(Date.parse(c.observedAt)))throw new Error('Verified inherited holding classification required: '+row.symbol);
   const previous=book.model.sessions.flatMap(s=>s.legacyHoldingSignals||[]).find(s=>s.symbol===row.symbol);
   if(previous&&(previous.sector!==c.sector||previous.issuer!==c.issuer))throw new Error('Inherited holding classification changed: '+row.symbol);
   legacyHoldingSignals.push({symbol:row.symbol,sector:c.sector,issuer:c.issuer,inheritedRiskOnly:true});
  }else if(![...(baseline.positionSignals||[]),...(baseline.signals||[])].some(s=>s.symbol===row.symbol))throw new Error('C1 holding signal unavailable: '+row.symbol);
  if(prices.some(p=>p.symbol===row.symbol))throw new Error('Supplemental observation cannot replace an accepted price: '+row.symbol);
  seen.add(row.symbol);prices.push({...p});
 }
 return {...book,model:{...book.model,sessions:book.model.sessions.map(s=>s===baseline?{...s,prices,legacyHoldingSignals}:s)}};
}

// Provider corrections are append-only index evidence. The accepted model and
// the actual account both retain their original historical bars and recorded
// fills; only the next observed session is appended. Never reinterpret private
// ownership merely because it was absent from the virtual model.
export function assertC1AccountRevisionCoverage(book, account, through) {
 for(const audit of book.reconciliations||[]){
  if(['c1-reviewed-session-revision-v1','c1-provider-revision-reconciliation-v1'].includes(audit.contract)&&
   audit.currentSessionDate<=through&&audit.currentSessionDate>account.adoption.sourceSessionDate){
   assertReviewedAccountParity(book,account,audit);
   continue;
  }
  if(audit.contract!=='c1-unexposed-price-reconciliation-v1'||audit.currentSessionDate>through||
    audit.currentSessionDate<=account.adoption.sourceSessionDate)continue;
  if(typeof audit.priorRecordHash!=='string'||typeof audit.previousSessionDate!=='string'||
   typeof audit.comparisonHash!=='string'||!Array.isArray(audit.mismatches)||!audit.mismatches.length||
   audit.originalInputsPreserved!==true||!Array.isArray(audit.economicAdjustments)||audit.economicAdjustments.length||
   audit.executable!==false||audit.eligibleForAlphaClaim!==false)
   throw new Error('Saved holding price history requires reviewed account reconciliation');
 }
}

// A model-only proof is insufficient for an actual account. Replay its actual
// fills and all stop/cooldown state under both bars, then compare opening plans.
// Original prices, account history and recorded capital are never rewritten.
function assertReviewedAccountParity(book,account,audit){
 const review=C1_SESSION_REVISION_REVIEW;
 const reject=()=>{throw new Error('Saved holding price history requires reviewed account reconciliation');};
 const legacy=audit.contract==='c1-reviewed-session-revision-v1';
 if((legacy&&(audit.priorRecordHash!==review.priorRecordHash||audit.evidenceHash!==review.evidenceHash||
  audit.previousSessionDate!==review.previousSessionDate||audit.currentSessionDate!==review.currentSessionDate))||
  (!legacy&&(audit.contract!=='c1-provider-revision-reconciliation-v1'||audit.provider!=='FMP'||
   audit.endpoint!=='historical-price-eod/dividend-adjusted'||typeof audit.priorRecordHash!=='string'||
   typeof audit.evidenceHash!=='string'||!Array.isArray(audit.observations)||new Set(audit.observations).size<2))||
  !Array.isArray(audit.correctedPrices)||!audit.correctedPrices.length||
  audit.originalInputsPreserved!==true||audit.identicalModelEconomics!==true)reject();
 // A repeat-confirmed provider revision is appended as evidence; it never
 // rewrites the actual account's accepted historical prices, fills or cash.
 // Model parity was already proved before the daily book advanced. Requiring
 // a second hypothetical private-account plan to match would turn a later FMP
 // edit into a permanent operational stop even though recorded history remains
 // authoritative and unchanged.
 if(!legacy){
  if(!Array.isArray(audit.mismatches)||!audit.mismatches.length||
   (Array.isArray(audit.economicAdjustments)&&audit.economicAdjustments.length))reject();
  return;
 }
 const sessions=book.model.sessions.filter(s=>s.date>=account.adoption.sourceSessionDate&&s.date<=audit.previousSessionDate);
 const opening=book.model.sessions.find(s=>s.date===audit.currentSessionDate);
 if(!sessions.length||!opening||sessions.at(-1).date!==audit.previousSessionDate)reject();
 const revised=JSON.parse(JSON.stringify(sessions));
 for(const p of revised.at(-1).prices){const replacement=audit.correctedPrices.find(r=>r.symbol===p.symbol);if(replacement)Object.assign(p,replacement);}
 const records=account.records.filter(r=>r.date<=audit.previousSessionDate);
 const observedAt=book.captures.find(c=>c.sessionDate===audit.currentSessionDate)?.observedAt;
 const state=source=>{
  const run=continueC1ActualAccount({adoption:account.adoption,sessions:source,records,cashReconciliations:account.cashReconciliations,observedAt});
  return {books:run.books,replay:run.replay,actualCash:run.actualCash,sleeves:Object.fromEntries(Object.entries(run.sleeves).map(([id,s])=>[id,{
   trades:s.trades,pendingDecisions:s.pendingDecisions,accountRisk:s.accountRisk,actualCash:s.actualCash,
   unresolvedUniverseRemovals:s.unresolvedUniverseRemovals,skippedOrders:s.skippedOrders,
   openPositions:s.openPositions.map(({lastPrice,...position})=>position)
  }]))};
 };
 if(JSON.stringify(state(sessions))!==JSON.stringify(state(revised)))reject();
 const plan=source=>{
  const p=planC1ContinuedAccountOpening({adoption:account.adoption,sessions:source,records,cashReconciliations:account.cashReconciliations,opening,observedAt,completionPolicy:c1CompletionPolicy(account.positionContext)});
  return {orders:p.orders,blockedOrders:p.blockedOrders,entryReviews:p.entryReviews,openingBooks:p.openingBooks,projectedBooks:p.projectedBooks,riskBySleeve:p.riskBySleeve};
 };
 if(JSON.stringify(plan(sessions))!==JSON.stringify(plan(revised)))reject();
}

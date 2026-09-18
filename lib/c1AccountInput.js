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

// An index reconciliation does not prove private-account non-exposure. Never
// carry a revised basis across an actual holding or earlier fill.
export function assertC1AccountRevisionCoverage(book, account, through) {
 for(const audit of book.reconciliations||[]){
  if(audit.contract==='c1-reviewed-session-revision-v1'&&audit.currentSessionDate<=through&&audit.currentSessionDate>account.adoption.sourceSessionDate){
   assertReviewedAccountParity(book,account,audit);
   continue;
  }
  if(audit.contract!=='c1-unexposed-price-reconciliation-v1'||audit.currentSessionDate>through||
    audit.currentSessionDate<=account.adoption.sourceSessionDate)continue;
  const owned=new Set(Object.values(account.adoption.seeds).flatMap(s=>s.positions.map(p=>p.symbol)));
  // A later purchase is not exposure to the earlier revised close. Unknown
  // dates remain conservative; historical fills and adopted holdings retain
  // their existing reconciliation requirement even if subsequently sold.
  for(const record of [...account.records,...(account.intradayActivity?[account.intradayActivity]:[])]){
   const validDate=typeof record.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(record.date)&&
    Number.isFinite(Date.parse(record.date))&&new Date(record.date).toISOString().slice(0,10)===record.date;
   if(!validDate||!audit.previousSessionDate||record.date<=audit.previousSessionDate)
    for(const fill of record.fills||[])owned.add(fill.symbol);
  }
  const affected=audit.mismatches.find(r=>owned.has(r.symbol));
  if(affected)throw new Error('Saved holding price history requires reconciliation: '+affected.symbol);
 }
}

// A model-only proof is insufficient for an actual account. Replay its actual
// fills and all stop/cooldown state under both bars, then compare opening plans.
// Original prices, account history and recorded capital are never rewritten.
function assertReviewedAccountParity(book,account,audit){
 const review=C1_SESSION_REVISION_REVIEW;
 const reject=()=>{throw new Error('Saved holding price history requires reviewed account reconciliation');};
 if(audit.priorRecordHash!==review.priorRecordHash||audit.evidenceHash!==review.evidenceHash||
  audit.previousSessionDate!==review.previousSessionDate||audit.currentSessionDate!==review.currentSessionDate||
  audit.originalInputsPreserved!==true||audit.identicalModelEconomics!==true)reject();
 const sessions=book.model.sessions.filter(s=>s.date>=account.adoption.sourceSessionDate&&s.date<=audit.previousSessionDate);
 const opening=book.model.sessions.find(s=>s.date===audit.currentSessionDate);
 if(!sessions.length||!opening||sessions.at(-1).date!==audit.previousSessionDate)reject();
 const revised=JSON.parse(JSON.stringify(sessions));
 for(const p of revised.at(-1).prices){const replacement=audit.correctedPrices.find(r=>r.symbol===p.symbol);if(replacement)Object.assign(p,replacement);}
 const records=account.records.filter(r=>r.date<=audit.previousSessionDate);
 const observedAt=book.captures.find(c=>c.sessionDate===audit.currentSessionDate)?.observedAt;
 const state=source=>{
  const run=continueC1ActualAccount({adoption:account.adoption,sessions:source,records,observedAt});
  return {books:run.books,replay:run.replay,actualCash:run.actualCash,sleeves:Object.fromEntries(Object.entries(run.sleeves).map(([id,s])=>[id,{
   trades:s.trades,pendingDecisions:s.pendingDecisions,accountRisk:s.accountRisk,actualCash:s.actualCash,
   unresolvedUniverseRemovals:s.unresolvedUniverseRemovals,skippedOrders:s.skippedOrders,
   openPositions:s.openPositions.map(({lastPrice,...position})=>position)
  }]))};
 };
 if(JSON.stringify(state(sessions))!==JSON.stringify(state(revised)))reject();
 const plan=source=>{
  const p=planC1ContinuedAccountOpening({adoption:account.adoption,sessions:source,records,opening,observedAt,completionPolicy:c1CompletionPolicy(account.positionContext)});
  return {orders:p.orders,blockedOrders:p.blockedOrders,entryReviews:p.entryReviews,openingBooks:p.openingBooks,projectedBooks:p.projectedBooks,riskBySleeve:p.riskBySleeve};
 };
 if(JSON.stringify(plan(sessions))!==JSON.stringify(plan(revised)))reject();
}

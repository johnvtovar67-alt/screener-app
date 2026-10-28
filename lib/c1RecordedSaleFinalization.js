import {restoreC1SleeveAccounting,valueC1SleeveAccounting} from './c1SleeveAccounting';
import {c1CombinedPortfolio} from './c1CombinedPortfolio';

// Reviewed October28 incident only. The counterfactual vendor replay reprices
// three October26 sales; the accepted book is the authority for those fills.
// This never accepts a different future queue, position, quantity or new fill.
export const C1_RECORDED_SALE_FINALIZATION = Object.freeze({
 priorRecordHash:'70da67671aaedc744c356d70184ec8b2c794d31b11af75fed21defa5beb04258',
 previousSessionDate:'2026-10-26',currentSessionDate:'2026-10-27',
 recordedPrice:170.834752,revisedPrice:170.97458400000002,
 sales:[{index:15,sleeve:'base',shares:48.25},{index:17,sleeve:'cooldown15',shares:96.5},{index:19,sleeve:'sector40',shares:48.25}]
});
export function proveC1RecordedSaleFinalization(prior,input,original,corrected,digest){
 const review=C1_RECORDED_SALE_FINALIZATION,same=(a,b)=>digest(a)===digest(b),copy=v=>JSON.parse(JSON.stringify(v));
 if(prior.recordHash!==review.priorRecordHash||prior.model.sessions.at(-1).date!==review.previousSessionDate||
  input.sourceSessionDate!==review.currentSessionDate||
  !same(original.sessions.slice(0,-1),prior.model.sessions)||
  !same(original.ledger,prior.model.ledger)||!same(original.paperExecution,prior.model.paperExecution)||
  !same(original.pendingBySleeve,corrected.pendingBySleeve)||
  !same(original.pendingDecisionStatus,corrected.pendingDecisionStatus)||
  !same(original.paperExecution,corrected.paperExecution)||original.paperExecutionStatus?.status!=='unchanged')return null;
 const proposed=copy(original.ledger),symbols=new Set();
 for(const sale of review.sales){
  const fill=proposed.fills[sale.index];
  if(!fill||fill.side!=='sell'||fill.date!==review.previousSessionDate||fill.sleeve!==sale.sleeve||
   fill.shares!==sale.shares||fill.price!==review.recordedPrice)return null;
  symbols.add(fill.symbol);fill.price=review.revisedPrice;
 }
 if(symbols.size!==1)return null;
 const expectedLedger=restoreC1SleeveAccounting(proposed);
 if(!same(expectedLedger,corrected.ledger))return null;
 for(const sleeve of Object.keys(original.ledger.sleeves))
  if(!same(original.ledger.sleeves[sleeve].positions,corrected.ledger.sleeves[sleeve].positions))return null;
 const expectedStatus={...original.paperExecutionStatus,status:'blocked',reason:'Model history changed'};
 if(!same(expectedStatus,corrected.paperExecutionStatus))return null;
 const marks=Object.fromEntries(input.session.prices.map(p=>[p.symbol,p.close]));
 const valued=valueC1SleeveAccounting(expectedLedger,marks),expectedSummary={...copy(original.summary),
  cash:valued.cash,equity:valued.equity,
  combinedPortfolio:c1CombinedPortfolio(expectedLedger,marks,input.sourceSessionDate),
  paperExecution:expectedStatus};
 for(const [id,sleeve] of Object.entries(expectedSummary.sleeves))sleeve.cash=expectedLedger.sleeves[id].cash;
 if(!same(expectedSummary,corrected.summary))return null;
 return {contract:'c1-recorded-sale-finalization-proof-v1',
  reviewedPriorRecordHash:review.priorRecordHash,recordedFillCount:review.sales.length,
  recordedFillsPreserved:true,recordedCashPreserved:true,positionsIdentical:true,
  pendingDecisionsIdentical:true,newModelFills:0,
  counterfactualCashDelta:corrected.summary.cash-original.summary.cash,
  recordedLedgerHash:digest(original.ledger),counterfactualLedgerHash:digest(corrected.ledger),
  pendingDecisionsHash:digest(original.pendingBySleeve)};
}

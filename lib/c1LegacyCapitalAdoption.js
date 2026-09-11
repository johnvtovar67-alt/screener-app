import {portfolioCompositionSignature} from './portfolioGovernor';
import {isUsMarketSessionDay} from './marketSession';

// This creates a prospective opening record. It is deliberately separate from
// transaction reconciliation and never overwrites the legacy browser record.
export function adoptLegacyC1Capital({portfolio,record,confirmed=false,asOfSession}={}) {
  if(confirmed!==true)throw new Error('Explicit prospective legacy account adoption required');
  if(!record||record.version!==null||record.portfolioSignature!=null||record.reconciliationRequired!==true)
    throw new Error('Only a legacy record without an opening identity can use prospective adoption');
  const signature=portfolioCompositionSignature(portfolio);
  if(!signature||record.observedPortfolioSignature!==signature)
    throw new Error('Analyze the current balances before prospective adoption');
  if(typeof record.highWater!=='number'||!Number.isFinite(record.highWater)||record.highWater<=0)
    throw new Error('A positive retained capital peak is required; it cannot be replaced');
  const validDay=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d&&isUsMarketSessionDay(d);
  if(!validDay(asOfSession)||!Object.prototype.hasOwnProperty.call(record,'triggerDay')||
    (record.triggerDay!==null&&(!validDay(record.triggerDay)||record.triggerDay>asOfSession)))
    throw new Error('Valid retained breaker date and adoption session required');
  const original={version:null,observedPortfolioSignature:record.observedPortfolioSignature,
    highWater:record.highWater,triggerDay:record.triggerDay,reconciliationRequired:true};
  return {capitalRecord:{version:2,portfolioSignature:signature,highWater:record.highWater,
    triggerDay:record.triggerDay,reconciliationRequired:false},
    receipt:{contract:'c1-prospective-legacy-capital-v1',asOfSession,original,
      openingSignature:signature,historyReconciled:false,priorHistoryVerified:false,
      retainedPeak:record.highWater,retainedTriggerDay:record.triggerDay,
      explanation:'Account tracking begins at adoption. The recorded peak and breaker date are retained; earlier balances, cash flows and drawdown history remain unverified.'}};
}

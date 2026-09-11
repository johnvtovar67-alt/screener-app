import {reconcileBrokerageCSV} from './brokerageReconciliation';
import {cleanC1ControlState} from './c1CapitalState';
import {portfolioCompositionSignature} from './portfolioGovernor';

const CASH=new Set(['CASH','SWVXX','VMFXX','SPAXX','FDRXX','MMF']);
function anchorPositions(signature) {
  if(typeof signature!=='string'||!signature||signature==='unspecified')throw new Error('The saved capital record has no opening holdings. It cannot be repaired from a balance match alone.');
  const out=new Map();
  for(const item of signature.split('|')) {
    const [symbol,quantity,role,...extra]=item.split(':');
    const shares=Number(quantity);
    if(extra.length||!/^[A-Z][A-Z0-9.-]{0,15}$/.test(symbol)||!quantity||!Number.isFinite(shares)||shares<0||!['core','swing'].includes(role)||out.has(symbol))throw new Error('The saved opening holdings are invalid.');
    out.set(symbol,{symbol,shares,role});
  }
  return out;
}

// Reconcile an existing observed capital record, never create a new high-water
// mark or pretend that supplied records establish investment validation.
export function reconcileC1AccountHistory({csv,portfolio,state,completeActivityConfirmed=false,now=new Date()}={}) {
  const report=reconcileBrokerageCSV(csv,portfolio);
  if(report.status!=='balances-match')throw new Error('Resolve the displayed balance differences first.');
  const prior=cleanC1ControlState(state);
  if(prior.version!==2||!Number.isFinite(state?.highWater)||state.highWater<0||
    (state.triggerDay!=null&&state.triggerDay!==prior.triggerDay))throw new Error('A valid existing capital high-water mark and breaker date are required; they will not be reset.');
  const opening=anchorPositions(prior.portfolioSignature);
  const expectedCash=[...opening.values()].filter(p=>CASH.has(p.symbol)).reduce((s,p)=>s+p.shares,0);
  if(Math.abs(report.openingCash-expectedCash)>.010001)throw new Error('CSV opening cash does not match the saved capital record.');
  const oldStocks=[...opening.values()].filter(p=>!CASH.has(p.symbol));
  if(prior.highWater===0&&(expectedCash>0||oldStocks.some(p=>p.shares>0)))throw new Error('The saved zero capital peak is inconsistent with the opening balances.');
  if(portfolio.some(p=>CASH.has(p.symbol)&&Number(p.avgCost||1)!==1))throw new Error('Cash balances must use a unit value of one dollar.');
  for(const symbol of new Set([...oldStocks.map(p=>p.symbol),...Object.keys(report.openingPositions)])) {
    if(Math.abs((opening.get(symbol)?.shares||0)-(report.openingPositions[symbol]||0))>1e-8)throw new Error('CSV opening shares do not match the saved capital record: '+symbol);
  }
  const current=new Map(portfolio.map(p=>[p.symbol,p]));
  for(const symbol of new Set([...opening.keys(),...current.keys()])) {
    const before=opening.get(symbol),after=current.get(symbol);
    const wasCore=before?.role==='core'||symbol==='MSTR',isCore=after?.role==='Core'||symbol==='MSTR';
    if((wasCore||isCore)&&(!wasCore||!isCore||Math.abs((before?.shares||0)-(after?.shares||0))>1e-8))throw new Error('Core transfers need separate capital reconciliation: '+symbol);
    if((wasCore||isCore)&&report.transactions.some(t=>t.symbol===symbol))throw new Error('Core activity cannot be used to reconcile Swing capital: '+symbol);
  }
  if(report.transactions.some(t=>['DEPOSIT','WITHDRAWAL'].includes(t.type)))throw new Error('Deposits or withdrawals require valuations at the cash-flow dates. This import will preserve the existing capital restriction.');
  const clock=new Date(now);
  if(!Number.isFinite(clock.getTime())||report.lastTransactionDate>clock.toISOString().slice(0,10)||prior.triggerDay>clock.toISOString().slice(0,10))throw new Error('Future activity cannot reconcile current holdings.');
  const signature=portfolioCompositionSignature(portfolio);
  if(state.observedPortfolioSignature&&state.observedPortfolioSignature!==signature)throw new Error('Holdings changed after the failed analysis. Analyze the current holdings before reconciling.');
  if(completeActivityConfirmed!==true)return {status:'confirmation-required',report,
    preservedHighWater:prior.highWater,preservedTriggerDay:prior.triggerDay,
    message:'Opening and closing balances match. Confirm that the supplied records cover all account activity between the saved opening holdings and the current portfolio.'};
  return {status:'reconciled',report,state:{...prior,portfolioSignature:signature,
    reconciliationRequired:false,observedPortfolioSignature:signature},
    receipt:{contract:'c1-account-history-reconciliation-v1',at:clock.toISOString(),
      openingSignature:prior.portfolioSignature,closingSignature:signature,
      highWater:prior.highWater,triggerDay:prior.triggerDay,recordCount:report.recordCount,
      source:'user-supplied-complete-activity',brokerageVerified:false,strategyValidated:false},
    executable:false,orders:[]};
}

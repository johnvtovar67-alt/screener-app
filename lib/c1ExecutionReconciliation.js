import {planC1PaperEvents} from './c1PaperEvents';
import {easternMarketClock} from './marketSession';

// Compare reported fills with a model projection. Never adopt a partial fill as
// a completed model transition or silently erase execution-price differences.
export function reconcileC1Execution({record,plan,fills,observedAt}) {
 const blocked=reason=>({status:'blocked',reason,executable:false,brokerageVerified:false,orders:[]});
 try {
  const now=new Date(observedAt);
  if(!Number.isFinite(now.getTime())||!Array.isArray(fills)||fills.length>10000||!Array.isArray(plan?.orders)||!['opening-projection-only','observed-session-projection-only'].includes(plan.status))return blocked('Complete model projection and fill records required');
  const prior=planC1PaperEvents({before:record.ledger,after:record.ledger,account:record.paperExecution,eventMetadata:[]});
  if(prior.status!=='unchanged')return blocked(prior.reason||'Unreconciled starting account');
  if(!Number.isFinite(plan.projectedCash)||plan.projectedCash<0||!plan.projectedPositions||Array.isArray(plan.projectedPositions)||!Object.values(plan.projectedPositions).every(n=>Number.isSafeInteger(n)&&n>=0))return blocked('Invalid projected balances');
  const byId=new Map();
  for(const o of plan.orders){
   if(!o.modelEventId||byId.has(o.modelEventId)||o.sessionDate!==plan.date||!Number.isSafeInteger(o.shares)||o.shares<=0||!Number.isFinite(o.price)||o.price<=0||!['buy','sell'].includes(o.side)||!Number.isInteger(o.phase)||o.phase<0||o.phase>4)return blocked('Invalid model order projection');
   byId.set(o.modelEventId,o);
  }
  const seen=new Map(),filled=new Map(),positions={...record.paperExecution.positions};
  let cash=record.paperExecution.cash,lastTime=-Infinity,lastPhase=-1;
  for(const f of fills){
   if(typeof f.id!=='string'||!f.id)return blocked('Execution ID required');
   if(seen.has(f.id)){if(JSON.stringify(seen.get(f.id))!==JSON.stringify(f))return blocked('Conflicting execution ID');continue;}
   const o=byId.get(f.modelEventId),time=new Date(f.executedAt),clock=easternMarketClock(time);
   if(!o||o.side!==f.side||o.symbol!==f.symbol)return blocked('Execution does not match a model order');
   if(!Number.isFinite(time.getTime())||time>now||time.getTime()<lastTime||clock?.key!==plan.date||clock.minutes<570)return blocked('Invalid execution time or order');
   if(!Number.isInteger(o.phase)||o.phase<lastPhase)return blocked('Executions changed model phase order');
   if(!Number.isSafeInteger(f.shares)||f.shares<=0||typeof f.price!=='number'||!Number.isFinite(f.price)||f.price<=0||typeof f.fee!=='number'||!Number.isFinite(f.fee)||f.fee<0)return blocked('Invalid execution economics');
   const quantity=(filled.get(f.modelEventId)||0)+f.shares;
   if(quantity>o.shares)return blocked('Executions exceed modeled order size');
   const delta=f.side==='buy'?f.shares:-f.shares;
   const held=(positions[f.symbol]||0)+delta;
   cash-=delta*f.price+f.fee;
   if(held<0||cash< -1e-7)return blocked('Execution would oversell or require borrowing');
   if(held)positions[f.symbol]=held;else delete positions[f.symbol];
   seen.set(f.id,f);filled.set(f.modelEventId,quantity);lastTime=time.getTime();lastPhase=o.phase;
  }
  const remaining=plan.orders.map(o=>({modelEventId:o.modelEventId,unfilledShares:o.shares-(filled.get(o.modelEventId)||0)})).filter(o=>o.unfilledShares>0);
  const cashDifference=cash-plan.projectedCash;
  const positionMatch=[...new Set([...Object.keys(positions),...Object.keys(plan.projectedPositions||{})])].every(s=>(positions[s]||0)===(plan.projectedPositions?.[s]||0));
  return {status:remaining.length?'partial':Math.abs(cashDifference)>1e-7||!positionMatch?'execution-variance':'matches-model-projection',
   executable:false,brokerageVerified:false,orders:[],cash,positions,remaining,cashDifference,uniqueFillCount:seen.size,
   modelAdvanceAuthorized:false,
   limitation:'Reconciles only supplied fill records. Does not verify the broker, assume fills, alter model balances, or authorize remaining orders.'};
 }catch(error){return blocked(error.message);}
}

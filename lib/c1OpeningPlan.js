import {advanceC1ForwardModel} from './c1ForwardModel';
import {simulatePointInTimePortfolio} from './c1FrozenSimulator';
import {C1_FROZEN_OPTIONS} from './c1FrozenOptions';
import {C1_ACCOUNTING_WEIGHTS,applyC1SleeveFill} from './c1SleeveAccounting';
import {planC1PaperEvents,c1ModelEventPhase} from './c1PaperEvents';
import {marketSessionDistance,marketObservationSessionDay} from './marketSession';

// A causal opening projection using the exact frozen engine. No intraday bars,
// new closing ranks, or current brokerage holdings are substituted into C1.
export function planC1Opening({record,date,observedAt,opens}) {
 const blocked=reason=>({status:'blocked',reason,executable:false,orders:[]});
 try {
  const prior=record?.sessions?.at(-1),now=new Date(observedAt);
  if(!prior||!record.ledger||!record.paperExecution||!Number.isFinite(now.getTime()))return blocked('Complete model record and observation time required');
  if(marketSessionDistance(prior.date,date)!==1||date<record.firstDecisionSession||marketObservationSessionDay(now)!==date)return blocked('Opening plan requires the next observed market session');
  if(!record.pendingBySleeve||Object.keys(record.pendingBySleeve).sort().join(',')!=='base,cooldown15,sector40')return blocked('Complete sleeve queues required');
  const validated=advanceC1ForwardModel(record,[prior],now);
  if(validated.paperExecutionStatus?.status==='blocked')return blocked(validated.paperExecutionStatus.reason);
  if(!Array.isArray(opens)||!opens.length)return blocked('Opening prices required');
  const bySymbol=new Map();
  for(const p of opens){
   if(typeof p.symbol!=='string'||!/^[A-Z][A-Z0-9.-]{0,14}$/.test(p.symbol)||bySymbol.has(p.symbol)||p.adjusted!==true||typeof p.open!=='number'||!Number.isFinite(p.open)||p.open<=0)return blocked('Invalid or duplicate opening price');
   bySymbol.set(p.symbol,p.open);
  }
  // Requiring all held and queued names prevents a missing quote from silently
  // becoming a different allocation. No inferred opening from a last price.
  const required=new Set(['SPY','QQQ']);
  for(const b of Object.values(record.ledger.sleeves))for(const s of Object.keys(b.positions))required.add(s);
  for(const queue of Object.values(record.pendingBySleeve||{}))for(const o of queue)required.add(o.symbol);
  for(const symbol of required)if(!bySymbol.has(symbol))return blocked('Missing opening price: '+symbol);
  const opening={date,decisionAt:now.toISOString(),universeSymbols:prior.universeSymbols,signals:[],
   prices:[...bySymbol].map(([symbol,open])=>({symbol,open,high:open,low:open,close:open,adjusted:true}))};
  const sessions=[...record.sessions,opening],metadata=[],newFills=[];
  for(const [id,weight] of Object.entries(C1_ACCOUNTING_WEIGHTS)){
   const run=simulatePointInTimePortfolio({metadata:{},sessions},{...C1_FROZEN_OPTIONS[id],startDate:record.firstDecisionSession,endDate:date,liquidateAtEnd:false});
   const old=record.ledger.fills.filter(f=>f.sleeve===id);
   if(run.trades.length<old.length)return blocked('Model fill history shortened');
   for(let i=0;i<run.trades.length;i++){
    const t=run.trades[i],f={id:`${id}:${i}`,sleeve:id,date:t.date,symbol:t.symbol,side:t.side,shares:t.shares*weight,price:t.price,fee:0};
    if(i<old.length){if(JSON.stringify(f)!==JSON.stringify(old[i]))return blocked('Model fill history changed');continue;}
    if(t.date!==date)return blocked('Opening plan contains an unexpected session');
    // Only phases before intraday stops. Open-gap stops are handled separately
    // by the completed-session engine until an explicit stop-order path exists.
    if(c1ModelEventPhase(t)>3)continue;
    newFills.push(f);metadata.push({id:f.id,fill:f,reason:t.reason});
   }
  }
  let ledger=record.ledger;
  for(const f of newFills)ledger=applyC1SleeveFill(ledger,f);
  const mapped=planC1PaperEvents({before:record.ledger,after:ledger,account:record.paperExecution,eventMetadata:metadata});
  if(mapped.status==='blocked')return mapped;
  return {status:'opening-projection-only',date,observedAt:now.toISOString(),sourceSessionDate:prior.date,
   executable:false,orders:mapped.orders,modelFills:newFills,projectedCash:mapped.nextAccount.cash,
   projectedPositions:mapped.nextAccount.positions,
   limitations:['Opening orders only; intraday stop orders are not covered.','Opening prices are caller supplied and not provider verified.','Universe and corporate-action changes at the open require separate verification.','No brokerage fills, trading authority, or next account state is inferred.']};
 }catch(error){return blocked(error.message);}
}

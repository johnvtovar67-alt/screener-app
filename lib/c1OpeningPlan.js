import {advanceC1ForwardModel} from './c1ForwardModel';
import {simulatePointInTimePortfolio} from './c1FrozenSimulator';
import {C1_FROZEN_OPTIONS} from './c1FrozenOptions';
import {C1_ACCOUNTING_WEIGHTS,applyC1SleeveFill} from './c1SleeveAccounting';
import {planC1PaperEvents,c1ModelEventPhase} from './c1PaperEvents';
import {marketSessionDistance,marketObservationSessionDay,easternMarketClock} from './marketSession';

// A causal opening projection using the exact frozen engine. No intraday bars,
// new closing ranks, or current brokerage holdings are substituted into C1.
function projectC1Session({record,date,observedAt,opens}, includeStops=false) {
 const blocked=reason=>({status:'blocked',reason,executable:false,orders:[]});
 try {
  const prior=record?.sessions?.at(-1),now=new Date(observedAt);
  if(!prior||!record.ledger||!record.paperExecution||!Number.isFinite(now.getTime()))return blocked('Complete model record and observation time required');
  if(marketSessionDistance(prior.date,date)!==1||date<record.firstDecisionSession||marketObservationSessionDay(now)!==date)return blocked('Opening plan requires the next observed market session');
  if(!record.pendingBySleeve||Object.keys(record.pendingBySleeve).sort().join(',')!=='base,cooldown15,sector40')return blocked('Complete sleeve queues required');
  const clock=easternMarketClock(now);
  if(clock?.key!==date||clock.minutes<570)return blocked('Observation must be on the execution session after its open');
  const atOpen=new Date(now.getTime()-(clock.minutes-570)*60000-clock.second*1000);
  const validated=advanceC1ForwardModel(record,[prior],atOpen);
  if(validated.paperExecutionStatus?.status==='blocked')return blocked(validated.paperExecutionStatus.reason);
  if(!Array.isArray(opens)||!opens.length)return blocked('Opening prices required');
  const bySymbol=new Map();
  for(const p of opens){
   if(typeof p.symbol!=='string'||!/^[A-Z][A-Z0-9.-]{0,14}$/.test(p.symbol)||bySymbol.has(p.symbol)||p.adjusted!==true||typeof p.open!=='number'||!Number.isFinite(p.open)||p.open<=0)return blocked('Invalid or duplicate opening price');
   if(includeStops){
    const at=new Date(p.throughAt),c=easternMarketClock(at);
    if(!Number.isFinite(at.getTime())||at>now||c?.key!==date||c.minutes<570)return blocked('Invalid or future bar observation');
    if(![p.high,p.low,p.close].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0)||p.low>Math.min(p.open,p.close)||p.high<Math.max(p.open,p.close))return blocked('Invalid observed price range');
    bySymbol.set(p.symbol,{symbol:p.symbol,open:p.open,high:p.high,low:p.low,close:p.close,adjusted:true});
   }else bySymbol.set(p.symbol,{symbol:p.symbol,open:p.open,high:p.open,low:p.open,close:p.open,adjusted:true});
  }
  // Requiring all held and queued names prevents a missing quote from silently
  // becoming a different allocation. No inferred opening from a last price.
  const required=new Set(['SPY','QQQ']);
  for(const b of Object.values(record.ledger.sleeves))for(const s of Object.keys(b.positions))required.add(s);
  for(const queue of Object.values(record.pendingBySleeve||{}))for(const o of queue)required.add(o.symbol);
  for(const symbol of required)if(!bySymbol.has(symbol))return blocked('Missing opening price: '+symbol);
  const opening={date,decisionAt:now.toISOString(),universeSymbols:prior.universeSymbols,signals:[],
   prices:[...bySymbol.values()]};
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
    if(c1ModelEventPhase(t)>(includeStops?4:3))continue;
    newFills.push(f);metadata.push({id:f.id,fill:f,reason:t.reason});
   }
  }
  let ledger=record.ledger;
  for(const f of newFills)ledger=applyC1SleeveFill(ledger,f);
  const mapped=planC1PaperEvents({before:record.ledger,after:ledger,account:record.paperExecution,eventMetadata:metadata});
  if(mapped.status==='blocked')return mapped;
  return {status:includeStops?'observed-session-projection-only':'opening-projection-only',date,observedAt:now.toISOString(),sourceSessionDate:prior.date,
   executable:false,orders:mapped.orders,modelFills:newFills,projectedCash:mapped.nextAccount.cash,
   projectedPositions:mapped.nextAccount.positions,
   limitations:[includeStops?'Includes modeled stops through supplied bar observations; actual trigger time and fills are not established.':'Opening orders only; intraday stop orders are not covered.','Opening prices are caller supplied and not provider verified.','Universe and corporate-action changes at the open require separate verification.','No brokerage fills, trading authority, or next account state is inferred.']};
 }catch(error){return blocked(error.message);}
}

export function planC1Opening(request){return projectC1Session(request,false);}
export function planC1ObservedSession({record,date,observedAt,bars}){
 return projectC1Session({record,date,observedAt,opens:bars},true);
}

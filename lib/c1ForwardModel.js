import {c1CombinedPortfolio} from './c1CombinedPortfolio';
import {planC1PaperEvents,initializeC1EventAccount,C1_EVENT_PRICE_BASIS} from './c1PaperEvents';
import { simulatePointInTimePortfolio } from './c1FrozenSimulator';
import { C1_FROZEN_OPTIONS } from './c1FrozenOptions';
import { createC1SleeveAccounting, applyC1SleeveFill, valueC1SleeveAccounting, C1_ACCOUNTING_WEIGHTS } from './c1SleeveAccounting';
import { latestCompletedMarketSessionDay, isUsMarketSessionDay, marketSessionDistance, marketObservationSessionDay } from './marketSession';

export const C1_FORWARD_CONTRACT = 'c1-frozen-simulator-forward-paper-v1';
function nextSession(day) {
  let time = Date.parse(day+'T12:00:00Z');
  for (let i=0;i<10;i++) { time+=86400000;const date=new Date(time).toISOString().slice(0,10);if(isUsMarketSessionDay(date))return date; }
  throw new Error('Cannot determine next market session');
}
function validateSession(session) {
  if (!session || !/^\d{4}-\d{2}-\d{2}$/.test(session.date||'') ||
      !Number.isFinite(Date.parse(session.date)) || new Date(session.date).toISOString().slice(0,10)!==session.date ||
      !isUsMarketSessionDay(session.date) || !Array.isArray(session.prices) ||
      !session.prices.length || !Array.isArray(session.signals) ||
      (!Array.isArray(session.universeSymbols) && session.universeSymbols !== null))
    throw new Error('Incomplete forward session');
  const symbols = session.prices.map(row=>row.symbol);
  if (new Set(symbols).size!==symbols.length || session.prices.some(row=>!Number.isFinite(row.close)||row.close<=0))
    throw new Error('Invalid forward prices');
}

function firstFutureExecutionSession(baselineDate, observedAt) {
  const observed = new Date(observedAt);
  if (!Number.isFinite(observed.getTime())) throw new Error('Forward observation timestamp unavailable');
  // A baseline captured after an opening auction cannot claim that opening.
  return [nextSession(baselineDate), nextSession(marketObservationSessionDay(observed))].sort().at(-1);
}

// The first observed completed session is a baseline, never a new forward test.
// Brokerage positions are deliberately not inputs to this model portfolio.
export function advanceC1ForwardModel(prior, incoming, now=new Date()) {
  const required = latestCompletedMarketSessionDay(now);
  if (!Array.isArray(incoming)||!incoming.length)throw new Error('No completed input sessions');
  incoming.forEach(validateSession);
  if(incoming.some(s=>!Number.isFinite(Date.parse(s.decisionAt))||Date.parse(s.decisionAt)>now.getTime()))
    throw new Error('Forward decision timestamp unavailable or in the future');
  if(incoming.some((s,i)=>i>0&&s.date<=incoming[i-1].date)||incoming.at(-1).date!==required)
    throw new Error('Forward inputs are unordered or not current');
  let record;
  if (!prior) {
    record={contract:C1_FORWARD_CONTRACT,createdAt:now.toISOString(),
      firstDecisionSession:firstFutureExecutionSession(required,now),sessions:[JSON.parse(JSON.stringify(incoming.at(-1)))],revision:1};
  } else {
    if(prior.contract!==C1_FORWARD_CONTRACT||!Array.isArray(prior.sessions)||!prior.sessions.length)
      throw new Error('Unsupported forward model record');
    prior.sessions.forEach(validateSession);
    if(prior.firstDecisionSession!==firstFutureExecutionSession(prior.sessions[0].date,prior.createdAt))
      throw new Error('Forward baseline execution predates observation or identity changed; original preserved');
    const byDate=new Map(prior.sessions.map(s=>[s.date,s]));
    for(const s of incoming) if(byDate.has(s.date)&&JSON.stringify(byDate.get(s.date))!==JSON.stringify(s)) {
      const saved=byDate.get(s.date);
      const changedFields=[...new Set([...Object.keys(saved),...Object.keys(s)])]
        .filter(key=>JSON.stringify(saved[key])!==JSON.stringify(s[key]));
      const error=new Error(`Previously observed input changed: ${s.date}; original preserved`);
      error.inputRevision={date:s.date,changedFields,originalPreserved:true,
        validationEligible:false};
      throw error;
    }
    const additions=incoming.filter(s=>s.date>prior.sessions.at(-1).date);
    let last=prior.sessions.at(-1).date;
    for(const s of additions){if(marketSessionDistance(last,s.date)!==1)throw new Error('Missing forward session');last=s.date;}
    if(!additions.length&&prior.summary?.combinedPortfolio?.contract==='c1-combined-holdings-v1'&&prior.paperExecutionStatus&&prior.pendingDecisionStatus&&prior.paperExecution?.priceBasis===C1_EVENT_PRICE_BASIS&&planC1PaperEvents({before:prior.ledger,after:prior.ledger,account:prior.paperExecution,eventMetadata:[]}).status==='unchanged')return prior;
    record={...prior,sessions:[...prior.sessions,...JSON.parse(JSON.stringify(additions))],revision:prior.revision+1};
  }
  const sessions=record.sessions, through=sessions.at(-1).date;
  const marks=Object.fromEntries(sessions.at(-1).prices.map(row=>[row.symbol,row.close]));
  let ledger=createC1SleeveAccounting(100000,sessions[0].date);
  const sleeves={},expectedEquity={},pendingBySleeve={},eventMetadata=[];
  for(const [id,weight] of Object.entries(C1_ACCOUNTING_WEIGHTS)) {
    const run=simulatePointInTimePortfolio({metadata:{},sessions},{...C1_FROZEN_OPTIONS[id],
      startDate:record.firstDecisionSession,endDate:through,liquidateAtEnd:false});
    for(let i=0;i<run.trades.length;i++){
      const t=run.trades[i];
      ledger=applyC1SleeveFill(ledger,{id:`${id}:${i}`,sleeve:id,date:t.date,symbol:t.symbol,
        side:t.side,shares:t.shares*weight,price:t.price,fee:0});
      eventMetadata.push({id:`${id}:${i}`,fill:ledger.fills.at(-1),reason:t.reason});
    }
    pendingBySleeve[id]=run.pendingDecisions;
    const book=ledger.sleeves[id],point=run.curve.at(-1);
    expectedEquity[id]=point?point.equity*weight:100000*weight;
    if(point&&(Math.abs(book.cash-point.cash*weight)>0.0051||Object.keys(book.positions).length!==point.positions))
      throw new Error(`Forward cash/position parity failure: ${id}`);
    sleeves[id]={cash:book.cash,positions:book.positions,tradeCount:run.trades.length};
  }
  // Keep existing fills as an immutable prefix when another sleeve trades later.
  // Stable sorting preserves each sleeve's original same-session execution order.
  ledger.fills.sort((a,b)=>a.date.localeCompare(b.date));
  const marked=valueC1SleeveAccounting(ledger,marks);
  for(const id of Object.keys(sleeves))if(Math.abs(marked.sleeves[id].equity-expectedEquity[id])>0.0051)
    throw new Error(`Forward marked-equity parity failure: ${id}`);
  let paperExecution=prior?.paperExecution||null,paperExecutionStatus;
  try{
    const before=prior?.ledger||createC1SleeveAccounting(100000,sessions[0].date);
    if(!paperExecution)paperExecution=initializeC1EventAccount(before);
    const existingIds=new Set(before.fills.map(f=>f.id));
    const transition=planC1PaperEvents({before,after:ledger,account:paperExecution,eventMetadata:eventMetadata.filter(m=>!existingIds.has(m.id))});
    paperExecutionStatus={status:transition.status,reason:transition.reason||null,
      proposedOrderCount:transition.orders.length,executable:false,
      basis:"retrospective-model-event-paper-mapping"};
    if(transition.nextAccount)paperExecution=transition.nextAccount;
  }catch(error){paperExecutionStatus={status:"blocked",reason:error.message,proposedOrderCount:0,executable:false,basis:"retrospective-model-event-paper-mapping"};}
  const pendingDecisionStatus={sourceSessionDate:through,earliestExecutionSession:[nextSession(through),record.firstDecisionSession].sort().at(-1),
    executable:false,status:"research-queue-only",sleeves:Object.fromEntries(Object.entries(pendingBySleeve).map(([id,orders])=>[id,{buyCandidates:orders.filter(o=>o.side==="buy").length,pendingExits:orders.filter(o=>o.side==="sell").length}]))};
  return {...record,ledger,paperExecution,paperExecutionStatus,pendingBySleeve,pendingDecisionStatus,summary:{contract:C1_FORWARD_CONTRACT,status:'paper-only',
    sourceSessionDate:through,firstDecisionSession:record.firstDecisionSession,
    observedForwardSessions:sessions.filter(s=>s.date>=record.firstDecisionSession).length,
    executable:false,eligibleForLiveCapital:false,eligibleForAlphaClaim:false,
    pointInTimeMembershipAvailable:sessions.every(s=>Array.isArray(s.universeSymbols)),
    cohort:'current-production-compiler-paper-model',cash:marked.cash,equity:marked.equity,
    virtualShares:marked.virtualShares,combinedPortfolio:c1CombinedPortfolio(ledger,marks,through),sleeves,paperExecution:paperExecutionStatus,pendingDecisions:pendingDecisionStatus}};
}

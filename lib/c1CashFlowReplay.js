import {isUsMarketSessionDay} from './marketSession';

// The statement resolver validates the original account and approved journal
// before marking its detached replay. Serialized flags never carry this proof.
const capabilities=new WeakMap();
const sleeves=new Set(['base','cooldown15','sector40']);
const clone=value=>JSON.parse(JSON.stringify(value));
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const positive=value=>finite(value)&&value>0;
const validDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&
 Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value&&isUsMarketSessionDay(value);

export function markC1CashFlowReplay(replay,{sleeve,actualDollarsPerModelDollar,events,openingEvents=[],sourceDigest}={}){
 if(replay?.contract!=='c1-actual-fill-replay-v1'||!Array.isArray(replay.sessions)||!sleeves.has(sleeve)||
  !positive(actualDollarsPerModelDollar)||!Array.isArray(events)||!Array.isArray(openingEvents)||events.length+openingEvents.length>10000||!/^[a-f0-9]{64}$/.test(sourceDigest||''))
  throw new Error('Validated statement cash journal and allocation replay required');
 const dates=new Set(replay.sessions.map(session=>session.date));
 if(replay.projectionDate)dates.add(replay.projectionDate);
 const seen=new Map();
 const normalize=(rows,opening=false)=>{const normalized=[];let previous='';
 for(const event of rows){
  if(typeof event?.id!=='string'||!event.id||event.id.length>200||!validDay(event.date)||!dates.has(event.date)||
   event.date<previous||!finite(event.amount)||event.amount===0||!['capital','pnl'].includes(event.kind)||
   opening&&(event.date!==replay.projectionDate||event.kind!=='pnl'))
   throw new Error('Invalid dated statement cash event');
  const identity=JSON.stringify([event.id,event.date,event.amount,event.kind,opening]);
  if(seen.has(event.id)){
   if(seen.get(event.id)!==identity)throw new Error('Conflicting statement cash event identity');
   continue;
  }
  const amount=event.amount/actualDollarsPerModelDollar;
  if(!finite(amount)||amount===0)throw new Error('Statement cash event cannot be normalized to account units');
  seen.set(event.id,identity);previous=event.date;
  normalized.push({id:event.id,date:event.date,amount,kind:event.kind});
 }
 return normalized;};
 const proof={sleeve,sourceDigest,actualDollarsPerModelDollar,events:normalize(events),openingEvents:normalize(openingEvents,true)};
 const prior=capabilities.get(replay);
 if(prior&&JSON.stringify(prior)!==JSON.stringify(proof))throw new Error('Conflicting validated statement cash journal');
 if(!prior)capabilities.set(replay,proof);
 return replay;
}

export function c1ReplayCashFlowEvents(replay,date){
 return clone((capabilities.get(replay)?.events||[]).filter(event=>event.date===date));
}
export function c1ReplayOpeningCashFlowEvents(replay,date){
 return clone((capabilities.get(replay)?.openingEvents||[]).filter(event=>event.date===date));
}

// EOD cash flows follow the original recorded fills and in-kind adoption.
// Capital movements preserve the drawdown percentage at the flow. Income,
// fees and statement-net corrections change P&L and do not scale references.
// Negative analytic cash is not brokerage borrowing or purchase authority.
export function applyC1CashFlowEvents({cash,equity,portfolioHighWatermark,operationalRiskState,events=[]}={}){
 if(!finite(cash)||!finite(equity)||!positive(portfolioHighWatermark)||!Array.isArray(events))
  throw new Error('Valid marked equity and statement cash events required');
 let nextCash=cash,nextEquity=equity,nextReference=portfolioHighWatermark,nextOperational=operationalRiskState,capitalFlow=0;
 const seen=new Map(),appliedIds=[];
 const date=events[0]?.date;
 for(const event of events){
  if(typeof event?.id!=='string'||!event.id||!validDay(event.date)||event.date!==date||!finite(event.amount)||event.amount===0||!['capital','pnl'].includes(event.kind))
   throw new Error('Invalid effective statement cash event');
  const identity=JSON.stringify([event.id,event.date,event.amount,event.kind]);
  if(seen.has(event.id)){
   if(seen.get(event.id)!==identity)throw new Error('Conflicting effective statement cash event identity');
   continue;
  }
  seen.set(event.id,identity);
  const after=nextEquity+event.amount;
  if(!finite(after)||!finite(nextCash+event.amount))throw new Error('Statement cash event exceeds finite account equity');
  if(event.kind==='capital'){
   if(!positive(nextEquity)||!positive(after))throw new Error('Capital cash flow requires positive marked equity before and after the flow');
   const ratio=after/nextEquity;
   nextReference*=ratio;
   if(!positive(nextReference))throw new Error('Capital cash flow invalidates the portfolio risk reference');
   if(nextOperational!=null){
    if(!positive(nextOperational.operationalHighWater))throw new Error('Capital cash flow requires a valid operational risk reference');
    nextOperational={...nextOperational,operationalHighWater:nextOperational.operationalHighWater*ratio};
    if(!positive(nextOperational.operationalHighWater))throw new Error('Capital cash flow invalidates the operational risk reference');
   }
   capitalFlow+=event.amount;
   if(!finite(capitalFlow))throw new Error('Statement capital flow exceeds finite account units');
  }
  nextCash+=event.amount;nextEquity=after;appliedIds.push(event.id);
 }
 return {cash:nextCash,equity:nextEquity,portfolioHighWatermark:nextReference,operationalRiskState:nextOperational,capitalFlow,appliedIds};
}

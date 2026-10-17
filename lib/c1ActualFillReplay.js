import {marketSessionDistance} from './marketSession';

// These full exits may be replayed from privately reconciled saved-plan
// authority even after a later policy changes the hypothetical current queue.
const rankSaleReasons=new Set(['rank-deterioration','early-rank-deterioration','profit-rank-deterioration',
  'recent-momentum-deterioration','recent-momentum-profit-protection']);
const reconciledRankFills=new WeakSet(),reconciledIdentity=new WeakMap();
const reconciledProjectionFills=new WeakSet(),projectionIdentity=new WeakMap();
const brokeragePurchases=new WeakMap(),capacityPurchases=new WeakMap();
export function markC1AdditionalCapacityPurchase(fill,date){
 if(fill?.side==='buy')capacityPurchases.set(fill,{date,identity:identity(fill)});
 return fill;
}
const identity=fill=>JSON.stringify([fill.id,fill.orderId,fill.symbol,fill.side,fill.reason,fill.shares,fill.price,fill.fee,fill.executedAt,fill.targetShares]);
// Only the ledger calls this after reconciling a server-captured funded plan.
// A serialized brokerageFunded flag cannot authorize a historical cash debit.
export function markC1BrokerageFundedPurchase(fill,date){
 if(fill?.side==='buy')brokeragePurchases.set(fill,{date,identity:identity(fill)});
 return fill;
}
// Called only after the account ledger reconciles the original saved order and
// posted economics. No serialized/client flag carries this private capability.
export function markC1ReconciledRankSale(fill,canonicalRecordDate){
  if(fill?.side==='sell'&&rankSaleReasons.has(fill.reason)&&typeof canonicalRecordDate==='string'){
    reconciledRankFills.add(fill);reconciledIdentity.set(fill,{identity:identity(fill),date:canonicalRecordDate});
  }
  return fill;
}

// The caller has reconciled this exact fill against its saved server plan and
// original opening books. This non-serializable capability applies only to
// already executed projection facts, never an order target or future quantity.
export function markC1ReconciledProjectionFill(fill,date,sourceSignal){
  reconciledProjectionFills.add(fill);
  projectionIdentity.set(fill,{identity:JSON.stringify(fill),date,
    sourceSignal:sourceSignal?JSON.parse(JSON.stringify(sourceSignal)):null});
  return fill;
}

// Consumes recorded executions only. An explicitly listed empty session means
// no orders filled; an omitted session must never become a simulated fill.
export function createC1ActualFillReplay(input,seed,sessions) {
  if(input==null)return null;
  if(!seed||input.contract!=='c1-actual-fill-replay-v1'||!Array.isArray(input.sessions))throw new Error('Actual replay requires a seeded account and dated fill records');
  const after=sessions.filter(s=>s.date>seed.asOfSession),records=new Map(),used=new Set(),reconciledKeys=new Set(),projectionEvidence=new Map(),fundedKeys=new Set(),capacityKeys=new Set();
  const normalize=(f,key,recordDate)=>{
    if(!f||typeof f.symbol!=='string'||!['buy','sell'].includes(f.side)||typeof f.reason!=='string'||![f.shares,f.price,f.fee].every(Number.isFinite)||f.shares<=0||f.price<=0||f.fee<0)throw new Error('Invalid normalized actual fill');
    if(f.side==='buy'&&['MSTR','SCHW'].includes(f.symbol))throw new Error('Excluded account purchase');
    const capability=reconciledIdentity.get(f);
    const funding=brokeragePurchases.get(f),capacity=capacityPurchases.get(f);
    if(capacity?.date===recordDate&&capacity.identity===identity(f))capacityKeys.add(key);
    if(funding?.date===recordDate&&funding.identity===identity(f))fundedKeys.add(key);
    if(reconciledRankFills.has(f)&&capability?.identity===identity(f)&&capability.date===recordDate)reconciledKeys.add(key);
    const projection=projectionIdentity.get(f);
    if(recordDate===input.projectionDate&&reconciledProjectionFills.has(f)&&projection?.identity===JSON.stringify(f)&&projection.date===recordDate)
      projectionEvidence.set(key,projection);
    return {...f,key};
  };
  for(const record of input.sessions){
    if(records.has(record.date)||!Array.isArray(record.fills))throw new Error('Duplicate or invalid execution session');
    records.set(record.date,record.fills.map((f,index)=>normalize(f,record.date+':'+index,record.date)));
  }
  if(input.projectionFills!=null&&(!input.projectionDate||!Array.isArray(input.projectionFills)))throw new Error('Projected actual fills require a projection date');
  const projected=(input.projectionFills||[]).map((f,index)=>normalize(f,'projection:'+index,input.projectionDate));
  let previous=seed.asOfSession;
  for(const session of after){
    if(marketSessionDistance(previous,session.date)!==1)throw new Error('Actual replay requires every market session');
    const projection=session.date===input.projectionDate;
    if(projection&&session!==after.at(-1))throw new Error('Only the last session can be projected');
    if(projection?records.has(session.date):!records.has(session.date))throw new Error('Missing or conflicting actual execution session');
    previous=session.date;
  }
  if([...records.keys()].some(date=>!after.some(s=>s.date===date)))throw new Error('Execution record is outside the replay window');
  const available=(date,symbol,side,reason)=>{
    const source=date===input.projectionDate?projected:records.get(date);
    return source?.filter(f=>!used.has(f.key)&&f.symbol===symbol&&f.side===side&&f.reason===reason)||[];
  };
  return {
    additionalCapacityAllowed(date,symbol,reason){
      return date===input.projectionDate&&input.additionalCapacitySymbols?.includes(symbol)===true||
        available(date,symbol,'buy',reason).some(fill=>capacityKeys.has(fill.key));
    },
    independentPurchaseFunding(date){return input.purchaseFundingIndependent===true&&date===input.projectionDate;},
    reconciledProjectionExecutions(date){
      if(date!==input.projectionDate)return [];
      return projected.filter(fill=>!used.has(fill.key)&&projectionEvidence.has(fill.key))
        .map(fill=>({...fill,keys:[fill.key],sourceSignal:projectionEvidence.get(fill.key).sourceSignal}));
    },
    reconciledRankSales(date){
      if(date===input.projectionDate)return [];
      const pending=(records.get(date)||[]).filter(f=>!used.has(f.key)&&f.side==='sell'&&rankSaleReasons.has(f.reason));
      const groups=new Map();
      for(const fill of pending){const key=fill.symbol+':'+fill.reason;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(fill);}
      return [...groups.values()].filter(fills=>fills.every(f=>reconciledKeys.has(f.key))).map(fills=>({symbol:fills[0].symbol,reason:fills[0].reason}));
    },
    has(date,symbol,side,reason){return available(date,symbol,side,reason).length>0;},
    lookup(date,symbol,side,reason){
      if(date===input.projectionDate){if(!projected.length)return null;}
      else if(!records.has(date))throw new Error('Missing actual execution session');
      const matches=available(date,symbol,side,reason);
      if(!matches.length)return date===input.projectionDate?null:{shares:0,price:0,fee:0};
      const shares=matches.reduce((sum,f)=>sum+f.shares,0);
      return {...(matches.every(f=>fundedKeys.has(f.key))?{brokerageFunded:true}:{}),...(matches.every(f=>Number.isFinite(f.targetShares)&&f.targetShares===matches[0].targetShares)?{targetShares:matches[0].targetShares}:{}),keys:matches.map(f=>f.key),shares,price:matches.reduce((sum,f)=>sum+f.shares*f.price,0)/shares,fee:matches.reduce((sum,f)=>sum+f.fee,0)};
    },
    commit(record){for(const key of record?.keys||[])used.add(key);},
    finish(){const unused=[...records.values(),projected].flat().find(f=>!used.has(f.key));if(unused)throw new Error('Actual fill could not be applied to its C1 decision ('+unused.symbol+' '+unused.side+' '+unused.reason+'); original account must be retained');}
  };
}

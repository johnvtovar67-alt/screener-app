import {marketSessionDistance} from './marketSession';

// Consumes recorded executions only. An explicitly listed empty session means
// no orders filled; an omitted session must never become a simulated fill.
export function createC1ActualFillReplay(input,seed,sessions) {
  if(input==null)return null;
  if(!seed||input.contract!=='c1-actual-fill-replay-v1'||!Array.isArray(input.sessions))throw new Error('Actual replay requires a seeded account and dated fill records');
  const after=sessions.filter(s=>s.date>seed.asOfSession),records=new Map(),used=new Set();
  const normalize=(f,key)=>{
    if(!f||typeof f.symbol!=='string'||!['buy','sell'].includes(f.side)||typeof f.reason!=='string'||![f.shares,f.price,f.fee].every(Number.isFinite)||f.shares<=0||f.price<=0||f.fee<0)throw new Error('Invalid normalized actual fill');
    if(f.side==='buy'&&['MSTR','SCHW'].includes(f.symbol))throw new Error('Excluded account purchase');
    return {...f,key};
  };
  for(const record of input.sessions){
    if(records.has(record.date)||!Array.isArray(record.fills))throw new Error('Duplicate or invalid execution session');
    records.set(record.date,record.fills.map((f,index)=>normalize(f,record.date+':'+index)));
  }
  if(input.projectionFills!=null&&(!input.projectionDate||!Array.isArray(input.projectionFills)))throw new Error('Projected actual fills require a projection date');
  const projected=(input.projectionFills||[]).map((f,index)=>normalize(f,'projection:'+index));
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
    has(date,symbol,side,reason){return available(date,symbol,side,reason).length>0;},
    lookup(date,symbol,side,reason){
      if(date===input.projectionDate){if(!projected.length)return null;}
      else if(!records.has(date))throw new Error('Missing actual execution session');
      const matches=available(date,symbol,side,reason);
      if(!matches.length)return date===input.projectionDate?null:{shares:0,price:0,fee:0};
      const shares=matches.reduce((sum,f)=>sum+f.shares,0);
      return {...(matches.every(f=>Number.isFinite(f.targetShares)&&f.targetShares===matches[0].targetShares)?{targetShares:matches[0].targetShares}:{}),keys:matches.map(f=>f.key),shares,price:matches.reduce((sum,f)=>sum+f.shares*f.price,0)/shares,fee:matches.reduce((sum,f)=>sum+f.fee,0)};
    },
    commit(record){for(const key of record?.keys||[])used.add(key);},
    finish(){const unused=[...records.values(),projected].flat().find(f=>!used.has(f.key));if(unused)throw new Error('Actual fill could not be applied to its C1 decision ('+unused.symbol+' '+unused.side+' '+unused.reason+'); original account must be retained');}
  };
}

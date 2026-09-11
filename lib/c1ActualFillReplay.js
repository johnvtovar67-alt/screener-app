import {marketSessionDistance} from './marketSession';

// Consumes recorded executions only. An explicitly listed empty session means
// no orders filled; an omitted session must never become a simulated fill.
export function createC1ActualFillReplay(input,seed,sessions) {
  if(input==null)return null;
  if(!seed||input.contract!=='c1-actual-fill-replay-v1'||!Array.isArray(input.sessions))throw new Error('Actual replay requires a seeded account and dated fill records');
  const after=sessions.filter(s=>s.date>seed.asOfSession),records=new Map(),used=new Set();
  for(const record of input.sessions){
    if(records.has(record.date)||!Array.isArray(record.fills))throw new Error('Duplicate or invalid execution session');
    records.set(record.date,record.fills.map((f,index)=>{
      if(!f||typeof f.symbol!=='string'||!['buy','sell'].includes(f.side)||typeof f.reason!=='string'||![f.shares,f.price,f.fee].every(Number.isFinite)||f.shares<=0||f.price<=0||f.fee<0)throw new Error('Invalid normalized actual fill');
      if(f.side==='buy'&&['MSTR','SCHW'].includes(f.symbol))throw new Error('Excluded account purchase');
      return {...f,key:record.date+':'+index};
    }));
  }
  let previous=seed.asOfSession;
  for(const session of after){
    if(marketSessionDistance(previous,session.date)!==1)throw new Error('Actual replay requires every market session');
    const projection=session.date===input.projectionDate;
    if(projection&&session!==after.at(-1))throw new Error('Only the last session can be projected');
    if(projection?records.has(session.date):!records.has(session.date))throw new Error('Missing or conflicting actual execution session');
    previous=session.date;
  }
  if([...records.keys()].some(date=>!after.some(s=>s.date===date)))throw new Error('Execution record is outside the replay window');
  return {
    lookup(date,symbol,side,reason){
      if(date===input.projectionDate)return null;
      if(!records.has(date))throw new Error('Missing actual execution session');
      const matches=records.get(date).filter(f=>!used.has(f.key)&&f.symbol===symbol&&f.side===side&&f.reason===reason);
      if(!matches.length)return {shares:0,price:0,fee:0};
      const shares=matches.reduce((sum,f)=>sum+f.shares,0);
      return {keys:matches.map(f=>f.key),shares,price:matches.reduce((sum,f)=>sum+f.shares*f.price,0)/shares,fee:matches.reduce((sum,f)=>sum+f.fee,0)};
    },
    commit(record){for(const key of record?.keys||[])used.add(key);},
    finish(){if([...records.values()].flat().some(f=>!used.has(f.key)))throw new Error('Actual fill could not be applied to its C1 decision; original account must be retained');}
  };
}

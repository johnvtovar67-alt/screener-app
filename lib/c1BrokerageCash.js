import {easternMarketClock} from './marketSession';

export const C1_BROKERAGE_CASH_SOURCE='manual-broker-balance';
export function isC1BrokerageCashBalance(value){
 if(typeof value!=='number'||!Number.isFinite(value)||value<0)return false;
 const cents=value*100;
 return Number.isSafeInteger(Math.round(cents))&&Math.round(cents)/100===value;
}

// A manual balance authorizes purchases only on the Eastern calendar date on
// which it was observed. Overnight cash can change outside C1, so it must be
// confirmed again on the next date. Missing/invalid observations fail closed.
// Posted C1 fills after that observation adjust the execution balance, never
// the persisted metadata or the strategy ledger. A later manual observation
// already includes earlier fills and must not count their proceeds twice.
export function c1CashAvailability({strategyCash,brokerageCash,records=[],intradayActivity,now=new Date()}={}){
 const base={strategyCash,actualCash:strategyCash,brokerageCash:null,executableCash:0,brokerageCashCurrent:false,
  brokerageCashObservedAt:brokerageCash?.observedAt||null,brokerageCashStatus:'missing',
  brokerageCashReason:'Update Brokerage Cash with the current broker balance before a new C1 purchase.'};
 if(brokerageCash==null)return base;
 const observed=Date.parse(brokerageCash.observedAt),time=new Date(now).getTime(),clock=easternMarketClock(now),observedClock=easternMarketClock(brokerageCash.observedAt);
 if(brokerageCash.source!==C1_BROKERAGE_CASH_SOURCE||!isC1BrokerageCashBalance(brokerageCash.balance)||!Number.isFinite(observed)||!Number.isFinite(time)||observed>time||!clock||!observedClock)
  return {...base,brokerageCashStatus:'invalid',brokerageCashReason:'The brokerage cash observation is invalid. Update Brokerage Cash before a new C1 purchase.'};
 const fills=[...records.flatMap(record=>record.fills||[]),...(intradayActivity?.fills||[])],seen=new Map();
 let delta=0;
 for(const fill of fills){
  const executed=Date.parse(fill.executedAt);
  if(!Number.isFinite(executed)||executed<=observed||executed>time)continue;
  if(seen.has(fill.id)){
   if(JSON.stringify(seen.get(fill.id))!==JSON.stringify(fill))return {...base,brokerageCashStatus:'invalid',brokerageCashReason:'Conflicting recorded cash activity requires an account refresh.'};
   continue;
  }
  if(typeof fill.id!=='string'||!fill.id||!['buy','sell'].includes(fill.side)||!Number.isSafeInteger(fill.shares)||fill.shares<=0||!Number.isFinite(fill.price)||fill.price<=0||!Number.isFinite(fill.fee)||fill.fee<0)
   return {...base,brokerageCashStatus:'invalid',brokerageCashReason:'Recorded cash activity requires an account refresh.'};
  delta+=(fill.side==='sell'?1:-1)*fill.shares*fill.price-fill.fee;
  seen.set(fill.id,fill);
 }
 const balance=Math.round((brokerageCash.balance+delta)*100)/100,current=clock.key===observedClock.key&&balance>=0;
 if(balance<0)return {...base,brokerageCash:balance,brokerageCashStatus:'invalid',brokerageCashReason:'Recorded purchases exceed the observed brokerage cash. Update Brokerage Cash before a new purchase.'};
 return {...base,brokerageCash:balance,brokerageCashCurrent:current,brokerageCashStatus:current?'current':'stale',
  executableCash:current&&Number.isFinite(strategyCash)?Math.max(0,Math.min(strategyCash,balance)):0,
  brokerageCashReason:current?null:'Brokerage cash is from an earlier Eastern date. Update Brokerage Cash before a new C1 purchase.'};
}

export function c1AccountCashAvailability({account,strategyCash,now=new Date()}={}){
 return c1CashAvailability({strategyCash,brokerageCash:account?.brokerageCash,records:account?.records,intradayActivity:account?.intradayActivity,now});
}

// Validate new accounting facts against the observed cash at each buy time.
// Recorded sales can fund a later buy; proposed or later sales cannot. Existing
// fills later than a backdated buy are removed from its strategy cash trajectory
// so entering trades out of order cannot borrow proceeds from the future.
export function assertC1NewBuyCash({account,strategyCash,fills=[],now=new Date()}={}){
 if(!fills.some(fill=>fill.side==='buy'))return;
 if(!Number.isFinite(strategyCash)||strategyCash<0)throw new Error('Valid C1 strategy cash required before a new purchase');
 const prior=[...new Map([...(account.records||[]).flatMap(record=>record.fills||[]),...(account.intradayActivity?.fills||[])].map(fill=>[fill.id,fill])).values()];
 const seen=new Map(prior.map(fill=>[fill.id,fill])),ordered=[...fills].sort((a,b)=>Date.parse(a.executedAt)-Date.parse(b.executedAt));
 const cashDelta=fill=>(fill.side==='sell'?1:-1)*fill.shares*fill.price-fill.fee;
 let addedStrategy=0,addedBroker=0;
 const observed=Date.parse(account.brokerageCash?.observedAt);
 for(const fill of ordered){
  if(seen.has(fill.id)){
   if(JSON.stringify(seen.get(fill.id))!==JSON.stringify(fill))throw new Error('Conflicting actual fill ID');
   continue;
  }
  const executed=Date.parse(fill.executedAt);
  if(!Number.isFinite(executed)||executed>new Date(now).getTime())throw new Error('Valid actual execution time required');
  if(!['buy','sell'].includes(fill.side)||!Number.isSafeInteger(fill.shares)||fill.shares<=0||!Number.isFinite(fill.price)||fill.price<=0||!Number.isFinite(fill.fee)||fill.fee<0)throw new Error('Actual quantity, execution price and fee required');
  if(fill.side==='buy'){
   const cash=c1AccountCashAvailability({account,strategyCash,now:new Date(executed)});
   if(!cash.brokerageCashCurrent)throw new Error(cash.brokerageCashReason);
   const future=prior.filter(row=>Date.parse(row.executedAt)>executed).reduce((sum,row)=>sum+cashDelta(row),0);
   const strategyBefore=strategyCash-future+addedStrategy,brokerBefore=cash.brokerageCash+addedBroker,cost=fill.shares*fill.price+fill.fee;
   if(!Number.isFinite(cost)||cost<0||cost>Math.max(0,Math.min(strategyBefore,brokerBefore))+1e-7)throw new Error('New C1 purchase exceeds available brokerage or strategy cash');
  }
  const delta=cashDelta(fill);addedStrategy+=delta;
  if(executed>observed)addedBroker+=delta;
  seen.set(fill.id,fill);
 }
}

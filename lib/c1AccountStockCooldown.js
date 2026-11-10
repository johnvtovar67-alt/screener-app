import {C1_FROZEN_OPTIONS} from './c1FrozenOptions';
import {easternMarketClock,isUsMarketSessionDay,marketSessionDistance} from './marketSession';
import {c1NonCashEvents} from './c1NonCashAdoption';

const ids=['base','cooldown15','sector40'];
const clone=value=>JSON.parse(JSON.stringify(value));
const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;
const whole=value=>{const n=Math.round(value);if(!Number.isSafeInteger(n)||n<0||Math.abs(n-value)>1e-7)throw new Error('Verified whole-share ownership required for account cooldown');return n;};
const validDay=date=>typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date&&isUsMarketSessionDay(date);
export function nextC1PolicySession(date){
 if(!validDay(date))throw new Error('Valid original exchange session required');
 const value=new Date(date+'T00:00:00.000Z');
 for(let i=0;i<370;i++){value.setUTCDate(value.getUTCDate()+1);const day=value.toISOString().slice(0,10);if(isUsMarketSessionDay(day))return day;}
 throw new Error('Exchange session calendar unavailable');
}
export function c1StockCooldownExpiry(triggerDate,durationSessions){
 if(!validDay(triggerDate)||!Number.isSafeInteger(durationSessions)||durationSessions<1)throw new Error('Valid actual loss date and session duration required');
 let expiresAfterSession=triggerDate;
 for(let i=0;i<durationSessions;i++)expiresAfterSession=nextC1PolicySession(expiresAfterSession);
 return {expiresAfterSession,resumesOn:nextC1PolicySession(expiresAfterSession)};
}

// Called after the ordinary account ledger validates saved order identities and
// actual economics. This derives policy evidence; it never records a fill or
// changes the accepted account. Cash metadata and projections are not trades.
export function reconcileC1AccountInvestmentPeriods(account,{date,now=new Date()}={}){
 if(account?.contract!=='c1-private-account-v1'||!account.adoption?.seeds||!Array.isArray(account.records)||!validDay(date))throw new Error('Dated accepted account required for loss cooldown');
 const states=new Map(),periods=[],events=[],seen=new Map();
 const stateFor=(symbol,openedAt,basisScope='complete-recorded-lifecycle')=>{
  if(!states.has(symbol))states.set(symbol,{symbol,openedAt,basisScope,completeHoldingPeriodVerified:basisScope==='complete-recorded-lifecycle',positions:new Map(),participating:new Set(),realizedPnl:0,buyCost:0,netProceeds:0});
  return states.get(symbol);
 };
 const addBasis=(symbol,sleeve,shares,cost,openedAt,basisScope)=>{
  if(!shares)return;
  const state=stateFor(symbol,openedAt,basisScope),prior=state.positions.get(sleeve)||{shares:0,basis:0};
  state.positions.set(sleeve,{shares:prior.shares+shares,basis:prior.basis+cost});state.participating.add(sleeve);state.buyCost+=cost;
  if(openedAt<state.openedAt)state.openedAt=openedAt;
  if(basisScope==='verified-adopted-opening-basis')state.basisScope=basisScope;
 };
 for(const sleeve of ids){
  const seed=account.adoption.seeds[sleeve];
  if(seed?.sleeve!==sleeve||!positive(seed.actualDollarsPerModelDollar)||!Array.isArray(seed.positions))throw new Error('Verified allocation seed required for account cooldown');
  for(const p of seed.positions){
   const shares=whole(p.shares*seed.actualDollarsPerModelDollar);
   if(!positive(p.entryPrice)||typeof p.symbol!=='string')throw new Error('Verified adopted cost basis required');
   addBasis(p.symbol,sleeve,shares,shares*p.entryPrice,p.openedAt,'verified-adopted-opening-basis');
  }
 }
 // The noncash receipt carries original acquisition cost, never the valuation
 // mark used to record the capital contribution in the performance curve.
 for(const event of c1NonCashEvents(account.adoption).filter(e=>e.effectiveSessionDate<=date))events.push({kind:'adoption',date:event.effectiveSessionDate,time:Infinity,event});
 const records=[...account.records];
 if(account.intradayActivity)records.push({...account.intradayActivity,executionEvidence:account.intradayActivity.plan,intraday:true});
 for(const record of records){
  if(record.date>date)continue;
  if(!validDay(record.date)||!Array.isArray(record.fills))throw new Error('Dated actual fills required for account cooldown');
  const plan=record.executionEvidence||record.recordingEvidence;
  for(const fill of record.fills){
   if(seen.has(fill.id)){if(JSON.stringify(seen.get(fill.id))!==JSON.stringify(fill))throw new Error('Conflicting actual fill identity in account cooldown');continue;}
   if(typeof fill.id!=='string'||!fill.id||!['buy','sell'].includes(fill.side)||!Number.isSafeInteger(fill.shares)||fill.shares<1||!positive(fill.price)||!Number.isFinite(fill.fee)||fill.fee<0)throw new Error('Valid reconciled actual economics required for account cooldown');
   const time=Date.parse(fill.executedAt),clock=easternMarketClock(fill.executedAt);
   if(!Number.isFinite(time)||time>new Date(now).getTime()||clock?.key!==record.date)throw new Error('Valid actual execution date required for account cooldown');
   const order=plan?.orders?.find(o=>o.id===fill.orderId);
   let sleeve=order?.sleeve;
   // These original numeric identities predate captured server plans. The
   // ordinary ledger independently reconstructs and verifies them before use.
   if(!plan&&record.date<'2026-09-22')sleeve=ids.find(id=>fill.orderId?.startsWith(id+':'+record.date+':'));
   if(!ids.includes(sleeve)||(plan&&(!order||order.symbol!==fill.symbol||order.side!==fill.side)))throw new Error('Actual fill lacks reconciled allocation order evidence');
   seen.set(fill.id,clone(fill));events.push({kind:'fill',date:record.date,time,fill,sleeve,index:events.length});
  }
 }
 events.sort((a,b)=>a.date.localeCompare(b.date)||a.time-b.time||(a.index||0)-(b.index||0));
 for(const item of events){
  if(item.kind==='adoption'){
   const e=item.event;
   if(states.has(e.original.symbol))throw new Error('Noncash adoption duplicates an account investment');
   for(const sleeve of ids)addBasis(e.original.symbol,sleeve,e.allocations[sleeve],e.allocations[sleeve]*Number(e.original.avgCost),e.original.openedAt,'verified-adopted-opening-basis');
   continue;
  }
  const {fill,sleeve}=item;
  if(fill.side==='buy'){addBasis(fill.symbol,sleeve,fill.shares,fill.shares*fill.price+fill.fee,item.date,'complete-recorded-lifecycle');continue;}
  const state=states.get(fill.symbol),position=state?.positions.get(sleeve);
  if(!state||!position||fill.shares>position.shares)throw new Error('Actual sale exceeds verified account ownership');
  const removedBasis=position.basis*fill.shares/position.shares,proceeds=fill.shares*fill.price-fill.fee;
  state.realizedPnl+=proceeds-removedBasis;state.netProceeds+=proceeds;
  position.shares-=fill.shares;position.basis-=removedBasis;
  if(!position.shares)state.positions.delete(sleeve);
  if(!state.positions.size){
   const participatingAllocations=ids.filter(id=>state.participating.has(id));
   const durationSessions=Math.max(...participatingAllocations.map(id=>C1_FROZEN_OPTIONS[id].portfolioDrawdownCooldownSessions));
   periods.push({symbol:fill.symbol,openedAt:state.openedAt,triggerDate:item.date,completedAt:fill.executedAt,
    recordedPeriodNetRealizedPnl:state.realizedPnl,netRealizedPnl:state.completeHoldingPeriodVerified?state.realizedPnl:null,
    buyCost:state.buyCost,netProceeds:state.netProceeds,participatingAllocations,durationSessions,basisScope:state.basisScope,
    completeHoldingPeriodVerified:state.completeHoldingPeriodVerified,loss:state.completeHoldingPeriodVerified?state.realizedPnl< -1e-7:null,
    ...(state.completeHoldingPeriodVerified?c1StockCooldownExpiry(item.date,durationSessions):{})});
   states.delete(fill.symbol);
  }
 }
 const cooldownBySymbol=new Map();
 for(const period of periods.filter(p=>p.loss)){
  const prior=cooldownBySymbol.get(period.symbol);
  if(!prior||period.expiresAfterSession>prior.expiresAfterSession)cooldownBySymbol.set(period.symbol,period);
 }
 const stockCooldowns=[...cooldownBySymbol.values()].map(p=>({...p,eligibleFromSession:p.resumesOn,elapsedSessions:marketSessionDistance(p.triggerDate,date),active:date<=p.expiresAfterSession}));
 const accountingRestrictions=periods.filter(p=>!p.completeHoldingPeriodVerified).map(p=>({symbol:p.symbol,triggerDate:p.triggerDate,
  ...c1StockCooldownExpiry(p.triggerDate,p.durationSessions),active:date<=c1StockCooldownExpiry(p.triggerDate,p.durationSessions).expiresAfterSession,reason:'account-holding-period-unverified',lossClassification:'unknown',
  detail:'Verified adopted remaining cost basis does not establish pre-adoption partial-sale proceeds. Complete holding-period net profit or loss is unverified.'}));
 return {complete:true,periods,stockCooldowns,accountingRestrictions,openInvestments:[...states.values()].map(p=>({symbol:p.symbol,openedAt:p.openedAt,shares:[...p.positions.values()].reduce((sum,x)=>sum+x.shares,0),participatingAllocations:ids.filter(id=>p.participating.has(id)),realizedPnl:p.realizedPnl,basisScope:p.basisScope}))};
}

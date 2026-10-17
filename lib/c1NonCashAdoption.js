import {c1AccountDifferences} from './c1AccountDifferences';
import {isUsMarketSessionDay,latestCompletedMarketSessionDay,marketExecutionState} from './marketSession';
import {c1HistoricalPriceEvidence} from './c1AccountSeed';

export const C1_NON_CASH_ADOPTION='c1-mrna-in-kind-adoption-v1';
const ids=['base','cooldown15','sector40'],weights=[.25,.5,.25],capabilities=new WeakMap();
const clone=x=>JSON.parse(JSON.stringify(x));
const fingerprint=x=>JSON.stringify(x);
const positive=x=>Number.isFinite(x)&&x>0;
const facts=p=>({symbol:p.symbol,role:p.role,shares:Number(p.shares),avgCost:Number(p.avgCost),openedAt:String(p.openedAt||'').slice(0,10)});
function quantities(shares){
 const q=weights.map(w=>Math.floor(shares*w));
 const order=weights.map((w,i)=>({i,r:shares*w-q[i]})).sort((a,b)=>b.r-a.r||a.i-b.i);
 for(let i=0,n=shares-q.reduce((a,b)=>a+b,0);i<n;i++)q[order[i].i]++;
 return Object.fromEntries(ids.map((id,i)=>[id,q[i]]));
}
function priceEvidence(original,sessions,date){
 const p=facts(original),history=c1HistoricalPriceEvidence({symbol:p.symbol,entryPrice:p.avgCost,openedAt:p.openedAt},sessions,date);
 if(!history.complete)throw new Error('Complete verified MRNA price history since purchase is required for stops and profit protection');
 const window=sessions.filter(s=>s.date>=p.openedAt&&s.date<=date);
 if(window.some(s=>(s.corporateActions||[]).some(a=>(a.symbol||a.ticker)==='MRNA')))throw new Error('MRNA corporate-action history requires a separate basis review before adoption');
 const bars=window.map(s=>s.prices.find(r=>r.symbol==='MRNA'));
 return {history,digest:fingerprint(bars.map(b=>[b.date,b.open,b.high,b.low,b.close,b.adjusted])),mark:bars.at(-1)?.close};
}
export function buildC1NonCashAdoptionReview({account,decision,book,portfolioRecord,accountEtag,accountIdentity,completedActivity=null,finalizedSessions=[],expectedRevision,now=new Date()}={}){
 if(account?.revision!==expectedRevision)throw new Error('Account changed; reload before reviewing adoption');
 if(account.adoption.nonCashHoldings?.length)throw new Error('The one-time MRNA adoption is already recorded');
 if(marketExecutionState(now).isOpen)throw new Error('Adopt MRNA between regular sessions, after reconciling the latest completed close');
 if(account.intradayActivity)throw new Error('Complete the saved intraday session before adopting MRNA');
 const date=decision?.sourceSessionDate;
 if(!decision?.current||date!==latestCompletedMarketSessionDay(now)||date!==book.model.sessions.at(-1)?.date||date!==(account.records.at(-1)?.date||account.adoption.sourceSessionDate))throw new Error('Complete the C1 account update to the latest verified close before adoption');
 if(typeof accountIdentity!=='string'||!/^[a-f0-9]{64}$/.test(accountIdentity))throw new Error('The authenticated C1 account identity is required');
 if(typeof accountEtag!=='string'||!accountEtag)throw new Error('A versioned saved C1 account is required');
 if(!portfolioRecord?.etag||!Array.isArray(portfolioRecord.portfolio))throw new Error('A saved, versioned portfolio is required');
 const differences=c1AccountDifferences(decision,portfolioRecord.portfolio);
 if(differences.length)throw new Error('Resolve existing C1 ownership differences before adoption: '+differences.map(p=>p.symbol+' '+p.field).join(', '));
 const rows=portfolioRecord.portfolio.filter(p=>p.symbol==='MRNA'),original=rows[0];
 if(rows.length!==1||original.role!=='Core')throw new Error('Exactly one saved MRNA Core holding is required');
 const p=facts(original);
 if(!Number.isSafeInteger(p.shares)||p.shares<=0||!positive(p.avgCost)||!positive(p.shares*p.avgCost)||!isUsMarketSessionDay(p.openedAt)||p.openedAt>date)throw new Error('Original whole shares, positive basis and valid purchase date are required');
 if(decision.positions.some(p=>p.symbol==='MRNA')||Object.values(account.adoption.seeds).some(s=>s.positions.some(p=>p.symbol==='MRNA'))||account.positionContext?.some(p=>p.symbol==='MRNA')||account.records.some(r=>r.fills?.some(f=>f.symbol==='MRNA')))throw new Error('Existing C1 MRNA ownership/history requires a separate lot reconciliation; no lots will be combined');
 const baseline=book.model.sessions.find(s=>s.date===date),stock=[...(baseline.positionSignals||[]),...(baseline.signals||[])].find(s=>s.symbol==='MRNA');
 if(!baseline.universeSymbols?.includes('MRNA')||typeof stock?.sector!=='string'||!stock.sector.trim())throw new Error('Accepted current MRNA membership and classification are required');
 const evidence=priceEvidence(original,book.model.sessions,date);
 if(!positive(evidence.mark))throw new Error('Verified MRNA closing valuation required');
 const sourceHash=book.captures.find(c=>c.sessionDate===date)?.hash;
 if(!sourceHash||account.sourceHashes.find(c=>c.date===date)?.hash!==sourceHash)throw new Error('Accepted account close identity required');
 const proposal={contract:C1_NON_CASH_ADOPTION,effectiveSessionDate:date,sourceHash,accountRevision:account.revision,accountIdentity,accountEtag,portfolioEtag:portfolioRecord.etag,...(completedActivity?{completedActivity:clone(completedActivity)}:{}),finalizedSessions,
  original:clone(original),allocations:quantities(p.shares),mark:evidence.mark,value:p.shares*evidence.mark,
  historicalPriceFingerprint:evidence.digest,history:evidence.history,stock:clone(stock),cashChange:0};
 return proposal;
}
export function appendC1NonCashAdoption({account,review,reviewId,confirmed=false,now=new Date()}={}){
 if(confirmed!==true||review?.contract!==C1_NON_CASH_ADOPTION||review.reviewId!==reviewId||account.revision!==review.accountRevision)throw new Error('Explicit confirmation of the current MRNA adoption review is required');
 if(account.adoption.nonCashHoldings?.length)throw new Error('The one-time MRNA adoption is already recorded');
 const {reviewId:acceptedId,...proposal}=clone(review);
 const event={...proposal,reviewId:acceptedId,id:acceptedId,reviewPayload:fingerprint(proposal),recordedAt:now.toISOString()};
 return {...account,revision:account.revision+1,adoption:{...account.adoption,nonCashHoldings:[event]}};
}
export function c1NonCashEvents(adoption,sessions=[]){
 const events=adoption?.nonCashHoldings||[];
 if(!Array.isArray(events)||events.length>1)throw new Error('Invalid one-time MRNA adoption history');
 for(const event of events){
  const {id,recordedAt,reviewId,reviewPayload,...proposal}=event,p=facts(event.original||{});
  if(event.contract!==C1_NON_CASH_ADOPTION||id!==reviewId||!/^[a-f0-9]{64}$/.test(id)||fingerprint(proposal)!==reviewPayload||event.cashChange!==0||p.symbol!=='MRNA'||p.role!=='Core'||!Number.isSafeInteger(p.shares)||p.shares<=0||!positive(p.avgCost)||event.effectiveSessionDate<adoption.sourceSessionDate||!Number.isFinite(Date.parse(recordedAt))||latestCompletedMarketSessionDay(recordedAt)!==event.effectiveSessionDate||marketExecutionState(recordedAt).isOpen||JSON.stringify(event.allocations)!==JSON.stringify(quantities(p.shares)))throw new Error('Invalid immutable non-cash adoption receipt');
  // The original observations were captured and hash-bound before confirmation.
  // Do not make a later valid Sell depend on re-fetching pre-adoption history.
  const rows=JSON.parse(event.historicalPriceFingerprint);
  if(!Array.isArray(rows)||rows.some(r=>!Array.isArray(r)||r.length!==6))throw new Error('Invalid captured MRNA price evidence');
  const captured=rows.map(([date,open,high,low,close,adjusted])=>({date,prices:[{symbol:'MRNA',date,open,high,low,close,adjusted}],corporateActions:[]}));
  const evidence=priceEvidence(event.original,captured,event.effectiveSessionDate);
  if(evidence.digest!==event.historicalPriceFingerprint||JSON.stringify(evidence.history)!==JSON.stringify(event.history)||evidence.mark!==event.mark||event.value!==p.shares*event.mark)throw new Error('Accepted MRNA adoption price evidence changed');
 }
 return events;
}
export function markC1NonCashReplay(replay,adoption,sleeve,sessions,through=sessions.at(-1)?.date){
 if(!replay)return replay;
 const events=c1NonCashEvents(adoption,sessions).filter(e=>e.effectiveSessionDate<=through&&e.allocations[sleeve]>0).map(e=>{
  const scale=adoption.seeds[sleeve].actualDollarsPerModelDollar,p=facts(e.original);
  return {date:e.effectiveSessionDate,value:e.allocations[sleeve]*e.mark/scale,position:{nonCashPriceProof:true,symbol:'MRNA',role:'Swing',shares:e.allocations[sleeve]/scale,entryPrice:p.avgCost,openedAt:p.openedAt,sector:e.stock.sector,issuer:e.stock.issuer||String(e.stock.cik||e.stock.cikNumber||'MRNA'),stock:clone(e.stock),historicalPriceEvidence:clone(e.history)}};
 });
 capabilities.set(replay,events);return replay;
}
export function c1ReplayNonCashHoldings(replay,date){return clone((capabilities.get(replay)||[]).filter(e=>e.date===date));}
export function applyC1NonCashBooks(books,events,date){
 for(const e of events.filter(e=>e.effectiveSessionDate===date))for(const id of ids){
  const shares=e.allocations[id];if(!shares)continue;
  if(books[id].positions.MRNA)throw new Error('Non-cash adoption would duplicate owned MRNA shares');
  books[id].positions.MRNA={shares,avgCost:Number(e.original.avgCost),openedAt:String(e.original.openedAt).slice(0,10)};
 }
 return books;
}
export function c1NonCashHoldingHistory(event,sessions,through){
 const captured=JSON.parse(event.historicalPriceFingerprint).map(([date,open,high,low,close,adjusted])=>({date,prices:[{symbol:'MRNA',date,open,high,low,close,adjusted}]}));
 return c1HistoricalPriceEvidence({symbol:'MRNA',entryPrice:Number(event.original.avgCost),openedAt:String(event.original.openedAt).slice(0,10)},[...captured,...sessions.filter(s=>s.date>event.effectiveSessionDate)],through);
}
// End-of-session capital contributions are excluded from investment returns.
// No-flow accounts retain the original curve object and metrics exactly.
export function c1NonCashPerformanceCurve(curve){
 if(!curve.some(p=>p.nonCashFlow))return curve;
 let previous=null,nav=null;
 return curve.map(p=>{const before=p.equity-(p.nonCashFlow||0);nav=previous===null?before:nav*before/previous;previous=p.equity;return {...p,equity:nav};});
}

import {easternMarketClock,marketExecutionState,latestCompletedMarketSessionDay,previousMarketSessionDay,isUsMarketSessionDay} from './marketSession';
import {c1MomentumRiskBasis} from './c1MomentumEvidence';

const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const percent=(value,reference)=>positive(value)&&positive(reference)?(value/reference-1)*100:null;
const cash=new Set(['CASH','SWVXX','VMFXX','SPAXX','FDRXX','MMF']);
const sectors={
 'basic materials':'XLB','materials':'XLB','communication services':'XLC',
 'consumer cyclical':'XLY','consumer discretionary':'XLY','consumer defensive':'XLP','consumer staples':'XLP',
 'energy':'XLE','financial services':'XLF','financials':'XLF','healthcare':'XLV','health care':'XLV',
 'industrials':'XLI','real estate':'XLRE','technology':'XLK','information technology':'XLK','utilities':'XLU',
};

export function c1IntradaySymbol(value){
 if(typeof value!=='string')return null;
 const symbol=value.trim().toUpperCase().replace('-', '.');
 return /^[A-Z][A-Z0-9]{0,9}(?:\.[A-Z0-9]{1,3})?$/.test(symbol)?symbol:null;
}

export function validateC1IntradaySymbols(value){
 const input=typeof value==='string'?value.split(','):value;
 if(!Array.isArray(input)||!input.length||input.length>32)throw new Error('Request between 1 and 32 quote symbols.');
 const symbols=input.map(c1IntradaySymbol);
 if(symbols.some(symbol=>!symbol))throw new Error('Quote symbols are malformed.');
 return [...new Set(symbols)].sort();
}

const validSession=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&
 Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value&&isUsMarketSessionDay(value);
const sectorETF=value=>{
 const key=typeof value==='string'?value.trim().toLowerCase():null;
 return key!==null&&Object.hasOwn(sectors,key)?sectors[key]:null;
};
const exactPrice=(left,right)=>positive(left)&&positive(right)&&Math.abs(left-right)<=1e-7+Number.EPSILON*Math.max(left,right)*4;
const acceptedClose=position=>{
 const values=[...new Set((position?.reviewRules||[]).map(rule=>rule.close).filter(positive))];
 return values.length===1?values[0]:null;
};
function verifiedDailyLabel(position,date){
 const evidence=position?.momentumEvidence;
 return evidence?.contract==='c1-momentum-evidence-v1'&&evidence.sourceSessionDate===date&&
  ['available','partial'].includes(evidence.status)&&evidence.riskBasis===c1MomentumRiskBasis(position)
  ?evidence.classification||null:null;
}

// Only authoritative account positions and the dated nine-name screen are
// targets. Live broad-screen rows never supply eligibility, rank or sector.
export function c1IntradayTargets({decision,screenRows=[],portfolio,accountMatches}={}){
 if(decision?.contract!=='c1-account-decision-v1'||!validSession(decision.sourceSessionDate))return [];
 const date=decision.sourceSessionDate,snapshot=decision.stockScreen;
 const candidates=snapshot?.contract==='c1-stock-screen-v1'&&snapshot.sourceSessionDate===date&&Array.isArray(snapshot.candidates)
  ?snapshot.candidates.slice(0,9):[];
 const byCandidate=new Map(candidates.map(row=>[c1IntradaySymbol(row.symbol),row]));
 const opportunities=new Set((decision.opportunities||[]).map(row=>c1IntradaySymbol(row.symbol)).filter(Boolean));
 const targetMap=new Map();
 let holdingsMatch=accountMatches!==false;
 if(Array.isArray(portfolio)){
  const held=portfolio.filter(row=>row.role==='Swing'&&!cash.has(c1IntradaySymbol(row.symbol))&&Number(row.shares)>0);
  const positions=Array.isArray(decision.positions)?decision.positions:[];
  holdingsMatch=holdingsMatch&&new Set(held.map(row=>c1IntradaySymbol(row.symbol))).size===held.length&&
   new Set(positions.map(row=>c1IntradaySymbol(row.symbol))).size===positions.length&&held.length===positions.length&&held.every(row=>{
   const position=positions.find(item=>c1IntradaySymbol(item.symbol)===c1IntradaySymbol(row.symbol));
   return position&&Math.abs(Number(row.shares)-position.shares)<=1e-7&&
    Math.abs(Number(row.avgCost)-position.avgCost)<=.02&&String(row.openedAt||'').slice(0,10)===position.openedAt;
  });
 }
 if(holdingsMatch)for(const position of decision.positions||[]){
  const symbol=c1IntradaySymbol(position.symbol);if(!symbol||cash.has(symbol)||!positive(position.shares))continue;
  const candidate=byCandidate.get(symbol),sector=typeof candidate?.sector==='string'?candidate.sector:null;
  const ranks=Object.entries(position.holdingRank||{}).filter(([sleeve,row])=>
   (position.reviewRules||[]).some(rule=>rule.sleeve===sleeve&&rule.rankVerified===true)&&row.verified!==false&&row.eligible===true&&
   Number.isSafeInteger(row.rank)&&row.rank>0&&Number.isSafeInteger(row.eligibleCount)&&row.rank<=row.eligibleCount).map(([,row])=>row);
  const rank=Number.isSafeInteger(candidate?.researchRank)?candidate.researchRank:ranks.length?Math.min(...ranks.map(row=>row.rank)):null;
  const stops=(position.stops||[]).filter(stop=>positive(stop.price)).map(stop=>({
   sleeve:typeof stop.sleeve==='string'?stop.sleeve:null,price:stop.price,shares:positive(stop.shares)?stop.shares:null,
  }));
  targetMap.set(symbol,{symbol,role:'Swing holding',sourceSessionDate:date,baselineClose:acceptedClose(position),
   sector,sectorETF:sectorETF(sector),researchRank:rank,dailyEvidenceLabel:verifiedDailyLabel(position,date),stops});
 }
 for(const candidate of candidates){
  const symbol=c1IntradaySymbol(candidate.symbol);if(!symbol||cash.has(symbol)||targetMap.has(symbol))continue;
  const sector=typeof candidate.sector==='string'?candidate.sector:null;
  targetMap.set(symbol,{symbol,role:opportunities.has(symbol)?'Daily opportunity':'Daily watch',sourceSessionDate:date,
   baselineClose:positive(candidate.sourcePrice)?candidate.sourcePrice:null,sector,sectorETF:sectorETF(sector),
   researchRank:Number.isSafeInteger(candidate.researchRank)&&candidate.researchRank>0?candidate.researchRank:null,
   dailyEvidenceLabel:null,stops:[]});
 }
 return [...targetMap.values()];
}

export function c1IntradayRequestSymbols(targets=[]){
 if(!Array.isArray(targets)||!targets.length)return [];
 return validateC1IntradaySymbols([...new Set(['SPY','QQQ',...targets.flatMap(row=>[row.symbol,...(row.sectorETF?[row.sectorETF]:[])])])]);
}

// FMP's timestamp may use epoch seconds or milliseconds. String dates without
// an explicit timezone and implausible epochs cannot establish freshness.
export function c1IntradayTimestamp(value){
 if(!finite(value)||value<=0)return null;
 const milliseconds=value<1e11?value*1000:value;
 if(!Number.isSafeInteger(milliseconds)||milliseconds<Date.UTC(2000,0,1)||milliseconds>=Date.UTC(2100,0,1))return null;
 return milliseconds;
}
function receiptTime(value){
 return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)&&Number.isFinite(Date.parse(value))?Date.parse(value):null;
}
function quoteIndex(snapshot){
 const index=new Map(),duplicates=new Set();
 for(const quote of Array.isArray(snapshot?.quotes)?snapshot.quotes:[]){
  const symbol=c1IntradaySymbol(quote?.symbol);if(!symbol)continue;
  if(index.has(symbol))duplicates.add(symbol);else index.set(symbol,quote);
 }
 for(const symbol of duplicates)index.delete(symbol);
 return index;
}
function observationState(quote,{nowMs,market,trusted,cacheStatus,receivedMs}){
 if(!trusted)return {freshness:'unavailable',reason:'Quote snapshot identity or receipt time is untrusted.',providerAt:null,milliseconds:null};
 if(!quote||!positive(quote.price))return {freshness:'unavailable',reason:'A unique usable provider price is unavailable.',providerAt:null,milliseconds:null};
 const milliseconds=c1IntradayTimestamp(quote.timestamp);
 if(milliseconds===null)return {freshness:'unavailable',reason:'Provider observation timestamp is unavailable or malformed.',providerAt:null,milliseconds:null};
 const providerAt=new Date(milliseconds).toISOString(),clock=easternMarketClock(new Date(milliseconds));
 if(milliseconds>nowMs||milliseconds>receivedMs)return {freshness:'unavailable',reason:'Provider observation timestamp is in the future.',providerAt,milliseconds};
 const regular=marketExecutionState(new Date(milliseconds)).isOpen;
 if(!regular)return {freshness:'stale',reason:'Provider observation is outside the regular market session.',providerAt,milliseconds};
 if(!market.isOpen)return {freshness:'stale',reason:'Regular market session is closed; this is a dated reference.',providerAt,milliseconds};
 if(clock?.key!==market.clock?.key)return {freshness:'stale',reason:'Provider observation is from another session.',providerAt,milliseconds};
 if(['stale-fallback','stale-cooldown'].includes(cacheStatus))return {freshness:'stale',reason:'Cached fallback is retained after a quote-source failure.',providerAt,milliseconds};
 const age=nowMs-milliseconds;
 return age<=120000?{freshness:'fresh',reason:'Regular-session observation is no more than 120 seconds old.',providerAt,milliseconds}
  :age<=900000?{freshness:'delayed',reason:'Regular-session observation is delayed; it is not a current confirmation.',providerAt,milliseconds}
  :{freshness:'stale',reason:'Provider observation is more than 15 minutes old.',providerAt,milliseconds};
}

// Pure disposable observations: no actions, ranking updates, inferred stops,
// exit streaks, account writes, volume proxies or undocumented indicators.
export function buildC1IntradayAdvisory({targets=[],quoteSnapshot,sourceSessionDate,baselineCurrent=false,now=new Date()}={}){
 const time=now instanceof Date?now:new Date(now),nowMs=time.getTime(),market=marketExecutionState(time);
 const receivedMs=receiptTime(quoteSnapshot?.receivedAt),cacheStatus=quoteSnapshot?.cacheStatus||'unavailable';
 const trusted=Number.isFinite(nowMs)&&quoteSnapshot?.contract==='c1-intraday-quotes-v1'&&receivedMs!==null&&receivedMs<=nowMs&&
  ['live','fresh-memory','inflight','stale-fallback','stale-cooldown'].includes(cacheStatus)&&Array.isArray(quoteSnapshot.quotes);
 const baselineStatus=!validSession(sourceSessionDate)?'unavailable':baselineCurrent===true&&
  sourceSessionDate===latestCompletedMarketSessionDay(time)?'current':'stale';
 const index=quoteIndex(quoteSnapshot),states=new Map();
 const stateFor=symbol=>{if(!states.has(symbol))states.set(symbol,observationState(index.get(symbol),{nowMs,market,trusted,cacheStatus,receivedMs}));return states.get(symbol);};
 const rows=(Array.isArray(targets)?targets:[]).filter(target=>c1IntradaySymbol(target?.symbol)).map(target=>{
  const symbol=c1IntradaySymbol(target.symbol),quote=index.get(symbol),state=stateFor(symbol),usable=state.freshness!=='unavailable';
  const price=usable?quote.price:null,open=usable&&positive(quote.open)?quote.open:null,previousClose=usable&&positive(quote.previousClose)?quote.previousClose:null;
  const gapPct=percent(open,previousClose),openToNowPct=percent(price,open),dayChangePct=percent(price,previousClose),limitations=[];
  const quoteDate=state.milliseconds!==null?easternMarketClock(new Date(state.milliseconds))?.key:null;
  const basisStatus=baselineStatus!=='current'||target.sourceSessionDate!==sourceSessionDate?'stale-baseline'
   :!positive(target.baselineClose)||!positive(previousClose)?'unavailable'
   :sourceSessionDate!==previousMarketSessionDay(quoteDate)||!exactPrice(target.baselineClose,previousClose)?'mismatch':'matched';
  if(basisStatus!=='matched')limitations.push('Accepted daily close/date does not match the quote previous-close basis; stop distances and daily divergence are unavailable.');
  if(!target.sectorETF)limitations.push('A verified dated sector benchmark is unavailable.');
  if(open===null)limitations.push('Provider opening price is unavailable.');
  if(previousClose===null)limitations.push('Provider previous close is unavailable.');
  const benchmarkSymbols=[...new Set(['SPY','QQQ',...(target.sectorETF?[target.sectorETF]:[])])];
  const relative=benchmarkSymbols.map(benchmark=>{
   const other=index.get(benchmark),otherState=stateFor(benchmark);
   const synchronized=state.freshness==='fresh'&&otherState.freshness==='fresh'&&Math.abs(state.milliseconds-otherState.milliseconds)<=60000;
   const benchmarkGap=synchronized?percent(other.open,other.previousClose):null,benchmarkMove=synchronized?percent(other.price,other.open):null;
   return {benchmark,status:synchronized?'synchronized':'unavailable',providerAt:otherState.providerAt,
    gapPp:synchronized&&gapPct!==null&&benchmarkGap!==null?gapPct-benchmarkGap:null,
    openToNowPp:synchronized&&openToNowPct!==null&&benchmarkMove!==null?openToNowPct-benchmarkMove:null};
  });
  if(relative.some(row=>row.status!=='synchronized'))limitations.push('Relative comparisons require fresh benchmark observations within 60 seconds of the stock.');
  const stops=(Array.isArray(target.stops)?target.stops:[]).filter(stop=>positive(stop.price)).map(stop=>{
   const available=state.freshness==='fresh'&&basisStatus==='matched';
   const distancePct=available?(price-stop.price)/price*100:null;
   return {sleeve:typeof stop.sleeve==='string'?stop.sleeve:null,price:stop.price,shares:positive(stop.shares)?stop.shares:null,distancePct,
    status:!available?'unavailable':distancePct<=0?'at-or-below':distancePct<=3?'within-warning-band':'above'};
  });
  if(target.role==='Swing holding'&&!stops.length)limitations.push('No actual recorded stop level is available; no stop is inferred from cost.');
  const spy=relative.find(row=>row.benchmark==='SPY'),bullish=['Momentum Accelerating','Momentum Intact'].includes(target.dailyEvidenceLabel)||
   Number.isSafeInteger(target.researchRank)&&target.researchRank>0&&target.researchRank<=3;
  let label='Intraday context',observation='Current-session observations are descriptive and do not change C1 decisions.';
  if(state.freshness!=='fresh'){label=state.freshness==='delayed'?'Delayed observation':state.freshness==='stale'?'Stale observation':'Observation unavailable';observation=state.reason;}
  else if(baselineStatus!=='current'){label='Daily baseline stale';observation='Fresh quotes are available; the authoritative daily comparison needs a current accepted baseline.';}
  else if(stops.some(stop=>stop.status==='at-or-below')){label='Recorded stop proximity';observation='Fresh price is at or below a recorded stop. Verify the broker observation and recorded stop status.';}
  else if(stops.some(stop=>stop.status==='within-warning-band')){label='Recorded stop proximity';observation='Fresh price is within the descriptive 3% band above a recorded stop.';}
  else if(basisStatus==='matched'&&bullish&&openToNowPct!==null&&openToNowPct<=-1&&spy?.openToNowPp!==null&&spy?.openToNowPp<0){
   label='Historical momentum / current weakness';observation='Strong completed-session momentum coexists with a decline of at least 1% from the open and underperformance versus synchronized SPY.';
  }else if(openToNowPct!==null&&openToNowPct<=-1&&spy?.openToNowPp!==null&&spy?.openToNowPp<0){label='Weakening intraday price';observation='Price is down at least 1% from the open and underperforming synchronized SPY.';}
  else if(openToNowPct!==null&&openToNowPct>=1&&spy?.openToNowPp!==null&&spy?.openToNowPp>0){label='Strengthening intraday price';observation='Price is up at least 1% from the open and outperforming synchronized SPY.';}
  const high=usable&&positive(quote.dayHigh)?quote.dayHigh:null,low=usable&&positive(quote.dayLow)?quote.dayLow:null;
  const rangePositionPct=high!==null&&low!==null&&high>low&&price>=low&&price<=high?(price-low)/(high-low)*100:null;
  return {symbol,role:target.role,providerAt:state.providerAt,freshness:state.freshness,freshnessReason:state.reason,price,
   sourceSessionDate:target.sourceSessionDate,researchRank:target.researchRank??null,dailyEvidenceLabel:target.dailyEvidenceLabel??null,
   sectorETF:target.sectorETF??null,basisStatus,gapPct,openToNowPct,dayChangePct,rangePositionPct,relative,stops,label,observation,limitations};
 });
 return {contract:'c1-intraday-advisory-v1',advisoryOnly:true,sourceSessionDate:validSession(sourceSessionDate)?sourceSessionDate:null,
  baselineStatus,receivedAt:receivedMs!==null?new Date(receivedMs).toISOString():null,cacheStatus,
  market:{phase:market.phase,isOpen:market.isOpen,sessionDate:market.clock?.key||null},rows,
  limitations:['Manual quote snapshots provide no path, volume, VWAP or execution confirmation.',
   'The 1% movement and 3% stop-proximity bands are descriptive heuristics; predictive value has not been validated.',
   ...(baselineStatus!=='current'?['Authoritative completed-session baseline is stale or unavailable.']:[])]};
}

import {fetchFmpResponse,readFmpJsonResponse,fmpApiKey} from './fmpTransport';
import {fetchEventRiskMap} from './eventRisk';
import {verifyC1Quote} from './c1QuoteVerification';
import {readC1CurrentEventEvidence} from './c1CurrentEventEvidence';
import {toFmpSymbol,fromFmpSymbol} from './fmpSymbols';
import {buildC1OperationalReadiness} from './c1OperationalReadiness';
import {publishC1Readiness} from './c1ReadinessStore';
import {C1_FROZEN_OPTIONS} from './c1FrozenOptions';

// Cover the union of every sleeve's possible holdings and entry queue plus
// both benchmarks; do not silently truncate or invent a smaller policy limit.
const maximumSymbols=2+Object.values(C1_FROZEN_OPTIONS).reduce((sum,options)=>sum+options.maxPositions+options.rankedEntryQueueCount,0);

// A bounded market-service probe, not a screen/account request. No historical
// compilation, performance observation, portfolio mutation or trade is invoked.
export async function probeC1Readiness({index,now=()=>new Date(),deadlineMs=Date.now()+25000,
 fetcher=fetch,apiKey=fmpApiKey(),events=fetchEventRiskMap,commit=process.env.VERCEL_GIT_COMMIT_SHA||'local',indexFailed=false}={}){
 const symbols=[...new Set([...(index?.decisionSnapshot?.symbols||[]).map(r=>r.symbol),'SPY','QQQ'])];
 const sourceSessionDate=index?.sourceSessionDate;
 if(!sourceSessionDate||index?.decisionSnapshot?.contract!=='c1-shared-model-decision-v1'||
  index.decisionSnapshot.status!=='diagnostic-only'||index.decisionSnapshot.requiredSessionDate!==sourceSessionDate||
  index.decisionSnapshot.sourceSessionDate!==sourceSessionDate||!Array.isArray(index.decisionSnapshot.symbols)||
  !symbols.length||symbols.length>maximumSymbols||symbols.some(s=>typeof s!=='string'||!/^[A-Z][A-Z0-9.-]{0,15}$/.test(s)))
  return buildC1OperationalReadiness({sourceSessionDate,observedAt:now(),commit,indexFailed,scopeInvalid:true});
 let rows=[],eventMap=new Map(),failed=!apiKey,timer;
 try{
  if(!apiKey||Date.now()>=deadlineMs)throw new Error('Probe unavailable');
  const query=new URLSearchParams({symbols:symbols.map(toFmpSymbol).join(','),apikey:apiKey});
  const quoted=(async()=>{const r=await fetchFmpResponse('https://financialmodelingprep.com/stable/batch-quote?'+query,
   {cache:'no-store',signal:AbortSignal.timeout(Math.max(1,Math.min(8000,deadlineMs-Date.now())))},{fetcher});
   if(!r.ok)throw new Error('Probe unavailable');const body=await readFmpJsonResponse(r);if(!Array.isArray(body))throw new Error('Probe unavailable');
   const at=now().toISOString(),seen=new Set();return body.map(row=>{
    const symbol=fromFmpSymbol(row.symbol);
    const timestamp=Number(row.timestamp),quoteMs=timestamp>1e12?timestamp:timestamp*1000;
    if(!symbols.includes(symbol)||seen.has(symbol)||!Number.isFinite(Number(row.price))||Number(row.price)<=0||
     !Number.isFinite(quoteMs)||quoteMs<=0||quoteMs>Date.parse(at))throw new Error('Probe unavailable');seen.add(symbol);
    return {...row,symbol,_fmpQuoteProvider:'FMP',_fmpQuoteEndpoint:'quote',_fmpQuoteCache:'live',_fmpQuoteFetchedAt:at,
     _fmpQuoteObservation:{provider:'FMP',endpoint:'stable/quote',symbol,price:Number(row.price),timestamp:Number(row.timestamp),fetchedAt:at}};
   });})();
  const result=await Promise.race([Promise.allSettled([quoted,events(symbols,{apiKey,fetcher,deadlineMs})]),
   new Promise(resolve=>{timer=setTimeout(()=>resolve(null),Math.max(1,Math.min(25000,deadlineMs-Date.now())));})]);
  if(!result)throw new Error('Probe unavailable');
  if(result[0].status==='fulfilled')rows=result[0].value;else failed=true;
  if(result[1].status==='fulfilled')eventMap=result[1].value;else failed=true;
 }catch{failed=true;}finally{if(timer)clearTimeout(timer);}
 if(!eventMap||typeof eventMap.get!=='function'){eventMap=new Map();failed=true;}
 const completed=now(),verified=symbols.filter(symbol=>['VERIFIED_CLEAR','VERIFIED_BLOCKED'].includes(readC1CurrentEventEvidence(eventMap.get(symbol),completed)));
 return buildC1OperationalReadiness({sourceSessionDate,observedAt:completed,commit,indexFailed,probeFailed:failed,
  expectedCount:symbols.length,quoteCount:rows.length,regularQuoteCount:rows.filter(row=>verifyC1Quote(row,completed).verifiedRegularSession).length,
  eventCount:verified.length,eventBlockedCount:verified.filter(symbol=>eventMap.get(symbol).eventVerification.state==='VERIFIED_BLOCKED').length});
}
export async function observeC1ScheduledReadiness(options={},{probe=probeC1Readiness,publish=publishC1Readiness,emit=(...args)=>console.info(...args)}={}){
 const deadline=Number.isFinite(options.deadlineMs)?options.deadlineMs:Date.now()+30000;
 let timer,closed=false;
 const log=value=>{try{emit('C1_READINESS_OPERATIONAL',JSON.stringify(value));}catch{}};
 const work=(async()=>{try{
  const receipt=await probe(options);
  if(closed||Date.now()>=deadline)return null;
  await publish(receipt);
  if(closed)return null;
  log(receipt);return receipt;
 }catch{if(!closed)log({code:'READINESS_OBSERVATION_UNAVAILABLE',executable:false});return null;}})();
 try{return await Promise.race([work,new Promise(resolve=>{timer=setTimeout(()=>{
  closed=true;log({code:'READINESS_OBSERVATION_TIMED_OUT',executable:false});resolve(null);
 },Math.max(1,deadline-Date.now()));})]);}
 finally{closed=true;if(timer)clearTimeout(timer);}
}

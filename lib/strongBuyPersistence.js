import { list, get } from '@vercel/blob';
import { top5Phase, top5Count, assertTop5Active, isTop5Deadline } from './top5Diagnostics';

const STORE='screener-performance-ledger.json';
const MEMORY_KEY='__screenerStrongBuyMemoryV1';
const WINDOW_MS=6.5*60*60*1000;
const BUY_VISIBILITY_WINDOW_MS=36*60*60*1000;

async function readRecordsDiagnosticTask(){
  assertTop5Active();
  try{
    const{blobs}=await list({prefix:STORE,limit:10});
    assertTop5Active();
    const blob=blobs.find(b=>b.pathname===STORE);
    if(!blob)return[];
    const result=await get(blob.url,{access:'private',useCache:false});
    assertTop5Active();
    if(!result)return[];
    const text=await new Response(result.stream).text();
    const parsed=JSON.parse(text);
    assertTop5Active();
    return Array.isArray(parsed?.records)?parsed.records:[];
  }catch(e){
    if(isTop5Deadline(e))throw e;
    assertTop5Active();
    console.warn('strong-buy persistence read:',e.message);
    return[];
  }
}

async function seedDurableStrongBuyMemoryDiagnosticTask(now=Date.now()){
  assertTop5Active();
  const existing=globalThis[MEMORY_KEY] instanceof Map?globalThis[MEMORY_KEY]:new Map();
  const records=await readRecords();top5Count('continuity.records',records.length);
  assertTop5Active();
  const durable=new Map();let seeded=0;
  for(const r of records){
    const symbol=String(r?.symbol||'').toUpperCase().trim();
    const observedAt=new Date(r?.timestamp||r?.day||0).getTime();
    if(!symbol||!Number.isFinite(observedAt)||observedAt<=0||observedAt>now+60000)continue;
    if(r?.recordType==='state'&&r?.signalState===true){
      if(['Strong Buy','Buy'].includes(r.action))durable.set(symbol,{action:r.action,earnedAt:observedAt,interruptedAt:0});
      else if(['Watch','Avoid'].includes(r.action)){const prior=durable.get(symbol);if(prior?.earnedAt&&observedAt>=prior.earnedAt)durable.set(symbol,{...prior,interruptedAt:observedAt});}
      continue;
    }
    if(['Strong Buy','Buy'].includes(r?.action))durable.set(symbol,{action:r.action,earnedAt:observedAt,interruptedAt:0});
  }
  for(const[symbol,candidate]of durable){
    const windowMs=candidate.action==='Strong Buy'?WINDOW_MS:BUY_VISIBILITY_WINDOW_MS;
    if(now-candidate.earnedAt>windowMs)continue;
    const prior=existing.get(symbol),candidateTime=Math.max(candidate.earnedAt,candidate.interruptedAt||0),priorTime=Math.max(prior?.earnedAt||0,prior?.interruptedAt||0);
    if(candidateTime>=priorTime){assertTop5Active();existing.set(symbol,candidate);seeded++;}
  }
  assertTop5Active();
  globalThis[MEMORY_KEY]=existing;
  return{seeded,persistentStorage:true};
}

function readRecords(...args){return top5Phase('continuity.durable-read',()=>readRecordsDiagnosticTask(...args),{});}

export function seedDurableStrongBuyMemory(...args){return top5Phase('continuity.seed',()=>seedDurableStrongBuyMemoryDiagnosticTask(...args),{});}

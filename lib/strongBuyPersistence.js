import { list, get } from '@vercel/blob';

const STORE='screener-performance-ledger.json';
const MEMORY_KEY='__screenerStrongBuyMemoryV1';
const WINDOW_MS=6.5*60*60*1000;
const BUY_VISIBILITY_WINDOW_MS=36*60*60*1000;

const hasToken=()=>Boolean(process.env.BLOB_READ_WRITE_TOKEN);

async function readRecords(){
  if(!hasToken())return[];
  try{
    const{blobs}=await list({prefix:STORE,limit:1});
    const blob=blobs.find(b=>b.pathname===STORE)||blobs[0];
    if(!blob)return[];
    const result=await get(blob.url);
    if(!result)return[];
    const text=await new Response(result.stream).text();
    const parsed=JSON.parse(text);
    return Array.isArray(parsed?.records)?parsed.records:[];
  }catch(e){
    console.warn('strong-buy persistence read:',e.message);
    return[];
  }
}

export async function seedDurableStrongBuyMemory(now=Date.now()){
  const existing=globalThis[MEMORY_KEY] instanceof Map?globalThis[MEMORY_KEY]:new Map();
  const records=await readRecords();
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
    if(candidateTime>=priorTime){existing.set(symbol,candidate);seeded++;}
  }
  globalThis[MEMORY_KEY]=existing;
  return{seeded,persistentStorage:hasToken()};
}

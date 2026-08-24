import { list, get } from '@vercel/blob';

const STORE='screener-performance-ledger.json';
const MEMORY_KEY='__screenerStrongBuyMemoryV1';
const WINDOW_MS=6.5*60*60*1000;

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
  let seeded=0;
  for(const r of records){
    if(r?.action!=='Strong Buy')continue;
    const symbol=String(r?.symbol||'').toUpperCase().trim();
    const earnedAt=new Date(r?.timestamp||r?.day||0).getTime();
    if(!symbol||!Number.isFinite(earnedAt)||earnedAt<=0||now-earnedAt>WINDOW_MS||earnedAt>now+60000)continue;
    const prior=existing.get(symbol);
    if(!prior?.earnedAt||earnedAt>prior.earnedAt){existing.set(symbol,{action:'Strong Buy',earnedAt});seeded++;}
  }
  globalThis[MEMORY_KEY]=existing;
  return{seeded,persistentStorage:hasToken()};
}

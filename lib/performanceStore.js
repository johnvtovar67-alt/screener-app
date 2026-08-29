import { put, list, get } from '@vercel/blob';
import {
  applyPerformanceObservation,
  mergeLedgerRecords,
  normalizeLedgerRecords,
} from './performanceLedger';

const STORE='screener-performance-ledger.json';
const LOCK_KEY='__screenerPerformanceLedgerLockV4';

export async function readPerformanceLedger(){
  try{
    const{blobs}=await list({prefix:STORE,limit:1}),blob=blobs.find(b=>b.pathname===STORE)||blobs[0];
    if(!blob)return{records:[]};
    const result=await get(blob.url,{access:'private',useCache:false});
    if(!result)return{records:[]};
    const text=await new Response(result.stream).text(),parsed=JSON.parse(text);
    return{records:Array.isArray(parsed?.records)?parsed.records:[]};
  }catch(e){return{records:[],warning:`ledger read failed: ${e.message}`};}
}

async function writePerformanceLedger(records){
  try{
    const blob=await put(STORE,JSON.stringify({version:4,updatedAt:new Date().toISOString(),records}),{access:'private',allowOverwrite:true,addRandomSuffix:false,contentType:'application/json',cacheControlMaxAge:0});
    return{ok:true,url:blob.url};
  }catch(e){return{ok:false,warning:`ledger write failed: ${e.message}`};}
}

async function withLedgerLock(task){
  const prior=globalThis[LOCK_KEY]||Promise.resolve();
  let release;const gate=new Promise(resolve=>{release=resolve;});
  globalThis[LOCK_KEY]=prior.catch(()=>{}).then(()=>gate);
  await prior.catch(()=>{});
  try{return await task();}finally{release();}
}

const stableJson=value=>JSON.stringify(value);

export async function updatePerformanceLedger(rows,now){
  return withLedgerLock(async()=>{
    const first=await readPerformanceLedger();
    // Never replace the durable ledger with a partial snapshot after a read
    // failure. A later screen can retry without losing historical evidence.
    if(first.warning)return{ok:false,status:503,records:[],warning:first.warning};
    let records=applyPerformanceObservation(first.records,rows,now);
    // A second read narrows the serverless read/modify/write race across warm
    // instances and devices. Merge by stable record id before overwriting.
    const latest=await readPerformanceLedger();
    if(latest.warning)return{ok:false,status:503,records:first.records,warning:latest.warning};
    records=applyPerformanceObservation(mergeLedgerRecords(latest.records,records),rows,now).slice(-10000);
    let write=await writePerformanceLedger(records);
    if(!write.ok)return{ok:false,status:503,records,warning:write.warning};
    // Bounded post-write reconciliation: if a competing writer landed between
    // our read and write, merge it once rather than silently dropping its rows.
    const verify=await readPerformanceLedger();
    if(!verify.warning){
      const reconciled=applyPerformanceObservation(mergeLedgerRecords(records,verify.records),rows,now).slice(-10000);
      if(stableJson(reconciled)!==stableJson(normalizeLedgerRecords(verify.records,now).slice(-10000))){write=await writePerformanceLedger(reconciled);records=reconciled;}
    }
    return{ok:write.ok,status:write.ok?200:503,records,warning:write.warning||verify.warning||null};
  });
}

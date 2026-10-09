import { put, list, get } from '@vercel/blob';
import { top5Phase, top5Count } from './top5Diagnostics';
import {
  applyPerformanceObservation,
  mergeLedgerRecords,
  normalizeLedgerRecords,
} from './performanceLedger';

const STORE='screener-performance-ledger.json';
const LOCK_KEY='__screenerPerformanceLedgerLockV4';

async function readPerformanceLedgerDiagnosticTask(){
  try{
    const{blobs}=await list({prefix:STORE,limit:10}),blob=blobs.find(b=>b.pathname===STORE);
    if(!blob)return{records:[]};
    const result=await get(blob.url,{access:'private',useCache:false});
    if(!result)return{records:[]};
    const text=await new Response(result.stream).text(),parsed=JSON.parse(text);
    return{records:Array.isArray(parsed?.records)?parsed.records:[]};
  }catch(e){return{records:[],warning:`ledger read failed: ${e.message}`};}
}

async function writePerformanceLedgerDiagnosticTask(records){
  try{
    const blob=await put(STORE,JSON.stringify({version:4,updatedAt:new Date().toISOString(),records}),{access:'private',allowOverwrite:true,addRandomSuffix:false,contentType:'application/json',cacheControlMaxAge:0});
    return{ok:true,url:blob.url};
  }catch(e){return{ok:false,warning:`ledger write failed: ${e.message}`};}
}

async function withLedgerLock(task){
  const prior=globalThis[LOCK_KEY]||Promise.resolve();
  let release;const gate=new Promise(resolve=>{release=resolve;});
  globalThis[LOCK_KEY]=prior.catch(()=>{}).then(()=>gate);
  await top5Phase('performance.lock-wait',()=>prior.catch(()=>{}));
  try{return await task();}finally{release();}
}

const stableJson=value=>JSON.stringify(value);

async function updatePerformanceLedgerDiagnosticTask(rows,now){
  return withLedgerLock(async()=>{
    const first=await top5Phase('performance.first-read',()=>readPerformanceLedger());top5Count('performance.prior-records',first.records.length);
    // Never replace the durable ledger with a partial snapshot after a read
    // failure. A later screen can retry without losing historical evidence.
    if(first.warning)return{ok:false,status:503,records:[],warning:first.warning};
    let records=applyPerformanceObservation(first.records,rows,now);
    // A second read narrows the serverless read/modify/write race across warm
    // instances and devices. Merge by stable record id before overwriting.
    const latest=await top5Phase('performance.latest-read',()=>readPerformanceLedger());
    if(latest.warning)return{ok:false,status:503,records:first.records,warning:latest.warning};
    records=applyPerformanceObservation(mergeLedgerRecords(latest.records,records),rows,now).slice(-10000);
    let write=await writePerformanceLedger(records);
    if(!write.ok)return{ok:false,status:503,records,warning:write.warning};
    // Bounded post-write reconciliation: if a competing writer landed between
    // our read and write, merge it once rather than silently dropping its rows.
    const verify=await top5Phase('performance.verify-read',()=>readPerformanceLedger());
    if(!verify.warning){
      const reconciled=applyPerformanceObservation(mergeLedgerRecords(records,verify.records),rows,now).slice(-10000);
      if(stableJson(reconciled)!==stableJson(normalizeLedgerRecords(verify.records,now).slice(-10000))){write=await writePerformanceLedger(reconciled);records=reconciled;}
    }
    return{ok:write.ok,status:write.ok?200:503,records,warning:write.warning||verify.warning||null};
  });
}

export function readPerformanceLedger(...args){return top5Phase('performance.durable-read',()=>readPerformanceLedgerDiagnosticTask(...args),{});}

function writePerformanceLedger(...args){return top5Phase('performance.write',()=>writePerformanceLedgerDiagnosticTask(...args),{count:args[0]?.length||0});}

export function updatePerformanceLedger(...args){return top5Phase('performance.update',()=>updatePerformanceLedgerDiagnosticTask(...args),{count:args[0]?.length||0});}

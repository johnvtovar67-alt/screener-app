import { put, list, get } from '@vercel/blob';
import { top5Phase, top5Count, assertTop5Active, isTop5Deadline } from './top5Diagnostics';
import {
  applyPerformanceObservation,
  mergeLedgerRecords,
  normalizeLedgerRecords,
} from './performanceLedger';

const STORE='screener-performance-ledger.json';
const LOCK_KEY='__screenerPerformanceLedgerLockV4';

async function readPerformanceLedgerDiagnosticTask(){
  assertTop5Active();
  try{
    const{blobs}=await list({prefix:STORE,limit:10});assertTop5Active();const blob=blobs.find(b=>b.pathname===STORE);
    if(!blob)return{records:[]};
    const result=await get(blob.url,{access:'private',useCache:false});
    assertTop5Active();
    if(!result)return{records:[]};
    const text=await new Response(result.stream).text(),parsed=JSON.parse(text);
    assertTop5Active();
    return{records:Array.isArray(parsed?.records)?parsed.records:[]};
  }catch(e){if(isTop5Deadline(e))throw e;assertTop5Active();return{records:[],warning:`ledger read failed: ${e.message}`};}
}

async function writePerformanceLedgerDiagnosticTask(records){
  assertTop5Active();
  try{
    const body=JSON.stringify({version:4,updatedAt:new Date().toISOString(),records});assertTop5Active();
    const blob=await put(STORE,body,{access:'private',allowOverwrite:true,addRandomSuffix:false,contentType:'application/json',cacheControlMaxAge:0});
    assertTop5Active();
    return{ok:true,url:blob.url};
  }catch(e){if(isTop5Deadline(e))throw e;assertTop5Active();return{ok:false,warning:`ledger write failed: ${e.message}`};}
}

async function withLedgerLock(task){
  assertTop5Active();
  const prior=globalThis[LOCK_KEY]||Promise.resolve();
  let release;const gate=new Promise(resolve=>{release=resolve;});
  globalThis[LOCK_KEY]=prior.catch(()=>{}).then(()=>gate);
  try{
    // The response deadline never releases a holder whose durable operation
    // is still pending. Later updates remain chained to its actual settlement.
    await top5Phase('performance.lock-wait',()=>prior.catch(()=>{}));
    assertTop5Active();
    return await task();
  }finally{release();}
}

const stableJson=value=>JSON.stringify(value);

async function updatePerformanceLedgerDiagnosticTask(rows,now){
  assertTop5Active();
  return withLedgerLock(async()=>{
    const first=await top5Phase('performance.first-read',()=>readPerformanceLedger());top5Count('performance.prior-records',first.records.length);
    assertTop5Active();
    // Never replace the durable ledger with a partial snapshot after a read
    // failure. A later screen can retry without losing historical evidence.
    if(first.warning)return{ok:false,status:503,records:[],warning:first.warning};
    let records=top5Phase("performance.apply-first",()=>applyPerformanceObservation(first.records,rows,now));
    assertTop5Active();
    // A second read narrows the serverless read/modify/write race across warm
    // instances and devices. Merge by stable record id before overwriting.
    const latest=await top5Phase('performance.latest-read',()=>readPerformanceLedger());
    assertTop5Active();
    if(latest.warning)return{ok:false,status:503,records:first.records,warning:latest.warning};
    records=top5Phase("performance.merge-apply",()=>applyPerformanceObservation(mergeLedgerRecords(latest.records,records),rows,now).slice(-10000));
    assertTop5Active();
    let write=await writePerformanceLedger(records);
    assertTop5Active();
    if(!write.ok)return{ok:false,status:503,records,warning:write.warning};
    // Bounded post-write reconciliation: if a competing writer landed between
    // our read and write, merge it once rather than silently dropping its rows.
    const verify=await top5Phase('performance.verify-read',()=>readPerformanceLedger());
    assertTop5Active();
    if(!verify.warning){
      const reconciled=top5Phase("performance.reconcile",()=>applyPerformanceObservation(mergeLedgerRecords(records,verify.records),rows,now).slice(-10000));
      assertTop5Active();
      if(stableJson(reconciled)!==stableJson(normalizeLedgerRecords(verify.records,now).slice(-10000))){write=await writePerformanceLedger(reconciled);records=reconciled;}
    }
    assertTop5Active();
    return{ok:write.ok,status:write.ok?200:503,records,warning:write.warning||verify.warning||null};
  });
}

export function readPerformanceLedger(...args){return top5Phase('performance.durable-read',()=>readPerformanceLedgerDiagnosticTask(...args),{});}

function writePerformanceLedger(...args){return top5Phase('performance.write',()=>writePerformanceLedgerDiagnosticTask(...args),{count:args[0]?.length||0});}

export function updatePerformanceLedger(...args){return top5Phase('performance.update',()=>updatePerformanceLedgerDiagnosticTask(...args),{count:args[0]?.length||0});}

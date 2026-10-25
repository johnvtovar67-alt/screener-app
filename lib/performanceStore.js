import { put, list, get, BlobPreconditionFailedError } from '@vercel/blob';
import { top5Phase, top5Count, assertTop5Active, isTop5Deadline } from './top5Diagnostics';
import {
  applyPerformanceObservation,
  mergeLedgerRecords,
  normalizeLedgerRecords,
} from './performanceLedger';

const STORE='screener-performance-ledger.json';
const LOCK_KEY='__screenerPerformanceLedgerLockV4';
// Bind each read body to its origin version without exposing storage metadata.
const ledgerVersions=new WeakMap();

async function readPerformanceLedgerDiagnosticTask(){
  assertTop5Active();
  try{
    const{blobs}=await list({prefix:STORE,limit:10});assertTop5Active();const blob=blobs.find(b=>b.pathname===STORE);
    if(!blob){const view={records:[]};ledgerVersions.set(view,{exists:false});return view;}
    const result=await get(blob.url,{access:'private',useCache:false,headers:{'accept-encoding':'identity'}});
    assertTop5Active();
    if(result?.statusCode!==200||typeof result.blob?.etag!=='string'||!result.blob.etag||result.blob.etag.startsWith('W/'))throw new Error('Complete versioned ledger read required');
    const text=await new Response(result.stream).text(),parsed=JSON.parse(text);
    assertTop5Active();
    if(!Array.isArray(parsed?.records))throw new Error('Valid ledger records required');
    const view={records:parsed.records};ledgerVersions.set(view,{exists:true,etag:result.blob.etag});return view;
  }catch(e){if(isTop5Deadline(e))throw e;assertTop5Active();return{records:[],warning:`ledger read failed: ${e.message}`};}
}

async function writePerformanceLedgerDiagnosticTask(records,basis){
  assertTop5Active();
  try{
    const version=ledgerVersions.get(basis);
    if(!version)throw new Error('Verified ledger write basis required');
    const body=JSON.stringify({version:4,updatedAt:new Date().toISOString(),records});assertTop5Active();
    const blob=await put(STORE,body,{access:'private',allowOverwrite:version.exists,...(version.exists?{ifMatch:version.etag}:{}),addRandomSuffix:false,contentType:'application/json',cacheControlMaxAge:0});
    assertTop5Active();
    return{ok:true,url:blob.url};
  }catch(e){if(isTop5Deadline(e))throw e;assertTop5Active();return{ok:false,warning:e instanceof BlobPreconditionFailedError?'ledger changed during refresh; retry on a new verified refresh.':`ledger write failed: ${e.message}`};}
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
    // Merge by stable record id, then condition the write on this exact read.
    const latest=await top5Phase('performance.latest-read',()=>readPerformanceLedger());
    assertTop5Active();
    if(latest.warning)return{ok:false,status:503,records:first.records,warning:latest.warning};
    records=top5Phase("performance.merge-apply",()=>applyPerformanceObservation(mergeLedgerRecords(latest.records,records),rows,now).slice(-10000));
    assertTop5Active();
    let write=await writePerformanceLedger(records,latest);
    assertTop5Active();
    if(!write.ok)return{ok:false,status:503,records,warning:write.warning};
    // Bounded post-write reconciliation: if a competing writer landed between
    // our read and write, merge it once rather than silently dropping its rows.
    const verify=await top5Phase('performance.verify-read',()=>readPerformanceLedger());
    assertTop5Active();
    if(!verify.warning){
      const reconciled=top5Phase("performance.reconcile",()=>applyPerformanceObservation(mergeLedgerRecords(records,verify.records),rows,now).slice(-10000));
      assertTop5Active();
      if(stableJson(reconciled)!==stableJson(normalizeLedgerRecords(verify.records,now).slice(-10000))){write=await writePerformanceLedger(reconciled,verify);records=reconciled;}
    }
    assertTop5Active();
    return{ok:write.ok,status:write.ok?200:503,records,warning:write.warning||verify.warning||null};
  });
}

export function readPerformanceLedger(...args){return top5Phase('performance.durable-read',()=>readPerformanceLedgerDiagnosticTask(...args),{});}

function writePerformanceLedger(...args){return top5Phase('performance.write',()=>writePerformanceLedgerDiagnosticTask(...args),{count:args[0]?.length||0});}

export function updatePerformanceLedger(...args){return top5Phase('performance.update',()=>updatePerformanceLedgerDiagnosticTask(...args),{count:args[0]?.length||0});}

import { put, list, get } from '@vercel/blob';
import {applyPerformanceObservation,mergeLedgerRecords,normalizeLedgerRecords,summarizePerformance} from '../../lib/performanceLedger';

export const config={api:{bodyParser:{sizeLimit:'8mb'}}};
const STORE='screener-performance-ledger.json';
const LOCK_KEY='__screenerPerformanceLedgerLockV4';

async function readLedger(){
  try{
    const{blobs}=await list({prefix:STORE,limit:1}),blob=blobs.find(b=>b.pathname===STORE)||blobs[0];
    if(!blob)return{records:[]};
    const result=await get(blob.url,{access:'private',useCache:false});
    if(!result)return{records:[]};
    const text=await new Response(result.stream).text(),parsed=JSON.parse(text);
    return{records:Array.isArray(parsed?.records)?parsed.records:[]};
  }catch(e){return{records:[],warning:`ledger read failed: ${e.message}`};}
}
async function writeLedger(records){
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
async function updateLedger(rows,now){
  return withLedgerLock(async()=>{
    const first=await readLedger();
    // Never replace the durable ledger with a partial snapshot after a read
    // failure. A later screen can retry without losing historical evidence.
    if(first.warning)return{ok:false,status:503,records:[],warning:first.warning};
    let records=applyPerformanceObservation(first.records,rows,now);
    // A second read narrows the serverless read/modify/write race across warm
    // instances and devices. Merge by stable record id before overwriting.
    const latest=await readLedger();
    if(latest.warning)return{ok:false,status:503,records:first.records,warning:latest.warning};
    records=applyPerformanceObservation(mergeLedgerRecords(latest.records,records),rows,now).slice(-10000);
    let write=await writeLedger(records);
    if(!write.ok)return{ok:false,status:503,records,warning:write.warning};
    // Bounded post-write reconciliation: if a competing writer landed between
    // our read and write, merge it once rather than silently dropping its rows.
    const verify=await readLedger();
    if(!verify.warning){
      const reconciled=applyPerformanceObservation(mergeLedgerRecords(records,verify.records),rows,now).slice(-10000);
      if(stableJson(reconciled)!==stableJson(normalizeLedgerRecords(verify.records,now).slice(-10000))){write=await writeLedger(reconciled);records=reconciled;}
    }
    return{ok:write.ok,status:write.ok?200:503,records,warning:write.warning||verify.warning||null};
  });
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  if(req.method==='GET'){
    const ledger=await readLedger(),records=normalizeLedgerRecords(ledger.records,new Date());
    return res.status(200).json({records:records.slice(-1000),summary:summarizePerformance(records),warning:ledger.warning||null,persistentStorage:!ledger.warning,sessionBasis:'U.S. market sessions'});
  }
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const rows=Array.isArray(req.body?.stocks)?req.body.stocks:[],now=req.body?.timestamp||new Date().toISOString(),result=await updateLedger(rows,now);
  if(!result.ok)console.warn('performance ledger persistence:',result.warning);
  return res.status(result.status).json({persisted:result.ok,records:result.records.length,summary:summarizePerformance(result.records),warning:result.warning||null,persistentStorage:result.ok,sessionBasis:'U.S. market sessions'});
}

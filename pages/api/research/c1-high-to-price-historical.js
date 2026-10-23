import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {get,list} from '@vercel/blob';
import {runC1HighToPriceComparisonMemoryBound} from '../../../lib/c1HighToPriceChallenger';

export const config={maxDuration:800};

const MANIFEST='research/pit-sp500-compiled-checkpoint-v1.json';
const START_DATE='2023-01-04';
const END_DATE='2026-09-01';

async function exactBlob(pathname){
 const {blobs}=await list({prefix:pathname,limit:10});
 const blob=blobs.find(item=>item.pathname===pathname);
 if(!blob)throw new Error('Required accepted research artifact is unavailable');
 const response=await get(blob.url,{access:'private',useCache:false});
 if(!response)throw new Error('Required accepted research artifact cannot be read');
 return response;
}

async function json(pathname){
 const response=await exactBlob(pathname);
 return JSON.parse(await new Response(response.stream).text());
}

async function gzipJson(pathname,compressedBytes){
 const response=await exactBlob(pathname);
 const compressed=Buffer.from(await new Response(response.stream).arrayBuffer());
 if(compressed.length!==compressedBytes)throw new Error('Accepted point-in-time chunk byte count is invalid');
 return JSON.parse(gunzipSync(compressed).toString('utf8'));
}

async function acceptedDataset(onProgress=()=>{}){
 const manifest=await json(MANIFEST);
 if(manifest?.complete!==true||!Array.isArray(manifest.sessionDates)||!Array.isArray(manifest.chunks)||!manifest.chunks.length)
  throw new Error('Accepted point-in-time dataset is incomplete');
 const sessions=[];
 let expectedStart=0;
 for(let index=0;index<manifest.chunks.length;index+=4){
  const batch=manifest.chunks.slice(index,index+4);
  onProgress({phase:'restore-batch-start',firstChunk:index,lastChunk:index+batch.length-1});
  for(const chunk of batch){
   if(chunk.start!==expectedStart||chunk.end<=chunk.start)throw new Error('Accepted point-in-time chunk sequence is invalid');
   expectedStart=chunk.end;
  }
  const restoredBatch=await Promise.all(batch.map(async chunk=>{
   const payload=await gzipJson(chunk.pathname,chunk.compressedBytes);
   const restored=payload?.sessions||[];
   if(restored.length!==chunk.end-chunk.start||restored[0]?.date!==chunk.firstDate||restored.at(-1)?.date!==chunk.lastDate)
    throw new Error('Accepted point-in-time chunk failed its manifest contract');
   return restored;
  }));
  for(const restored of restoredBatch)sessions.push(...restored);
  onProgress({phase:'restore-batch-end',completedChunks:index+batch.length,completedSessions:sessions.length});
 }
 if(expectedStart!==manifest.sessionDates.length||sessions.length!==manifest.sessionDates.length||
    sessions.some((session,index)=>session.date!==manifest.sessionDates[index]))
  throw new Error('Accepted point-in-time dataset restore is incomplete');
 const fingerprint=createHash('sha256').update(JSON.stringify({signature:manifest.signature,
  sessionDates:manifest.sessionDates,chunks:manifest.chunks})).digest('hex');
 return {dataset:{metadata:manifest.datasetMetadata,sessions},fingerprint,chunkCount:manifest.chunks.length};
}

function sleeveSummary(result={}){
 return Object.fromEntries(Object.entries(result.sleeves||{}).map(([sleeve,run])=>[sleeve,{
  totalReturnPct:run.metrics?.totalReturnPct??null,
  sharpe:run.metrics?.sharpe??null,
  maxDrawdownPct:run.metrics?.maxDrawdownPct??null,
  closedTrades:run.metrics?.closedTrades??null,
  winRatePct:run.metrics?.winRatePct??null,
  annualizedTurnoverPct:run.metrics?.annualizedTurnoverPct??null,
  simpleDifferenceVsSpyPct:run.metrics?.benchmarkComparisons?.SPY?.excessReturnPct??null,
  simpleDifferenceVsQqqPct:run.metrics?.benchmarkComparisons?.QQQ?.excessReturnPct??null,
 }]));
}

function summary(result={}){
 return {metrics:result.metrics,sleeves:sleeveSummary(result)};
}

export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(process.env.VERCEL_ENV==='production')return res.status(404).json({error:'Not found'});
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
 try{
  const startedAt=Date.now();
  const onProgress=event=>console.info('[c1-high-to-price-historical-progress]',JSON.stringify({...event,elapsedMs:Date.now()-startedAt}));
  onProgress({phase:'request-start'});
  const restored=await acceptedDataset(onProgress);
  onProgress({phase:'restore-complete',chunkCount:restored.chunkCount,sessionCount:restored.dataset.sessions.length});
  const comparison=runC1HighToPriceComparisonMemoryBound({dataset:restored.dataset,startDate:START_DATE,endDate:END_DATE,onProgress});
  onProgress({phase:'response-ready'});
  return res.status(200).json({contract:comparison.contract,scope:comparison.scope,executable:false,productionChanged:false,
   dataset:{fingerprint:restored.fingerprint,chunkCount:restored.chunkCount,sessionCount:restored.dataset.sessions.length,
    firstSession:restored.dataset.sessions[0]?.date,lastSession:restored.dataset.sessions.at(-1)?.date},
   evaluation:{startDate:START_DATE,endDate:END_DATE,parameterGrid:false},
   champion:summary(comparison.champion),challenger:summary(comparison.challenger),comparison:comparison.comparison,
   limitations:comparison.limitations});
 }catch(error){
  console.error('[c1-high-to-price-historical]',String(error?.message||error).slice(0,240));
  return res.status(500).json({status:'failed',executable:false,productionChanged:false,error:String(error?.message||error).slice(0,240)});
 }
}

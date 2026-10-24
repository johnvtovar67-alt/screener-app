import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {get,list} from '@vercel/blob';
import {c1ReportedThesisRetainedStartIndex,runC1ReportedThesisTournamentMemoryBound} from '../../../lib/c1ReportedThesisTournament';

export const config={maxDuration:800};

const MANIFEST='research/pit-sp500-compiled-checkpoint-v1.json';
const START_DATE='2023-01-04';
const END_DATE='2026-09-01';
const ACCEPTED_RETAINED_START_INDEX=130;
const ACCEPTED_RETAINED_FIRST_SESSION='2022-07-12';

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
 let expectedStart=0;
 for(const chunk of manifest.chunks){
  if(chunk.start!==expectedStart||chunk.end<=chunk.start)throw new Error('Accepted point-in-time chunk sequence is invalid');
  expectedStart=chunk.end;
 }
 if(expectedStart!==manifest.sessionDates.length)throw new Error('Accepted point-in-time manifest sequence is incomplete');
 const retainedStartIndex=c1ReportedThesisRetainedStartIndex(manifest.sessionDates,START_DATE);
 if(retainedStartIndex!==ACCEPTED_RETAINED_START_INDEX||manifest.sessionDates[retainedStartIndex]!==ACCEPTED_RETAINED_FIRST_SESSION)
  throw new Error('Accepted point-in-time retained window changed');
 const restoreChunks=manifest.chunks.map((chunk,index)=>({chunk,index})).filter(({chunk})=>chunk.end>retainedStartIndex);
 const sessions=[];
 onProgress({phase:'restore-plan',acceptedSessionCount:manifest.sessionDates.length,retainedSessionCount:manifest.sessionDates.length-retainedStartIndex,
  retainedStartIndex,firstRetainedSession:manifest.sessionDates[retainedStartIndex],restoreChunkCount:restoreChunks.length});
 for(let ordinal=0;ordinal<restoreChunks.length;ordinal++){
  const {chunk,index}=restoreChunks[ordinal];
  onProgress({phase:'restore-chunk-start',chunkIndex:index,restoreOrdinal:ordinal+1,totalRestoreChunks:restoreChunks.length});
  const payload=await gzipJson(chunk.pathname,chunk.compressedBytes),restored=payload?.sessions||[];
  if(restored.length!==chunk.end-chunk.start||restored[0]?.date!==chunk.firstDate||restored.at(-1)?.date!==chunk.lastDate)
   throw new Error('Accepted point-in-time chunk failed its manifest contract');
  sessions.push(...restored.slice(Math.max(0,retainedStartIndex-chunk.start)));
  onProgress({phase:'restore-chunk-end',chunkIndex:index,completedRestoreChunks:ordinal+1,totalRestoreChunks:restoreChunks.length,
   completedSessions:sessions.length});
 }
 const retainedDates=manifest.sessionDates.slice(retainedStartIndex);
 if(sessions.length!==retainedDates.length||sessions.some((session,index)=>session.date!==retainedDates[index]))
  throw new Error('Accepted point-in-time dataset restore is incomplete');
 const fingerprint=createHash('sha256').update(JSON.stringify({signature:manifest.signature,
  sessionDates:manifest.sessionDates,chunks:manifest.chunks})).digest('hex');
 return {dataset:{metadata:manifest.datasetMetadata,sessions},fingerprint,chunkCount:manifest.chunks.length,
  acceptedSessionCount:manifest.sessionDates.length,acceptedFirstSession:manifest.sessionDates[0],retainedStartIndex};
}

export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(process.env.VERCEL_ENV==='production')return res.status(404).json({error:'Not found'});
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
 try{
  const startedAt=Date.now();
  const onProgress=event=>console.info('[c1-reported-thesis-tournament-progress]',JSON.stringify({...event,elapsedMs:Date.now()-startedAt}));
  onProgress({phase:'request-start'});
  const restored=await acceptedDataset(onProgress);
  onProgress({phase:'restore-complete',chunkCount:restored.chunkCount,acceptedSessionCount:restored.acceptedSessionCount,
   retainedSessionCount:restored.dataset.sessions.length,retainedStartIndex:restored.retainedStartIndex});
  const result=runC1ReportedThesisTournamentMemoryBound({dataset:restored.dataset,startDate:START_DATE,endDate:END_DATE,onProgress});
  // Bounded aggregate logging preserves the completed result if the protected
  // preview client times out. It contains no prices, symbols, holdings or trades.
  onProgress({phase:'result-summary',champion:result.champion,challengers:result.challengers,comparisons:result.comparisons});
  onProgress({phase:'response-ready'});
  return res.status(200).json({...result,dataset:{fingerprint:restored.fingerprint,chunkCount:restored.chunkCount,
   acceptedSessionCount:restored.acceptedSessionCount,acceptedFirstSession:restored.acceptedFirstSession,
   retainedSessionCount:restored.dataset.sessions.length,retainedStartIndex:restored.retainedStartIndex,
   retainedFirstSession:restored.dataset.sessions[0]?.date,lastSession:restored.dataset.sessions.at(-1)?.date},
   evaluation:{startDate:START_DATE,endDate:END_DATE,parameterGrid:false}});
 }catch(error){
  console.error('[c1-reported-thesis-tournament]',String(error?.message||error).slice(0,240));
  return res.status(500).json({status:'failed',executable:false,productionChanged:false,error:String(error?.message||error).slice(0,240)});
 }
}

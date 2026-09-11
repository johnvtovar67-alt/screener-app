import { get, put } from '@vercel/blob';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { advanceC1ForwardModel, C1_FORWARD_CONTRACT } from './c1ForwardModel';
import { latestCompletedMarketSessionDay } from './marketSession';

// Previews must never write the production paper book.
export function c1ForwardStorePath(environment=process.env.VERCEL_ENV,commit=process.env.VERCEL_GIT_COMMIT_SHA) {
  if(environment==='production')return 'research/c1-forward-accounting-production-v1.json.gz';
  if(!/^[a-f0-9]{7,40}$/.test(commit||''))throw new Error('Preview commit identity required');
  return `research/c1-forward-accounting-preview-${commit}-v1.json.gz`;
}
const storage = {
  async read(path) {
    const response=await get(path,{access:'private',useCache:false});
    if(!response)return null;
    if(response.statusCode!==200||!response.blob?.etag)throw new Error('Forward storage identity unavailable');
    return {etag:response.blob.etag,record:JSON.parse(gunzipSync(Buffer.from(await new Response(response.stream).arrayBuffer())).toString('utf8'))};
  },
  async write(path,record,etag) {
    return put(path,gzipSync(JSON.stringify(record)),{access:'private',addRandomSuffix:false,
      allowOverwrite:Boolean(etag),...(etag?{ifMatch:etag}:{}),contentType:'application/gzip',cacheControlMaxAge:0});
  }
};

export function c1ForwardSummary(record,now=new Date()) {
  if(record?.contract!==C1_FORWARD_CONTRACT||!record.summary)return {contract:C1_FORWARD_CONTRACT,status:'unavailable',executable:false,eligibleForLiveCapital:false};
  const current=record.summary.sourceSessionDate===latestCompletedMarketSessionDay(now);
  return {...record.summary,status:current?'paper-only':'stale',executable:false,
    ...(record.recovery?{recovery:record.recovery}:{}),eligibleForLiveCapital:false,eligibleForAlphaClaim:false};
}

async function advanceAtPath(sessions,now,store,path,recovery=null) {
  // A race may be a duplicate refresh. Re-read once; never overwrite a newer book.
  for(let attempt=0;attempt<2;attempt++){
    const existing=await store.read(path);
    if(recovery && existing && JSON.stringify(existing.record.recovery)!==JSON.stringify(recovery))
      throw new Error('Diagnostic ledger lineage changed; original and diagnostic records preserved');
    const next=advanceC1ForwardModel(existing?.record||null,sessions,now,{completedCloseQueue:Boolean(recovery)});
    if(next===existing?.record)return c1ForwardSummary(next,now);
    if(recovery)next.recovery=recovery;
    try{await store.write(path,next,existing?.etag);return c1ForwardSummary(next,now);}
    catch(error){if(attempt||!['BlobPreconditionFailedError','BlobAlreadyExistsError'].includes(error?.name))throw error;}
  }
  throw new Error('Forward model update conflict');
}

export async function advanceStoredC1ForwardModel(sessions,now=new Date(),store=storage,path=c1ForwardStorePath()) {
  try { return await advanceAtPath(sessions,now,store,path); }
  catch(error) {
    if(error?.code!=='C1_BASELINE_CLOCK_CONFLICT')throw error;
    const original=await store.read(path);
    if(!original?.record)throw new Error('Original ledger unavailable for diagnostic recovery');
    // Verify the same narrow failure after re-reading. Other input errors are
    // never a license to reset a ledger or discard failed observations.
    let clockConflict=false;
    try { advanceC1ForwardModel(original.record,sessions,now); }
    catch(confirmed) { if(confirmed?.code!=='C1_BASELINE_CLOCK_CONFLICT')throw confirmed;clockConflict=true; }
    if(!clockConflict)throw new Error('Original ledger changed during recovery; retry required');
    if(original.record.createdAt!=='2026-09-10T15:59:42.924Z' || original.record.sessions?.[0]?.date!=='2026-09-09' || original.record.firstDecisionSession!=='2026-09-10')
      throw new Error('Unrecognized baseline-clock conflict; no diagnostic reset authorized');
    if(original.record.firstDecisionSession && original.record.contract!==C1_FORWARD_CONTRACT)
      throw new Error('Unsupported original ledger');
    const recovery={contract:'c1-diagnostic-recovery-v1',reason:'invalid-original-baseline-clock',
      originalRecordSha256:createHash('sha256').update(JSON.stringify(original.record)).digest('hex'),
      originalPath:path,originalPreserved:true,newValidationEvidence:false,eligibleForLiveCapital:false};
    return advanceAtPath(sessions,now,store,path.replace(/\.json\.gz$/, '')+'-diagnostic-v1.json.gz',recovery);
  }
}

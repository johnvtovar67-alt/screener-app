import { get, put } from '@vercel/blob';
import { gzipSync, gunzipSync } from 'node:zlib';
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
    eligibleForLiveCapital:false,eligibleForAlphaClaim:false};
}

export async function advanceStoredC1ForwardModel(sessions,now=new Date(),store=storage,path=c1ForwardStorePath()) {
  // A race may be a duplicate refresh. Re-read once; never overwrite a newer book.
  for(let attempt=0;attempt<2;attempt++){
    const existing=await store.read(path);
    const next=advanceC1ForwardModel(existing?.record||null,sessions,now);
    if(next===existing?.record)return c1ForwardSummary(next,now);
    try{await store.write(path,next,existing?.etag);return c1ForwardSummary(next,now);}
    catch(error){if(attempt||!['BlobPreconditionFailedError','BlobAlreadyExistsError'].includes(error?.name))throw error;}
  }
  throw new Error('Forward model update conflict');
}

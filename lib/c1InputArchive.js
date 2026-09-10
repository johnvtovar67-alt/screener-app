import { get, put } from '@vercel/blob';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { latestCompletedMarketSessionDay } from './marketSession';

const CONTRACT='c1-observed-input-v1';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function c1InputArchivePrefix(environment=process.env.VERCEL_ENV,commit=process.env.VERCEL_GIT_COMMIT_SHA) {
  if(environment==='production')return 'research/c1-input-archive-production-v1';
  if(!/^[a-f0-9]{7,40}$/.test(commit||''))throw new Error('Preview archive commit identity required');
  return `research/c1-input-archive-preview-${commit}-v1`;
}
const storage={
  async read(path){
    const response=await get(path,{access:'private',useCache:false});
    if(!response)return null;
    if(response.statusCode!==200)throw new Error('Input archive read failed');
    return JSON.parse(gunzipSync(Buffer.from(await new Response(response.stream).arrayBuffer())).toString());
  },
  async create(path,record){
    return put(path,gzipSync(JSON.stringify(record)),{access:'private',addRandomSuffix:false,
      allowOverwrite:false,contentType:'application/gzip',cacheControlMaxAge:0});
  }
};
// Capture evidence only. Never replace the forward book, certify a dataset,
// or convert a revised historical session into a prospective observation.
export async function archiveC1Input(session,metadata,source,now=new Date(),store=storage,prefix=c1InputArchivePrefix()) {
  if(session?.date!==latestCompletedMarketSessionDay(now)||!Array.isArray(session.prices)||!session.prices.length||!Array.isArray(session.signals))
    throw new Error('Only a completed current input session can be archived');
  if(!metadata||typeof metadata!=='object'||!source?.chunkPath)throw new Error('Input provenance required');
  const input=JSON.parse(JSON.stringify({session,metadata}));
  const hash=digest(input),path=`${prefix}/${session.date}/first.json.gz`;
  const capture={contract:CONTRACT,observedAt:now.toISOString(),hash,...input,source};
  const verify=record=>{
    if(record?.contract!==CONTRACT||record.session?.date!==session.date||digest({session:record.session,metadata:record.metadata})!==record.hash)
      throw new Error('Archived input integrity failure');
    return record;
  };
  async function createOrRead(target,record){
    const saved=await store.read(target);
    if(saved)return verify(saved);
    try{await store.create(target,record);return record;}
    catch(error){
      if(!['BlobAlreadyExistsError','BlobPreconditionFailedError'].includes(error?.name))throw error;
      const winner=await store.read(target);if(!winner)throw new Error('Input archive race unresolved');
      return verify(winner);
    }
  }
  const first=await createOrRead(path,capture),conflict=first.hash!==hash;
  if(conflict){
    const revision=await createOrRead(`${prefix}/${session.date}/revisions/${hash}.json.gz`,capture);
    if(revision.hash!==hash)throw new Error('Archived revision identity mismatch');
  }
  return {contract:CONTRACT,status:conflict?'revision-quarantined':'captured',sessionDate:session.date,
    firstObservedAt:first.observedAt,firstHash:first.hash,observedHash:hash,originalPreserved:true,
    sourcePointInTime:metadata.pointInTime===true&&metadata.universeMembershipPointInTime===true&&metadata.survivorshipBiasFree===true,
    executable:false,eligibleForLiveCapital:false,eligibleForAlphaClaim:false};
}

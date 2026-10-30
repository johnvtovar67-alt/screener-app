import {createHash} from 'node:crypto';
import {get,put} from '@vercel/blob';

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function c1ReadinessPrefix(environment=process.env.VERCEL_ENV,commit=process.env.VERCEL_GIT_COMMIT_SHA){
 if(environment==='production')return 'operations/c1-readiness-v1/production';
 if(!/^[a-f0-9]{7,40}$/.test(commit||''))throw new Error('Readiness storage identity unavailable');
 return 'operations/c1-readiness-v1/preview-'+commit;
}
const storage={
 async read(path){const r=await get(path,{access:'private',useCache:false});if(!r)return null;
  if(r.statusCode!==200||!r.blob?.etag)throw new Error('Readiness storage unavailable');
  return {etag:r.blob.etag,record:JSON.parse(await new Response(r.stream).text())};},
 async write(path,record,etag){return put(path,JSON.stringify(record),{access:'private',addRandomSuffix:false,
  allowOverwrite:Boolean(etag),...(etag?{ifMatch:etag}:{}),contentType:'application/json',cacheControlMaxAge:0});}
};
export async function readC1Readiness({store=storage,prefix=c1ReadinessPrefix()}={}){
 const head=await store.read(prefix+'/head.json');if(!head)return null;
 const h=head.record;
 if(h?.contract!=='c1-readiness-head-v1'||!/^[a-f0-9]{64}$/.test(h.hash||'')||h.path!==prefix+'/receipts/'+h.hash+'.json')throw new Error('Readiness receipt identity mismatch');
 const saved=await store.read(h.path);
 if(!saved||digest(saved.record)!==h.hash)throw new Error('Readiness receipt integrity failed');
 return saved.record;
}
// Separate diagnostic records only; never an account/model/performance write.
// A lost acknowledgement is resolved by reading, never by replaying the PUT.
export async function publishC1Readiness(receipt,{store=storage,prefix=c1ReadinessPrefix()}={}){
 const hash=digest(receipt),path=prefix+'/receipts/'+hash+'.json';
 try{await store.write(path,receipt);}catch{
  const saved=await store.read(path);if(!saved||digest(saved.record)!==hash)throw new Error('Readiness receipt publication unconfirmed');
 }
 const previous=await store.read(prefix+'/head.json');
 if(previous&&Date.parse(previous.record.observedAt)>Date.parse(receipt.observedAt))return {status:'superseded',hash};
 const head={contract:'c1-readiness-head-v1',hash,path,observedAt:receipt.observedAt};
 try{await store.write(prefix+'/head.json',head,previous?.etag);}catch{
  const saved=await store.read(prefix+'/head.json');
  if(!saved||saved.record.hash!==hash)throw new Error('Readiness head publication unconfirmed');
 }
 return {status:'published',hash};
}

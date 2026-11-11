// Cross-worker continuation of dated market anchors only. This namespace never
// stores account records, current quotes, events, cash, orders or authorization.
const TTL_MS=300000;
const storage={
 async read(path){
  const {get}=await import('@vercel/blob');
  const r=await get(path,{access:'private',useCache:false,headers:{'accept-encoding':'identity'},abortSignal:AbortSignal.timeout(5000)});
  if(!r)return null;
  if(r.statusCode!==200||!r.blob?.etag)throw new Error('Opening scan storage unavailable');
  return {record:JSON.parse(await new Response(r.stream).text()),etag:r.blob.etag};
 },
 async write(path,record,etag){
  const {put}=await import('@vercel/blob');
  return put(path,JSON.stringify(record),{access:'private',addRandomSuffix:false,allowOverwrite:Boolean(etag),
   ...(etag?{ifMatch:etag}:{}),contentType:'application/json',cacheControlMaxAge:0,abortSignal:AbortSignal.timeout(5000)});
 }
};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function bar(value,date){
 if(value==null)return null;
 if(value.date!==date||value.adjusted!==true||!['open','high','low','close'].every(k=>Number.isFinite(value[k])&&value[k]>0)||
  !Number.isFinite(value.volume)||value.volume<0)throw new Error('Opening scan anchor evidence is invalid');
 return {date,open:value.open,high:value.high,low:value.low,close:value.close,volume:value.volume,adjusted:true};
}
function anchor(value,date){
 if(!value||typeof value!=='object'||Object.keys(value).some(k=>!['anchor','anchorRecheck','unverified'].includes(k)))throw new Error('Opening scan anchor schema is invalid');
 if(value.unverified===true){if(Object.keys(value).length!==1)throw new Error('Opening scan anchor schema is invalid');return {unverified:true};}
 if(Object.hasOwn(value,'unverified'))throw new Error('Opening scan anchor schema is invalid');
 const first=bar(value.anchor,date),repeat=bar(value.anchorRecheck,date);
 return {...(first?{anchor:first}:{}),...(repeat?{anchorRecheck:repeat}:{})};
}
export function createC1OpeningAnchorStore({store=storage,environment=process.env.VERCEL_ENV,commit=process.env.VERCEL_GIT_COMMIT_SHA}={}){
 if(!['production','preview'].includes(environment)||!/^[a-f0-9]{40}$/.test(commit||''))throw new Error('Opening scan deployment identity is unavailable');
 const prefix='operations/c1-opening-anchors-v1/'+(environment==='production'?'production':'preview-'+commit)+'/'+commit;
 function context(input){
  const {sourceIdentity,sourceSessionDate,allowedSymbols,now}=input,time=Math.max(new Date(now).getTime(),Date.now());
  if(!/^[a-f0-9]{64}$/.test(sourceIdentity||'')||!/^\d{4}-\d{2}-\d{2}$/.test(sourceSessionDate||'')||!Number.isFinite(time)||
   !Array.isArray(allowedSymbols)||!allowedSymbols.length||allowedSymbols.some(s=>typeof s!=='string'||!/^[A-Z0-9][A-Z0-9.]{0,14}$/.test(s)))throw new Error('Opening scan source identity is invalid');
  return {sourceIdentity,sourceSessionDate,time,allowed:new Set(allowedSymbols),path:prefix+'/'+sourceSessionDate+'/'+sourceIdentity+'.json'};
 }
 function decode(saved,c){
  if(!saved)return new Map();
  const r=saved.record;
  if(!saved.etag||r?.contract!=='c1-opening-anchor-progress-v1'||r.commit!==commit||r.environment!==environment||r.sourceIdentity!==c.sourceIdentity||r.sourceSessionDate!==c.sourceSessionDate||
   !Number.isFinite(r.updatedAt)||!Number.isFinite(r.expiresAt)||r.updatedAt>c.time||r.expiresAt-r.updatedAt!==TTL_MS||!Array.isArray(r.anchors)||
   Object.keys(r).sort().join(',')!=='anchors,commit,contract,environment,expiresAt,sourceIdentity,sourceSessionDate,updatedAt')throw new Error('Opening scan stored evidence is invalid');
  if(r.expiresAt<=c.time)return new Map();
  const result=new Map();
  for(const row of r.anchors){
   if(!Array.isArray(row)||row.length!==2||!c.allowed.has(row[0])||result.has(row[0]))throw new Error('Opening scan stored symbol evidence is invalid');
   result.set(row[0],anchor(row[1],c.sourceSessionDate));
  }
  return result;
 }
 function merge(current,incoming,c){
  for(const [symbol,value]of incoming){
   if(!c.allowed.has(symbol))throw new Error('Opening scan symbol is outside its accepted source');
   const clean=anchor(value,c.sourceSessionDate);
   if(current.has(symbol)&&!same(current.get(symbol),clean))throw new Error('Opening scan anchor evidence changed during verification');
   current.set(symbol,clean);
  }
  return current;
 }
 return {
  async read(input){const c=context(input),saved=await store.read(c.path);c.time=Math.max(c.time,Date.now());return decode(saved,c);},
  async write(input){
   const c=context(input);
   if(!(input.anchors instanceof Map))throw new Error('Opening scan anchor map is invalid');
   let saved=await store.read(c.path);
   c.time=Math.max(c.time,Date.now());
   for(let attempt=0;attempt<3;attempt++){
    const current=decode(saved,c),previousSize=current.size,anchors=merge(current,input.anchors,c);
    if(saved&&anchors.size===previousSize)return anchors;
    const record={contract:'c1-opening-anchor-progress-v1',environment,commit,sourceIdentity:c.sourceIdentity,sourceSessionDate:c.sourceSessionDate,
     updatedAt:c.time,expiresAt:c.time+TTL_MS,anchors:[...anchors].sort(([a],[b])=>a.localeCompare(b))};
    try{await store.write(c.path,record,saved?.etag);return anchors;}
    catch(error){
     const winner=await store.read(c.path);
     if(!winner||winner.etag===saved?.etag)throw new Error('Opening scan progress publication is unconfirmed');
     c.time=Math.max(c.time,Date.now());
     const confirmed=decode(winner,c);
     if([...input.anchors].every(([symbol,value])=>confirmed.has(symbol)&&same(confirmed.get(symbol),anchor(value,c.sourceSessionDate))))return confirmed;
     saved=winner;
    }
   }
   throw new Error('Opening scan progress changed concurrently; verification remains incomplete');
  }
 };
}

// Actual installed SDK/HTTP dependency; explicit fake token, memory-only transport.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {spawnSync}=require('node:child_process');
const lock=fs.readFileSync('package-lock.json','utf8'),parsed=JSON.parse(lock);
assert.equal(parsed.packages['node_modules/undici'].version,'6.29.1');
assert.equal(parsed.packages['node_modules/@vercel/blob'].version,'2.8.0');
assert.equal(parsed.packages['node_modules/@vercel/oidc'].version,'3.8.7');
assert.equal(parsed.packages['node_modules/@vercel/cli-config'].version,'0.2.6');
const original=lock.replace('"version": "6.29.1"','"version": "6.28.1"')
 .replace('https://registry.npmjs.org/undici/-/undici-6.29.1.tgz','https://registry.npmjs.org/undici/-/undici-6.28.1.tgz')
 .replace('sha512-EvRlUt/QqAEvXdQeRMYUfwOQsfzpDztykrG2owGEE/rBOBoYv9uF39ZzsNDh4lTFHhTr2XOZjKkYgueD12ZmGA==','sha512-zWpdTVD54H48CIybL0rWQ3ukpb9d23wM7eH5RtfdmeP70cWHNjtfo7P4vZX+5CoDcO53J4Pu5uXp7lNfjc6DRA==');
assert.equal(createHash('sha1').update('blob '+Buffer.byteLength(original)+'\0').update(original).digest('hex'),'e957c3f6f17f259210e409c01d5c806e9ba8d967','Only the patched Undici entry differs from exact released lockfile');
if(process.argv[2]!=='--sdk-child'){
 const child=spawnSync(process.execPath,[__filename,'--sdk-child'],{cwd:process.cwd(),env:{NODE_ENV:'test'},encoding:'utf8',timeout:20000});
 assert.equal(child.status,0,(child.error?.message||'')+child.stdout+child.stderr);
 console.log(child.stdout.trim());
}else (async()=>{
 assert.equal(require('undici/package.json').version,'6.29.1','Actual installed HTTP library must match the reviewed patched lock');
 const sdkPackage=path.resolve(path.dirname(require.resolve('@vercel/blob')),'../package.json');
 assert.equal(JSON.parse(fs.readFileSync(sdkPackage,'utf8')).version,'2.8.0','Actual SDK stays on the reviewed version');
 const {MockAgent,setGlobalDispatcher}=require('undici');
 const mock=new MockAgent();mock.disableNetConnect();setGlobalDispatcher(mock);
 // This child has no inherited environment credentials. No OIDC/CLI token lookup.
 const {put,get,BlobPreconditionFailedError}=await import('@vercel/blob');
 const token='vercel_blob_rw_offlinefixture_fakefixture',pathname='offline-sdk-fixture.json';
 const blobUrl='https://offlinefixture.private.blob.vercel-storage.com/'+pathname;
 const body=JSON.stringify({records:[{id:'offline-only',value:1}]});
 const headersOf=raw=>{if(Array.isArray(raw)){const out={};for(let i=0;i<raw.length;i+=2)out[String(raw[i]).toLowerCase()]=String(raw[i+1]);return out;}return Object.fromEntries(Object.entries(raw||{}).map(([k,v])=>[k.toLowerCase(),String(v)]));};
 let puts=0,gets=0;
 const api=mock.get('https://vercel.com'),store=mock.get('https://offlinefixture.private.blob.vercel-storage.com');
 const result={url:blobUrl,downloadUrl:blobUrl+'?download=1',pathname,contentType:'application/json',contentDisposition:'attachment',size:body.length,uploadedAt:'2026-10-24T00:00:00Z',etag:'"v2"'};
 api.intercept({method:'PUT',path:()=>true}).reply(options=>{puts++;const h=headersOf(options.headers);assert.equal(h['x-if-match'],'"v1"');assert.equal(h['x-allow-overwrite'],'1');assert.equal(h['x-add-random-suffix'],'0');assert.equal(String(options.body),body);return{statusCode:200,data:JSON.stringify(result),responseOptions:{headers:{'content-type':'application/json'}}};});
 const saved=await put(pathname,body,{token,access:'private',allowOverwrite:true,addRandomSuffix:false,ifMatch:'"v1"',contentType:'application/json'});
 assert.equal(saved.etag,'"v2"');assert.equal(saved.pathname,pathname);
 store.intercept({method:'GET',path:'/'+pathname+'?cache=0'}).reply(options=>{gets++;assert.equal(headersOf(options.headers)['accept-encoding'],'identity');return{statusCode:200,data:body,responseOptions:{headers:{etag:'"v2"','content-type':'application/json','content-length':String(Buffer.byteLength(body))}}};});
 const read=await get(blobUrl,{token,access:'private',useCache:false,headers:{'accept-encoding':'identity'}});
 assert.equal(read.statusCode,200);assert.equal(read.blob.etag,'"v2"');assert.equal(await new Response(read.stream).text(),body);
 api.intercept({method:'PUT',path:()=>true}).reply(options=>{puts++;assert.equal(headersOf(options.headers)['x-if-match'],'"stale"');return{statusCode:412,data:JSON.stringify({error:{code:'precondition_failed',message:'offline stale version'}}),responseOptions:{headers:{'content-type':'application/json'}}};});
 await assert.rejects(put(pathname,body,{token,access:'private',allowOverwrite:true,addRandomSuffix:false,ifMatch:'"stale"'}),error=>error instanceof BlobPreconditionFailedError);
 api.intercept({method:'PUT',path:()=>true}).reply(options=>{puts++;const h=headersOf(options.headers);assert.equal(h['x-allow-overwrite'],'0');assert.equal(h['x-if-match'],undefined);return{statusCode:200,data:JSON.stringify(result),responseOptions:{headers:{'content-type':'application/json'}}};});
 await put(pathname,body,{token,access:'private',allowOverwrite:false,addRandomSuffix:false});
 assert.equal(puts,3);assert.equal(gets,1);mock.assertNoPendingInterceptors();await mock.close();
 console.log('PASS: patched Undici with actual Blob2.8 preserves identity body/ETag, conditional overwrite, stale precondition class and non-overwriting creation; all transport mocked.');
})().catch(error=>{console.error(error);process.exitCode=1;});

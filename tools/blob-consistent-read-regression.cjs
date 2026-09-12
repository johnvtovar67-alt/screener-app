const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const entry=require.resolve('@vercel/blob');
const metadata=JSON.parse(fs.readFileSync(path.resolve(path.dirname(entry),'../package.json'),'utf8'));
assert.equal(metadata.version,'2.8.0','Install the pinned Blob SDK; cached older versions may ignore useCache:false');
const {get}=require('@vercel/blob');
const {MockAgent,getGlobalDispatcher,setGlobalDispatcher}=require(require.resolve('undici',{paths:[path.dirname(entry)]}));
(async()=>{
 const previous=getGlobalDispatcher(),mock=new MockAgent();
 mock.disableNetConnect();setGlobalDispatcher(mock);
 try{
  const pool=mock.get('https://fixture.private.blob.vercel-storage.com');
  pool.intercept({path:'/account.json?cache=0',method:'GET'}).reply(200,JSON.stringify({revision:7}),{headers:{'content-type':'application/json',etag:'"fixture-version-7"'}});
  const result=await get('https://fixture.private.blob.vercel-storage.com/account.json',{access:'private',useCache:false,token:'vercel_blob_rw_fixture_synthetic'});
  assert.equal(result.statusCode,200);assert.equal(result.blob.etag,'"fixture-version-7"');
  assert.equal(JSON.parse(await new Response(result.stream).text()).revision,7);
  mock.assertNoPendingInterceptors();
  console.log('PASS: Blob SDK '+metadata.version+' sends the private origin-read parameter and returns the matching content/ETag.');
 }finally{setGlobalDispatcher(previous);await mock.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

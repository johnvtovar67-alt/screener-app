const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const entry=require.resolve('@vercel/blob');
const metadata=JSON.parse(fs.readFileSync(path.resolve(path.dirname(entry),'../package.json'),'utf8'));
assert.equal(metadata.version,'2.8.0','Install the pinned Blob SDK; cached older versions may ignore useCache:false');
const {get}=require('@vercel/blob');
const vm=require('node:vm');
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
  // Exercise the production adapter against compression-dependent tags.
  // The old default read receives a weak validator and cannot save. The
  // adapter must explicitly request identity and preserve the exact tag.
  const body={revision:7,holdings:[{symbol:'FIXTURE',shares:34}],records:[{date:'2026-09-08'}]};
  const strong='"stored-version-7"';let writes=0;
  const source=fs.readFileSync('pages/api/c1-account.js','utf8');
  const adapter=source.slice(source.indexOf('const storage={'),source.indexOf('export function createC1AccountHandler'));
  const fixtureToken='vercel_blob_rw_fixture_synthetic';
  const box={Response,JSON,get:(pathname,options)=>get('https://fixture.private.blob.vercel-storage.com/'+pathname,{...options,token:fixtureToken}),
   put:async(pathname,serialized,options)=>{
    assert.equal(options.access,'private');assert.equal(options.allowOverwrite,true);
    if(options.ifMatch!==strong)throw new Error('Precondition failed');
    writes++;assert.deepEqual(JSON.parse(serialized).holdings,body.holdings);assert.deepEqual(JSON.parse(serialized).records,body.records);
   }};
  vm.createContext(box);vm.runInContext(adapter+'\nglobalThis.store=storage;',box);
  pool.intercept({path:'/old.json?cache=0',method:'GET'}).reply(200,JSON.stringify(body),{headers:{etag:'W/'+strong}});
  const old=await get('https://fixture.private.blob.vercel-storage.com/old.json',{access:'private',useCache:false,token:fixtureToken});
  assert.ok(old.blob.etag.startsWith('W/'));await new Response(old.stream).text();
  await assert.rejects(box.store.write('account.json',body,old.blob.etag),/Precondition failed/);
  pool.intercept({path:'/account.json?cache=0',method:'GET',headers:{'accept-encoding':'identity'}}).reply(200,JSON.stringify(body),{headers:{etag:strong}});
  const saved=await box.store.read('account.json');assert.equal(saved.etag,strong);assert.deepEqual(saved.record,body);
  await box.store.write('account.json',{...saved.record,revision:8,holdingRankReviews:[{verified:true}]},saved.etag);
  assert.equal(writes,1);
  await assert.rejects(box.store.write('account.json',body,'"stale-version"'),/Precondition failed/);
  assert.equal(writes,1,'Stale versions must still reject');
  mock.assertNoPendingInterceptors();
  console.log('PASS: Blob SDK '+metadata.version+' sends the private origin-read parameter and uses identity encoding for account reads, preserves strong save tags and rejects weak/stale versions.');
 }finally{setGlobalDispatcher(previous);await mock.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createWorkflowFixture}=require('./c1-trading-workflow.cjs');
// The real production API handler with isolated memory storage and supplied
// quote evidence. No live Blob, FMP or Schwab connection can be used here.
function createWorkflowApi(kind='buy'){
 const fixture=createWorkflowFixture(kind==='sell-missing'?'sell':kind);if(kind==='sell-missing')fixture.setOpeningFailure(true);
 const file=path.join(fixture.root,'pages/api/c1-account.js'),imports={};
 const never=()=>{throw Error('Live provider/storage access forbidden in workflow test');};
 const coverageSource=fs.readFileSync(path.join(fixture.root,'lib/c1HoldingCoverage.js'),'utf8').replace(/^import .*;$/gm,'').replace(/export (async )?function /g,(_,a)=>(a||'')+'function ');
 const missingPrices=new Function(coverageSource+';return missingC1HoldingPrices;')();
 let source=fs.readFileSync(file,'utf8').replace(/import\s*{([^}]+)}\s*from\s*'([^']+)';/g,(_,spec,request)=>{
  const values=request==='@vercel/blob'?{get:never,put:never}:request.endsWith('c1DatedBookStore')?{readStoredC1DatedBook:never}:
   request.endsWith('c1HeldRankProvider')?{collectC1HeldRankReviews:never}:request.endsWith('c1AccountOpeningProvider')?{collectC1AccountOpening:never}:
   request.endsWith('c1HoldingCoverage')?{collectC1HoldingCoverage:never,missingC1HoldingPrices:missingPrices}:
   request.startsWith('node:')?require(request):fixture.loader.load(request,file);
  for(const name of spec.split(',').map(x=>x.trim())){if(!(name in values))throw Error('Missing API binding '+name);imports[name]=values[name];}
  return '';
 }).replace(/export const /g,'const ').replace(/export function /g,'function ').replace('export default createC1AccountHandler();','globalThis.factory=createC1AccountHandler;');
 const box={...imports,Date,console,process:{env:{}},Response};vm.createContext(box);vm.runInContext(source,box,{filename:file});
 let etag='"fixture-0"';
 const handler=box.factory({environment:'test',commit:'workflow-only',clock:()=>fixture.now,readBook:async()=>({record:fixture.book}),collectOpening:fixture.collectOpening,
  collectHoldings:never,collectRanks:never,store:{read:async()=>({record:fixture.account,etag}),write:async(_path,record,expected)=>{
   if(expected!==etag)throw Error('Fixture ETag conflict');fixture.persist(record);etag='"fixture-'+fixture.writes+'"';
  }}});
 return {fixture,async request(method,body,authorized=true){
  fixture.advance();let status=200,value;
  const res={setHeader(){},status(code){status=code;return this;},json(body){value=body;return this;}};
  await handler({method,body,headers:authorized?{authorization:'Bearer offline_workflow_fixture_key_000001'}:{}},res);
  return {status,body:{...value,testClock:fixture.now.toISOString(),testScreenRows:fixture.screenRows()}};
 }};
}
module.exports={createWorkflowApi};

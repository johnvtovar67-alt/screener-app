const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createWorkflowFixture}=require('./c1-trading-workflow.cjs');
// The real production API handler with isolated memory storage and supplied
// quote evidence. No live Blob, FMP or Schwab connection can be used here.
function createWorkflowApi(kind='buy',options={}){
 const fixture=createWorkflowFixture(kind==='sell-missing'?'sell':kind,options.portfolio?{portfolio:options.portfolio,baselineDate:options.baselineDate,now:options.now}:['capacity','adoption'].includes(kind)?{portfolio:[...['BBB','CCC','LLL'].map(symbol=>({symbol,role:'Swing',shares:40,avgCost:100,openedAt:'2026-10-14'})),{symbol:'CASH',role:'Swing',shares:8000,avgCost:1}]}:{baselineDate:options.baselineDate,now:options.now});if(kind==='sell-missing')fixture.setOpeningFailure(true);
 if(kind==='adoption'){fixture.now='2026-10-14T22:00:00Z';fixture.setCash(5000);fixture.adoptionPortfolioRecord={etag:'\"adoption-core-1\"',portfolio:[...fixture.portfolio,{symbol:'MRNA',role:'Core',shares:20,avgCost:88,openedAt:'2026-10-01'}]};}
 const file=path.join(fixture.root,'pages/api/c1-account.js'),imports={};
 const never=()=>{throw Error('Live provider/storage access forbidden in workflow test');};
 const coverageSource=fs.readFileSync(path.join(fixture.root,'lib/c1HoldingCoverage.js'),'utf8').replace(/^import .*;$/gm,'').replace(/export (async )?function /g,(_,a)=>(a||'')+'function ');
 const missingPrices=new Function(coverageSource+';return missingC1HoldingPrices;')();
 let source=fs.readFileSync(file,'utf8').replace(/import\s*{([^}]+)}\s*from\s*'([^']+)';/g,(_,spec,request)=>{
  const values=request.endsWith('c1JourneyObservation')&&options.observationSecret?{signC1JourneyObservation:(status,context)=>require('./c1-operational-modules.cjs').createOperationalModuleLoader(fixture.root).load('lib/c1JourneyObservation.js').signC1JourneyObservation(status,{...context,secret:options.observationSecret})}:request==='@vercel/blob'?{get:never,put:never}:request.endsWith('c1DatedBookStore')?{readStoredC1DatedBook:never}:
   request.endsWith('c1HeldRankProvider')?{collectC1HeldRankReviews:never}:request.endsWith('c1AccountOpeningProvider')?{collectC1AccountOpening:never}:
   request.endsWith('c1HoldingCoverage')?{collectC1HoldingCoverage:never,missingC1HoldingPrices:missingPrices}:
   request.startsWith('node:')?require(request):fixture.loader.load(request,file);
  for(const name of spec.split(',').map(x=>x.trim())){if(!(name in values))throw Error('Missing API binding '+name);imports[name]=values[name];}
  return '';
 }).replace(/export const /g,'const ').replace(/export function /g,'function ').replace('export default createC1AccountHandler();','globalThis.factory=createC1AccountHandler;');
 const box={...imports,Date,console,process:{env:{}},Response};vm.createContext(box);vm.runInContext(source,box,{filename:file});
 let etag='"fixture-0"';const requests=[];
 const handler=box.factory({environment:'test',commit:options.commit||'workflow-only',readPortfolio:async()=>{if(!fixture.adoptionPortfolioRecord)throw Error('Synthetic adoption portfolio required');return JSON.parse(JSON.stringify(fixture.adoptionPortfolioRecord));},clock:()=>fixture.now,readBook:async()=>({record:fixture.book}),collectOpening:fixture.collectOpening,
  collectHoldings:never,collectRanks:never,store:{read:async()=>({record:fixture.account,etag}),write:async(_path,record,expected)=>{
   if(expected!==etag)throw Error('Fixture ETag conflict');fixture.persist(record);etag='"fixture-'+fixture.writes+'"';
  }}});
 return {fixture,requests,async request(method,body,authorized=true){
  requests.push({method,operation:body?.operation||null});
  fixture.advance();let status=200,value;const headers={};
  const res={setHeader(name,value){headers[name]=value;},status(code){status=code;return this;},json(body){value=body;return this;}};
  await handler({method,body,headers:authorized?{authorization:'Bearer offline_workflow_fixture_key_000001'}:{}},res);
  return {status,headers,body:{...value,testClock:fixture.now.toISOString(),testPortfolio:fixture.adoptionPortfolioRecord?.portfolio||fixture.portfolio,testScreenRows:fixture.screenRows()}};
 }};
}
module.exports={createWorkflowApi};

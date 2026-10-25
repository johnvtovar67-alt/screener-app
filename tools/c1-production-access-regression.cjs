// Owner-approved access restrictions; synthetic credentials/storage only.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const crypto=require('node:crypto'),babel=require('next/dist/compiled/babel/core');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const authSource=fs.readFileSync('lib/researchMutationAuth.js','utf8').replace(/^import .*;\n/gm,'').replace(/export function /g,'function ');
const auth=env=>new Function('process','Buffer','timingSafeEqual',authSource+';return {rejectPublicProductionResearch,researchMutationAuthorized};')({env},Buffer,crypto.timingSafeEqual);
const response=()=>{const out={headers:{}};out.setHeader=(k,v)=>{out.headers[k]=v;};out.status=s=>{out.statusCode=s;return out;};out.json=b=>{out.body=b;return out;};return out;};
const guardImport='import {rejectPublicProductionResearch} from "../../../lib/researchMutationAuth";\n';
const guardLine='  if (rejectPublicProductionResearch(req, res)) return;\n';
const files=fs.readdirSync('pages/api/research').filter(f=>f.endsWith('.js')).map(f=>'pages/api/research/'+f);
const hashes=JSON.parse(fs.readFileSync('docs/operations/c1-production-access-baseline-20261025.json','utf8'));
const hash=s=>crypto.createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0').update(s).digest('hex');
async function main(){
 assert.equal(files.length,53);
 for(const file of files){
  const source=fs.readFileSync(file,'utf8');
  assert(source.startsWith(guardImport),file+' imports actual shared guard');
  assert.equal(hash(source.replace(guardImport,'').replace(guardLine,'')),hashes[file],file+' exact source reversal');
  const ast=babel.parseSync(source,{sourceType:'module',babelrc:false,configFile:false});
  const declaration=ast.program.body.find(n=>n.type==='ExportDefaultDeclaration').declaration;
  const head=source.slice(declaration.body.start+1,declaration.body.end-1).trimStart();
  assert(head.startsWith(guardLine.trim()),file+' guard is first handler operation');
  const handler=new Function('rejectPublicProductionResearch','return '+source.slice(declaration.start,declaration.end))(auth({VERCEL_ENV:'production',CRON_SECRET:'synthetic-worker-secret'}).rejectPublicProductionResearch);
  for(const method of ['GET','POST','PUT','DELETE','HEAD','OPTIONS']){
   for(const authorization of [undefined,'Bearer wrong','Bearer '+ 'x'.repeat(300),'synthetic-worker-secret']){
    const req={method,headers:{authorization},get body(){throw Error('public body read');},get query(){throw Error('public query read');}};
    const res=response();await handler(req,res);
    assert.equal(res.statusCode,404);assert.deepEqual(res.body,{error:'Not found'});
   }
  }
 }
 for(const environment of ['preview','development',undefined,'Production']){
  const res=response();assert.equal(auth({VERCEL_ENV:environment}).rejectPublicProductionResearch({get headers(){throw Error('Nonproduction auth policy changed');}},res),false);assert.equal(res.statusCode,undefined);
 }
 for(const secret of [undefined,''])assert.equal(auth({VERCEL_ENV:'production',CRON_SECRET:secret}).rejectPublicProductionResearch({headers:{authorization:'Bearer synthetic-worker-secret'}},response()),true);
 const trusted=auth({VERCEL_ENV:'production',CRON_SECRET:'synthetic-worker-secret'});
 const allowed=response();assert.equal(trusted.rejectPublicProductionResearch({headers:{authorization:'Bearer synthetic-worker-secret'}},allowed),false);assert.equal(allowed.statusCode,undefined);
 // Complete real portfolio handler with memory storage, no provider or Blob I/O.
 const portfolioFile='pages/api/portfolio-sync.js',portfolioSource=fs.readFileSync(portfolioFile,'utf8');
 const oldPortfolio=fs.readFileSync('tools/fixtures/portfolio-sync-production-d386ae5.js','utf8').replace(/^  if\(process.env.VERCEL_ENV==='production'&&!saved\).*\n/m,'').replace(/^    if\(e.code==='PRODUCTION_ACCOUNT_CREATION_DISABLED'\).*\n/m,'');
 assert.equal(hash(oldPortfolio),hashes[portfolioFile]);
 function portfolio(source,environment,saved){
  const state={saved:saved?structuredClone(saved):null,puts:0,reads:0};
  const code=source.replace(/^import .*;\n/gm,'').replace('export const config=','const config=').replace('export default async function handler','async function handler');
  const box={...require('./c1-owner-access-extraction.cjs').ownerAccessFixture(),process:{env:{VERCEL_ENV:environment}},createHash:crypto.createHash,randomUUID:crypto.randomUUID,isBlobPreconditionFailed:loader.load('lib/blobErrors.js').isBlobPreconditionFailed,Response,console,cleanC1ControlState:loader.load('lib/c1CapitalState.js').cleanC1ControlState,
   get:async()=>{state.reads++;if(state.failure)throw state.failure;return state.saved?{statusCode:200,blob:{etag:state.saved.etag},stream:new Response(JSON.stringify(state.saved.record)).body}:null;},
   put:async(path,body,options)=>{state.puts++;state.options=options;state.saved={etag:'v2',record:JSON.parse(body)};return{etag:'v2'};},list:()=>{throw Error('Unexpected health scan');}};
  vm.createContext(box);vm.runInContext(code+';this.handler=handler;',box);return{state,handler:box.handler};
 }
 const request=(method,etag=null)=>({method,query:{},headers:{authorization:'Bearer '+'x'.repeat(32)},body:{portfolio:[{symbol:'AAA',shares:3,avgCost:100,role:'Swing'}],expectedEtag:etag,c1ControlState:{}}});
 const absent=portfolio(portfolioSource,'production',null),denied=response();await absent.handler(request('PUT'),denied);assert.equal(denied.statusCode,403);assert.equal(absent.state.puts,0);assert.equal(absent.state.saved,null);
 const saved={etag:'v1',record:{version:2,portfolio:[{symbol:'AAA',shares:3,avgCost:100,role:'Swing'}],c1ControlState:{}}};
 for(const [method,etag] of [['GET',null],['PUT','v1'],['PUT','stale']]){
  const prior=portfolio(oldPortfolio,'production',saved),current=portfolio(portfolioSource,'production',saved),a=response(),b=response();
  await prior.handler(request(method,etag),a);await current.handler(request(method,etag),b);
  if(a.body?.updatedAt){a.body.updatedAt='clock';b.body.updatedAt='clock';prior.state.saved.record.updatedAt='clock';current.state.saved.record.updatedAt='clock';}
  assert.equal(b.statusCode,a.statusCode);assert.equal(JSON.stringify(b.body),JSON.stringify(a.body));assert.equal(JSON.stringify(current.state),JSON.stringify(prior.state));
 }
 const preview=portfolio(portfolioSource,'preview',null),created=response();await preview.handler(request('PUT'),created);assert.equal(created.statusCode,200);assert.equal(preview.state.puts,1);
 for(const source of [oldPortfolio,portfolioSource]){
  const failed=portfolio(source,'production',saved),res=response();failed.state.failure=Object.assign(new Error('Synthetic storage authorization failure'),{status:403});
  await failed.handler(request('PUT','v1'),res);assert.equal(res.statusCode,500,'Storage403 is not mislabeled as disabled account creation');assert.equal(res.body.error,'Portfolio sync failed.');assert.equal(failed.state.puts,0);
 }
 // Real account handler: production adoption cannot read market inputs or write.
 const accountFile='pages/api/c1-account.js',accountSource=fs.readFileSync(accountFile,'utf8');
 assert.equal(hash(require('./c1-owner-access-extraction.cjs').originalAccountSource(accountSource).replace(/^   if\(environment==='production'&&operation==='adopt'&&!saved\).*\n/m,'')),hashes[accountFile]);
 const accountCode=accountSource.replace(/^import .*;\n/gm,'').replace('export const config=','const config=').replace('export function createC1AccountHandler','function createC1AccountHandler').replace('export default createC1AccountHandler();','this.factory=createC1AccountHandler;');
 const dependencies={...require('./c1-owner-access-extraction.cjs').ownerAccessFixture(),createHash:crypto.createHash,randomUUID:crypto.randomUUID,...loader.load('lib/c1ApiErrors.js'),Response,console,process:{env:{}},readStoredC1DatedBook:()=>{},collectC1AccountOpening:()=>{},collectC1HoldingCoverage:()=>{},collectC1HeldRankReviews:()=>{}};
 vm.createContext(dependencies);vm.runInContext(accountCode,dependencies);
 let writes=0,bookReads=0;
 const handler=dependencies.factory({environment:'production',store:{read:async()=>null,write:async()=>{writes++;}},readBook:async()=>{bookReads++;throw Error('Inputs must not be read');}});
 const rejection=response();await handler({method:'POST',headers:request('PUT').headers,body:{operation:'adopt'}},rejection);assert.equal(rejection.statusCode,403);assert.equal(writes,0);assert.equal(bookReads,0);
 const configText=fs.readFileSync('vercel.json','utf8'),config=JSON.parse(configText),configurationHash=text=>hash(JSON.stringify(JSON.parse(text)));
 assert.equal(configurationHash(configText),hashes['vercel.json:canonical'],'Every deployment configuration value, including cron paths/schedules, remains unchanged');
 assert.equal(configurationHash(JSON.stringify(config)+'\n'),hashes['vercel.json:canonical'],'Vercel compact formatting preserves the exact full configuration contract');
 const changedConfig=structuredClone(config);changedConfig.crons[0].schedule='0 0 * * *';
 assert.notEqual(configurationHash(JSON.stringify(changedConfig)),hashes['vercel.json:canonical'],'A real cron-policy change must still fail');
 for(const f of ['pages/api/cron/c1-index.js','pages/api/cron/full-market-discovery.js','pages/api/cron/fmp-research-backtest.js'])assert.equal(hash(fs.readFileSync(f,'utf8')),hashes[f],f+' byte-identical');
 console.log('PASS: all53 research routes deny public production requests before handler work; existing server authorization/nonproduction retained; new production portfolio/account creation zero-write denied; existing portfolio output/storage parity and cron hashes unchanged.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});

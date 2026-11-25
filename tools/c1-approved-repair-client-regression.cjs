// Actual Home normal refresh/pull/push and signed publication path. Fictional
// in-memory responses only; no live account, provider, or financial writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const babel=require('next/dist/compiled/babel/core'),{createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd()),page=fs.readFileSync('pages/index.js','utf8');
const signatureRecord={exports:{}},signatureSource=fs.readFileSync('lib/c1JourneyObservation.js','utf8').replace(/import\s*{([^}]+)}\s*from\s*'([^']+)';/g,(_,names,from)=>'const {'+names+"}=require('"+from+"');").replace(/export function /g,'function ');
new Function('require','module','exports',signatureSource+'\nmodule.exports={signC1JourneyObservation,verifyC1JourneyObservation};')(require,signatureRecord,signatureRecord.exports);
const ast=babel.parseSync(page,{sourceType:'module',babelrc:false,configFile:false,parserOpts:{plugins:['jsx']}}),home=ast.program.body.find(row=>row.type==='ExportDefaultDeclaration').declaration;
const top=['c1ApprovedRepairReceipt','c1ApprovedPortfolioBasis'].map(name=>{const node=ast.program.body.find(row=>row.type==='FunctionDeclaration'&&row.id.name===name);assert(node);return page.slice(node.start,node.end);}).join('\n');
const functions=['publishC1AccountState','refreshC1Account','pushCloudPortfolio','pullCloudPortfolio'].map(name=>{const node=home.body.body.find(row=>row.type==='FunctionDeclaration'&&row.id.name===name);assert(node);return page.slice(node.start,node.end);}).join('\n');
const observation=home.body.body.find(row=>row.type==='ExpressionStatement'&&row.expression?.callee?.name==='useEffect'&&page.slice(row.start,row.end).includes('reportC1PublishedJourney(accountView'));
assert(observation);const observed=page.slice(observation.expression.arguments[0].start,observation.expression.arguments[0].end);
const clone=value=>JSON.parse(JSON.stringify(value));
const source=[{symbol:'ZZCORE',role:'Core',shares:40,avgCost:50,openedAt:'2026-01-02',lastTradeAt:'2026-11-20T15:00:00Z',custom:'keep Core'},
 {symbol:'ZZQ',role:'Swing',shares:10,avgCost:100.08,openedAt:'2026-11-18',lastTradeAt:'2026-11-18T15:00:00Z',stop:88,custom:'keep user fields'},
 {symbol:'CASH',role:'Swing',shares:25,avgCost:1,custom:'keep old metadata'}];
const now=new Date('2026-11-25T17:00:00Z'),commit='a'.repeat(40),secret='fictional-client-observation-secret';
function view(){return {decision:{contract:'c1-account-decision-v1',decisionId:'fictional-approved:9',revision:9,current:true,sourceSessionDate:'2026-11-24',brokerageCash:123,
 positions:[{symbol:'ZZQ',shares:10,avgCost:100.05,openedAt:'2026-11-18',stops:[],exits:[],reviewRules:[]}],opportunities:[]},openingError:null,
 approvedAccountRepairReceipt:{contract:'c1-approved-account-repair-receipt-v1',status:'applied',authorizationId:'c1-owner-approved-repair-20261125',reviewId:'b'.repeat(64),attributionProposalId:'c'.repeat(64),revision:9,originalRecordsPreserved:true,
  basisCorrections:[{symbol:'ZZQ',remainingShares:10,basisBefore:1000.8,basisAfter:1000.5}]}};}
function harness({approved=true,etagReady=false,conflict=false,missingEtag=false,dirty=false}={}){
 const key='fictional_connected_client_key_'.repeat(2),values=new Map([['key',key],['portfolio',JSON.stringify(source)],['capital','{}']]);
 const state={portfolio:clone(source),accountView:null,verified:false,error:'',syncStatus:'Synced',cloud:clone(source),etag:'"portfolio-v1"',calls:[],localWrites:[],observations:[],serverWrites:0};
 const responseView=view();if(!approved)delete responseView.approvedAccountRepairReceipt;
 const journey=loader.load('lib/c1JourneyClient.js'),signature=signatureRecord.exports;
 const token=signature.signC1JourneyObservation({operation:'ANALYSIS',code:'ACCOUNT_ANALYSIS_ONLY',requestId:'01234567-89ab-4cde-8f01-23456789abcd',commit,sourceSessionDate:'2026-11-24'},{now,secret});assert(token);
 const box={...loader.load('lib/c1AccountPortfolio.js'),...loader.load('lib/c1NonCashPortfolio.js'),...loader.load('lib/c1AccountDifferences.js'),...loader.load('lib/c1RefreshResponse.js'),
  bindC1JourneyReceipt:journey.bindC1JourneyReceipt,
  reportC1PublishedJourney:(value,options)=>journey.reportC1PublishedJourney(value,{...options,fetcher:async(url,input)=>{assert.equal(url,'/api/c1-journey-observation');const body=JSON.parse(input.body);assert(signature.verifyC1JourneyObservation(body.token,{now,secret,commit}));state.observations.push(body);return new Response('{}');}}),
  Date,Promise,JSON,Number,Object,Array,Set,Map,Response,console,CASH:['CASH'],KEY:'portfolio',SYNC_KEY:'key',C1_DRAWDOWN_KEY:'capital',c1Control:null,
  accountRequestId:{current:0},screenRequestId:{current:1},syncPullId:{current:0},syncWriteId:{current:0},syncQueue:{current:Promise.resolve()},syncDirty:{current:dirty},syncRevision:{current:etagReady?{key,etag:state.etag}:{key:'',etag:null}},
  loading:false,reloading:false,accountBusy:false,feedHealth:{status:'healthy'},
  localStorage:{getItem:name=>values.get(name)||null,setItem:(name,value)=>{values.set(name,value);state.localWrites.push(name);}},
  window:{dispatchEvent(){}},CustomEvent:class{constructor(name){this.type=name;}},
  observeStopOwnership(){},setAccountView:value=>state.accountView=value,setAccountAbsent(){},setAccountError:value=>state.error=value,setAccountResponseVerified:value=>state.verified=value,
  setPortfolio:value=>state.portfolio=value,setSyncStatus:value=>state.syncStatus=value,
  fetch:async(url,options={})=>{
   const method=options.method||'GET',body=options.body?JSON.parse(options.body):null;state.calls.push({url,method,body});
   if(url==='/api/c1-account'){assert.equal(method,'GET','Normal opening must not ask the client to confirm or fabricate a trade');return new Response(JSON.stringify(responseView),{headers:{'x-c1-operational-receipt':token}});}
   assert.equal(url,'/api/portfolio-sync');
   if(method==='GET')return new Response(JSON.stringify({portfolio:state.cloud,...(missingEtag?{}:{etag:state.etag})}));
   assert.equal(method,'PUT');assert.equal(body.expectedEtag,state.etag,'Derived basis uses the existing strong saved portfolio identity');
   if(conflict)return new Response(JSON.stringify({error:'fictional concurrent portfolio save'}),{status:409});
   state.cloud=clone(body.portfolio);state.serverWrites++;state.etag='"portfolio-v'+(state.serverWrites+1)+'"';return new Response(JSON.stringify({etag:state.etag}));
  }};
 for(const [name,get]of [['portfolio',()=>state.portfolio],['accountView',()=>state.accountView],['accountResponseVerified',()=>state.verified],['syncStatus',()=>state.syncStatus],['syncKey',()=>key]])Object.defineProperty(box,name,{get,configurable:true});
 vm.createContext(box);vm.runInContext(top+'\n'+functions+'\nglobalThis.client={refreshC1Account,pullCloudPortfolio,c1ApprovedRepairReceipt,c1ApprovedPortfolioBasis,publishObservation:'+observed+'};',box);
 return {box,state,values,key,responseView,...box.client};
}
let cases=0;async function check(name,run){await run();cases++;console.log('PASS '+name);}
function preserved(rows){assert.equal(JSON.stringify(rows[0]),JSON.stringify(source[0]));assert.equal(JSON.stringify(rows[2]),JSON.stringify(source[2]));assert.equal(JSON.stringify({...rows[1],avgCost:source[1].avgCost}),JSON.stringify(source[1]));}
(async()=>{
 await check('normal verified account read repairs only approved basis and syncs through a strong ETag',async()=>{
  const h=harness(),before=loader.load('lib/c1AccountDifferences.js').c1AccountDifferences(h.responseView.decision,source);assert.equal(before.length,1);
  await h.refreshC1Account();assert.equal(h.state.verified,true);assert.equal(h.state.portfolio[1].avgCost,100.05);preserved(h.state.portfolio);preserved(h.state.cloud);
  assert.equal(h.state.serverWrites,1);assert.equal(h.box.syncDirty.current,false);assert.equal(h.state.calls.filter(call=>call.url==='/api/c1-account').length,1);
  assert.equal(loader.load('lib/c1AccountDifferences.js').c1AccountDifferences(h.state.accountView.decision,h.state.portfolio).length,0);
  h.publishObservation();await Promise.resolve();assert.equal(h.state.observations.length,1);assert.equal(h.state.observations[0].outcome,'PUBLISHED');
  await h.refreshC1Account();assert.equal(h.state.serverWrites,1,'A second normal read cannot rewrite the same correction');
 });
 await check('later cloud pulls cannot reintroduce the old basis or overwrite updated Core fields',async()=>{
  const h=harness();await h.refreshC1Account();h.state.cloud=clone(source);h.state.cloud[0].shares=41;h.state.cloud[0].custom='new saved Core metadata';h.state.etag='"concurrent-v3"';
  await h.pullCloudPortfolio(h.key,[],true);assert.equal(h.state.portfolio[1].avgCost,100.05);assert.equal(h.state.portfolio[0].shares,41);assert.equal(h.state.portfolio[0].custom,'new saved Core metadata');assert.equal(h.state.cloud[0].shares,41);assert.equal(h.state.serverWrites,2);
 });
 await check('ordinary accounts, unapproved receipts and changed ownership cannot authorize basis or holdings edits',async()=>{
  const h=harness({approved:false});await h.refreshC1Account();assert.equal(h.state.serverWrites,0);assert.equal(JSON.stringify(h.state.portfolio),JSON.stringify(source));
  for(const modify of [value=>{value.approvedAccountRepairReceipt.status='proposed';},value=>{value.approvedAccountRepairReceipt.revision--;},value=>{value.approvedAccountRepairReceipt.originalRecordsPreserved=false;},value=>{value.approvedAccountRepairReceipt.basisCorrections=[null];},value=>{value.decision.positions[0].shares=11;},value=>{value.decision.positions[0].avgCost=99;}]){
   const candidate=view();modify(candidate);assert.equal(h.c1ApprovedPortfolioBasis(source,candidate),source);
  }
  const altered=clone(source);altered[1].avgCost=95;assert.equal(h.c1ApprovedPortfolioBasis(altered,view()),altered,'An unrelated user basis edit is not replaced');
 });
 await check('missing ETags, concurrent saves and pending local edits remain paused rather than claim publication',async()=>{
  for(const options of [{missingEtag:true},{conflict:true},{dirty:true}]){
   const h=harness(options);await h.refreshC1Account();assert.equal(h.state.serverWrites,0);h.publishObservation();await Promise.resolve();assert.equal(h.state.observations[0].outcome,'PAUSED');
   assert.equal(h.state.calls.filter(call=>call.url==='/api/c1-account'&&call.method!=='GET').length,0);
  }
 });
 console.log(`PASS: ${cases} actual normal-load client flows; receipt-bound basis-only merge, unchanged Core/dates/stops/shares, conditional portfolio sync and signed frame publication. No live data or writes.`);
})().catch(error=>{console.error(error);process.exitCode=1;});

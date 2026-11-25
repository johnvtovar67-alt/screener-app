// Actual Home review callback, actual HTTP handler and actual response reader.
// Fictional inputs and memory storage only; no network or financial writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),Module=require('node:module');
const babel=require('next/dist/compiled/babel/core');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd()),reader=loader.load('lib/c1RefreshResponse.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const apiTestFile=path.resolve('tools/c1-broker-cash-api-regression.cjs'),apiTest=fs.readFileSync(apiTestFile,'utf8');
const boundary=apiTest.indexOf('\nlet cases=0;');assert(boundary>0,'Reuse the real API fixture without executing its mutation tests');
const fixtureModule=new Module(apiTestFile,module);fixtureModule.filename=apiTestFile;fixtureModule.paths=Module._nodeModulePaths(path.dirname(apiTestFile));
fixtureModule._compile(apiTest.slice(0,boundary)+'\nmodule.exports={harness};',apiTestFile);
const {harness:apiHarness}=fixtureModule.exports;
const pageFile=path.resolve('pages/index.js'),page=fs.readFileSync(pageFile,'utf8');
const ast=babel.parseSync(page,{sourceType:'module',babelrc:false,configFile:false,parserOpts:{plugins:['jsx']}});
const home=ast.program.body.find(row=>row.type==='ExportDefaultDeclaration').declaration;
const callbackNode=home.body.body.find(row=>row.type==='FunctionDeclaration'&&row.id.name==='reviewBrokerCashHistory');
assert(callbackNode);const callback=page.slice(callbackNode.start,callbackNode.end);
assert(page.includes("import {readC1AccountResponse,requestC1BrokerCashReview} from '../lib/c1RefreshResponse';"));
function pageHarness(kind='plain',transform=value=>value){
 const api=apiHarness(kind),calls=[],busy=[],errors=[],snapshot=clone(api.state.account),writes=[];
 const box={...reader,Promise,Error,JSON,syncQueue:{current:Promise.resolve()},syncDirty:{current:false},syncStatus:'Synced',SYNC_KEY:'fixture-key',
  localStorage:{getItem:()=> 'fictional-connected-owner-key',setItem:()=>{writes.push('local-storage');throw Error('Review cannot write local storage');}},
  setAccountBusy:value=>busy.push(value),setAccountError:value=>errors.push(value),
  fetch:async(url,options)=>{
   assert.equal(url,'/api/c1-account');const body=JSON.parse(options.body);calls.push(body);
   assert.equal(body.operation,'review-broker-cash-history','The actual page review callback cannot invoke confirmation');
   const response=await api.request(body),wire=transform(clone(response.body),response);
   return {ok:response.statusCode>=200&&response.statusCode<300,status:response.statusCode,headers:{get:()=>null},json:async()=>wire};
  }};
 vm.createContext(box);vm.runInContext(callback+';globalThis.review=reviewBrokerCashHistory;',box,{filename:pageFile});
 return {...api,box,calls,busy,errors,snapshot,writes,review:box.review};
}
const unchanged=h=>{assert.equal(h.state.writes,0);assert.equal(h.state.writeAttempts,0);assert.equal(h.state.providerCalls,0);assert.equal(h.writes.length,0);assert.equal(JSON.stringify(h.state.account),JSON.stringify(h.snapshot));assert.deepEqual(h.busy,[true,false]);};
let cases=0;
async function check(name,run){await run();cases++;console.log('PASS '+name);}
async function main(){
 await check('actual page callback accepts real read-only handler proposals without requiring an account decision',async()=>{
  for(const kind of ['plain','planned']){
   const h=pageHarness(kind),proposal=await h.review(h.input.statementText,0);
   assert.equal(proposal.contract,'c1-broker-statement-review-v1');assert.equal(proposal.financialValid,true);assert.match(proposal.reviewId,/^[a-f0-9]{64}$/);
   assert.equal(proposal.revision,0);assert.equal(proposal.financialPreview.currentCash,h.input.expectedCash);assert.equal(proposal.financialPreview.allocations.length,3);
   assert.equal(Boolean(proposal.plannedSaleCorrection),kind==='planned');assert.equal(h.calls.length,1);assert.equal(h.calls[0].statementText,h.input.statementText);unchanged(h);
   await assert.rejects(reader.readC1AccountResponse({ok:true,status:200,headers:{get:()=>null},json:async()=>({cashReview:proposal})}),error=>error.code==='ACCOUNT_RESPONSE_INVALID','Ordinary account responses still require a valid decision');
  }
 });
 await check('actual page callback retains HTTP failure handling and refuses to run before portfolio sync',async()=>{
  const h=pageHarness();await assert.rejects(h.review(h.input.statementText,-1),/account changed|reload/i);assert.equal(h.calls.length,1);unchanged(h);
  const dirty=pageHarness();dirty.box.syncDirty.current=true;
  await assert.rejects(dirty.review(dirty.input.statementText,0),/Sync the saved portfolio/);assert.equal(dirty.calls.length,0);unchanged(dirty);
 });
 await check('malformed contracts, revisions, financial values and planned allocations cannot reach review confirmation',async()=>{
  const mutations=[
   value=>{value.cashReview.contract='unrelated';},value=>{value.cashReview.reviewId='not-a-bound-proposal';},
   value=>{value.cashReview.revision++;},value=>{value.cashReview.financialValid=false;},
   value=>{value.cashReview.financialPreview.currentCash=null;},value=>{value.cashReview.financialPreview.accountingCash+=1;},
   value=>{value.cashReview.financialPreview.allocations[0].currentEquity=null;},
   value=>{value.cashReview.financialPreview.allocations[0].adjustedOperationalReference=0;},
   value=>{value.cashReview.financialPreview.allocations[1].sleeve='base';},
   value=>{value.cashReview.remainingRoundedBalanceAdjustment.amount=6;},
   value=>{value.cashReview.plannedSaleCorrection.proposalId='invalid';},
   value=>{value.cashReview.plannedSaleCorrection.rows[0].allocationsAfter[0].shares--;}
  ];
  for(const mutate of mutations){
   const h=pageHarness('planned',value=>{mutate(value);return value;});
   await assert.rejects(h.review(h.input.statementText,0),error=>error.code==='ACCOUNT_RESPONSE_INVALID'&&error.stage==='broker-cash-review');unchanged(h);
  }
 });
 await check('review body errors and the existing bounded timeout settle once without retrying or logging private content',async()=>{
  const source=fs.readFileSync('lib/c1RefreshResponse.js','utf8').replace(/export (async )?function /g,(_,async)=>(async||'')+'function ');
  const logs=[];let deadline,clears=0,reads=0;
  const box={console:{warn:(...args)=>logs.push(args)},Error,Set,Number,Array,setTimeout:(run,ms)=>{assert.equal(ms,90000);deadline=run;return 4;},clearTimeout:id=>{assert.equal(id,4);clears++;}};
  vm.createContext(box);vm.runInContext(source+';globalThis.read=readC1BrokerCashReviewResponse;',box);
  const response={ok:true,status:200,headers:{get:()=>null},json:()=>{reads++;return new Promise(()=>{});}};
  const pending=box.read(response,{expectedRevision:0});await Promise.resolve();deadline();
  await assert.rejects(pending,error=>error.code==='ACCOUNT_RESPONSE_TIMEOUT'&&error.stage==='broker-cash-review');assert.equal(reads,1);assert.equal(clears,1);
  for(const [name,code]of [['SyntaxError','ACCOUNT_RESPONSE_JSON_INVALID'],['TypeError','ACCOUNT_RESPONSE_INTERRUPTED']]){
   await assert.rejects(box.read({...response,json:async()=>{const error=new Error('PRIVATE_STATEMENT_BODY');error.name=name;throw error;}},{expectedRevision:0}),error=>error.code===code&&!error.message.includes('PRIVATE'));
  }
  for(const [prefix,line]of logs){assert.equal(prefix,'C1_REFRESH_FAILURE');const log=JSON.parse(line);assert.equal(log.stage,'broker-cash-review');assert.deepEqual(Object.keys(log).sort(),['code','requestId','stage','status']);assert(!line.includes('PRIVATE'));}
 });
 await check('actual page callback unlocks after a stalled read-only request without retrying or accepting late headers',async()=>{
  const source=fs.readFileSync('lib/c1RefreshResponse.js','utf8').replace(/export (async )?function /g,(_,async)=>(async||'')+'function ');
  let deadline,clears=0,settle,bodyReads=0;
  const clocked={console:{warn(){}},Error,Set,Number,Array,setTimeout:(run,ms)=>{assert.equal(ms,90000);deadline=run;return 8;},clearTimeout:id=>{assert.equal(id,8);clears++;}};
  vm.createContext(clocked);vm.runInContext(source+';globalThis.request=requestC1BrokerCashReview;',clocked);
  const h=pageHarness();h.box.requestC1BrokerCashReview=clocked.request;
  h.box.fetch=(url,options)=>{assert.equal(url,'/api/c1-account');assert.equal(options.method,'POST');assert.equal(options.cache,'no-store');
   const body=JSON.parse(options.body);assert.equal(body.operation,'review-broker-cash-history');h.calls.push(body);return new Promise(resolve=>{settle=resolve;});};
  const pending=h.review(h.input.statementText,0);await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(h.busy,[true]);assert.equal(h.calls.length,1);assert(deadline);
  deadline();await assert.rejects(pending,error=>error.code==='ACCOUNT_RESPONSE_TIMEOUT'&&error.stage==='broker-cash-review'&&/read-only brokerage cash review timed out/.test(error.message));
  unchanged(h);assert.equal(clears,1);assert.equal(h.state.reads,0);
  settle({ok:true,status:200,json:async()=>{bodyReads++;return {};}});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(bodyReads,0,'A late response cannot publish an expired review');assert.equal(h.calls.length,1,'Timeout cannot automatically retry a request');unchanged(h);
 });
 console.log(`PASS: ${cases} actual review response flows; real Home callback + handler contract, strict dedicated proposal validation, unchanged decision validation, bounded body failure and no writes.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});

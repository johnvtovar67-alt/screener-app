// Fictional private draft/account bindings through actual page callbacks and
// the actual authenticated HTTP handler. No network or financial writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),Module=require('node:module'),{createHash}=require('node:crypto');
const babel=require('next/dist/compiled/babel/core');
function fixtureExports(name,boundary,exports){
 const file=path.resolve('tools/'+name),source=fs.readFileSync(file,'utf8'),at=source.indexOf(boundary);assert(at>0);
 const fixture=new Module(file,module);fixture.filename=file;fixture.paths=Module._nodeModulePaths(path.dirname(file));
 fixture._compile(source.slice(0,at)+'\nmodule.exports={'+exports+'};',file);return fixture.exports;
}
const {harness}=fixtureExports('c1-broker-cash-api-regression.cjs','\nlet cases=0;','harness'),
 {pageHarness}=fixtureExports('c1-broker-cash-review-response-regression.cjs','\nlet cases=0;','pageHarness'),
 target=createHash('sha256').update('fictional_cash_review_key_'.repeat(2)).digest('hex'),
 message='This private recovery link belongs to a different C1 account.';
let checks=0;
(async()=>{
 for(const operation of ['review-broker-cash-history','confirm-broker-cash-history']){
  for(const wrong of ['0'.repeat(64),'',null,17,{},[],target.toUpperCase(),' '+target]){
   const h=harness(),before=JSON.stringify(h.state.account),response=await h.request({operation,targetAccountHash:wrong,statementText:'PRIVATE_FICTIONAL_DRAFT',expectedRevision:0,confirmed:true});
   assert.equal(response.statusCode,422);assert.equal(response.body.code,'ACCOUNT_VALIDATION_FAILED');assert.equal(response.body.error,message);
   assert.equal(h.state.reads,0,'A wrong-account draft cannot even read a saved account');assert.equal(h.state.portfolioReads,0);assert.equal(h.state.providerCalls,0);assert.equal(h.state.writeAttempts,0);assert.equal(JSON.stringify(h.state.account),before);
   assert(!JSON.stringify(response.body).includes('PRIVATE_FICTIONAL_DRAFT'));checks++;
  }
 }
 for(const bound of [false,true]){
  const h=harness(),before=JSON.stringify(h.state.account),body={operation:'review-broker-cash-history',statementText:h.input.statementText,expectedRevision:0,...(bound?{targetAccountHash:target}:{})},response=await h.request(body);
  assert.equal(response.statusCode,200,JSON.stringify(response.body));assert.equal(response.body.cashReview.financialValid,true);assert.equal(h.state.portfolioReads,1);assert.equal(h.state.writeAttempts,0);assert.equal(JSON.stringify(h.state.account),before);
  const denied=await h.request({operation:'confirm-broker-cash-history',statementText:h.input.statementText,reviewId:response.body.cashReview.reviewId,expectedRevision:0,confirmed:false,...(bound?{targetAccountHash:target}:{})});
  assert.equal(denied.statusCode,422);assert.match(denied.body.error,/Confirm the reviewed/);assert.equal(h.state.writeAttempts,0,'An account binding never grants financial approval');checks++;
 }
 const denied=harness(),unauthorized=await denied.request({operation:'review-broker-cash-history',targetAccountHash:target},false);assert.equal(unauthorized.statusCode,401);assert.equal(denied.state.reads,0);checks++;
 const repeat=harness('planned'),original=JSON.stringify(repeat.state.account),repeated=await repeat.request({operation:'record-intraday',expectedRevision:repeat.state.account.revision,
  ticket:{id:'fictional-withheld-repeat',symbol:'LLL',side:'sell',shares:19,price:100,fee:0,executedAt:'2026-11-24T16:00:00Z',saleSelection:{kind:'planned',orderIds:['fictional-current-sale']}}});
 assert.equal(repeated.statusCode,422);assert.equal(repeated.body.error,'Review the already completed planned-sale allocation before recording another planned sale');assert.equal(repeat.state.openingCalls,0);assert.equal(repeat.state.providerCalls,0);assert.equal(repeat.state.writeAttempts,0);assert.equal(JSON.stringify(repeat.state.account),original);checks++;
 for(const binding of [undefined,'',target]){
  const h=pageHarness();await h.review(h.input.statementText,0,binding);assert.equal(h.calls.length,1);assert.equal(h.calls[0].targetAccountHash,binding||undefined);assert.equal(Object.hasOwn(h.calls[0],'targetAccountHash'),Boolean(binding));assert.equal(h.state.writeAttempts,0);checks++;
 }
 const file=path.resolve('pages/index.js'),page=fs.readFileSync(file,'utf8'),ast=babel.parseSync(page,{sourceType:'module',babelrc:false,configFile:false,parserOpts:{plugins:['jsx']}}),
  home=ast.program.body.find(row=>row.type==='ExportDefaultDeclaration').declaration,node=home.body.body.find(row=>row.type==='FunctionDeclaration'&&row.id.name==='confirmBrokerCashHistory');assert(node);
 for(const binding of [undefined,'',target]){
  const calls=[],busy=[],box={Error,setAccountBusy:value=>busy.push(value),setErr(){},refreshC1Account:async body=>{calls.push(body);throw Error('Fictional prewrite boundary');}};
  vm.createContext(box);vm.runInContext(page.slice(node.start,node.end)+';globalThis.confirm=confirmBrokerCashHistory;',box);
  await assert.rejects(box.confirm({reviewId:'a'.repeat(64),statementText:'FICTIONAL',expectedRevision:0,confirmed:true,targetAccountHash:binding}),/Fictional prewrite/);
  assert.equal(calls.length,1);assert.equal(calls[0].targetAccountHash,binding||undefined);assert.equal(Object.hasOwn(calls[0],'targetAccountHash'),Boolean(binding));assert.deepEqual(busy,[true,false]);checks++;
 }
 const navigation=home.body.body.find(row=>row.type==='ExpressionStatement'&&row.expression?.callee?.name==='useEffect'&&page.slice(row.start,row.end).includes('#c1-broker-cash-review='));assert(navigation);
 const tabs=[],listeners=new Map(),location={hash:'#c1-broker-cash-review=FICTIONAL_PRIVATE_DRAFT'};let cleanup;
 const box={useEffect:run=>{cleanup=run();},setTab:tab=>tabs.push(tab),window:{location,addEventListener:(name,run)=>listeners.set(name,run),removeEventListener:(name,run)=>{assert.equal(listeners.get(name),run);listeners.delete(name);}}};
 vm.createContext(box);vm.runInContext(page.slice(navigation.start,navigation.end),box);assert.deepEqual(tabs,['account-tools']);assert.equal(location.hash,'#c1-broker-cash-review=FICTIONAL_PRIVATE_DRAFT','Navigation does not discard the private draft');
 location.hash='#unrelated';listeners.get('hashchange')();assert.equal(tabs.length,1);location.hash='#c1-broker-cash-review=NEXT_FICTIONAL_DRAFT';listeners.get('hashchange')();assert.equal(tabs.length,2);cleanup();assert.equal(listeners.size,0);checks++;
 assert(page.includes("ready={syncStatus==='Synced'&&!syncDirty.current&&!reloading&&!loading}"));
 console.log(`PASS: ${checks} private cash-review account boundaries; strict optional account hash, pre-source mismatch rejection, unchanged authentication/financial checks, actual callback forwarding and zero automatic writes.`);
})().catch(error=>{console.error(error);process.exitCode=1;});

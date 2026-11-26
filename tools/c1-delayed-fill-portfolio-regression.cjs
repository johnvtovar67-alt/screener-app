// Real Home callbacks, authentic fictional-account receipts, and the actual
// portfolio route with ordered memory standing in for private Blob storage.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const babel=require('next/dist/compiled/babel/core');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const {harness}=require('./c1-broker-cash-api-regression.cjs');

const page=fs.readFileSync('pages/index.js','utf8');
const ast=babel.parseSync(page,{sourceType:'module',configFile:false,babelrc:false,parserOpts:{plugins:['jsx']}});
const home=ast.program.body.find(row=>row.type==='ExportDefaultDeclaration').declaration;
const names=['publishC1AccountState','refreshC1Account','captureC1PortfolioInput','syncC1RecordedPortfolio',
 'saveC1Intraday','pushCloudPortfolio','pullCloudPortfolio','disconnectSync','save'];
const source=names.map(name=>{
 const node=home.body.body.find(row=>row.type==='FunctionDeclaration'&&row.id.name===name);assert(node,name);
 return page.slice(node.start,node.end);
}).join('\n');
const loader=createResearchModuleLoader(process.cwd());
const clone=value=>JSON.parse(JSON.stringify(value));
const position=(rows,symbol)=>rows.find(row=>row.symbol===symbol);

async function exercise(mode){
 const h=harness(),{state,key}=h;
 const recordedAt=state.now;
 if(mode==='normal')state.now=new Date('2026-11-24T16:58:00.000Z');
 const cashReview=await h.review(),verifiedCash=await h.request(h.confirmPayload(cashReview));
 assert.equal(verifiedCash.statusCode,200);state.now=recordedAt;state.allowOpening=true;
 const originalAccount=clone(state.account),initialRows=clone(state.portfolioRecord.portfolio),initialEtag=state.portfolioRecord.etag;
 const writes=[],records=[],messages=[],analyses=[],statuses=[];
 const storage=new Map([['key',key],['portfolio',JSON.stringify(initialRows)]]);
 let resumeReceipt,acceptReceipt;
 const held=new Promise(resolve=>{acceptReceipt=resolve;});
 const box={...loader.load('lib/c1AccountPortfolio.js'),...loader.load('lib/c1NonCashPortfolio.js'),
  ...loader.load('lib/c1RefreshResponse.js'),...loader.load('lib/c1JourneyClient.js'),
  Error,KEY:'portfolio',SYNC_KEY:'key',C1_DRAWDOWN_KEY:'risk',syncKey:key,c1Control:null,accountView:null,portfolio:initialRows,
  accountRequestId:{current:0},syncPullId:{current:0},syncWriteId:{current:0},syncRevision:{current:{}},
  syncDirty:{current:false},syncQueue:{current:Promise.resolve()},
  localStorage:{getItem:name=>storage.get(name)||null,setItem:(name,value)=>storage.set(name,value),removeItem:name=>storage.delete(name)},
  setAccountView:value=>{box.accountView=value;},setPortfolio:value=>{box.portfolio=value;},setSyncStatus:value=>statuses.push(value),
  setAccountBusy(){},setAccountAbsent(){},setAccountError(){},setAccountResponseVerified(){},setAnalysisCapitalReady(){},setResults(){},
  setSyncKey(){},setSyncInput(){},setErr:value=>messages.push(value),analyze:async rows=>analyses.push(clone(rows)),
  fetch:async(url,options)=>{
   assert.equal(options.headers.authorization,'Bearer '+key);
   const method=options.method||'GET',body=options.body?JSON.parse(options.body):undefined;
   if(url==='/api/c1-account'){
    const result=await h.request(body);
    if(body?.operation==='record-intraday'){
     records.push(result.statusCode);
     assert.equal(result.statusCode,200,result.body.error);
     if(mode==='ownership-edit'||mode==='disconnect')await new Promise(resolve=>{resumeReceipt=resolve;acceptReceipt();});
    }
    return {ok:result.statusCode===200,status:result.statusCode,json:async()=>clone(result.body)};
   }
   assert.equal(url,'/api/portfolio-sync');
   if(method==='PUT'&&mode==='conflict'&&!writes.length){
    const newer=await h.portfolioRequest('PUT',{portfolio:initialRows.filter(row=>row.symbol!=='CORC'),expectedEtag:initialEtag});
    assert.equal(newer.statusCode,200,'A different device commits its edit before the projected write');
   }
   const result=await h.portfolioRequest(method,body);
   if(method==='PUT'){
    writes.push({status:result.statusCode,etag:body.expectedEtag});
    if(mode==='uncertain')throw new TypeError('Connection lost after actual storage commit');
    if(mode==='missing-identity')return {ok:true,status:200,json:async()=>({ok:true})};
   }
   return {ok:result.statusCode===200,status:result.statusCode,json:async()=>clone(result.body)};
  }};
 require('./fixtures/c1-stop-observer-bindings.cjs').bindC1StopOwnershipObserver(box,page);
 require('./c1-approved-repair-client-bindings.cjs').bindC1ApprovedRepairClientHelpers(box,page);
 require('./c1-core-cash-client-bindings.cjs').bindC1CoreCashClient(box,page);
 vm.createContext(box);vm.runInContext(source,box);
 assert(await box.pullCloudPortfolio(key));
 const before=(await box.refreshC1Account()).decision;
 const ticket={id:'fictional-scope-sale-'+mode,symbol:'LLL',side:'sell',shares:1,price:101,fee:0,
  executedAt:'2026-11-24T16:59:00.000Z',recordingReason:'owner-discretionary-exit'};
 const pending=box.saveC1Intraday(ticket,before.revision);
 if(mode==='ownership-edit'||mode==='disconnect'){
  await held;
  if(mode==='ownership-edit'){
   box.save(initialRows.map(row=>row.symbol==='CORC'?{...row,role:'Swing'}:row));
   await box.syncQueue.current;
  }else box.disconnectSync();
  resumeReceipt();
 }
 if(mode==='disconnect')await assert.rejects(pending,/Trade save was interrupted/);
 else{
  const acknowledged=await pending;
  assert.equal(acknowledged.ticket.id,ticket.id);
  if(mode==='normal'){
   assert.equal(acknowledged.warning,'');
   assert(Date.parse(before.brokerageCashObservedAt)<Date.parse(ticket.executedAt));
   assert.equal(acknowledged.view.decision.brokerageCash,before.brokerageCash+101,'Sale after the observation increases the effective balance once');
  }
  else assert.match(acknowledged.warning,/trade is saved.*do not enter this trade again/i);
 }
 assert.deepEqual(records,[200]);
 assert.equal(state.account.intradayActivity.tickets.length,1);
 assert.equal(state.account.intradayActivity.tickets[0].id,ticket.id);
 assert.equal(state.account.intradayActivity.fills.reduce((value,fill)=>value+fill.price*fill.shares-fill.fee,0),101);
 for(const field of ['adoption','records','sourceHashes','cashAccountingCorrections','brokerageCash'])assert.deepEqual(state.account[field],originalAccount[field],field);
 assert.equal(state.providerCalls,0);
 const readback=await h.portfolioRequest('GET'),stored=readback.body.portfolio,fullSwingShares=mode==='conflict'||mode==='ownership-edit'||mode==='disconnect';
 assert.equal(readback.statusCode,200);
 assert.equal(position(stored,'LLL').shares,fullSwingShares?100:99);
 assert.equal(position(stored,'LLL').avgCost,position(initialRows,'LLL').avgCost);
 assert.equal(Date.parse(position(stored,'LLL').openedAt),Date.parse(position(initialRows,'LLL').openedAt));
 if(mode==='conflict')assert(!position(stored,'CORC'),'The newer external Core removal remains saved');
 else assert.equal(position(stored,'CORC').role,mode==='ownership-edit'?'Swing':'Core');
 if(mode==='conflict'||mode==='ownership-edit')assert(readback.body.coreCashChangeTimes.includes(state.now.toISOString()));
 assert.deepEqual(writes,mode==='disconnect'?[]:[{status:mode==='conflict'?409:200,etag:initialEtag}]);
 const clean=mode==='normal'||mode==='ownership-edit'||mode==='disconnect';
 assert.equal(box.syncDirty.current,!clean);
 if(mode==='normal'){
  assert.equal(analyses.length,1);assert.equal(box.syncRevision.current.etag,readback.body.etag);assert.equal(statuses.at(-1),'Synced');
 }else{
  assert.equal(analyses.length,0,'The competing or unconfirmed portfolio must not trigger a new analysis');
  if(!clean)assert.equal(box.syncRevision.current.etag,initialEtag,'A conflicted or unknown write cannot advance acknowledged identity');
  if(mode==='conflict')assert.match(statuses.at(-1),/^Sync conflict/);
  if(mode==='uncertain'||mode==='missing-identity')assert.match(statuses.at(-1),/^Sync error/);
  if(mode==='disconnect')assert.equal(statuses.at(-1),'Sync disconnected on this device.');
  else assert.match(messages.at(-1),/do not enter this trade again/);
 }
 console.log('PASS: actual C1/account and strong conditional portfolio routes, '+mode+'.');
}

(async()=>{for(const mode of ['normal','ownership-edit','conflict','uncertain','missing-identity','disconnect'])await exercise(mode);})()
 .catch(error=>{console.error(error);process.exitCode=1;});

// Fictional accounting and UI examples only. The actual account service,
// recorder component, API handler, recovery and conditional saver run here.
// External provider/storage boundaries use memory; this is behavior evidence,
// never a claim about investment performance or the owner's production account.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const {createWorkflowFixture}=require('./fixtures/c1-trading-workflow.cjs');
const root=process.cwd(),clone=value=>JSON.parse(JSON.stringify(value));
const same=(actual,expected,message)=>assert.equal(JSON.stringify(actual),JSON.stringify(expected),message);
const loader=createResearchModuleLoader(root),recovery=loader.load('lib/c1SaleAttributionRecovery.js');
const date='2026-11-25',now=new Date(date+'T17:00:00.000Z');

async function fictionalAccount(){
 const workflow=createWorkflowFixture('buy',{baselineDate:'2026-11-24',portfolio:[
  {symbol:'LLL',role:'Swing',shares:100,avgCost:100,openedAt:'2026-11-24'},
  {symbol:'CASH',role:'Swing',shares:3000,avgCost:1}
 ]});
 workflow.setCash(3000);
 const prepared=await workflow.prepare(),plan=clone(prepared.openingPlan);
 // The legacy attribution defect is injected into otherwise real adopted
 // books and normal opening evidence. No actual loss event is asserted.
 const target={id:'fictional-sector-loss',sleeve:'sector40',symbol:'LLL',side:'sell',shares:25,
  estimatedPrice:99,reason:'portfolio-drawdown-stop',date};
 plan.orders=[target,...plan.orders.filter(order=>order.side==='sell'&&order.symbol==='LLL')];
 const ticket={id:'fictional-completed-sale',symbol:'LLL',side:'sell',shares:25,price:99,fee:.25,executedAt:date+'T15:01:00.000Z'};
 const fills=[['base',6,.06],['cooldown15',13,.13],['sector40',6,.06]].map(([sleeve,shares,fee])=>({
  ...ticket,id:ticket.id+':'+sleeve,orderId:sleeve==='sector40'?target.id:plan.orders.find(order=>order.sleeve===sleeve&&order.condition).id,shares,fee
 }));
 const account={...workflow.account,revision:7,intradayActivity:{date,openingObservedAt:plan.observedAt,plan,fills,tickets:[ticket]}};
 return {account,book:workflow.book,service:workflow.service};
}

function apiFixture(initial,book){
 const state={account:clone(initial),etag:'"fictional-original-etag"',writes:0,writeAttempts:0,providerCalls:0,conflict:false,book:clone(book)};
 const unexpected=()=>{state.providerCalls++;throw new Error('External I/O forbidden in this recovery fixture');};
 const imports={},file=path.resolve('pages/api/c1-account.js');
 const source=fs.readFileSync(file,'utf8').replace(/import\s*{([^}]+)}\s*from\s*['"]([^'"]+)['"];?/g,(_,names,request)=>{
  const values=request==='@vercel/blob'?{get:unexpected,put:unexpected}:
   request.endsWith('c1DatedBookStore')?{readStoredC1DatedBook:unexpected}:
   request.endsWith('c1OwnerAccess')?require('./c1-owner-access-extraction.cjs').ownerAccessFixture():loader.load(request,file);
  for(const name of names.split(',').map(part=>part.trim())){assert(name in values,request+' exports '+name);imports[name]=values[name];}
  return '';
 }).replace(/export const /g,'const ').replace(/export function /g,'function ')
  .replace('export default createC1AccountHandler();','globalThis.factory=createC1AccountHandler;');
 const box={...imports,Date,Response,process:{env:{}},console:{info(){},warn(){},error(){}}};
 vm.createContext(box);vm.runInContext(source,box,{filename:file});
 const handler=box.factory({environment:'preview',commit:'fictional-recovery-test',clock:()=>now,
  readBook:async()=>({record:clone(state.book)}),collectOpening:unexpected,collectHoldings:unexpected,collectRanks:unexpected,readPortfolio:unexpected,
  store:{read:async()=>({record:clone(state.account),etag:state.etag}),write:async(_path,account,etag)=>{
   state.writeAttempts++;assert.equal(etag,state.etag,'The normal saver must retain the strong ETag');
   if(state.conflict)throw Object.assign(new Error('Fictional precondition failure'),{name:'BlobPreconditionFailedError',status:412});
   state.account=clone(account);state.writes++;state.etag='"fictional-written-'+state.writes+'"';
  }}
 });
 return {state,async request(body,authorized=true){
  const response={headers:{},setHeader(name,value){this.headers[name]=value;},status(status){this.statusCode=status;return this;},json(value){this.body=value;return this;}};
  await handler({method:body?'POST':'GET',body,headers:authorized?{authorization:'Bearer '+'fictional_recovery_key_'.repeat(3)}:{}},response);
  assert.equal(response.headers['Cache-Control'],'no-store');return response;
 }};
}

function componentFixture(session,onConfirm){
 const React=require('react'),babel=require('next/dist/compiled/babel/core');let active;
 const mockReact={...React,useMemo:calculate=>calculate(),useState:initial=>{
  const index=active.index++;if(!(index in active.values))active.values[index]=typeof initial==='function'?initial():initial;
  return [active.values[index],value=>{active.values[index]=typeof value==='function'?value(active.values[index]):value;}];
 }};
 const file=path.resolve('components/C1IntradayActivity.js'),compiled=babel.transformSync(fs.readFileSync(file,'utf8'),{
  filename:file,babelrc:false,configFile:false,presets:[[require.resolve('next/babel'),{'preset-env':{modules:'commonjs'}}]]
 }).code,moduleRecord={exports:{}};
 new Function('require','module','exports',compiled)(name=>name==='react'?mockReact:
  name.startsWith('@babel/runtime/')?require('next/dist/compiled/'+name):require(name),moduleRecord,moduleRecord.exports);
 const Component=moduleRecord.exports.default,parent={values:[],index:0},child={values:[],index:0};
 const nodes=node=>!node||typeof node!=='object'?[]:[node,...React.Children.toArray(node.props?.children).flatMap(nodes)];
 const text=node=>node==null||typeof node==='boolean'?'':typeof node==='string'||typeof node==='number'?String(node):React.Children.toArray(node.props?.children).map(text).join('');
 let busy=false,newTrades=0;
 function render(){
  active=parent;parent.index=0;
  const tree=Component({session,onSave:()=>{newTrades++;throw Error('Allocation correction must never record another trade');},onCorrectAttribution:onConfirm,busy});
  const review=nodes(tree).find(node=>typeof node.type==='function'&&node.props.review);
  assert(review,'The actual recorder must include its correction review');
  active=child;child.index=0;return review.type(review.props);
 }
 const find=predicate=>{const node=nodes(render()).find(predicate);assert(node,'Expected actual correction review control');return node;};
 return {session,render,text:()=>text(render()),get newTrades(){return newTrades;},setBusy(value){busy=value;},
  checkbox:()=>find(node=>node.type==='input'&&node.props.type==='checkbox'),
  button:()=>find(node=>node.type==='button'),
  approve(){this.checkbox().props.onChange({target:{checked:true}});}
 };
}

(async()=>{
 const {account,book,service}=await fictionalAccount(),before=clone(account),api=apiFixture(account,book);
 let response=await api.request(undefined,false);assert.equal(response.statusCode,401);assert.equal(api.state.writes,0);
 response=await api.request();assert.equal(response.statusCode,200,JSON.stringify(response.body));
 const review=response.body.intradaySession.saleAttributionReview;
 assert.equal(review.status,'confirmation-required');assert.equal(review.revision,7);assert.equal(review.rows[0].remainingShares,75);
 assert.equal(api.state.writes,0,'Displaying the actual account review is read-only');same(api.state.account,before);
 const payload={operation:'correct-sale-attribution',proposalId:review.proposalId,expectedRevision:7,confirmed:true};
 for(const [patch,status]of [[{confirmed:false},422],[{expectedRevision:6},409],[{proposalId:'0'.repeat(64)},409]]){
  response=await api.request({...payload,...patch});assert.equal(response.statusCode,status,JSON.stringify(response.body));assert.equal(response.body.retryable,false);assert.equal(api.state.writeAttempts,0);same(api.state.account,before);
 }
 api.state.conflict=true;response=await api.request(payload);assert.equal(response.statusCode,409);assert.equal(response.body.code,'ACCOUNT_SAVE_CONFLICT');assert.equal(api.state.writes,0);same(api.state.account,before);api.state.conflict=false;
 response=await api.request(payload);assert.equal(response.statusCode,200,JSON.stringify(response.body));assert.equal(api.state.writes,1);
 assert.equal(response.body.saleAttributionReceipt.proposalId,review.proposalId);assert.equal(response.body.intradaySession.saleAttributionReview.status,'applied');
 const next=clone(api.state.account),decision=service.deriveC1AccountAnalysis({account:next,book,now}).decision;
 assert.equal(decision.positions.find(row=>row.symbol==='LLL').shares,75);
 assert.equal(response.body.decision.positions.find(row=>row.symbol==='LLL').shares,75);
 same(next.intradayActivity.tickets,before.intradayActivity.tickets);same(next.records,before.records);same(next.brokerageCash,before.brokerageCash);
 assert.equal(next.saleAttributionCorrections.length,1);assert.equal(next.intradayActivity.fills.length,1);assert.equal(next.intradayActivity.fills[0].shares,25);
 assert(Math.abs(response.body.decision.strategyCash-5474.75)<1e-8);
 response=await api.request(payload);assert.equal(response.statusCode,200);assert.equal(api.state.writes,1,'A duplicate confirmation returns its receipt without a second financial write');same(api.state.account,next);
 response=await api.request();assert.equal(response.statusCode,200);assert.equal(response.body.intradaySession.saleAttributionReview.status,'applied');assert.equal(api.state.writes,1);
 assert.equal(api.state.providerCalls,0,'The correction cannot invoke market providers or production jobs');
 // An accepted-book identity failure must occur before conditional persistence.
 const bad=apiFixture(account,book);bad.state.book.captures.at(-1).hash='changed-accepted-source';
 response=await bad.request(payload);assert.equal(response.statusCode,500);assert.equal(response.body.code,'ACCOUNT_INPUT_INTEGRITY_FAILED');assert.equal(bad.state.writeAttempts,0);same(bad.state.account,before);
 console.log('PASS actual account-handler read/review/confirm/reload, real economic derivation, original broker facts, strong ETag conflict, safe validation, one write and pre-save accepted-source rejection');

 const uiReview=clone(review);uiReview.rows[0].basisAfter-=12.34;
 const calls=[],session={date,revision:7,plan:account.intradayActivity.plan,fills:account.intradayActivity.fills,tickets:account.intradayActivity.tickets,saleAttributionReview:uiReview};
 const ui=componentFixture(session,async(proposalId,revision)=>{calls.push({proposalId,revision});return {proposalId};});
 assert.equal(ui.checkbox().props.checked,false);assert.equal(ui.button().props.disabled,true);
 assert(ui.text().includes('Recorded sale split: 6 Base, 13 15-session allocation, 6 40% sector allocation'));
 assert(ui.text().includes('Corrected sale split: 25 40% sector allocation'));
 assert(ui.text().includes('$7500.00 → $7487.66'),'The actual review exposes the derived-basis difference before approval');
 assert(ui.text().includes('Remaining account holding: 75 shares'));
 ui.approve();assert.equal(ui.button().props.disabled,false);
 ui.setBusy(true);assert.equal(ui.checkbox().props.disabled,true);assert.equal(ui.button().props.disabled,true);await ui.button().props.onClick();assert.equal(calls.length,0);ui.setBusy(false);
 // A refreshed proposal must require a fresh confirmation even in a mounted form.
 session.saleAttributionReview={...uiReview,proposalId:'1'.repeat(64),revision:8};assert.equal(ui.checkbox().props.checked,false);assert.equal(ui.button().props.disabled,true);
 ui.approve();await ui.button().props.onClick();same(calls,[{proposalId:'1'.repeat(64),revision:8}]);assert.equal(ui.newTrades,0);
 assert(ui.text().includes('Sale allocation correction saved. Do not record these sales again.'));
 session.saleAttributionReview={...uiReview,status:'applied'};assert(ui.text().includes('Sale allocation correction saved. Original broker trades'));
 console.log('PASS actual React review disclosure, explicit proposal-bound confirmation, busy/stale controls, exact id/revision callback and no new-trade action');
 console.log('PASS: fictional UI/API recovery path only; production account and browser remain separately verifiable.');
})().catch(error=>{console.error(error);process.exitCode=1;});

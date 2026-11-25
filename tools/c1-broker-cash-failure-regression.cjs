// Actual HTTP handler fault boundaries with fictional memory state. Faults
// replace only the financial-review call, never its production error mapper.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd()),file=path.resolve('pages/api/c1-account.js'),clone=value=>JSON.parse(JSON.stringify(value));
const secret='PRIVATE_account_key_123_provider=https://private.example/?token=PRIVATE_789',operations=['review-broker-cash-history','confirm-broker-cash-history'];
function fixture(){
 const account={contract:'c1-private-account-v1',revision:7,adoption:{sourceSessionDate:'2026-11-23'},records:[],privateSentinel:secret},
  state={account:clone(account),writes:0,reviewCalls:0,confirmCalls:0,logs:[],error:Error('Cash accounting: detached financial cash differs from its trusted model replay')},imports={},never=()=>{throw Error('Unexpected external access');};
 const source=fs.readFileSync(file,'utf8').replace(/import\s*{([^}]+)}\s*from\s*['"]([^'"]+)['"];?/g,(_,names,request)=>{
  const values=request==='@vercel/blob'?{get:never,put:never}:request.endsWith('c1DatedBookStore')?{readStoredC1DatedBook:never}:request.endsWith('c1OwnerAccess')?require('./c1-owner-access-extraction.cjs').ownerAccessFixture():loader.load(request,file);
  for(const name of names.split(',').map(value=>value.trim())){assert(name in values);imports[name]=values[name];}return '';
 }).replace(/export const /g,'const ').replace(/export function /g,'function ').replace('export default createC1AccountHandler();','globalThis.factory=createC1AccountHandler;');
 Object.assign(imports,{
  reviewC1BrokerCashCorrection:()=>{state.reviewCalls++;throw state.error;},
  confirmC1BrokerCashCorrection:()=>{state.confirmCalls++;if(!state.failAfterConfirm)throw state.error;return clone(state.account);},
  deriveC1AccountAnalysis:()=>{throw state.error;},
 });
 const box={...imports,Date,Response,process:{env:{}},console:{warn:(...args)=>state.logs.push(args.join(' ')),info(){},error(){}}};
 vm.createContext(box);vm.runInContext(source,box,{filename:file});
 const handler=box.factory({environment:'preview',commit:'a'.repeat(40),clock:()=>new Date('2026-11-24T17:00:00Z'),
  readBook:async()=>({record:{model:{sessions:[{date:'2026-11-23'}]}}}),readPortfolio:async()=>({portfolio:[],etag:'"fictional-portfolio"'}),
  collectOpening:never,collectHoldings:never,collectRanks:never,
  store:{read:async()=>({record:clone(state.account),etag:'"fictional-account"'}),write:async()=>{state.writes++;throw Error('Unexpected financial write');}}});
 return {state,async request(operation){
  const res={headers:{},setHeader(name,value){this.headers[name]=value;},status(value){this.statusCode=value;return this;},json(value){this.body=value;return this;}};
  await handler({method:'POST',headers:{authorization:'Bearer '+'fictional_diagnostic_key_'.repeat(2)},body:{operation,statementText:secret,reviewId:'b'.repeat(64),expectedRevision:7,confirmed:true}},res);return res;
 }};
}
(async()=>{
 let checks=0;
 for(const operation of operations){
  const f=fixture(),before=JSON.stringify(f.state.account),response=await f.request(operation),diagnostic=response.body.diagnostic;
  assert.equal(response.statusCode,500);assert.equal(response.body.code,'ACCOUNT_ANALYSIS_FAILED');assert.equal(response.body.retryable,false);
  assert.equal(diagnostic.operation,operation);assert.equal(diagnostic.stage,operation==='review-broker-cash-history'?'broker-cash-review':'broker-cash-confirm');
  assert.equal(diagnostic.reasonId,'CASH_ACCOUNTING_INVARIANT');assert.match(diagnostic.fingerprint,/^[a-f0-9]{16}$/);
  assert.match(response.body.error,/detached financial cash differs from its trusted model replay/);
  assert.equal(f.state.writes,0);assert.equal(f.state.reviewCalls+f.state.confirmCalls,1,'A failed financial request is never retried');assert.equal(JSON.stringify(f.state.account),before);
  assert.equal(response.body.requestId,response.headers['X-C1-Request-Id']);
  const log=JSON.parse(f.state.logs.at(-1).slice('C1_ACCOUNT_API_FAILURE '.length));assert.equal(log.operation,operation);assert.equal(log.fingerprint,diagnostic.fingerprint);
  const fingerprint=diagnostic.fingerprint;const again=await f.request(operation);assert.equal(again.body.diagnostic.fingerprint,fingerprint,'The same invariant has a stable bounded fingerprint');
  assert(!JSON.stringify({response:response.body,logs:f.state.logs}).includes(secret));checks++;
 }
 for(const [message,reasonId]of [
  ['The corrected cash does not reconcile to the confirmed brokerage balance','CASH_REVIEW_INVARIANT'],
  ['Recorded execution evidence does not match the completed account','ACCOUNT_LEDGER_INVARIANT'],
  ['Corrected completed liquidation cash does not reconcile','RISK_EPISODE_INVARIANT'],
 ]){
  const f=fixture();f.state.error=Error(message);const response=await f.request(operations[0]);assert.equal(response.statusCode,500);assert.equal(response.body.diagnostic.reasonId,reasonId);assert(response.body.error.includes(message));assert.equal(f.state.writes,0);checks++;
 }
 for(const message of [secret,'Cash accounting: detached financial cash differs from its trusted model replay '+secret,'Unexpected failure\n'+secret]){
  const f=fixture();f.state.error=Object.assign(Error(message),{code:secret,cause:secret,stack:secret});const response=await f.request(operations[0]);
  assert.equal(response.statusCode,500);assert.equal(response.body.diagnostic.reasonId,'UNCLASSIFIED_CASH_REVIEW_FAILURE');
  assert.match(response.body.diagnostic.fingerprint,/^[a-f0-9]{16}$/);assert(!JSON.stringify({response:response.body,logs:f.state.logs}).includes(secret));assert.equal(f.state.writes,0);checks++;
 }
 for(const [message,status]of [
  ['The account changed; reload before reviewing brokerage cash history',409],
  ['Confirm the reviewed brokerage cash correction before saving',422],
  ['Accepted holding marks are required for the financial review',503],
 ]){
  const f=fixture();f.state.error=Error(message);const response=await f.request(operations[0]);assert.equal(response.statusCode,status);assert.equal(response.body.error,message);assert.equal(response.body.diagnostic,undefined);assert.equal(f.state.writes,0);checks++;
 }
 const f=fixture();f.state.failAfterConfirm=true;const response=await f.request(operations[1]);assert.equal(response.body.diagnostic.stage,'broker-cash-confirm-analysis');assert.equal(f.state.writes,0);checks++;
 const errors=loader.load('lib/c1ApiErrors.js');assert.equal(errors.c1AccountApiFailure(Error('Recorded execution evidence does not match the completed account')).diagnostic,undefined);
 assert.equal(errors.c1AccountApiFailure(Error(secret),{operation:secret,stage:secret}).diagnostic,undefined);checks++;
 console.log(`PASS: ${checks} cash-review failure boundaries; actual handler, exact static invariant copy, bounded fingerprints, review/confirm stages, preserved status classes, private redaction and zero financial writes/retries.`);
})().catch(error=>{console.error(error);process.exitCode=1;});

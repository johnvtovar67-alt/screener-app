// Actual native handler + complete existing financial review/confirmation.
// Fictional memory account, statement and market inputs only; no live access.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),Module=require('node:module'),{createHash}=require('node:crypto');
const {createResearchModuleLoader}=require('./research-module-loader.cjs'),loader=createResearchModuleLoader(process.cwd()),repair=loader.load('lib/c1ApprovedAccountRepair.js');
const clone=value=>JSON.parse(JSON.stringify(value)),same=(a,b)=>assert.equal(JSON.stringify(a),JSON.stringify(b)),key='fictional_cash_review_key_'.repeat(2),now=new Date('2026-11-24T17:00:00Z');
const fixtureFile=path.resolve('tools/c1-broker-cash-api-regression.cjs'),fixtureSource=fs.readFileSync(fixtureFile,'utf8'),at=fixtureSource.indexOf('\nlet cases=0;'),fixtureModule=new Module(fixtureFile,module);
fixtureModule.filename=fixtureFile;fixtureModule.paths=Module._nodeModulePaths(path.dirname(fixtureFile));fixtureModule._compile(fixtureSource.slice(0,at)+'\nmodule.exports={fictionalInput};',fixtureFile);
const {fictionalInput}=fixtureModule.exports;
function fixture({environment='production',configured=true,targetAccountHash}={}){
 const input=fictionalInput('planned');input.portfolioRecord.portfolio.find(row=>row.symbol==='LLL').shares=75;
 const config={contract:'c1-owner-approved-account-repair-v1',authorizationId:'c1-owner-approved-repair-20261125',targetAccountHash:targetAccountHash||createHash('sha256').update(key).digest('hex'),
  sourceEconomicFingerprint:repair.c1ApprovedAccountRepairFingerprint(input.account),portfolioFingerprint:repair.c1ApprovedRepairPortfolioFingerprint(input.portfolioRecord.portfolio),confirmedBrokerageCash:input.expectedCash,statementText:input.statementText};
 const state={account:clone(input.account),book:clone(input.book),portfolioRecord:clone(input.portfolioRecord),etag:'"fictional-before"',reads:0,writes:0,attempts:0,portfolios:0,providerCalls:0,logs:[]},never=()=>{state.providerCalls++;throw Error('Forbidden fictional external call');};
 const file=path.resolve('pages/api/c1-account.js'),imports={},source=fs.readFileSync(file,'utf8').replace(/import\s*{([^}]+)}\s*from\s*['"]([^'"]+)['"];?/g,(_,names,request)=>{
  const values=request==='@vercel/blob'?{get:never,put:never}:request.endsWith('c1DatedBookStore')?{readStoredC1DatedBook:never}:request.endsWith('c1OwnerAccess')?require('./c1-owner-access-extraction.cjs').ownerAccessFixture():loader.load(request,file);
  for(const name of names.split(',').map(part=>part.trim())){assert(name in values);imports[name]=values[name];}return '';
 }).replace(/export const /g,'const ').replace(/export function /g,'function ').replace('export default createC1AccountHandler();','globalThis.factory=createC1AccountHandler;');
 const box={...imports,Date,Response,process:{env:{}},console:{info:(...args)=>state.logs.push(args.join(' ')),warn:(...args)=>state.logs.push(args.join(' ')),error:(...args)=>state.logs.push(args.join(' '))}};
 vm.createContext(box);vm.runInContext(source,box,{filename:file});
 const handler=box.factory({environment,commit:'a'.repeat(40),approvedRepairConfiguration:configured?JSON.stringify(config):undefined,clock:()=>now,
  readBook:async()=>({record:clone(state.book)}),readPortfolio:async()=>{state.portfolios++;return clone(state.portfolioRecord);},collectOpening:never,collectHoldings:never,collectRanks:never,
  store:{read:async()=>{state.reads++;if(state.unreadableAfterWrite&&state.attempts)throw Error('PRIVATE_READBACK_FAILURE');return {record:clone(state.account),etag:state.etag};},
   write:async(_path,account,etag)=>{state.attempts++;assert.equal(etag,'"fictional-before"');if(state.conflict)throw Object.assign(Error('PRIVATE_ETAG'),{name:'BlobPreconditionFailedError',status:412});
    if(state.validationSpy)state.validationSpy(account);
    if(state.etag!==etag)throw Object.assign(Error('PRIVATE_ETAG'),{name:'BlobPreconditionFailedError',status:412});state.account=clone(account);state.etag='"fictional-after"';state.writes++;
    if(state.commitThenFail)throw Error('PRIVATE_TRANSPORT');}}});
 return {state,input,config,async request(body){const response={headers:{},setHeader(name,value){this.headers[name]=value;},status(value){this.statusCode=value;return this;},json(value){this.body=value;return this;}};
  await handler({method:body?'POST':'GET',headers:{authorization:'Bearer '+key},body},response);return response;}};
}
let cases=0;
async function check(name,run){await run();cases++;console.log('PASS '+name);}
(async()=>{
 await check('normal production account open applies the approved real correction once and proves readback',async()=>{
  const h=fixture(),original=clone(h.state.account);h.state.validationSpy=next=>{assert(next.cashAccountingCorrections[0]);assert(next.saleAttributionCorrections[0]);};
  const first=await h.request();assert.equal(first.statusCode,200,JSON.stringify(first.body));assert.equal(h.state.writes,1);assert.equal(h.state.attempts,1);assert(h.state.reads>=2);
  const receipt=first.body.approvedAccountRepairReceipt;assert.equal(receipt.contract,'c1-approved-account-repair-receipt-v1');assert.equal(receipt.status,'applied');assert.equal(receipt.revision,first.body.decision.revision);assert.equal(receipt.basisCorrections.length,1);
  assert.equal(first.body.decision.actualCash,h.input.expectedCash);assert.equal(first.body.saleAttributionHold,undefined);assert.equal(first.body.decision.positions.find(row=>row.symbol==='LLL').shares,75);
  same(h.state.account.adoption,original.adoption);same(h.state.account.records,original.records);same(h.state.account.intradayActivity.plan,original.intradayActivity.plan);same(h.state.account.intradayActivity.tickets,original.intradayActivity.tickets);
  same(h.state.account.saleAttributionCorrections[0].originalFills,original.intradayActivity.fills);assert.equal(h.state.providerCalls,0);
  const second=await h.request();assert.equal(second.statusCode,200);same(second.body.approvedAccountRepairReceipt,receipt);assert.equal(h.state.writes,1);assert.equal(h.state.attempts,1);
  h.state.portfolioRecord.portfolio.push({symbol:'OTHER',role:'Core',shares:1});const subsequent=await h.request();assert.equal(subsequent.statusCode,200,'A genuine applied receipt is checked before a later portfolio change');assert.equal(h.state.attempts,1);
  assert(h.state.logs.some(line=>line.startsWith('C1_APPROVED_ACCOUNT_REPAIR ')));assert(!JSON.stringify(h.state.logs).includes(h.input.statementText));
 });
 await check('nonproduction and missing configuration preserve the normal original read without writes',async()=>{
  for(const options of [{environment:'preview'},{configured:false},{targetAccountHash:'0'.repeat(64)}]){const h=fixture(options),before=clone(h.state.account),response=await h.request();assert.equal(response.statusCode,200);assert.equal(response.body.approvedAccountRepairReceipt,undefined);assert.equal(h.state.writes,0);assert.equal(h.state.portfolios,0);same(h.state.account,before);}
 });
 await check('unrelated financial mutations never trigger automatic recovery',async()=>{
  const h=fixture(),response=await h.request({operation:'update-brokerage-cash',brokerageCash:h.input.expectedCash,expectedRevision:h.state.account.revision});
  assert.equal(response.statusCode,200);assert.equal(response.body.approvedAccountRepairReceipt,undefined);assert.equal(h.state.account.approvedAccountRepairs,undefined);assert.equal(h.state.account.cashAccountingCorrections,undefined);assert.equal(h.state.account.saleAttributionCorrections,undefined);
 });
 await check('changed economic source, portfolio identity or current cash fail before a financial write',async()=>{
  for(const change of [h=>{h.state.account.positionContext=[{symbol:'LLL',shares:999}];},h=>{h.state.portfolioRecord.portfolio.find(row=>row.symbol==='LLL').shares++;},h=>{h.state.account.brokerageCash.balance++;}]){
   const h=fixture();change(h);const before=clone(h.state.account),response=await h.request();assert.equal(response.statusCode,422);assert.equal(h.state.attempts,0);same(h.state.account,before);
  }
 });
 await check('existing financial guards run before migration and cannot be bypassed by server approval',async()=>{
  const h=fixture();h.state.book.captures.find(row=>row.sessionDate===h.state.account.sourceHashes[0].date).hash='changed';const before=clone(h.state.account),response=await h.request();assert.equal(response.statusCode,500);assert.equal(h.state.attempts,0);same(h.state.account,before);
 });
 await check('conditional conflict never rebases or repeats the repair write',async()=>{
  const h=fixture();h.state.conflict=true;const response=await h.request();assert.equal(response.statusCode,409);assert.equal(h.state.attempts,1);assert.equal(h.state.writes,0);assert(h.state.reads>=2);
 });
 await check('concurrent native loads conserve one repair and both verify the actual winner',async()=>{
  const h=fixture(),responses=await Promise.all([h.request(),h.request()]);for(const response of responses){assert.equal(response.statusCode,200,JSON.stringify(response.body));assert.equal(response.body.approvedAccountRepairReceipt.status,'applied');}
  assert.equal(h.state.writes,1);assert(h.state.attempts<=2);assert.equal(h.state.account.cashAccountingCorrections.length,1);assert.equal(h.state.account.saleAttributionCorrections.length,1);
 });
 await check('an uncertain committed write succeeds only after real receipt readback, without a write retry',async()=>{
  const h=fixture();h.state.commitThenFail=true;const response=await h.request();assert.equal(response.statusCode,200,JSON.stringify(response.body));assert.equal(h.state.attempts,1);assert.equal(h.state.writes,1);assert.equal(response.body.approvedAccountRepairReceipt.status,'applied');
 });
 await check('failed readback never publishes success and a later read recovers the actual saved receipt',async()=>{
  const h=fixture();h.state.unreadableAfterWrite=true;const failed=await h.request();assert.equal(failed.statusCode,503);assert.equal(failed.body.approvedAccountRepairReceipt,undefined);assert.equal(h.state.writes,1);
  h.state.unreadableAfterWrite=false;const recovered=await h.request();assert.equal(recovered.statusCode,200);assert.equal(recovered.body.approvedAccountRepairReceipt.status,'applied');assert.equal(h.state.attempts,1);
 });
 await check('a JSON applied flag without genuine journal and allocation audits cannot authorize another write',async()=>{
  const h=fixture();assert.equal((await h.request()).statusCode,200);delete h.state.account.cashAccountingCorrections;const before=h.state.attempts,response=await h.request();assert.notEqual(response.statusCode,200);assert.equal(response.body.approvedAccountRepairReceipt,undefined);assert.equal(h.state.attempts,before);
 });
 console.log(`PASS: ${cases} native owner-approved repair flows; complete financial pipeline, source/cash/ownership binding, immutable original facts, conditional idempotence and verified real readback. Fictional behavior only.`);
})().catch(error=>{console.error(error);process.exitCode=1;});

// Actual native handler + complete existing financial review/confirmation.
// Fictional memory account, statement and market inputs only; no live access.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),Module=require('node:module'),{createHash}=require('node:crypto');
const {createResearchModuleLoader}=require('./research-module-loader.cjs'),loader=createResearchModuleLoader(process.cwd()),repair=loader.load('lib/c1ApprovedAccountRepair.js');
const clone=value=>JSON.parse(JSON.stringify(value)),same=(a,b)=>assert.equal(JSON.stringify(a),JSON.stringify(b)),key='fictional_cash_review_key_'.repeat(2),now=new Date('2026-11-24T17:00:00Z');
const fixtureFile=path.resolve('tools/c1-broker-cash-api-regression.cjs'),fixtureSource=fs.readFileSync(fixtureFile,'utf8'),at=fixtureSource.indexOf('\nlet cases=0;'),fixtureModule=new Module(fixtureFile,module);
fixtureModule.filename=fixtureFile;fixtureModule.paths=Module._nodeModulePaths(path.dirname(fixtureFile));fixtureModule._compile(fixtureSource.slice(0,at)+'\nmodule.exports={fictionalInput};',fixtureFile);
const {fictionalInput}=fixtureModule.exports;
function fixture({environment='production',configured=true,targetAccountHash,configurationTransform}={}){
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
 const handler=box.factory({environment,commit:'a'.repeat(40),approvedRepairConfiguration:configured?(configurationTransform?configurationTransform(JSON.stringify(config),clone(config)):JSON.stringify(config)):undefined,clock:()=>now,
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
  for(const [change,reasonId]of [[h=>{h.state.account.positionContext=[{symbol:'LLL',shares:999}];},'SOURCE_CHANGED'],[h=>{h.state.portfolioRecord.portfolio.find(row=>row.symbol==='LLL').shares++;},'PORTFOLIO_CHANGED'],[h=>{h.state.account.brokerageCash.balance++;},'CASH_CHANGED']]){
   const h=fixture();change(h);const before=clone(h.state.account),response=await h.request();assert.equal(response.statusCode,422);assert.equal(h.state.attempts,0);same(h.state.account,before);
   assert.equal(response.body.diagnostic?.contract,'c1-approved-account-repair-failure-v1');assert.equal(response.body.diagnostic.reasonId,reasonId);
  }
 });
 await check('hidden legacy cash aliases are metadata, never ownership or additional funding',async()=>{
  const aliases=['CASH','SWVXX','VMFXX','SPAXX','FDRXX','MMF'];
  for(const [index,symbol]of aliases.entries()){
   const h=fixture(),original=clone(h.state.account),holdings=h.state.portfolioRecord.portfolio.filter(row=>!aliases.includes(row.symbol)),core=clone(holdings.filter(row=>row.role==='Core'));
   h.state.portfolioRecord.portfolio=[...holdings,{symbol,role:index%2?'Core':'Swing',shares:987654.32,avgCost:1,openedAt:'2026-09-01',lastTradeAt:'2026-09-01'}];
   const savedPortfolio=clone(h.state.portfolioRecord.portfolio);assert.equal(repair.c1ApprovedRepairPortfolioFingerprint(savedPortfolio),repair.c1ApprovedRepairPortfolioFingerprint(holdings));
   const response=await h.request();assert.equal(response.statusCode,200,JSON.stringify(response.body));assert.equal(response.body.approvedAccountRepairReceipt.status,'applied');assert.equal(h.state.writes,1);
   assert.equal(response.body.decision.actualCash,h.input.expectedCash,'Legacy cash metadata cannot fund the account');assert.equal(response.body.decision.positions.find(row=>row.symbol==='LLL').shares,75);
   assert(!response.body.decision.positions.some(row=>aliases.includes(row.symbol)));same(h.state.portfolioRecord.portfolio,savedPortfolio);same(h.state.portfolioRecord.portfolio.filter(row=>row.role==='Core'&&!aliases.includes(row.symbol)),core);
   same(h.state.account.adoption,original.adoption);same(h.state.account.records,original.records);same(h.state.account.intradayActivity.plan,original.intradayActivity.plan);same(h.state.account.intradayActivity.tickets,original.intradayActivity.tickets);
  }
 });
 await check('admission diagnostics identify only bounded source, cash and portfolio reasons without leaking values',async()=>{
  const secret='PRIVATE_DIAGNOSTIC_SENTINEL_7843';
  for(const [change,reasonId]of [
   [h=>{h.state.account.positionContext=[{symbol:secret}];},'SOURCE_CHANGED'],
   [h=>{h.state.account.brokerageCash.observedAt='2026-11-23T14:30:00Z';},'CASH_NOT_CURRENT'],
   [h=>{h.state.account.brokerageCash.balance++;},'CASH_CHANGED'],
   [h=>{h.state.portfolioRecord.portfolio=null;},'PORTFOLIO_INPUT'],
   [h=>{h.state.portfolioRecord.portfolio.find(row=>row.symbol==='LLL').role=secret;},'PORTFOLIO_ROW'],
   [h=>{h.state.portfolioRecord.portfolio.push({symbol:secret,role:'Swing',shares:1});},'PORTFOLIO_CHANGED'],
  ]){
   const h=fixture();change(h);const before=clone(h.state.account),response=await h.request();assert.equal(response.statusCode,422);assert.equal(response.body.diagnostic?.contract,'c1-approved-account-repair-failure-v1');assert.equal(response.body.diagnostic.reasonId,reasonId);
   assert.equal(h.state.attempts,0);same(h.state.account,before);assert(!JSON.stringify({body:response.body,logs:h.state.logs}).includes(secret));assert(!JSON.stringify(h.state.logs).includes(h.input.statementText));
  }
 });
 await check('malformed staged evidence reports configuration classes without exposing the staged text',async()=>{
  const secret='PRIVATE_CONFIGURATION_SENTINEL_2948';
  for(const [configurationTransform,reasonId]of [
   [()=>secret+'{','CONFIG_JSON'],
   [(_text,config)=>JSON.stringify({...config,privateExtra:secret}),'CONFIG_SHAPE'],
   [(_text,config)=>JSON.stringify({...config,sourceEconomicFingerprint:secret}),'CONFIG_VALUES'],
  ]){
   const h=fixture({configurationTransform}),response=await h.request();assert.equal(response.statusCode,422);assert.equal(response.body.diagnostic?.contract,'c1-approved-account-repair-failure-v1');assert.equal(response.body.diagnostic.reasonId,reasonId);
   assert.equal(h.state.attempts,0);assert(!JSON.stringify({body:response.body,logs:h.state.logs}).includes(secret));
  }
 });
 await check('unknown reason properties and unrelated error contexts cannot forge or leak repair diagnostics',async()=>{
  const errors=loader.load('lib/c1ApiErrors.js'),message='The owner-approved account repair could not be verified. Purchases remain paused.',secret='PRIVATE_UNKNOWN_REASON_SENTINEL_8913',
   unknown=errors.c1AccountApiFailure(Object.assign(Error(message),{c1ApprovedRepairReason:secret}),{operation:'approved-account-repair'});
  assert.equal(unknown.status,422);assert.equal(unknown.diagnostic,undefined);assert(!JSON.stringify(unknown).includes(secret));
  const known=Object.assign(Error(message),{c1ApprovedRepairReason:'SOURCE_CHANGED'});
  for(const context of [undefined,{operation:'refresh-analysis'},{operation:'review-broker-cash-history'}]){
   const response=errors.c1AccountApiFailure(known,context);assert.equal(response.status,422);assert.equal(response.diagnostic,undefined);
  }
  const unrelated=errors.c1AccountApiFailure(Object.assign(Error(secret),{c1ApprovedRepairReason:'SOURCE_CHANGED'}),{operation:'approved-account-repair'});
  assert.notEqual(unrelated.diagnostic?.reasonId,'SOURCE_CHANGED');assert(!JSON.stringify(unrelated).includes(secret));
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

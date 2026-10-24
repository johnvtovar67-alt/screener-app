const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createHash}=require('node:crypto');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const root=path.resolve(__dirname,'..'),plain=value=>JSON.parse(JSON.stringify(value));
const pins={
  'lib/c1AccountSimulator.js':['tools/fixtures/c1-account-simulator-9097e89.js','15aecf5479fa496bb7fe232f8367aab2c4d37597bba0c347b2064e38e1886e4b'],
  'lib/c1AccountLedger.js':['tools/fixtures/c1-account-ledger-9097e89.js','f861123083c1d08c825808cf76e479cd00cc59eba5eefa24e29d2a286aaa9a77'],
  'lib/c1AccountProjection.js':['tools/fixtures/c1-account-projection-9097e89.js','63805fbd73e5fa28a48fa3adcf38e1c313430f9c36dd820e7225b52e9afbc53b'],
  'lib/c1AccountService.js':['tools/fixtures/c1-account-service-9097e89.js','0ddc751280d9d639866ef1945dbc4aa082e152005afa1b612139353315863355'],
  'lib/c1AccountSeed.js':['tools/fixtures/c1-account-seed-9097e89.js','c252e5f7c96d55b44aa8aa56dd10f57102d5968617bacadab6f47cb53506147e'],
  'lib/marketSession.js':['tools/fixtures/c1-market-session-9097e89.js','2b12b67b5000249f05431908e21c8b8e0979d881f2390d11430287aafe818cc6'],
};
for(const [fixture,pin] of Object.values(pins))assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root,fixture))).digest('hex'),pin);
function originalModules(){
  const read=fs.readFileSync;
  fs.readFileSync=function(file,...args){
    const relative=typeof file==='string'?path.relative(root,file).split(path.sep).join('/'):null;
    return read.call(fs,pins[relative]?path.join(root,pins[relative][0]):file,...args);
  };
  try{
    const loader=createResearchModuleLoader(root);
    return {service:loader.load('lib/c1AccountService.js'),projection:loader.load('lib/c1AccountProjection.js'),
      ledger:loader.load('lib/c1AccountLedger.js'),signature:loader.load('lib/portfolioGovernor.js').portfolioCompositionSignature};
  }finally{fs.readFileSync=read;}
}
const old=originalModules(),loader=createResearchModuleLoader(root);
const service=loader.load('lib/c1AccountService.js'),projection=loader.load('lib/c1AccountProjection.js');
const ledger=loader.load('lib/c1AccountLedger.js'),market=loader.load('lib/marketSession.js');
const coverage=fs.readFileSync(path.join(root,'lib/c1HoldingCoverage.js'),'utf8');
const coverageBox={...market};
vm.createContext(coverageBox);
vm.runInContext(coverage.slice(0,coverage.indexOf('// Account valuation coverage'))
  .replace(/^import .*;$/gm,'').replace('export function ','function ')
  +'\nglobalThis.missing=missingC1HoldingPrices;',coverageBox);
const unexpected=()=>{throw new Error('Unexpected external provider or storage access');};
const context={...market,...service,...ledger,...loader.load('lib/c1AccountSave.js'),
  ...loader.load('lib/c1HeldRankReview.js'),...loader.load('lib/c1AccountInput.js'),
  ...loader.load('lib/c1AccountExecutionView.js'),...loader.load('lib/c1IntradayActivity.js'),
  ...loader.load('lib/c1ManualRecommendations.js'),createHash,Date,process:{env:{}},
  missingC1HoldingPrices:coverageBox.missing,readStoredC1DatedBook:unexpected,
  collectC1AccountOpening:unexpected,collectC1HoldingCoverage:unexpected,collectC1HeldRankReviews:unexpected,
  get:unexpected,put:unexpected};
const route=fs.readFileSync(path.join(root,'pages/api/c1-account.js'),'utf8')
  .replace(/^import .*;$/gm,'').replace(/export const /g,'const ').replace(/export function /g,'function ')
  .replace('export default createC1AccountHandler();','globalThis.factory=createC1AccountHandler;');
assert.ok(!/^import /m.test(route));
Object.assign(context,loader.load('lib/c1ApiErrors.js'),{randomUUID:require('node:crypto').randomUUID});
vm.createContext(context);vm.runInContext(route,context);
const key='fixture'.repeat(6),accountPath='c1-accounts-v1/preview-compatibility-api/'+createHash('sha256').update(key).digest('hex')+'.json';
function harness(record,book,observedAt){
  const state={bytes:record?JSON.stringify(record):null,etag:'"fixture-0"',book:plain(book),now:new Date(observedAt),
    reads:0,bookReads:0,writes:[],providerCalls:0};
  const provider=()=>{state.providerCalls++;throw new Error('Provider calls are forbidden in this API fixture');};
  const handler=context.factory({environment:'preview',commit:'compatibility-api',clock:()=>state.now,
    readBook:async universe=>{assert.equal(universe,'sp500');state.bookReads++;return {record:plain(state.book)};},
    collectOpening:provider,collectHoldings:provider,collectRanks:provider,
    store:{read:async requested=>{assert.equal(requested,accountPath);state.reads++;return state.bytes?{record:JSON.parse(state.bytes),etag:state.etag}:null;},
      write:async(requested,value,etag)=>{assert.equal(requested,accountPath);assert.equal(etag,state.bytes?state.etag:undefined);
        state.writes.push({etag,record:plain(value)});state.bytes=JSON.stringify(value);state.etag='"fixture-'+state.writes.length+'"';}}});
  return {state,async request(method,body,authorized=true){
    const beforeBody=JSON.stringify(body),headers={},res={setHeader(name,value){headers[name]=value;},status(code){this.code=code;return this;},json(value){this.body=value;return this;}};
    await handler({method,body:body===undefined?undefined:plain(body),headers:authorized?{authorization:'Bearer '+key}:{}},res);
    assert.equal(JSON.stringify(body),beforeBody,'The handler cannot mutate the caller request');
    assert.equal(headers['Cache-Control'],'no-store');return res;
  }};
}
const sleeves=['base','cooldown15','sector40'],weights={base:.25,cooldown15:.5,sector40:.25};
function session(date,names=['SCHW','AAA','BBB','CCC']){
  const signals=names.map((symbol,index)=>({symbol,sector:'Sector '+index,companyName:symbol,cik:String(index+100),price:100,
    researchFactors:{momentumPercentile:100-index,volatility60Pct:20},
    entryTiming:{available:true,asOf:date,liquidityPass:true,averageDollarVolume20:500e6}}));
  return {date,decisionAt:date+'T22:00:00Z',signals,positionSignals:signals,universeSymbols:names,corporateActions:[],
    prices:[...names,'SPY','QQQ'].map(symbol=>({symbol,open:100,high:101,low:99,close:100,volume:5000000,adjusted:true}))};
}
function book(sessions){return {universe:'sp500',model:{sessions},captures:sessions.map(s=>({sessionDate:s.date,hash:'source-'+s.date,observedAt:s.decisionAt}))};}
const sessions=[session('2026-09-01'),session('2026-09-02')],inputs=book(sessions);
const adoption={contract:'c1-prospective-account-adoption-v1',sourceSessionDate:sessions[0].date,actualCash:100000,actualSwingEquity:100000,
  seeds:Object.fromEntries(sleeves.map(sleeve=>[sleeve,{contract:'c1-prospective-account-seed-v1',sleeve,asOfSession:sessions[0].date,
    prospectiveAdoptionConfirmed:true,cash:100000,highWater:100000,remainingCooldownSessions:0,positions:[],actualDollarsPerModelDollar:weights[sleeve]}]))};
const initial={contract:'c1-private-account-v1',revision:0,adoption,records:[],sourceHashes:[{date:sessions[0].date,hash:'source-'+sessions[0].date}],
  createdAt:sessions[0].decisionAt,brokerageCash:{balance:100000,source:'manual-broker-balance',observedAt:'2026-09-02T13:45:00Z'}};
const planArgs={adoption,baseline:sessions[0],opening:sessions[1],observedAt:'2026-09-02T14:00:00Z',books:ledger.c1AccountBooks(adoption),sessions:[sessions[0]]};
const oldPlan=old.projection.projectC1AccountSession(planArgs),currentPlan=projection.projectC1AccountSession(planArgs);
function record(plan,prefix){return {date:sessions[1].date,complete:true,openingObservedAt:planArgs.observedAt,
  fills:plan.orders.filter(order=>order.side==='buy'&&order.symbol==='AAA').map(order=>({id:prefix+':'+order.sleeve,orderId:order.id,
    symbol:'AAA',side:'buy',shares:1,price:100,fee:0,executedAt:planArgs.observedAt}))};}
const legacyRecord=record(oldPlan,'saved'),newRecord=record(currentPlan,'new');
for(const sleeve of sleeves){
  assert.equal(legacyRecord.fills.find(fill=>fill.orderId.startsWith(sleeve+':')).orderId,sleeve+':2026-09-02:1');
  assert.equal(newRecord.fills.find(fill=>fill.orderId.startsWith(sleeve+':')).orderId,sleeve+':2026-09-02:0');
}
const legacy={...plain(initial),records:[legacyRecord],sourceHashes:[...initial.sourceHashes,{date:sessions[1].date,hash:'source-'+sessions[1].date}]};
const oldRun=old.ledger.continueC1ActualAccount({adoption,sessions,records:legacy.records,observedAt:'2026-09-02T22:00:00Z'});
assert.equal(oldRun.actualCash,99700);

async function main(){
  const legacyApi=harness(legacy,inputs,'2026-09-02T22:00:00Z'),legacyBytes=legacyApi.state.bytes;
  assert.equal((await legacyApi.request('GET',undefined,false)).code,401);assert.equal(legacyApi.state.reads,0);assert.equal(legacyApi.state.bookReads,0);
  const legacyGet=await legacyApi.request('GET');
  assert.equal(legacyGet.code,200,JSON.stringify(legacyGet.body));assert.equal(legacyGet.body.decision.strategyCash,99700);
  assert.equal(legacyGet.body.decision.positions.find(position=>position.symbol==='AAA').shares,3);
  assert.equal(legacyApi.state.bytes,legacyBytes);assert.equal(legacyApi.state.writes.length,0);
  assert.ok(!JSON.parse(legacyApi.state.bytes).records[0].executionEvidence,'GET cannot stamp or migrate saved legacy history');

  const freshApi=harness(initial,inputs,'2026-09-02T22:00:00Z'),freshBytes=freshApi.state.bytes;
  const oldId=await freshApi.request('POST',{operation:'record-session',expectedRevision:0,record:legacyRecord});
  assert.equal(oldId.code,422);assert.match(oldId.body.error,/does not match an account order/);
  assert.equal(freshApi.state.bytes,freshBytes);assert.equal(freshApi.state.writes.length,0);
  for(const field of ['executionEvidence','recordingEvidence','entryPlanEvidence','entryRecheck']){
    const proposed={...newRecord,[field]:plain(currentPlan)};
    const rejected=await freshApi.request('POST',{operation:'record-session',expectedRevision:0,record:proposed});
    assert.equal(rejected.code,422);assert.match(rejected.body.error,/generated by the server only/);
    assert.equal(freshApi.state.bytes,freshBytes);assert.equal(freshApi.state.writes.length,0);
  }
  const posted=await freshApi.request('POST',{operation:'record-session',expectedRevision:0,record:newRecord});
  assert.equal(posted.code,200,JSON.stringify(posted.body));assert.equal(freshApi.state.writes.length,1);
  assert.equal(freshApi.state.writes[0].etag,'"fixture-0"');
  const newSaved=JSON.parse(freshApi.state.bytes),captured=newSaved.records[0].executionEvidence;
  assert.equal(captured.contract,'c1-actual-account-opening-plan-v1');assert.equal(captured.providerVerified,false);assert.equal(captured.executable,false);
  assert.deepEqual(plain(newSaved.records[0].fills),plain(newRecord.fills));
  assert.deepEqual(plain(captured.orders),plain(currentPlan.orders),'The API captures the current server queue, never old/client authority');
  assert.equal(posted.body.decision.strategyCash,99700);assert.equal(posted.body.decision.positions[0].shares,3);
  const stampedBytes=freshApi.state.bytes;
  assert.equal((await freshApi.request('GET')).code,200);assert.equal(freshApi.state.bytes,stampedBytes);assert.equal(freshApi.state.writes.length,1);

  const dates=[session('2025-01-08',['AAA','BBB','CCC']),session('2025-01-10',['AAA','BBB','CCC'])],dateBook=book(dates);
  const portfolio=[{symbol:'AAA',role:'Swing',shares:4,avgCost:100,openedAt:'2025-01-09'},{symbol:'CASH',role:'Swing',shares:9600,avgCost:1}];
  const capitalRecord={version:2,highWater:10000,triggerDay:null,portfolioSignature:old.signature(portfolio),reconciliationRequired:false};
  const dateSaved=old.service.adoptC1Account({portfolio,capitalRecord,book:dateBook,now:new Date('2025-01-10T22:00:00Z')});
  dateSaved.positionContext=[{symbol:'AAA',stage:'full',purchases:[{date:'2025-01-09',shares:4,cost:100}],source:'owner-confirmed-brokerage-evidence'}];
  const dateApi=harness(dateSaved,dateBook,'2025-01-10T22:00:00Z'),dateBytes=dateApi.state.bytes;
  const getDate=await dateApi.request('GET');assert.equal(getDate.code,200,JSON.stringify(getDate.body));
  assert.equal(getDate.body.decision.positions[0].openedAt,'2025-01-09');assert.equal(getDate.body.decision.positions[0].shares,4);
  assert.equal(getDate.body.decision.strategyCash,9600);assert.equal(dateApi.state.bytes,dateBytes);assert.equal(dateApi.state.writes.length,0);
  const corrected=await dateApi.request('POST',{operation:'correct-opening-date',symbol:'AAA',openedAt:'2025-01-08',expectedRevision:0});
  assert.equal(corrected.code,200,JSON.stringify(corrected.body));assert.equal(dateApi.state.writes.length,1);
  assert.equal(dateApi.state.writes[0].etag,'"fixture-0"');
  const changed=JSON.parse(dateApi.state.bytes);assert.equal(changed.revision,1);
  assert.equal(corrected.body.decision.positions[0].openedAt,'2025-01-08');assert.equal(corrected.body.decision.positions[0].shares,4);
  assert.equal(corrected.body.decision.strategyCash,9600);
  for(const field of ['records','sourceHashes','positionContext'])assert.deepEqual(changed[field],plain(dateSaved[field]));
  assert.equal(changed.corrections.at(-1).type,'first-purchase-date');assert.deepEqual(changed.corrections.at(-1).previousDates,['2025-01-09']);
  for(const sleeve of sleeves){
    const {positions:before,...oldSeed}=dateSaved.adoption.seeds[sleeve],{positions:after,...newSeed}=changed.adoption.seeds[sleeve];
    assert.deepEqual(newSeed,oldSeed);assert.deepEqual(after.map(({openedAt,...p})=>p),plain(before).map(({openedAt,...p})=>p));
  }
  const correctedBytes=dateApi.state.bytes;
  const reloadedDate=await dateApi.request('GET');
  assert.equal(reloadedDate.code,200,JSON.stringify(reloadedDate.body));
  assert.equal(reloadedDate.body.decision.positions[0].openedAt,'2025-01-08');
  assert.equal(reloadedDate.body.decision.positions[0].shares,4);assert.equal(reloadedDate.body.decision.strategyCash,9600);
  assert.equal(dateApi.state.bytes,correctedBytes);assert.equal(dateApi.state.writes.length,1);
  const invalidTarget=await dateApi.request('POST',{operation:'correct-opening-date',symbol:'AAA',openedAt:'2025-01-09',expectedRevision:1});
  assert.equal(invalidTarget.code,422);assert.match(invalidTarget.body.error,/valid first-purchase date/);
  assert.equal(dateApi.state.bytes,correctedBytes);assert.equal(dateApi.state.writes.length,1);
  const newDateApi=harness(null,dateBook,'2025-01-10T22:00:00Z');
  const invalidAdopt=await newDateApi.request('POST',{operation:'adopt',portfolio,capitalRecord});
  assert.equal(invalidAdopt.code,422);assert.match(invalidAdopt.body.error,/Original entry date/);
  assert.equal(newDateApi.state.bytes,null);assert.equal(newDateApi.state.writes.length,0);

  const validPortfolio=portfolio.map(p=>({...p,openedAt:'2025-01-08'})),closedBook=book([dates[0]]);
  const validCapital={...capitalRecord,portfolioSignature:old.signature(validPortfolio)};
  const closedSaved=service.adoptC1Account({portfolio:validPortfolio,capitalRecord:validCapital,book:closedBook,now:new Date('2025-01-08T22:00:00Z')});
  const closedApi=harness(closedSaved,closedBook,'2025-01-09T16:00:00Z'),closedBytes=closedApi.state.bytes;
  const invalidTicket=await closedApi.request('POST',{operation:'record-intraday',expectedRevision:0,
    ticket:{id:'closure-ticket',symbol:'AAA',side:'buy',shares:1,price:100,fee:0,executedAt:'2025-01-09T15:00:00Z'}});
  assert.equal(invalidTicket.code,503);assert.match(invalidTicket.body.error,/Current-session prices are unavailable/);
  const invalidSession=await closedApi.request('POST',{operation:'record-session',expectedRevision:0,record:{date:'2025-01-09',complete:true,fills:[]}});
  assert.equal(invalidSession.code,503);assert.match(invalidSession.body.error,/Observed session input missing/);
  assert.equal(closedApi.state.bytes,closedBytes);assert.equal(closedApi.state.writes.length,0);
  for(const api of [legacyApi,freshApi,dateApi,newDateApi,closedApi])assert.equal(api.state.providerCalls,0);
  console.log('PASS: authenticated real API reads preserve saved legacy fills and Jan9 metadata without writes; ETag date correction preserves economics/history; new session posts capture current server evidence; old IDs, supplied plans and new Jan9 activity reject without writes or provider access.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const root=path.resolve(__dirname,'..');
const plain=value=>JSON.parse(JSON.stringify(value));
const hash=value=>createHash('sha256').update(value).digest('hex');
const originalPins={
  'lib/c1AccountSimulator.js':['tools/fixtures/c1-account-simulator-9097e89.js','15aecf5479fa496bb7fe232f8367aab2c4d37597bba0c347b2064e38e1886e4b'],
  'lib/c1AccountLedger.js':['tools/fixtures/c1-account-ledger-9097e89.js','f861123083c1d08c825808cf76e479cd00cc59eba5eefa24e29d2a286aaa9a77'],
  'lib/c1AccountProjection.js':['tools/fixtures/c1-account-projection-9097e89.js','63805fbd73e5fa28a48fa3adcf38e1c313430f9c36dd820e7225b52e9afbc53b'],
  'lib/c1AccountService.js':['tools/fixtures/c1-account-service-9097e89.js','0ddc751280d9d639866ef1945dbc4aa082e152005afa1b612139353315863355'],
  'lib/c1AccountSeed.js':['tools/fixtures/c1-account-seed-9097e89.js','c252e5f7c96d55b44aa8aa56dd10f57102d5968617bacadab6f47cb53506147e'],
  'lib/marketSession.js':['tools/fixtures/c1-market-session-9097e89.js','2b12b67b5000249f05431908e21c8b8e0979d881f2390d11430287aafe818cc6'],
};
// Resolve imports at their original lib paths, using immutable fixtures. CI
// needs no Git history and no production, provider, account or network access.
function originalModules(){
  const originalRead=fs.readFileSync;
  fs.readFileSync=function(file,...args){
    const relative=typeof file==='string'?path.relative(root,file).split(path.sep).join('/'):null;
    const fixture=originalPins[relative];
    return originalRead.call(fs,fixture?path.join(root,fixture[0]):file,...args);
  };
  try{
    const loader=createResearchModuleLoader(root);
    return {ledger:loader.load('lib/c1AccountLedger.js'),projection:loader.load('lib/c1AccountProjection.js'),
      service:loader.load('lib/c1AccountService.js')};
  }finally{fs.readFileSync=originalRead;}
}
for(const [fixture,pin] of Object.values(originalPins))if(pin)assert.equal(hash(fs.readFileSync(path.join(root,fixture))),pin);
const old=originalModules(),loader=createResearchModuleLoader(root);
const ledger=loader.load('lib/c1AccountLedger.js'),projection=loader.load('lib/c1AccountProjection.js');
const service=loader.load('lib/c1AccountService.js');
const identity=loader.load('lib/c1LegacyOrderIdentity.js');
const sleeves=['base','cooldown15','sector40'],weights={base:.25,cooldown15:.5,sector40:.25};
const symbols=['SCHW','AAA','BBB','CCC'];
function session(date,names=symbols){
  const signals=names.map((symbol,index)=>({symbol,companyName:symbol,cik:String(100+index),
    sector:'Sector '+index,price:100,researchFactors:{momentumPercentile:100-index,volatility60Pct:20},
    entryTiming:{available:true,asOf:date,liquidityPass:true,averageDollarVolume20:500e6}}));
  return {date,decisionAt:date+'T21:00:00Z',signals,positionSignals:signals,universeSymbols:names,
    corporateActions:[],prices:[...names,'SPY','QQQ'].map(symbol=>({symbol,open:100,high:101,low:99,close:100,adjusted:true}))};
}
const sessions=[session('2026-09-01'),session('2026-09-02'),session('2026-09-03')];
const adoption={contract:'c1-prospective-account-adoption-v1',sourceSessionDate:sessions[0].date,
  actualCash:100000,actualSwingEquity:100000,seeds:Object.fromEntries(sleeves.map(sleeve=>[sleeve,{
    contract:'c1-prospective-account-seed-v1',sleeve,asOfSession:sessions[0].date,
    prospectiveAdoptionConfirmed:true,cash:100000,highWater:100000,remainingCooldownSessions:0,
    positions:[],actualDollarsPerModelDollar:weights[sleeve]}]))};
const observedAt='2026-09-02T22:00:00Z',openingObservedAt='2026-09-02T14:00:00Z';
const initialBooks=ledger.c1AccountBooks(adoption);
const request={adoption,baseline:sessions[0],opening:sessions[1],observedAt:openingObservedAt,
  books:initialBooks,sessions:sessions.slice(0,1)};
const oldPlan=old.projection.projectC1AccountSession(request);
const currentPlan=projection.projectC1AccountSession(request);
for(const sleeve of sleeves){
  assert.equal(oldPlan.orders.find(o=>o.sleeve===sleeve&&o.symbol==='AAA'&&o.side==='buy').id,sleeve+':2026-09-02:1');
  assert.equal(currentPlan.orders.find(o=>o.sleeve===sleeve&&o.symbol==='AAA'&&o.side==='buy').id,sleeve+':2026-09-02:0');
  assert.equal(currentPlan.orders.find(o=>o.id===sleeve+':2026-09-02:1').symbol,'BBB');
}
function fillsFor(plan,symbol='AAA'){
  return plan.orders.filter(o=>o.symbol===symbol&&o.side==='buy').map(o=>({id:'posted:'+o.sleeve+':'+symbol,
    orderId:o.id,symbol,side:'buy',shares:1,price:100,fee:0,executedAt:openingObservedAt}));
}
const record={date:sessions[1].date,complete:true,openingObservedAt,fills:fillsFor(oldPlan)};
const continuation={adoption,sessions:sessions.slice(0,2),records:[record],observedAt};
const untouched=JSON.stringify(continuation);
const original=old.ledger.continueC1ActualAccount(continuation);
assert.equal(original.actualCash,99700,'The immutable original implementation accepted these exact legacy IDs');
assert.throws(()=>ledger.reconcileC1ActualAccountFills({plan:currentPlan,fills:record.fills,observedAt}),/does not match an account order/,
  'Reusing the repaired numeric queue for an old AAA fill reproduces the compatibility blocker');
const repaired=ledger.continueC1ActualAccount(continuation);
assert.equal(repaired.actualCash,99700);
assert.deepEqual(plain(repaired.books),plain(original.books),'Legacy reconstruction preserves exact per-sleeve ownership, cash and basis');
assert.deepEqual(plain(repaired.replay),plain(original.replay),'Every immutable fill, reason, quantity, price, fee and target survives');
for(const sleeve of sleeves){
  assert.deepEqual(plain(repaired.sleeves[sleeve].trades),plain(original.sleeves[sleeve].trades));
  assert.deepEqual(plain(repaired.sleeves[sleeve].openPositions),plain(original.sleeves[sleeve].openPositions));
  assert.deepEqual(plain(repaired.sleeves[sleeve].accountRisk),plain(original.sleeves[sleeve].accountRisk));
}
assert.equal(JSON.stringify(continuation),untouched,'Reconstruction never writes historical records or adoption');
const reconstructed=identity.reconstructC1LegacyOrderIdentity({...request,record,observedAt});
assert.equal(reconstructed.executable,false);
assert.equal(reconstructed.status,'historical-reconstruction-only');
assert.equal(reconstructed.legacyOrderIdentitySource.sha256,originalPins['lib/c1AccountSimulator.js'][1]);
assert.deepEqual(plain(reconstructed.orders),plain(oldPlan.orders),'Exact old order IDs are source-bound, never matched by a new ID or symbol guess');

function compareOriginal(next,description){
  const before=JSON.stringify(next),expected=old.ledger.continueC1ActualAccount(next),actual=ledger.continueC1ActualAccount(next);
  assert.deepEqual(plain(actual.books),plain(expected.books),description);
  assert.deepEqual(plain(actual.replay),plain(expected.replay),description);
  assert.equal(JSON.stringify(next),before,'Input history remains immutable: '+description);
  return actual;
}
compareOriginal({...continuation,records:[{...record,openingObservedAt:'2026-09-03T12:00:00Z'}],observedAt:'2026-09-03T12:30:00Z'},
  'Late capture timestamp is distinct from actual same-day fills and present-day replay completion');
compareOriginal({...continuation,records:[{...record,executionEvidence:plain(oldPlan)}]},'Captured execution evidence remains primary');
// The original ledger treated optional null/false/zero values as missing
// captured plans. Preserve those accepted legacy rows; new ordinary records
// always receive a valid current server plan regardless of such a marker.
for(const missing of [null,false,0])compareOriginal({...continuation,records:[{...record,executionEvidence:missing}]},
  'Previously accepted falsy optional captured-plan field retains historical identity');
const ordinary={...record,recordingEvidence:plain(oldPlan),entryPlanEvidence:{retained:'ordinary input metadata'}};
compareOriginal({...continuation,records:[ordinary]},'Ordinary recording evidence is retained but cannot replace exact old purchase authority');
const alteredOrdinary=plain(ordinary);alteredOrdinary.recordingEvidence.orders[0].symbol='ZZZ';
compareOriginal({...continuation,records:[alteredOrdinary]},'Non-authoritative ordinary metadata cannot change the accepted historical order identities');
const twoParts=record.fills.flatMap(fill=>[{...fill,shares:1,price:99,fee:.25},
  {...fill,id:fill.id+':part2',shares:2,price:101,fee:.50,executedAt:'2026-09-02T14:01:00Z'}]).sort((a,b)=>a.executedAt.localeCompare(b.executedAt));
const partial=compareOriginal({...continuation,records:[{...record,fills:twoParts}]},'Multiple partial fills conserve weighted basis and all fees');
assert.equal(partial.actualCash,99094.75);
assert.equal(partial.books.base.positions.AAA.shares,3);
assert.equal(partial.books.base.positions.AAA.avgCost,(99+202+.75)/3);
const stopSessions=plain(sessions.slice(0,2));
stopSessions[1].prices.find(p=>p.symbol==='AAA').low=85;
const stopped=compareOriginal({...continuation,sessions:stopSessions,records:[{...record,fills:[...record.fills,
  ...oldPlan.orders.filter(o=>o.symbol==='AAA'&&o.condition==='stop-triggered').map(o=>({id:'stop:'+o.sleeve,
    orderId:o.id,symbol:'AAA',side:'sell',shares:1,price:86,fee:0,executedAt:'2026-09-02T14:30:00Z'}))]}]},
  'A legacy partial purchase and its same-session factual stop retain exact identities and economics');
assert.equal(stopped.actualCash,99958);
assert.ok(sleeves.every(sleeve=>!stopped.books[sleeve].positions.AAA));
compareOriginal({...continuation,records:[{...record,fills:[...record.fills,record.fills[0]]}]},'Identical duplicate broker fill IDs remain idempotent');
const correction={contract:'c1-broker-cash-reconciliation-v1',revision:1,amount:1.25,balanceBefore:99700,
  balanceAfter:99701.25,effectiveSessionDate:sessions[1].date,recordedAt:observedAt,source:'broker-statement-balance'};
assert.equal(compareOriginal({...continuation,cashReconciliations:[correction]},'Cash reconciliation applies once without changing posted fill economics').actualCash,99701.25);
compareOriginal({...continuation,sessions,records:[record,{date:sessions[2].date,complete:true,fills:[]}],observedAt:'2026-09-03T22:00:00Z'},
  'An empty subsequent session retains ownership without reconstructing a purchase plan');
const noSchwSessions=sessions.slice(0,2).map(s=>session(s.date,symbols.slice(1)));
const noSchwPlan=old.projection.projectC1AccountSession({...request,baseline:noSchwSessions[0],opening:noSchwSessions[1],sessions:noSchwSessions.slice(0,1)});
compareOriginal({...continuation,sessions:noSchwSessions,records:[{...record,fills:fillsFor(noSchwPlan)}]},'An unchanged no-SCHW legacy queue also replays exactly');

function rejects(mutator,pattern,description){
  const input=plain(continuation);mutator(input);const before=JSON.stringify(input);
  assert.throws(()=>ledger.continueC1ActualAccount(input),pattern,description);
  assert.equal(JSON.stringify(input),before,'Rejected records remain untouched: '+description);
}
rejects(x=>x.records[0].fills[0].orderId='unknown',/does not match/,'Unknown original ID');
rejects(x=>x.records[0].fills[0].symbol='BBB',/does not match/,'Correct old ID with wrong symbol');
rejects(x=>x.records[0].fills[0].side='sell',/does not match/,'Wrong side');
rejects(x=>x.records[0].fills[0].shares=100000,/exceed the planned/,'Oversized quantity');
rejects(x=>x.records[0].fills[0].price=100000,/exceeds its sleeve cash/,'Immutable factual cost must fit cash');
rejects(x=>x.records[0].fills[0].fee=-1,/execution price and fee/,'Invalid fee');
rejects(x=>x.records[0].fills[0].shares=.5,/quantity/,'Fractional ownership');
rejects(x=>x.records[0].fills[0].executedAt='2026-09-02T13:29:00Z',/execution time/,'Pre-open fill');
rejects(x=>x.records[0].fills[0].executedAt='2026-09-03T14:00:00Z',/execution time/,'Wrong/future date');
rejects(x=>x.records[0].fills.push({...x.records[0].fills[0],price:101}),/Conflicting actual fill/,'Conflicting duplicate broker fill ID');
rejects(x=>{x.records[0].executionEvidence=plain(oldPlan);x.records[0].executionEvidence.orders[0].symbol='ZZZ';},/does not match/,
  'Tampered saved primary plan cannot downgrade to legacy reconstruction');
for(const invalid of [{},'invalid-primary'])rejects(x=>x.records[0].executionEvidence=invalid,/execution evidence does not match/,
  'A truthy malformed primary plan fails without legacy fallback');
rejects(x=>{x.records[0].fills[0].symbol='SCHW';x.records[0].fills[0].orderId='base:2026-09-02:0';},/does not match/,
  'The original executable plan never authorized a SCHW purchase');
rejects(x=>x.records[0].fills[0].symbol='MSTR',/does not match/,'Historical reconstruction cannot authorize MSTR');
assert.throws(()=>identity.reconstructC1LegacyOrderIdentity({...request,record,observedAt:openingObservedAt}),/completed saved activity/,
  'Historical reconstruction is unavailable before the session completes');
assert.throws(()=>identity.reconstructC1LegacyOrderIdentity({...request,record:{...record,executionEvidence:oldPlan},observedAt}),/completed saved activity/,
  'A saved primary plan cannot be replaced by historical reconstruction');

const book={universe:'sp500',model:{sessions:sessions.slice(0,2)},captures:sessions.slice(0,2).map(s=>({sessionDate:s.date,
  hash:'accepted:'+s.date,observedAt:s.decisionAt}))};
const account={contract:'c1-private-account-v1',revision:0,adoption,records:[],sourceHashes:[{date:sessions[0].date,hash:'accepted:'+sessions[0].date}],
  brokerageCash:{balance:100000,observedAt:'2026-09-02T13:00:00Z',source:'manual-broker-balance'}};
const freshRecord={...record,fills:fillsFor(currentPlan)};
const accountBefore=JSON.stringify(account),freshBefore=JSON.stringify(freshRecord);
const oldAppended=old.service.appendC1AccountSession({account,record,book,expectedRevision:0,now:new Date(observedAt)});
assert.equal(old.service.evaluateC1Account({account:oldAppended,book,now:new Date(observedAt)}).actualCash,99700,
  'The former official ordinary-recording service accepted and stored the reproduced unstamped legacy activity');
assert.equal(oldAppended.records[0].executionEvidence,undefined);
const appended=service.appendC1AccountSession({account,record:freshRecord,book,expectedRevision:0,now:new Date(observedAt)});
assert.equal(appended.records[0].executionEvidence.orders.find(o=>o.symbol==='AAA'&&o.sleeve==='base'&&o.side==='buy').id,'base:2026-09-02:0');
assert.deepEqual(plain(appended.records[0].fills),plain(freshRecord.fills));
assert.equal(service.evaluateC1Account({account:appended,book,now:new Date(observedAt)}).actualCash,99700);
assert.equal(JSON.stringify(account),accountBefore);
assert.equal(JSON.stringify(freshRecord),freshBefore,'New server evidence does not rewrite the caller record');
assert.throws(()=>service.appendC1AccountSession({account,record,book,expectedRevision:0,now:new Date(observedAt)}),/does not match/,
  'New ordinary records cannot choose the old identities when their current IDs fail');
assert.throws(()=>service.appendC1AccountSession({account,record:{...freshRecord,executionEvidence:oldPlan},book,expectedRevision:0,now:new Date(observedAt)}),/saved server-recorded/,
  'Client-supplied captured evidence is still forbidden');
assert.throws(()=>service.appendC1AccountSession({account,record:{...record,legacyOrderIdentitySource:identity.C1_LEGACY_ORDER_SOURCE},book,
  expectedRevision:0,now:new Date(observedAt)}),/does not match/,'A client marker cannot route a new record through the legacy path');

// Jan9's old false session advanced seeded age by one. An immutable old sale
// remains a fact even though the repaired current age no longer proposes it.
const boundaryNames=['P1','P2','P3','P4','P5','P6','AAA','P8','P9','P10'];
const boundarySessions=['2025-02-21','2025-02-24','2025-02-25'].map(date=>session(date,boundaryNames));
const boundaryAdoption=plain(adoption);boundaryAdoption.sourceSessionDate=boundarySessions[0].date;boundaryAdoption.actualCash=0;
for(const seed of Object.values(boundaryAdoption.seeds)){
  seed.asOfSession=boundarySessions[0].date;seed.cash=0;
  seed.positions=[{symbol:'AAA',role:'Swing',shares:1000,entryPrice:100,openedAt:'2025-01-08',
    sector:'Sector 6',issuer:'106',stock:boundarySessions[0].signals.find(s=>s.symbol==='AAA')}];
}
const boundaryRequest={adoption:boundaryAdoption,baseline:boundarySessions[0],opening:boundarySessions[1],
  sessions:boundarySessions.slice(0,1),books:ledger.c1AccountBooks(boundaryAdoption),observedAt:'2025-02-24T15:00:00Z'};
const originalBoundaryPlan=old.projection.projectC1AccountSession(boundaryRequest);
const freshBoundaryPlan=projection.projectC1AccountSession(boundaryRequest);
assert.equal(freshBoundaryPlan.orders.filter(o=>o.reason==='rank-deterioration').length,0,
  'Current live age29 retains the ranked holding; legacy reconstruction cannot alter a fresh exit recommendation');
const boundaryFills=originalBoundaryPlan.orders.filter(o=>o.side==='sell'&&!o.condition).map(o=>({id:'boundary:'+o.sleeve,
  orderId:o.id,symbol:o.symbol,side:o.side,shares:o.shares,price:100,fee:0,executedAt:'2025-02-24T15:00:00Z'}));
assert.equal(boundaryFills.length,3,'The pinned original age30 generated one real rank exit per sleeve');
const boundaryRecord={date:boundarySessions[1].date,complete:true,fills:boundaryFills,openingObservedAt:'2025-02-24T15:00:00Z'};
const boundaryInput={adoption:boundaryAdoption,sessions:boundarySessions.slice(0,2),records:[boundaryRecord],observedAt:'2025-02-24T22:00:00Z'};
const boundary=compareOriginal(boundaryInput,'Original calendar order identity and canonically reconciled rank-sale facts preserve exact historical economics');
assert.equal(boundary.actualCash,100000);
assert.ok(sleeves.every(sleeve=>!Object.keys(boundary.books[sleeve].positions).length));
assert.deepEqual(plain(identity.reconstructC1LegacyOrderIdentity({...boundaryRequest,record:boundaryRecord,observedAt:boundaryInput.observedAt}).orders),
  plain(originalBoundaryPlan.orders),'Legacy original Seed+Calendar reconstruct the complete old order queue');
compareOriginal({...boundaryInput,records:[{...boundaryRecord,executionEvidence:plain(originalBoundaryPlan)}]},
  'An immutable captured old rank-exit plan receives the same factual-sale conservation');
const futureBoundaryPlan=projection.projectC1AccountSession({adoption:boundaryAdoption,baseline:boundarySessions[1],opening:boundarySessions[2],
  sessions:boundarySessions.slice(0,2),books:boundary.books,replay:boundary.replay,observedAt:'2025-02-25T15:00:00Z'});
assert.equal(futureBoundaryPlan.date,'2025-02-25');
assert.ok(futureBoundaryPlan.orders.some(o=>o.side==='buy'),'Subsequent current projection retains validated historical fill references through its replay spread');
assert.ok(futureBoundaryPlan.orders.every(o=>o.symbol!=='AAA'),'Sold historical ownership cannot reappear during future projection');
const currentSimulator=loader.load('lib/c1AccountSimulator.js').simulatePointInTimePortfolio;
const configurations=loader.load('lib/c1FrozenOptions.js').C1_FROZEN_OPTIONS;
function boundaryRun(replay){return currentSimulator({sessions:boundarySessions.slice(0,2)},
  {...configurations.base,startDate:'2025-02-21',endDate:'2025-02-24',liquidateAtEnd:false},boundaryAdoption.seeds.base,replay);}
assert.equal(boundaryRun({...boundary.replay.base}).actualCash,100000,'A normal replay-object spread preserves only its original fill capabilities');
assert.throws(()=>boundaryRun(plain(boundary.replay.base)),/Actual fill could not be applied/,
  'JSON roundtrip loses private authority; supplied rank-sale tuples cannot force an absent current exit');
const serializedForged=plain(boundary.replay.base);
for(const fill of serializedForged.sessions[0].fills){fill.reconciledRankSale=true;fill.legacyOrderIdentitySource=identity.C1_LEGACY_ORDER_SOURCE;}
assert.throws(()=>boundaryRun(serializedForged),/Actual fill could not be applied/,'Serialized marker guesses cannot authorize a rank sale');
const mixed=ledger.continueC1ActualAccount(boundaryInput).replay.base;
mixed.sessions[0].fills.push({...mixed.sessions[0].fills[0],id:'unvalidated-additional-sale',shares:1});
assert.throws(()=>boundaryRun(mixed),/Actual fill could not be applied/,'Unvalidated fills cannot join a privately validated symbol/reason group');
const altered=ledger.continueC1ActualAccount(boundaryInput).replay.base;altered.sessions[0].fills[0].price=101;
assert.throws(()=>boundaryRun(altered),/Actual fill could not be applied/,'Changing a marked factual identity revokes its capability');
const emptyBoundary=boundaryRun({contract:'c1-actual-fill-replay-v1',sessions:[{date:'2025-02-24',fills:[]}]});
assert.equal(emptyBoundary.actualCash,0);
assert.equal(emptyBoundary.openPositions[0].shares,1000,'No actual sale means current ownership remains held under the repaired calendar');
const replayModule=loader.load('lib/c1ActualFillReplay.js');
const rawStop={...plain(boundary.replay.base),sessions:[{date:'2025-02-24',fills:[{symbol:'AAA',side:'sell',reason:'initial-stop',
  shares:1000,price:86,fee:0,id:'not-a-rank-sale',orderId:'base:2025-02-24:stop:AAA',executedAt:'2025-02-24T15:00:00Z'}]}]};
replayModule.markC1ReconciledRankSale(rawStop.sessions[0].fills[0]);
assert.throws(()=>boundaryRun(rawStop),/Actual fill could not be applied/,'The capability cannot force an untriggered standing stop');
const boundaryBook={universe:'sp500',model:{sessions:boundarySessions.slice(0,2)},captures:boundarySessions.slice(0,2).map(s=>({
  sessionDate:s.date,hash:'boundary:'+s.date,observedAt:s.decisionAt}))};
const boundaryAccount={...account,adoption:boundaryAdoption,brokerageCash:undefined,sourceHashes:[{date:'2025-02-21',hash:'boundary:2025-02-21'}]};
assert.throws(()=>service.appendC1AccountSession({account:boundaryAccount,record:boundaryRecord,book:boundaryBook,
  expectedRevision:0,now:new Date(boundaryInput.observedAt)}),/does not match/,
  'New completed rows must prove the current plan before any historical factual capability can be marked');
console.log('PASS: exact pre-SCHW source reconstructs completed legacy order IDs; original 99700 cash/ownership/fills remain immutable; current new records capture server plans; malformed, tampered, premature and spoofed activity fails closed.');

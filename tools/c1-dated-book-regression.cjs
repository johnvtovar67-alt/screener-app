const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const imports={createHash,...loader.load('lib/c1ForwardModel.js'),...loader.load('lib/c1DecisionSnapshot.js'),
 ...loader.load('lib/c1HoldingsComparison.js'),...loader.load('lib/marketSession.js'),...loader.load('lib/c1LiveInput.js')};
const box={...imports,Date,process};vm.createContext(box);
vm.runInContext(fs.readFileSync('lib/c1DatedBook.js','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'')+'\nglobalThis.api={acceptC1DatedInput,c1DatedBookView};',box);
const {acceptC1DatedInput:accept,c1DatedBookView:view}=box.api;
const symbols=['AAA','BBB','CCC','DDD'];
const make=(date,previous)=>({contract:'c1-dated-index-input-v1',universe:'nasdaq',sourceSessionDate:date,observedAt:date+'T22:00:00.000Z',metadata:{sectorBasis:'current'},
 sourceReceipt:{membershipCheckedTwice:true},priorSessionPrices:{date:previous,closes:Object.fromEntries([...symbols,'SPY','QQQ'].map(s=>[s,100]))},
 session:{date,decisionAt:date+'T22:00:00.000Z',universeSymbols:symbols,
 prices:[...symbols,'SPY','QQQ'].map(symbol=>({symbol,open:100,close:100,high:101,low:99,volume:10000000,adjusted:true})),
 signals:symbols.map((symbol,i)=>({symbol,sector:'Sector'+i,price:100,timestamp:Math.floor(Date.parse(date+'T22:00:00.000Z')/1000),researchFactors:{momentumPercentile:100-i,volatility60Pct:20,coverage:1,return60Ex5:20,return120Ex5:30,return252Ex21:40},entryTiming:{available:true,liquidityPass:true,averageDollarVolume20:500000000}}))}});
const firstInput=make('2026-09-09','2026-09-08'),firstNow=new Date(firstInput.observedAt),first=accept(null,firstInput,firstNow);
assert.ok(first.model.summary.modelQueue.length>0,'The initial completed close must prepare the next opening queue');
const retry=JSON.parse(JSON.stringify(firstInput));retry.observedAt=retry.session.decisionAt='2026-09-09T23:00:00.000Z';
retry.session.signals.forEach(row=>row.timestamp=Math.floor(Date.parse(retry.observedAt)/1000));
assert.equal(accept(first,retry,new Date(retry.observedAt)),first,'A later observation of identical content is a no-op');
const revised=JSON.parse(JSON.stringify(retry));revised.session.prices[0].close=101;
assert.throws(()=>accept(first,revised,new Date(retry.observedAt)),/input changed/);
assert.throws(()=>accept(first,{...retry,universe:'sp500'},new Date(retry.observedAt)),/switch index/);
const next=make('2026-09-10','2026-09-09'),nextNow=new Date(next.observedAt);
const changed=JSON.parse(JSON.stringify(next));changed.priorSessionPrices.closes.AAA=50;
const beforeMismatch=JSON.stringify(first);
delete changed.priorSessionPrices.closes.BBB;
assert.throws(()=>accept(first,changed,nextNow), error=>{
 assert.match(error.message,/Corporate action/);
 assert.equal(error.priceAnchorMismatch.mismatchCount,2);
 assert.equal(error.priceAnchorMismatch.previousSessionDate,'2026-09-09');
 assert.equal(error.priceAnchorMismatch.currentSessionDate,'2026-09-10');
 assert.equal(JSON.stringify(error.priceAnchorMismatch.mismatches),JSON.stringify([
  {symbol:'AAA',previousClose:100,observedPriorClose:50},
  {symbol:'BBB',previousClose:100,observedPriorClose:null}]));
 return true;
});
assert.equal(JSON.stringify(first),beforeMismatch,'Rejecting all mismatches must preserve the full original record');
const second=accept(first,next,nextNow);
assert.ok(second.model.ledger.fills.length>0,'Consecutive observed input must execute the unchanged frozen engine');
assert.equal(first.model.ledger.fills.length,0,'Prior record must remain immutable');
assert.throws(()=>accept(first,make('2026-09-11','2026-09-10'),new Date('2026-09-11T22:00:00Z')),/Missing/);
const holdings=[{symbol:'AAA',shares:4,role:'Swing'},{symbol:'CASH',shares:2500.43,role:'Swing'},{symbol:'CORE',shares:20,role:'Core'}];
const result=view(second,holdings,nextNow);
assert.equal(result.holdingsComparison.cash,2500.43);assert.equal(result.holdingsComparison.positions.length,1);
assert.equal(result.holdingsComparison.decisionId,result.decisionSnapshot.decisionId);
assert.equal(result.holdingsComparison.positions[0].modelDecision.decisionId,result.decisionSnapshot.decisionId);
assert.equal(result.decisionSnapshot.universe,'nasdaq');assert.equal(result.executable,false);assert.equal(result.orders.length,0);
assert.equal(view(second,holdings,new Date('2026-09-11T22:00:00Z')).decisionSnapshot.status,'unavailable');
const corrupt=JSON.parse(JSON.stringify(second));corrupt.model.summary.cash+=1;
assert.throws(()=>view(corrupt,holdings,nextNow),/integrity/);
const storeBox={...box.api,Date,process};vm.createContext(storeBox);
vm.runInContext(fs.readFileSync('lib/c1DatedBookStore.js','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'')+'\nglobalThis.api={connectStoredC1DatedInput,c1DatedBookPath,prepareStoredC1DatedBook,C1_ACCEPTED_INDEX_SEED};',storeBox);
const {connectStoredC1DatedInput:connect,c1DatedBookPath:path,prepareStoredC1DatedBook:prepare,C1_ACCEPTED_INDEX_SEED:seedPolicy}=storeBox.api;
assert.throws(()=>path('nasdaq','production'),/S&P 500/);
assert.equal(path('sp500','production','a'.repeat(40)),path('sp500','production','b'.repeat(40)),'Production history must survive deployment commits');
assert.notEqual(path('nasdaq','preview','a'.repeat(40)),path('sp500','preview','a'.repeat(40)));
(async()=>{
 let saved=null,writes=0;
 const store={read:async()=>saved,write:async(p,record)=>{saved={etag:'test',record:JSON.parse(JSON.stringify(record))};writes++;}};
 const a=await connect(firstInput,{store,path:'test',holdings,now:firstNow});
 const b=await connect(retry,{store,path:'test',holdings,now:new Date(retry.observedAt)});
 assert.equal(a.decisionSnapshot.decisionId,b.decisionSnapshot.decisionId);assert.equal(writes,1);
 assert.ok(!JSON.stringify(saved.record).includes('2500.43'),'Account balances must never be persisted in the model');
 let raceSaved=null;
 const raceStore={read:async()=>raceSaved,write:async(p,record)=>{raceSaved={etag:'winner',record};throw new Error('Vercel Blob: This blob already exists');}};
 const raced=await connect(firstInput,{store:raceStore,path:'race',holdings,now:firstNow});
 assert.equal(raced.sourceHash,a.sourceHash,'A generic SDK conflict requires a verified matching saved winner');
 await assert.rejects(()=>connect(firstInput,{store:{read:async()=>null,write:async()=>{throw new Error('Write failed');}},path:'failed',now:firstNow}),/Write failed/);
 // Exercise the existing shared snapshot boundary used by both page APIs.
 const indexInput={...firstInput,universe:'sp500'},indexRecord=accept(null,indexInput,firstNow);
 const indexView=view(indexRecord,[],firstNow);
 // A restart must preserve a present book and refuse any unaccepted baseline.
 let seedWrites=0;
 const preserved=await prepare({now:firstNow,path:'production',store:{read:async()=>({record:indexRecord}),write:async()=>{seedWrites++;}}});
 assert.equal(preserved.recordHash,indexRecord.recordHash);assert.equal(seedWrites,0);
 await assert.rejects(()=>prepare({now:firstNow,path:'missing',store:{read:async()=>null,write:async()=>{seedWrites++;}}}),/seed is missing/);
 await assert.rejects(()=>prepare({now:firstNow,path:'new',store:{read:async p=>p===seedPolicy.path?{record:indexRecord}:null,write:async()=>{seedWrites++;}}}),/seed is missing or changed/);
 assert.equal(seedWrites,0,'A missing or different seed must never initialize a new book');
 let reads=0;
 const bridge={...imports,...loader.load('lib/v11ProductionPolicy.js'),Date,
  process:{env:{VERCEL_ENV:'preview'}},
  readStoredC1DatedBook:async universe=>{assert.equal(universe,'sp500');reads++;return {record:indexRecord,view:indexView,path:'preview/index'};}};
 vm.createContext(bridge);
 vm.runInContext(fs.readFileSync('lib/v11ProductionSnapshot.js','utf8').replace(/import\s+[\s\S]*?\s+from\s+["'][^"']+["'];/g,'').replace(/export /g,'')+'\nglobalThis.api={getV11ProductionSnapshot,refreshV11ProductionSnapshot};',bridge);
 const snapshot=await bridge.api.getV11ProductionSnapshot({now:firstNow});
 assert.equal(snapshot.decisionSnapshot.decisionId,indexView.decisionSnapshot.decisionId);
 assert.equal(snapshot.decisionSnapshot.universe,'sp500');assert.equal(snapshot.activationAuthorized,false);assert.equal(reads,1);
 bridge.process.env.VERCEL_ENV='production';
 const production=await bridge.api.refreshV11ProductionSnapshot(firstNow);
 assert.equal(production.decisionSnapshot.decisionId,snapshot.decisionSnapshot.decisionId);
 assert.equal(production.forwardAccounting.environment,'production');
 assert.equal(production.activationAuthorized,false);assert.equal(reads,2,'Legacy cron must also read the index book');
 bridge.readStoredC1DatedBook=async()=>{throw new Error('Not prepared');};
 const unavailable=await bridge.api.getV11ProductionSnapshot({now:firstNow});
 assert.equal(unavailable.status,'unavailable');assert.equal(unavailable.forwardAccounting,null,'No fallback to a different broad model');
 console.log('PASS: dated source → immutable book → frozen model → shared decision → account comparison; retries, revisions, corporate-action anchors, missing sessions and privacy');
})().catch(e=>{console.error(e);process.exitCode=1;});

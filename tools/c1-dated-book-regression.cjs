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
assert.throws(()=>accept(first,changed,nextNow),/Corporate action/);
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
vm.runInContext(fs.readFileSync('lib/c1DatedBookStore.js','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'')+'\nglobalThis.api={connectStoredC1DatedInput,c1DatedBookPath};',storeBox);
const {connectStoredC1DatedInput:connect,c1DatedBookPath:path}=storeBox.api;
assert.throws(()=>path('nasdaq','production'),/preview/);
assert.notEqual(path('nasdaq','preview','a'.repeat(40)),path('sp500','preview','a'.repeat(40)));
(async()=>{
 let saved=null,writes=0;
 const store={read:async()=>saved,write:async(p,record)=>{saved={etag:'test',record:JSON.parse(JSON.stringify(record))};writes++;}};
 const a=await connect(firstInput,{store,path:'test',holdings,now:firstNow});
 const b=await connect(retry,{store,path:'test',holdings,now:new Date(retry.observedAt)});
 assert.equal(a.decisionSnapshot.decisionId,b.decisionSnapshot.decisionId);assert.equal(writes,1);
 assert.ok(!JSON.stringify(saved.record).includes('2500.43'),'Account balances must never be persisted in the model');
 console.log('PASS: dated source → immutable book → frozen model → shared decision → account comparison; retries, revisions, corporate-action anchors, missing sessions and privacy');
})().catch(e=>{console.error(e);process.exitCode=1;});

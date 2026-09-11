const assert=require('node:assert/strict');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const {reconcileC1AccountHistory:reconcile}=loader.load('lib/c1AccountReconciliation.js');
const {c1DrawdownControl:control,portfolioCompositionSignature:signature}=loader.load('lib/portfolioGovernor.js');
const {cleanC1ControlState:clean}=loader.load('lib/c1CapitalState.js');
const before=[{symbol:'AAA',shares:10,role:'Swing'},{symbol:'MSTR',shares:2,role:'Core'},{symbol:'CASH',shares:1000,avgCost:1,role:'Swing'}];
const after=before.map(p=>({...p,shares:p.symbol==='AAA'?8:p.symbol==='CASH'?1187:p.shares}));
const now=new Date('2026-09-10T16:00:00Z');
const original={version:2,highWater:2000,triggerDay:null,portfolioSignature:signature(before)};
const blocked=control({state:original,portfolioSignature:signature(after),swingEquity:1667,now});
assert.equal(blocked.reconciliationRequired,true);
const csv='id,date,type,symbol,shares,price,cash_amount,fee\n'+
 'open,2026-09-09,OPEN_CASH,,,,1000,0\n'+
 'a,2026-09-09,OPEN_POSITION,AAA,10,,0,0\n'+
 'm,2026-09-09,OPEN_POSITION,MSTR,2,,0,0\n'+
 'fill1,2026-09-10,SELL,AAA,1,95,94,1\n'+
 'fill2,2026-09-10,SELL,AAA,1,95,93,2\n';
const request={csv,portfolio:after,state:blocked.state,now};
const saved=JSON.stringify(request);
assert.equal(reconcile(request).status,'confirmation-required');
assert.equal(JSON.stringify(request),saved,'Preview cannot mutate the account');
const repaired=reconcile({...request,completeActivityConfirmed:true});
assert.equal(repaired.status,'reconciled');
assert.equal(repaired.report.transactions.length,2,'Both partial fills must survive');
assert.equal(repaired.report.cash,1187,'Actual fees must remain charged');
assert.equal(repaired.state.highWater,2000,'Trading does not reset the recorded peak');
assert.equal(repaired.state.portfolioSignature,signature(after));
assert.equal(repaired.executable,false);assert.equal(repaired.orders.length,0);
const evaluated=control({state:clean(repaired.state),portfolioSignature:signature(after),swingEquity:1667,now});
assert.equal(evaluated.cooldown,true,'Reconciliation cannot erase a 12% loss');
assert.equal(evaluated.state.highWater,2000);
assert.equal(evaluated.state.triggerDay,'2026-09-10');
const inCooldown=reconcile({...request,state:{...request.state,triggerDay:'2026-09-09'},completeActivityConfirmed:true});
assert.equal(inCooldown.state.triggerDay,'2026-09-09');
assert.equal(control({state:inCooldown.state,portfolioSignature:signature(after),swingEquity:1900,now}).activeCapitalPct,0);
assert.equal(reconcile({...request,completeActivityConfirmed:'true'}).status,'confirmation-required');
const fails=(change,pattern)=>assert.throws(()=>reconcile({...request,completeActivityConfirmed:true,...change}),pattern);
fails({state:{...request.state,highWater:NaN}},/high-water/);
fails({state:{...request.state,highWater:0}},/zero capital/);
fails({state:{...request.state,triggerDay:'2026-02-31'}},/breaker date/);
fails({state:{...request.state,triggerDay:'2026-09-11'}},/Future/);
fails({state:{highWater:2000}},/high-water/);
fails({state:{...request.state,portfolioSignature:'unspecified'}},/no opening holdings/);
fails({state:{...request.state,observedPortfolioSignature:'changed'}},/changed after/);
fails({state:{...request.state,portfolioSignature:signature(before.map(p=>p.symbol==='AAA'?{...p,shares:11}:p))}},/opening shares/);
fails({state:{...request.state,portfolioSignature:signature(before.map(p=>p.symbol==='CASH'?{...p,shares:900}:p))}},/opening cash/);
fails({portfolio:after.map(p=>p.symbol==='AAA'?{...p,role:'Core'}:p)},/Core transfers/);
fails({portfolio:after.map(p=>p.symbol==='CASH'?{...p,avgCost:2}:p)},/unit value/);
fails({csv:csv.replace('fill2,','fill1,')},/duplicate/);
fails({csv:csv.replaceAll('2026-09-10','2026-09-11')},/Future/);
fails({csv:csv+'deposit,2026-09-10,DEPOSIT,,,,25,0\n',portfolio:after.map(p=>p.symbol==='CASH'?{...p,shares:1212}:p)},/cash-flow dates/);
fails({csv:csv+'core1,2026-09-10,SELL,MSTR,1,100,100,0\ncore2,2026-09-10,BUY,MSTR,1,100,-100,0\n'},/Core activity/);
const fs=require('node:fs'),vm=require('node:vm');
const page=fs.readFileSync('pages/index.js','utf8');
const handlers=page.slice(page.indexOf('  async function importTransactions'),page.indexOf('  async function analyze'));
const {reconcileBrokerageCSV}=loader.load('lib/brokerageReconciliation.js');
const storage=new Map([['risk',JSON.stringify(blocked.state)]]);
let quotaFailure=false,analysisCount=0,error='',check;
const box={portfolio:after,transactionImportId:{current:0},transactionSource:{current:null},
  activityComplete:false,C1_DRAWDOWN_KEY:'risk',
  localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>{if(quotaFailure)throw new Error('Storage full');storage.set(key,value);}},
  setTransactionCheck:value=>check=typeof value==='function'?value(check):value,
  setActivityComplete:value=>box.activityComplete=value,setImportingTransactions(){},setReconcilingAccount(){},setAnalysisCapitalReady(){},setErr:value=>error=value,
  reconcileBrokerageCSV,reconcileC1AccountHistory:args=>reconcile({...args,now}),
  analyze:async()=>{analysisCount++;assert.equal(JSON.parse(storage.get('risk')).highWater,2000);}};
vm.createContext(box);vm.runInContext(handlers+'\nglobalThis.importer=importTransactions;globalThis.apply=reconcileImportedHistory;',box);
const event=()=>({target:{files:[{size:csv.length,text:async()=>csv}],value:'fixture'}});
(async()=>{
  await box.importer(event());
  assert.equal(check.capitalReview.status,'confirmation-required');
  assert.equal(storage.size,1,'Import is read-only');
  await box.apply();assert.match(error,/Confirm/);assert.equal(analysisCount,0);
  box.activityComplete=true;quotaFailure=true;await box.apply();
  assert.match(error,/Storage full/);assert.equal(JSON.parse(storage.get('risk')).reconciliationRequired,true);
  quotaFailure=false;await box.apply();
  assert.equal(error,'');assert.equal(analysisCount,1);assert.equal(check.capitalReconciled,true);
  assert.equal(JSON.parse(storage.get('risk')).reconciliationRequired,false);
  const audit=JSON.parse(storage.get('stock_screener_c1_account_reconciliation_v1'));
  assert.equal(audit.length,1);assert.equal(audit[0].activity,csv);assert.equal(audit[0].priorState.highWater,2000);
  await box.apply();assert.equal(analysisCount,1,'Consumed import cannot apply twice');
  storage.set('risk',JSON.stringify(blocked.state));await box.importer(event());box.activityComplete=true;
  storage.set('risk',JSON.stringify({...blocked.state,highWater:2100}));
  await box.apply();assert.match(error,/changed after import/);assert.equal(JSON.parse(storage.get('risk')).highWater,2100);
  console.log('PASS: complete activity binds opening/current balances; partial fills, fees, peaks and cooldowns preserved; actual import/apply/save/analyze handlers reject missing confirmation, stale records and storage failure.');
})().catch(error=>{console.error(error);process.exitCode=1;});

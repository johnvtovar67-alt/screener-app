const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createWorkflowApi}=require('./fixtures/c1-trading-workflow-api.cjs');
(async()=>{
 const api=createWorkflowApi('adoption'),f=api.fixture,page=fs.readFileSync('pages/index.js','utf8');
 const original=JSON.stringify(f.adoptionPortfolioRecord.portfolio),saved=new Map([['key','offline_workflow_fixture_key_000001'],['portfolio',original]]),calls=[],state={error:'',syncAttempts:0};
 const box={...f.loader.load('lib/c1NonCashPortfolio.js'),accountView:null,portfolio:JSON.parse(original),accountRequestId:{current:0},syncPullId:{current:0},syncRevision:{current:{key:'offline_workflow_fixture_key_000001',etag:'"core"'}},syncDirty:{current:false},syncQueue:{current:Promise.resolve()},syncStatus:'Synced',KEY:'portfolio',SYNC_KEY:'key',C1_DRAWDOWN_KEY:'risk',
  localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)},
  setAccountView:v=>box.accountView=v,setPortfolio:v=>box.portfolio=v,setAccountAbsent(){},setAccountBusy(){},setResults(){},setAccountError:v=>state.error=v,setSyncStatus(){},
  pushCloudPortfolio:async()=>{state.syncAttempts++;return false;},
  fetch:async(url,options={})=>{
   if(url==='/api/portfolio-sync')return {ok:true,status:200,json:async()=>JSON.parse(JSON.stringify(f.adoptionPortfolioRecord))};
   assert.equal(url,'/api/c1-account');assert.equal(options.headers.authorization,'Bearer offline_workflow_fixture_key_000001');
   const body=options.body?JSON.parse(options.body):undefined;calls.push(body?.operation||'GET');const result=await api.request(options.method||'GET',body);return {ok:result.status===200,status:result.status,json:async()=>result.body};
  }};
 vm.createContext(box);
 const region=(start,end)=>page.slice(page.indexOf(start),page.indexOf(end,page.indexOf(start)));
 vm.runInContext(region('  async function refreshC1Account(','  async function prepareC1Execution(')+region('  async function reviewMRNAAdoption(','  async function updateBrokerageCash(')+region('  async function pullCloudPortfolio(','  async function refreshEnteredPortfolio('),box);
 await box.refreshC1Account();const review=await box.reviewMRNAAdoption(f.account.revision);assert.equal(f.writes,0);assert.equal(saved.get('portfolio'),original);
 box.syncDirty.current=true;await assert.rejects(()=>box.confirmMRNAAdoption(review.reviewId,f.account.revision),/Sync the saved portfolio/);assert.equal(f.writes,0);box.syncDirty.current=false;
 await box.confirmMRNAAdoption(review.reviewId,f.account.revision);assert.equal(f.writes,1);assert.equal(state.syncAttempts,1);assert.match(state.error,/adoption is saved in C1.*sync needs a retry/);
 let held=JSON.parse(saved.get('portfolio')).filter(p=>p.symbol==='MRNA');assert.equal(held.length,1);assert.equal(held[0].role,'Swing');assert.equal(held[0].shares,20);assert.equal(held[0].avgCost,88);assert.equal(held[0].openedAt,'2026-10-01');assert.equal(f.account.brokerageCash.balance,5000);
 // Exercise both reload orders with the real Home handlers and stale Core
 // cloud data: neither order may overwrite the receipt or duplicate shares.
 for(const accountFirst of [true,false]){
  saved.set('portfolio',original);box.portfolio=JSON.parse(original);box.accountView=null;
  if(accountFirst){await box.refreshC1Account();await box.pullCloudPortfolio(saved.get('key'));}
  else{await box.pullCloudPortfolio(saved.get('key'));await box.refreshC1Account();}
  held=JSON.parse(saved.get('portfolio')).filter(p=>p.symbol==='MRNA');assert.equal(held.length,1);assert.equal(held[0].role,'Swing');assert.equal(held[0].shares,20);
 }
 assert.equal(f.writes,1);assert(!calls.some(x=>x==='record-intraday'||x==='record-session'));
 fs.mkdirSync('work/non-cash-adoption',{recursive:true});fs.writeFileSync('work/non-cash-adoption/client.json',JSON.stringify({status:'PASS',scope:'Real Home handlers → production API → memory fixtures',reviewWrites:0,confirmationWrites:1,brokerCashChange:0,failedPortfolioSyncRecovered:true,bothReloadOrders:'PASS',duplicateShares:false,conversionCreatedTrade:false,liveWrites:0},null,2)+'\n');
 console.log('PASS: actual Home review/confirm/reload handlers preserve one Swing holding through failed portfolio sync; no brokerage trade or cash change.');
})().catch(e=>{console.error(e);process.exitCode=1;});

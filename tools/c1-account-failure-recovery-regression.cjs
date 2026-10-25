// Execute the real browser request function against isolated transport failures.
// No credentials, production endpoints, storage, or provider requests are used.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const page=fs.readFileSync('pages/index.js','utf8');
const start=page.indexOf('  async function refreshC1Account('),end=page.indexOf('  async function prepareC1Execution(',start);
assert(start>=0&&end>start);
const source=page.slice(start,end),copy=v=>JSON.parse(JSON.stringify(v));
const previous={decision:{decisionId:'synthetic:7',revision:7,positions:[{symbol:'TEST',shares:3,avgCost:101}],brokerageCash:900,actualCash:800},openingPlan:{id:'old-opening'},intradaySession:{tickets:[]}};
const recovered={decision:{...copy(previous.decision),decisionId:'synthetic:8',revision:8,brokerageCash:850},intradaySession:{tickets:[]}};
(async()=>{
 for(const operation of [null,'refresh-account-inputs','update-brokerage-cash'])for(const failureStage of ['transport','body']){
  const state={view:copy(previous),error:'',absent:false,calls:[],localWrites:0};
  let failed=true;
  const box={accountRequestId:{current:0},SYNC_KEY:'synthetic-sync-key',localStorage:{getItem:()=> 'offline_failure_fixture_key_000001',setItem:()=>{state.localWrites++;}},
   setAccountView:v=>{state.view=v;},setAccountError:v=>{state.error=v;},setAccountAbsent:v=>{state.absent=v;},
   fetch:async(url,options)=>{
    assert.equal(url,'/api/c1-account');state.calls.push({method:options.method,body:options.body});
    if(failed){if(failureStage==='transport')throw new TypeError('Load failed');return {ok:true,status:200,json:async()=>{throw new TypeError('Load failed');}};}
    assert.equal(options.method,'GET','Recovery is an explicit read, never a replayed mutation');
    return {ok:true,status:200,json:async()=>copy(recovered)};
   }};
  vm.createContext(box);vm.runInContext(source+'\nthis.refresh=refreshC1Account;',box);
  const before=JSON.stringify(state.view);
  await assert.rejects(box.refresh(operation?{operation,...(operation==='update-brokerage-cash'?{brokerageCash:850}:{})}:undefined),/Load failed/);
  assert.equal(state.calls.length,1,'A failed request must not automatically retry');
  assert.equal(state.calls[0].method,operation?'POST':'GET');
  assert.equal(JSON.stringify(state.view),before,'Retain the complete previous view after an ambiguous failure');
  assert.equal(state.absent,false);assert.equal(state.localWrites,0);
  failed=false;
  await box.refresh(null,{readOnly:true});
  assert.equal(state.calls.length,2);assert.deepEqual(copy(state.view),recovered,'An explicit read recovers the authoritative result, including a potentially committed mutation');
  assert.equal(state.localWrites,0);assert.equal(state.error,'');
 }
 console.log('PASS: all six real-client transport/body failures retain the complete view, issue zero automatic retries, and recover by explicit read.');
})().catch(error=>{console.error(error);process.exitCode=1;});

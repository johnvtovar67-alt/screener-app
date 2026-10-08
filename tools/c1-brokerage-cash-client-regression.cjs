const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const {mergeC1AccountPortfolio,portfolioHoldings,initialC1StrategyCash,seedInitialC1StrategyCash}=loader.load('lib/c1AccountPortfolio.js');
const {c1AccountDifferences}=loader.load('lib/c1AccountDifferences.js');
const {c1OpportunityPresentation}=loader.load('lib/c1EntryReview.js');
const plain=value=>JSON.parse(JSON.stringify(value));
const core=[{symbol:'MSTR',role:'Core',shares:2,avgCost:250},{symbol:'MRNA',role:'Core',shares:4,avgCost:50},{symbol:'CASH',role:'Core',shares:500,avgCost:1}];
const position={symbol:'TEST',shares:3,avgCost:100,openedAt:'2026-09-01',action:'Hold'};
const portfolio=[...core,{symbol:'TEST',role:'Swing',shares:3,avgCost:100,openedAt:'2026-09-01'},{symbol:'VMFXX',role:'Swing',shares:3037.90,avgCost:1}];
const decision={current:true,revision:9,strategyCash:3037.90,actualCash:3037.90,brokerageCash:363.36,brokerageCashCurrent:true,executableCash:363.36,positions:[position],opportunities:[{symbol:'BUY',rating:'Buy'},{symbol:'WATCH',rating:'Watch'}]};
const before=JSON.stringify(portfolio);
const merged=mergeC1AccountPortfolio(portfolio,decision);
assert.deepEqual(plain(merged.filter(row=>row.role==='Core')),core,'C1 activity preserves Core holdings and cash');
assert.equal(merged.find(row=>row.symbol==='VMFXX').shares,363.36,'Compatibility cash rows follow brokerage metadata only');
assert.equal(JSON.stringify(portfolio),before);
assert.deepEqual(plain(c1AccountDifferences(decision,portfolio)),[],'Legacy strategy-sized cash cannot create an ownership mismatch');
assert.deepEqual(plain(c1AccountDifferences({...decision,brokerageCash:0,executableCash:0},portfolio)),[],'Core spending and zero broker cash cannot create an ownership mismatch');
assert.deepEqual(plain(portfolioHoldings(merged).filter(row=>row.role==='Swing').map(row=>row.symbol)),['TEST'],'Cash and Core do not become C1 securities');
const legacy={...decision};delete legacy.brokerageCash;
assert.equal(mergeC1AccountPortfolio(portfolio,legacy).find(row=>row.symbol==='VMFXX').shares,3037.90,'Old accounts never substitute accounting cash for missing broker metadata');
assert.equal(mergeC1AccountPortfolio(portfolioHoldings(portfolio),decision).filter(row=>row.symbol==='CASH').length,0,'No synthetic Swing cash holding is created');
const seeded=seedInitialC1StrategyCash(core,3037.90);
assert.equal(initialC1StrategyCash(seeded),3037.90,'A brand-new account retains the explicit funding seed required by adoption');
assert.deepEqual(plain(seeded.filter(row=>row.role==='Core')),core,'Initial strategy funding keeps Core holdings and cash intact');
for(const brokerageCash of [0,363.36]){
 const shown=c1OpportunityPresentation({decision:{...decision,brokerageCash,executableCash:brokerageCash},plan:{entryReviews:[],cashBlockedOrders:[{symbol:'BUY',reason:'brokerage-cash-insufficient'}]},ready:true});
 assert.equal(shown.tiles[0].rating,'Buy','Cash authorization must not downgrade a completed Buy signal');
 assert.equal(shown.tiles[0].accountAction,'No purchase');
 assert.match(shown.tiles[0].detail,/C1 qualifies this stock, but available brokerage cash is insufficient/);
 assert.equal(shown.watch[0].symbol,'WATCH','Watch analysis remains visible');
}

const page=fs.readFileSync('pages/index.js','utf8');
const begin=page.indexOf('  async function updateBrokerageCash('),end=page.indexOf('  async function saveC1Activity(',begin);
assert.ok(begin>=0&&end>begin);
const source=page.slice(begin,end);
async function exercise(result){
 const requests=[],busy=[],errors=[],economicWrites=[];
 const box={setAccountBusy:value=>busy.push(value),setAccountError:value=>errors.push(value),
  refreshC1Account:async body=>{requests.push(plain(body));if(result==='failure')throw new Error('Revision conflict');return result==='interrupted'?undefined:{decision:{...decision,brokerageCash:363.36}};},
  localStorage:{setItem:(...args)=>economicWrites.push(args)},pushCloudPortfolio:()=>{throw new Error('Cash metadata must not sync holdings');},analyze:()=>{throw new Error('Cash metadata must not recalculate portfolio history');}};
 vm.createContext(box);vm.runInContext(source+'\nthis.update=updateBrokerageCash;',box);
 if(result==='success')await box.update(363.36,9);else await assert.rejects(box.update(363.36,9),result==='failure'?/Revision conflict/:/not confirmed/);
 assert.deepEqual(requests,[{operation:'update-brokerage-cash',brokerageCash:363.36,expectedRevision:9}],'One dedicated account operation updates broker metadata');
 assert.deepEqual(economicWrites,[],'Cash updates never write local holdings or capital history');
 assert.deepEqual(busy,[true,false]);
 assert.equal(decision.strategyCash,3037.90);
}
(async()=>{
 await exercise('success');await exercise('failure');await exercise('interrupted');
 // Exercise the real fetch wrapper as well: the dedicated operation must
 // never recover a revision conflict by making a second implicit API request.
 const refreshSource=page.slice(page.indexOf('  async function refreshC1Account('),page.indexOf('  async function prepareC1Execution('));
 const requests=[],storageWrites=[],box={accountRequestId:{current:0},SYNC_KEY:'key',
  localStorage:{getItem:()=> 'synthetic-key',setItem:(...args)=>storageWrites.push(args)},
  setAccountView(){},setAccountAbsent(){},setAccountError(){},setAccountBusy(){},
  fetch:async(url,options)=>{requests.push({url,options});return {ok:false,status:409,json:async()=>({error:'Revision conflict'})};}};
 vm.createContext(box);vm.runInContext(refreshSource+source+'\nthis.update=updateBrokerageCash;',box);
 await assert.rejects(box.update(363.36,9),/Reload before updating brokerage cash/);
 assert.equal(requests.length,1,'A revision conflict remains one dedicated API operation');
 assert.equal(requests[0].options.method,'POST');
 assert.deepEqual(JSON.parse(requests[0].options.body),{operation:'update-brokerage-cash',brokerageCash:363.36,expectedRevision:9});
 assert.deepEqual(storageWrites,[]);
 for(const [accountView,accountAbsent,expectedSaves] of [[null,true,1],[{decision},true,0],[null,false,0]]){
  const saves=[],errors=[],seedBox={accountView,accountAbsent,portfolio:core,initialStrategyCashInput:'3037.90',seedInitialC1StrategyCash,
   setAccountError:value=>errors.push(value),setInitialStrategyCashInput(){},save:rows=>saves.push(plain(rows))};
  vm.createContext(seedBox);vm.runInContext(source+'\nthis.seed=saveInitialC1StrategyCash;',seedBox);
  seedBox.seed({preventDefault(){}});
  assert.equal(saves.length,expectedSaves,'Initial strategy funding requires an authoritative absent account and cannot rewrite an existing or temporarily unavailable account');
 }
 console.log('PASS: brokerage cash has one dedicated client operation, preserves strategy/Core history and completed Buy/Watch analysis, and never creates a holdings mismatch or synthetic cash ownership.');
})().catch(error=>{console.error(error);process.exitCode=1;});

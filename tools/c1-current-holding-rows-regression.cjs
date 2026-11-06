// Synthetic device cache and synced holdings. No provider requests or stored accounts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const loader = require('./research-module-loader.cjs').createResearchModuleLoader(process.cwd());
const {currentC1HoldingRows, sameC1HoldingPeriod} = loader.load('lib/c1CurrentHoldingRows.js');
const page = fs.readFileSync('pages/index.js', 'utf8');
const old = {symbol:'ACME',role:'Swing',shares:27,avgCost:403.38,openedAt:'2026-09-22'};
const entry = {...old,openedAt:'2026-10-27'};
const second = {...old,symbol:'NEXT'};
const cached = [{...old,gainLoss:-773.28},second];
assert.equal(currentC1HoldingRows([entry,second],cached).length,0);
assert.equal(currentC1HoldingRows([second],cached).length,0);
assert.equal(currentC1HoldingRows([second,{...old,openedAt:'2026-09-22T12:00:00Z'}],cached),cached);
for (const change of [{shares:16},{avgCost:461.19},{role:'Core'}])
  assert(!sameC1HoldingPeriod(old,{...old,...change}));
const start = page.indexOf('  useEffect(()=>{\n    let local=');
const end = page.indexOf('  useEffect(()=>{const update=',start);
assert(start>=0 && end>start);
async function boot(local,synced) {
  let finish, priced, entered;
  const gate = new Promise(resolve=>{finish=resolve;});
  const storage = new Map([['sync','synthetic'],['positions',JSON.stringify(local)]]);
  vm.runInNewContext(page.slice(start,end), {useEffect:fn=>fn(),KEY:'positions',SYNC_KEY:'sync',
    localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},
    role:(_symbol,role)=>role,winnerHistoryFor:()=>({}),setPortfolio:rows=>{entered=rows;},setSyncInput(){},setSyncKey(){},
    pullCloudPortfolio:async()=>{await gate;if(synced!==null){entered=synced;storage.set('positions',JSON.stringify(synced));}return synced!==null;},
    load:(_tab,_pass,{pricePortfolio})=>{priced=pricePortfolio;}});
  assert(priced,'The screen starts independently of the portfolio sync');
  finish();return {priced:JSON.parse(JSON.stringify(await priced)),entered:JSON.parse(JSON.stringify(entered))};
}
(async()=>{
  for(const [local,synced] of [[[old,second],[second]],[[old],[entry]],[[],[entry]],[[old],[]],[[old],null]]){
    const result=await boot(local,synced);assert.deepEqual(result.priced,result.entered);
  }
  const holdingStart=page.indexOf('  function holdingQuoteRow(');
  const holdingEnd=page.indexOf('  async function pushCloudPortfolio(',holdingStart);
  const merge=new Function('CASH','sym','sameC1HoldingPeriod',page.slice(holdingStart,holdingEnd)+'; return holdingQuoteRow;')([],row=>row.symbol,sameC1HoldingPeriod);
  const failed=merge(entry,{error:'synthetic quote unavailable'},cached[0]);
  assert.equal(failed.openedAt,entry.openedAt);assert.equal(failed.gainLoss,undefined);
  assert.match(page,/currentC1HoldingRows\(portfolio,analyzedRows\)/);
  console.log('PASS: syncing, closing and reopening holdings cannot attach a former period or its P/L to current analysis.');
})().catch(error=>{console.error(error);process.exitCode=1;});

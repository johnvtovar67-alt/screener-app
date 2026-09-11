const assert=require('node:assert/strict');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const {c1HoldingRisk:run}=createResearchModuleLoader(process.cwd()).load('lib/c1HoldingRisk.js');
const now=new Date('2026-09-10T15:00:00Z');
const holding={symbol:'AAA',role:'Swing',shares:10,avgCost:100,price:90,timestamp:now.getTime()/1000};
const [above]=run([holding],now);
assert.equal(above.referencePrice,86);assert.equal(above.status,'above-reference');
assert.ok(Math.abs(above.downsideToReferencePct-4.444444444444445)<1e-9);
assert.equal(run([{...holding,price:86}],now)[0].status,'at-or-below-reference');
assert.equal(run([{...holding,price:85}],now)[0].status,'at-or-below-reference');
for(const change of [{timestamp:null},{timestamp:now.getTime()/1000-3600},{timestamp:now.getTime()/1000+60},
  {price:0},{shares:0},{error:'provider failed'},{dataFeedSnapshotStale:true},{clientSnapshotFallback:true},{_fmpQuoteCache:'stale-fallback'}])
  assert.equal(run([{...holding,...change}],now)[0].status,'quote-unverified');
assert.equal(run([{...holding,avgCost:null}],now)[0].status,'basis-required');
assert.equal(run([{...holding,role:'Core'},{...holding,symbol:'MSTR'},{...holding,symbol:'CASH'}],now).length,0);
assert.equal(above.executable,false);assert.equal(above.orders.length,0);
assert.equal(run([{...holding,price:90}],new Date('2026-09-10T15:16:00Z'))[0].status,'quote-unverified','Time alone can make the displayed quote stale');
console.log('PASS: exact 14% references, quote age/future timestamps, missing inputs, Core/MSTR/cash exclusions and no inferred orders');

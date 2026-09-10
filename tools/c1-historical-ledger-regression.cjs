// Deterministic accounting fixtures, reconstructed with the identity-pinned
// historical simulator. These are previously inspected data, not a holdout.
const fs = require('node:fs'), assert = require('node:assert/strict');
const { gunzipSync } = require('node:zlib');
const { createResearchModuleLoader } = require('./research-module-loader.cjs');
const { createC1SleeveAccounting: create, applyC1SleeveFill: fill,
  valueC1SleeveAccounting: value, C1_ACCOUNTING_WEIGHTS: weights } =
  createResearchModuleLoader(process.cwd()).load('lib/c1SleeveAccounting.js');
let totalOrders = 0, totalCheckpoints = 0;
for (const universe of ['nasdaq','sp500']) {
  const fixtures = JSON.parse(gunzipSync(Buffer.from(fs.readFileSync(
    `tools/fixtures/c1-${universe}-accounting.json.gz.base64`,'utf8'),'base64')));
  assert.equal(fixtures.length,3);
  for (const run of fixtures) {
    assert.equal(run.options.commissionPerOrder,0);
    const weight = weights[run.id]; assert.ok(weight > 0);
    let state = create(100000,run.options.startDate), index = 0;
    for (const point of run.curve) {
      while (index < run.trades.length && run.trades[index].date <= point.date) {
        const t=run.trades[index];
        state=fill(state,{...t,id:`${run.id}:${index}`,sleeve:run.id,shares:t.shares*weight,fee:0});
        index++;
      }
      const marked=value(state,point.marks).sleeves[run.id];
      assert.ok(Math.abs(marked.cash-point.cash*weight)<=0.0051,`${universe}/${run.id}/${point.date}: cash`);
      assert.ok(Math.abs(marked.equity-point.equity*weight)<=0.0051,`${universe}/${run.id}/${point.date}: equity`);
      assert.equal(Object.keys(state.sleeves[run.id].positions).length,point.positions);
      totalCheckpoints++;
    }
    assert.equal(index,run.trades.length);totalOrders+=index;
  }
}
assert.equal(totalOrders,976);assert.equal(totalCheckpoints,5508);
console.log(`PASS: ${totalOrders} historical fills and ${totalCheckpoints} cash/equity/position checkpoints across both C1 universes.`);

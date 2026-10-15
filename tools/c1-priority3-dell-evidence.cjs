// Reproduce the descriptive DELL snapshot from captured market data, offline.
// No new ranking, trading rule, account operation, provider request or file write.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const captured = JSON.parse(fs.readFileSync(path.join(__dirname,
  '../docs/research/c1-priority3-dell-evidence-20261014.json'), 'utf8'));
const results = {};
for (const name of ['dellAdjusted', 'dellRaw', 'spyAdjusted']) {
  const rows = captured.series[name];
  assert.ok(Array.isArray(rows) && rows.length >= 121);
  const prices = rows.map(row => name === 'dellRaw' ? row.close : row.adjClose);
  assert.ok(prices.every(price => Number.isFinite(price) && price > 0));
  assert.ok(rows.every((row, index) => !index || row.date > rows[index - 1].date));
  const ret = (length, skip = 0) => (prices.at(-1 - skip) / prices.at(-1 - skip - length) - 1) * 100;
  const recentReturnPct = Object.fromEntries([1, 3, 5, 10].map(length => [length, ret(length)]));
  const lagged100Ending20Pct = ret(100, 20), lagged55Ending5Pct = ret(55, 5);
  for (const [length, value] of Object.entries(recentReturnPct)) {
    assert.ok(Math.abs(value - captured.metrics[name].recentReturnPct[length]) < 1e-9);
  }
  assert.ok(Math.abs(lagged100Ending20Pct - captured.metrics[name].lagged100Ending20Pct) < 1e-9);
  assert.ok(Math.abs(lagged55Ending5Pct - captured.metrics[name].lagged55Ending5Pct) < 1e-9);
  results[name] = {latestDate: rows.at(-1).date, latestClose: prices.at(-1),
    recentReturnPct, lagged100Ending20Pct, lagged55Ending5Pct};
}
assert.equal(results.dellAdjusted.latestDate, results.spyAdjusted.latestDate);
console.log(JSON.stringify({capturedAt: captured.observedAt, sourceCommit: captured.sourceCommit,
  interpretation: 'Descriptive returns only; no peer percentile, actual rank, account action or performance advantage inferred.',
  results}, null, 2));

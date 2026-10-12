// Reads already-completed replay summaries and saved fixture metrics only.
// No historical replay, network request, account read, or strategy mutation.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const repoRoot = path.resolve(__dirname, '..');
const resultsRoot = path.resolve(process.argv[2] || path.join(repoRoot, '../work/c1-validation/results'));
const outputRoot = path.resolve(process.argv[3] || resultsRoot);
const fixtureMetricsPath = path.join(repoRoot, 'docs/research/c1-validation-20261012/preserved-frozen-12bps-metrics.json');
const costReceiptPath = path.join(repoRoot, 'docs/research/c1-validation-20261012/preserved-frozen-cost-audit.json');
const costReceiptBytes = fs.readFileSync(costReceiptPath);
const costReceipt = JSON.parse(costReceiptBytes);
const costReceiptBlobSHA = crypto.createHash('sha1')
  .update(`blob ${costReceiptBytes.length}\0`).update(costReceiptBytes).digest('hex');
assert.equal(costReceiptBlobSHA, '6637ab6a5f4d6cd7c4a8c3dc9861d1fa3c4c70a2',
  'The preserved original cost-receipt bytes must match its retrieved Git blob');
const published = {
  12: { totalReturnPct: 380.72, sharpe: 1.585, maxDrawdownPct: -20.70,
    alphaPositivePeriods: '7/8', topThreeGrossProfitSharePct: 47.61 },
  25: { totalReturnPct: 314.20, sharpe: 1.441, maxDrawdownPct: -24.17,
    alphaPositivePeriods: '6/8', topThreeGrossProfitSharePct: 49.22 },
  50: { totalReturnPct: 260.63, sharpe: 1.303, maxDrawdownPct: -22.93,
    alphaPositivePeriods: '6/8', topThreeGrossProfitSharePct: 47.13 }
};
// Cost receipt contains return/drawdown/benchmark excess, but no Sharpe.
const authoritative = Object.fromEntries(costReceipt.universes.sp500.results
  .map(r => [r.slippageBps, { totalReturnPct: r.totalReturnPct,
    maxDrawdownPct: r.maxDrawdownPct, benchmarks: r.benchmarks }]));
for (const cost of [12, 25, 50]) assert.ok(authoritative[cost], `Missing preserved cost ${cost}`);
const hashFile = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const metricsKeys = ['totalReturnPct', 'sharpe', 'sortino', 'legacySourceSortino',
  'maxDrawdownPct', 'fillCount', 'tradeCount', 'closedTrades', 'winRatePct', 'profitFactor',
  'averageHoldingSessions', 'medianHoldingSessions', 'twoWayTradedNotional', 'turnoverPct',
  'annualizedTurnoverPct', 'capitalUtilizationPct', 'openTerminalPositions', 'endingEquity'];
const selectMetrics = m => Object.fromEntries(metricsKeys
  .filter(k => Object.hasOwn(m, k)).map(k => [k, m[k]]));
const deltas = (current, baseline) => Object.fromEntries(metricsKeys
  .filter(k => Number.isFinite(current[k]) && Number.isFinite(baseline[k]))
  .map(k => [k, current[k] - baseline[k]]));
const fixtureReport = JSON.parse(fs.readFileSync(fixtureMetricsPath));
const fixture12 = fixtureReport.results.find(r => r.universe === 'sp500');
assert.ok(fixture12 && fixture12.slippageBps === 12);
const frozen12 = fixture12.combinedMetrics;
const frozenSharpe = {
  12: { value: frozen12.sharpe, source: fixtureMetricsPath,
    precision: 'Full preserved-fixture daily-curve arithmetic precision.' },
  25: { value: published[25].sharpe, source: 'docs/research/v12-active-swing-ensemble-c1.md',
    precision: 'Published value to three decimals; additional precision unavailable.' },
  50: { value: published[50].sharpe, source: 'docs/research/v12-active-swing-ensemble-c1.md',
    precision: 'Published value to three decimals; additional precision unavailable.' }
};
const comparisons = [12, 25, 50].map(cost => {
  const file = path.join(resultsRoot, `current-${cost}bps.summary.json`);
  if (!fs.existsSync(file)) return { slippageBps: cost, state: 'pending-summary',
    expectedCurrentSummary: file, frozenAuthoritative: authoritative[cost],
    frozenSharpe: frozenSharpe[cost], frozenPublished: published[cost] };
  const current = JSON.parse(fs.readFileSync(file));
  assert.equal(current.slippageBps, cost, 'Cost/filename mismatch');
  assert.ok(current.metrics, 'Summary metrics required');
  assert.equal(current.startDate, fixture12.startDate, 'Comparison start dates differ');
  assert.equal(current.endDate, fixture12.endDate, 'Comparison end dates differ');
  const sameDates = current.startDate === fixture12.startDate && current.endDate === fixture12.endDate;
  const benchmarkComparisons = current.metrics.benchmarkComparisons || {};
  const originalFrozenBenchmarkExcess = authoritative[cost].benchmarks;
  const deltaCurrentMinusOriginalFrozenBenchmarkExcess = Object.fromEntries(
    Object.entries(benchmarkComparisons)
      .filter(([symbol, b]) => Number.isFinite(b.excessReturnPct)
        && Number.isFinite(originalFrozenBenchmarkExcess[symbol]?.simpleDifferencePct))
      .map(([symbol, b]) => [symbol,
        b.excessReturnPct - originalFrozenBenchmarkExcess[symbol].simpleDifferencePct]));
  const restatedFrozenBenchmarkExcess = Object.fromEntries(Object.entries(benchmarkComparisons)
    .filter(([, b]) => Number.isFinite(b.simpleReturnPct ?? b.simpleCloseToCloseReturnPct))
    .map(([symbol, b]) => { const benchmarkReturnPct = b.simpleReturnPct ?? b.simpleCloseToCloseReturnPct;
      return [symbol, { benchmarkReturnPct,
        currentExcessReturnPct: current.metrics.totalReturnPct - benchmarkReturnPct,
        frozenAuthoritativeExcessOnCurrentBenchmarkPct: authoritative[cost].totalReturnPct - benchmarkReturnPct,
        ...(cost === 12 ? { frozenFixture12ExcessOnCurrentBenchmarkPct: frozen12.totalReturnPct - benchmarkReturnPct } : {}),
        status: 'Common-date restatement using the current replay benchmark. The stripped frozen accounting fixture does not retain its original benchmark history.' }]; }));
  return { slippageBps: cost, state: 'summary-present', currentSummary: file,
    currentSummarySha256: hashFile(file), currentContract: current.contract,
    currentRunClass: current.runClass ?? null,
    currentEligibilityForAlphaClaim: current.eligibleForAlphaClaim ?? null,
    currentInputManifestSha256: current.inputManifestSha256 ?? null,
    currentSourcePin: current.sourcePin ?? null,
    startDate: current.startDate, endDate: current.endDate,
    frozenObservations: fixture12.observations, currentObservations: current.observations,
    sameDateRange: sameDates, frozenAuthoritative: authoritative[cost],
    frozenSharpe: frozenSharpe[cost], frozenPublished: published[cost],
    currentMetrics: selectMetrics(current.metrics), currentBenchmarkComparisons: benchmarkComparisons,
    deltaCurrentMinusFrozenAuthoritative: deltas(current.metrics, authoritative[cost]),
    deltaCurrentMinusFrozenSharpe: current.metrics.sharpe - frozenSharpe[cost].value,
    deltaCurrentMinusFrozenPublished: deltas(current.metrics, published[cost]),
    ...(cost === 12 ? { frozenFixture12Metrics: selectMetrics(frozen12),
      deltaCurrentMinusFrozenFixture12: deltas(current.metrics, frozen12) } : {
      additionalFrozenTradeMetrics: null,
      unavailableReason: 'Preserved 25/50 bps receipts provide aggregate return, Sharpe, drawdown and consistency/concentration; no complete trade ledger for supplementary metrics is available.' }),
    originalFrozenBenchmarkExcess, deltaCurrentMinusOriginalFrozenBenchmarkExcess,
    restatedFrozenBenchmarkExcess };
});
const report = { contract: 'c1-current-vs-preserved-descriptive-comparison-v1',
  complete: comparisons.every(c => c.state === 'summary-present'), universe: 'S&P 500',
  source: {
    frozenAuthoritativeReceipt: {
      url: 'https://github.com/johnvtovar67-alt/screener-app/blob/research/c1-frozen-cost-audit/docs/research/c1-cost-audit-20260910.json',
      gitBranch: 'research/c1-frozen-cost-audit',
      gitPath: 'docs/research/c1-cost-audit-20260910.json',
      provenance: 'Reads the exact original preserved receipt bytes retrieved with the connected GitHub reader by the parent audit. No cost-audit historical experiment was rerun.',
      localOriginalReceiptAvailable: true,
      localPath: costReceiptPath,
      bytes: costReceiptBytes.length,
      sha256: hashFile(costReceiptPath),
      gitBlobSHA: costReceiptBlobSHA,
      storedNumbers: authoritative
    },
    frozenAuthoritativePrecision: 'Returns and drawdowns retain all stored receipt precision. The receipt benchmark returns are stored to two decimal places. This original cost receipt contains no Sharpe values.',
    frozenSharpeSources: frozenSharpe,
    frozenPublishedSummary: 'docs/research/v12-active-swing-ensemble-c1.md; published rounded summary preserved separately',
    frozenPublishedPrecision: 'Return/drawdown percentages rounded to 0.01; Sharpe rounded to 0.001. Deltas against those published figures inherit their rounding.',
    frozen12FixtureMetrics: fixtureMetricsPath, frozen12FixtureMetricsSha256: hashFile(fixtureMetricsPath),
    arithmetic: 'No historical engine rerun. Reads completed current summaries and preserved frozen fixture arithmetic only.' },
  metricConventions: {
    differenceDirection: 'Every delta is current minus frozen. Positive drawdown delta means a less negative drawdown. Percentage-valued deltas are percentage points.',
    sharpe: 'Mean daily return / sample daily-return deviation * sqrt(252); zero risk-free rate.',
    sortino: 'Standard zero-target downside RMS over all daily returns; legacySourceSortino retains source negative-return sample deviation.',
    trades: 'Completed sleeve round trips; identical symbols held by different sleeves count separately. Fills are separately reported.',
    medianHoldingSessions: 'Standard median averages two middle values for even counts. Frozen S&P has middle values 31 and 31, so old upper-middle selection and standard median both equal 31.',
    turnover: 'Two-way buy+sell notional divided by mean daily combined equity; annualized by 252/observations.',
    capitalUtilization: 'Mean daily (1 - combined cash / combined equity).',
    frozenBenchmarkExcess: 'Original excess comes directly from the recovered cost receipt, which uses two-decimal benchmark returns. A separate restatement uses current close-to-close benchmarks; it is not substituted for the original receipt.' },
  comparisonLimitations: [
    'Different ranking/eligibility cohorts and compiler conventions can change opportunities even over identical S&P 500 dates. Source compiler receipts must identify the actual current candidate pool.',
    'Frozen arithmetic weights three independently simulated 100000-dollar whole-share books at 25/50/25. Current production maps source planned integer shares into actual 25000/50000/25000-dollar books with double flooring. Analytical weighted original quantities do not represent current executable shares.',
    'Frozen fixtures artificially sell remaining positions at final close with modeled cost. Current production has no terminal liquidation and marks remaining positions; closed-trade statistics exclude open terminal holdings.',
    'Verified descriptive differences include the current 253-observation cohort and profile/issuer representation, SCHW allocation exclusion, production confirmed/profit/30-plus rank exit logic, actual whole-share double-floor mapping and terminal treatment. The performance delta cannot be attributed solely to the momentum-exit overlay. Price-factor formulas matched the archive; this task did not optimize or change factor weights or risk thresholds.',
    'A conditional account-policy model that skips literal input guards or lacks live Buy/event/brokerage verification cannot validate exact current production alpha. Retain each current summary runClass and eligibility flags in interpretation.',
    'Saved sector provenance and researcher/model-selection limitations remain. The same inspected time period does not become an untouched holdout.' ], comparisons };
fs.mkdirSync(outputRoot, { recursive: true });
const output = path.join(outputRoot, 'current-vs-preserved-comparison.json');
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
const cell = v => v == null ? 'unavailable' : Number.isFinite(v) ? String(v) : String(v);
const lines = [
  '# Current C1 versus preserved frozen S&P 500 results', '',
  `Status: ${report.complete ? 'all completed current summaries present' : 'waiting for completed current summaries'}.`, '',
  'This comparison reads saved results only. It is a descriptive comparison across the implemented policies and input conventions.', '',
  '| Cost | Current return | Frozen receipt return | Delta (pp) | Current Sharpe | Frozen Sharpe | Current max DD | Frozen max DD |',
  '|---|---:|---:|---:|---:|---:|---:|---:|'
];
for (const c of comparisons) {
  const m = c.currentMetrics || {}, d = c.deltaCurrentMinusFrozenAuthoritative || {};
  lines.push(`| ${c.slippageBps} bps | ${cell(m.totalReturnPct)} | ${c.frozenAuthoritative.totalReturnPct} | ${cell(d.totalReturnPct)} | ${cell(m.sharpe)} | ${c.frozenSharpe.value} | ${cell(m.maxDrawdownPct)} | ${c.frozenAuthoritative.maxDrawdownPct} |`);
}
lines.push('', ...report.comparisonLimitations.map(x => `- ${x}`), '',
  'Supplementary frozen metrics are recovered only for 12 bps. Standard and legacy-source Sortino are separate fields. Both frozen median conventions equal 31 sessions.', '',
  'Frozen return, drawdown and original benchmark excess come from the preserved cost-audit JSON. Sharpe is absent from that receipt: 12 bps uses saved fixture arithmetic; 25/50 bps use the frozen policy report at three-decimal precision.', '');
fs.writeFileSync(path.join(outputRoot, 'current-vs-preserved-comparison.md'), lines.join('\n'));
console.log(JSON.stringify({ output, complete: report.complete,
  states: comparisons.map(c => ({ slippageBps: c.slippageBps, state: c.state })) }, null, 2));

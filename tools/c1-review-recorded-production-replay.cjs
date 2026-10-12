// Read-only independent arithmetic for a recorded conditional production-policy
// replay. Decodes saved audit values; never executes a strategy or compiler.
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const args = process.argv.slice(2);
const rootOption = args.indexOf('--repo-root');
if (rootOption >= 0 && (!args[rootOption + 1] || args[rootOption + 1].startsWith('--'))) throw new Error('--repo-root requires a repository path');
const root = path.resolve(rootOption < 0 ? path.join(__dirname, '..') : args.splice(rootOption, 2)[1]);
const [runPath, outputPath, acceptedDataRoot] = args;
if (!runPath || !outputPath || args.length > 3 || args.some(arg => arg.startsWith('--'))) throw new Error('Usage: node tools/c1-review-recorded-production-replay.cjs RUN_PATH OUTPUT_PATH [ACCEPTED_DATA_ROOT] [--repo-root ROOT]');
const { parseAudit } = require(path.join(root, 'tools/c1-production-policy-replay.cjs'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const bytes = fs.readFileSync(runPath), run = parseAudit(runPath.endsWith('.gz') ? zlib.gunzipSync(bytes).toString() : bytes.toString());
assert.equal(run.runClass, 'conditional-current-account-policy-counterfactual');
assert.equal(run.actualLiveInputAccepted, false); assert.equal(run.eligibleForAlphaClaim, false);
assert.equal(run.operationalBuyVerificationReproduced, false); assert.equal(run.brokerageSnapshotsReproduced, false); assert.equal(run.historicalEventHistoryAvailable, false);
assert([12, 25, 50].includes(run.slippageBps)); assert.deepEqual(run.actualSleeveWeights, { base: 0.25, cooldown15: 0.5, sector40: 0.25 });
assert.equal(run.observations, 918); assert.equal(run.curve.length, 918);
assert.equal(run.startDate, '2023-01-04'); assert.equal(run.endDate, '2026-09-01'); assert.equal(run.initialCapital, 100000);
for (const [file, expected] of Object.entries(run.sourcePin.sources)) assert.equal(sha(fs.readFileSync(path.join(root, file))), expected, file);
assert.equal(sha(JSON.stringify(Object.entries(run.sourcePin.sources).sort())), run.sourcePin.sourceGraphSha256);
assert.equal(sha(fs.readFileSync(path.join(root, 'tools/c1-production-replay-loader.cjs'))), run.sourcePin.adapterSha256);
assert.deepEqual(run.sourcePin.costOverlay, { onlyChangedOption: 'slippageBps', value: run.slippageBps });
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const deviation = values => values.length < 2 ? 0 : Math.sqrt(values.reduce((sum, value) => sum + (value - mean(values)) ** 2, 0) / (values.length - 1));
const returns = run.curve.slice(1).map((row, index) => row.equity / run.curve[index].equity - 1);
let peak = run.initialCapital, drawdown = 0;
for (const row of run.curve) { peak = Math.max(peak, row.equity); drawdown = Math.min(drawdown, row.equity / peak - 1); }
const closed = run.trades.filter(trade => trade.side === 'sell' && trade.positionClosed);
const pnl = trade => trade.roundTripPnl ?? trade.realizedPnl;
const grossProfit = closed.reduce((sum, trade) => sum + Math.max(0, pnl(trade)), 0);
const grossLoss = -closed.reduce((sum, trade) => sum + Math.min(0, pnl(trade)), 0);
const notional = run.fills.reduce((sum, fill) => sum + fill.shares * fill.price, 0);
const values = run.curve.map(row => row.equity), downsideRms = Math.sqrt(mean(returns.map(value => Math.min(0, value) ** 2)));
const sortedHolds = closed.map(trade => trade.holdingSessions).sort((a, b) => a - b), middle = Math.floor(sortedHolds.length / 2);
const calculated = {
  initialCapital: run.initialCapital, endingEquity: values.at(-1), totalReturnPct: (values.at(-1) / run.initialCapital - 1) * 100,
  sharpe: deviation(returns) ? mean(returns) / deviation(returns) * Math.sqrt(252) : 0,
  sortino: downsideRms ? mean(returns) / downsideRms * Math.sqrt(252) : 0,
  legacySourceSortino: deviation(returns.filter(value => value < 0)) ? mean(returns) / deviation(returns.filter(value => value < 0)) * Math.sqrt(252) : 0,
  maxDrawdownPct: drawdown * 100, fillCount: run.fills.length, tradeCount: closed.length, closedTrades: closed.length,
  winRatePct: closed.length ? closed.filter(trade => pnl(trade) > 0).length / closed.length * 100 : 0,
  profitFactor: grossLoss ? grossProfit / grossLoss : null,
  averageHoldingSessions: closed.length ? mean(closed.map(trade => trade.holdingSessions)) : 0,
  medianHoldingSessions: !closed.length ? null : sortedHolds.length % 2 ? sortedHolds[middle] : (sortedHolds[middle - 1] + sortedHolds[middle]) / 2,
  twoWayTradedNotional: notional, turnoverPct: notional / mean(values) * 100,
  annualizedTurnoverPct: notional / mean(values) * 252 / values.length * 100,
  capitalUtilizationPct: mean(run.curve.map(row => 1 - row.cash / row.equity)) * 100,
  openTerminalPositions: run.curve.at(-1).positionCount,
};
let maxMetricDifference = 0;
for (const [name, value] of Object.entries(calculated)) {
  const recorded = run.metrics[name];
  if (value === null) assert.equal(recorded, null, name);
  else { const difference = Math.abs(value - recorded); maxMetricDifference = Math.max(maxMetricDifference, difference); assert(difference <= 1e-8 * Math.max(1, Math.abs(recorded)), name); }
}
assert.equal(run.trades.length, run.fills.length);
assert.equal(run.trades.length, closed.length * 2 + run.curve.at(-1).positionCount);
const entries = new Map(); let reconstructedPnlError = 0;
for (const trade of run.trades) {
  assert(Number.isSafeInteger(trade.shares));
  const key = trade.sleeve + ':' + trade.positionId;
  if (trade.side === 'buy') { assert(!entries.has(key)); entries.set(key, trade); }
  else { const entry = entries.get(key); assert(entry && trade.positionClosed); assert.equal(trade.shares, entry.shares);
    const difference = Math.abs(trade.shares * (trade.price - entry.price) - pnl(trade));
    reconstructedPnlError = Math.max(reconstructedPnlError, difference); assert(difference < 1e-7); entries.delete(key); }
}
assert.equal(entries.size, run.curve.at(-1).positionCount);
assert.equal(run.accountTrace.length, run.curve.length);
const modeledBooks = Object.fromEntries(Object.entries(run.actualSleeveWeights).map(([sleeve, weight]) => [sleeve, { cash: run.initialCapital * weight, positions: new Map() }]));
const fillsByDate = new Map();
for (const fill of run.fills) { const date = fill.executedAt.slice(0, 10); if (!fillsByDate.has(date)) fillsByDate.set(date, []); fillsByDate.get(date).push(fill); }
let maxSessionCashDifference = 0, maxSessionEquityAggregationDifference = 0, holdingsChecked = 0;
for (let index = 0; index < run.curve.length; index++) {
  const row = run.curve[index], trace = run.accountTrace[index]; assert.equal(row.date, trace.date);
  for (const fill of fillsByDate.get(row.date) || []) {
    const book = modeledBooks[fill.sleeve]; assert(book); assert(Number.isSafeInteger(fill.shares));
    book.cash += (fill.side === 'sell' ? 1 : -1) * fill.shares * fill.price - fill.fee;
    if (fill.side === 'buy') { assert(!book.positions.has(fill.symbol)); book.positions.set(fill.symbol, { shares: fill.shares, avgCost: fill.price + fill.fee / fill.shares }); }
    else { const position = book.positions.get(fill.symbol); assert(position); assert.equal(position.shares, fill.shares); book.positions.delete(fill.symbol); }
  }
  let cash = 0, equity = 0, positionCount = 0;
  for (const [sleeve, book] of Object.entries(modeledBooks)) {
    const saved = trace.books[sleeve], sleeveState = trace.sleeves[sleeve];
    const difference = Math.abs(saved.cash - book.cash); maxSessionCashDifference = Math.max(maxSessionCashDifference, difference); assert(difference < 1e-7);
    assert.equal(saved.cash, sleeveState.cash); assert.equal(Object.keys(saved.positions).length, book.positions.size);
    for (const [symbol, position] of Object.entries(saved.positions)) {
      const calculatedPosition = book.positions.get(symbol); assert(calculatedPosition); assert(Number.isSafeInteger(position.shares));
      assert.equal(position.shares, calculatedPosition.shares); assert(Math.abs(position.avgCost - calculatedPosition.avgCost) < 1e-10); holdingsChecked++;
    }
    cash += saved.cash; equity += sleeveState.equity; positionCount += book.positions.size;
  }
  maxSessionCashDifference = Math.max(maxSessionCashDifference, Math.abs(cash - row.cash)); assert(Math.abs(cash - row.cash) < 1e-7);
  maxSessionEquityAggregationDifference = Math.max(maxSessionEquityAggregationDifference, Math.abs(equity - row.equity)); assert(Math.abs(equity - row.equity) < 1e-7);
  assert.equal(positionCount, row.positionCount);
}
const cashFromFills = run.initialCapital + run.fills.reduce((sum, fill) => sum + (fill.side === 'sell' ? 1 : -1) * fill.shares * fill.price - fill.fee, 0);
const finalCash = Object.values(run.final.books).reduce((sum, book) => sum + book.cash, 0);
assert(Math.abs(cashFromFills - finalCash) < 1e-7);
const terminalInvestedMarketValue = run.curve.at(-1).equity - finalCash;
let terminalMarkCheck = null;
if (acceptedDataRoot) {
  const manifestBytes = fs.readFileSync(path.join(acceptedDataRoot, 'manifest.json'));
  assert.equal(sha(manifestBytes), run.inputManifestSha256);
  const manifest = JSON.parse(manifestBytes), lastChunk = manifest.chunks.at(-1);
  const compressed = fs.readFileSync(path.join(acceptedDataRoot, lastChunk.pathname)); assert.equal(sha(compressed), lastChunk.compressedSha256);
  const uncompressed = zlib.gunzipSync(compressed); assert.equal(sha(uncompressed), lastChunk.contentSha256);
  const session = JSON.parse(uncompressed).sessions.at(-1); assert.equal(session.date, run.endDate);
  const prices = new Map(session.prices.map(row => [row.symbol, row.close])); let markedValue = 0;
  for (const book of Object.values(run.final.books)) for (const [symbol, position] of Object.entries(book.positions)) {
    assert(prices.get(symbol) > 0); markedValue += position.shares * prices.get(symbol);
  }
  assert(Math.abs(markedValue - terminalInvestedMarketValue) < 1e-7);
  terminalMarkCheck = { passed: true, inputChunk: lastChunk.pathname, inputChunkCompressedSha256: lastChunk.compressedSha256, priceDate: session.date,
    investedMarketValueFromAcceptedCloses: markedValue, differenceFromFinalSavedEquityLessCash: markedValue - terminalInvestedMarketValue };
}
const terminalExitCost = terminalInvestedMarketValue * run.slippageBps / 10000;
const frozenBytes = fs.readFileSync(path.join(root, 'docs/research/c1-validation-20261012/preserved-frozen-cost-audit.json'));
const frozenResult = JSON.parse(frozenBytes).universes.sp500.results.find(row => row.slippageBps === run.slippageBps);
assert(frozenResult); const frozenReturnPct = frozenResult.totalReturnPct;
const terminalCostComparison = {
  method: 'Arithmetic-only hypothetical one-side closing cost on final marked holdings; no new policy run or executed sale.',
  finalMarkedEquity: run.curve.at(-1).equity, finalCash, terminalInvestedMarketValue,
  oneSideAdverseExitCost: terminalExitCost, returnCostPercentagePoints: terminalExitCost / run.initialCapital * 100,
  arithmeticLiquidationEquivalentReturnPct: (run.curve.at(-1).equity - terminalExitCost) / run.initialCapital * 100 - 100,
  preservedFrozenReturnPct: frozenReturnPct, markedReturnDifferencePercentagePoints: calculated.totalReturnPct - frozenReturnPct,
  liquidationEquivalentDifferencePercentagePoints: calculated.totalReturnPct - terminalExitCost / run.initialCapital * 100 - frozenReturnPct,
};
const receipt = { contract: 'c1-independent-saved-run-arithmetic-review-v1', passed: true,
  scope: 'Independent saved fills, curves, trades, cash and terminal-cost arithmetic; no policy/compiler replay.',
  actualLiveInputAccepted: false, eligibleForAlphaClaim: false, slippageBps: run.slippageBps,
  runArtifactSha256: sha(bytes), inputManifestSha256: run.inputManifestSha256, inputContentSha256: run.inputContentSha256,
  sourceGraphSha256: run.sourcePin.sourceGraphSha256, independentReviewerSha256: sha(fs.readFileSync(__filename)),
  preservedFrozenCostAuditSha256: sha(frozenBytes), engineSha256: sha(fs.readFileSync(path.join(root, 'tools/c1-production-policy-replay.cjs'))),
  metricChecks: calculated, maxMetricDifference, maxRoundTripPnlReconstructionDifference: reconstructedPnlError,
  chronologicalBookArithmetic: { sessionsChecked: run.curve.length, holdingsChecked, maxSessionCashDifference, maxSessionEquityAggregationDifference },
  endingCashReconstructedFromFills: cashFromFills, terminalMarkCheck, terminalCostComparison,
  interpretation: 'Numerical comparison describes the conditional core-policy counterfactual; it establishes neither production outperformance nor validated alpha, and cannot isolate exit-policy effects.' };
fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true }); fs.writeFileSync(outputPath, JSON.stringify(receipt, null, 2));
console.log(JSON.stringify(receipt));

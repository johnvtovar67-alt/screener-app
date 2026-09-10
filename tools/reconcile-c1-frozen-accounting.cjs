// Accounting-only replay. Never searches parameters or counts old sessions as new evidence.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { gunzipSync } = require('node:zlib');
const { createHash } = require('node:crypto');
const { createResearchModuleLoader } = require('./research-module-loader.cjs');
const [frozenRoot, dataRoot, output] = process.argv.slice(2);
if (!frozenRoot || !dataRoot || !output) throw new Error('Usage: node tools/reconcile-c1-frozen-accounting.cjs FROZEN_ROOT DATA_ROOT OUTPUT');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const simulator = fs.readFileSync(path.join(frozenRoot, 'lib/walkForwardBacktest.js'));
const expectedSimulator = 'bcf3cc3e89ac499319a2cbfab76e42fda3bda5ef72d2d45777959e73e6ad9e7d';
if (hash(simulator) !== expectedSimulator) throw new Error('Frozen simulator identity mismatch');
const source = fs.readFileSync(path.join(frozenRoot, 'tools/run-local-risk-family.mjs'), 'utf8');
if (hash(source) !== '3e4eb7c0bacc3383e3c72330931e9b59534e460c9678ee67b8cf7fc0b4d2764e')
  throw new Error('Frozen configuration source identity mismatch');
const context = {};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('const base ='), source.indexOf('const riskVariants =')) +
  source.slice(source.indexOf('const dailyCandidate ='), source.indexOf('const dailyRobustnessVariants =')) +
  '\nglobalThis.options={...base,...dailyCandidate,rankedExitBuffer:6};', context);
const manifest = JSON.parse(fs.readFileSync(path.join(dataRoot, 'manifest.json')));
let checksums = 0;
const sessions = manifest.chunks.flatMap(chunk => {
  const compressed = fs.readFileSync(path.join(dataRoot, path.basename(chunk.pathname)));
  if (compressed.length !== chunk.compressedBytes) throw new Error(`Incomplete dataset chunk: ${chunk.pathname}`);
  const raw = gunzipSync(compressed);
  if (chunk.contentSha256) {
    if (hash(raw) !== chunk.contentSha256) throw new Error('Dataset checksum mismatch');
    checksums++;
  }
  const rows = JSON.parse(raw).sessions;
  if (rows.length !== chunk.end-chunk.start || rows[0]?.date !== chunk.firstDate || rows.at(-1)?.date !== chunk.lastDate)
    throw new Error('Dataset session range mismatch');
  return rows;
});
if (sessions.some((session,index)=>index>0 && session.date<=sessions[index-1].date))
  throw new Error('Duplicate or unordered dataset sessions');
const { simulatePointInTimePortfolio } = createResearchModuleLoader(frozenRoot).load('lib/walkForwardBacktest.js');
const { createC1SleeveAccounting, applyC1SleeveFill, valueC1SleeveAccounting, C1_ACCOUNTING_WEIGHTS } =
  createResearchModuleLoader(process.cwd()).load('lib/c1SleeveAccounting.js');
const pricesByDay = new Map(sessions.map(session => [session.date,
  Object.fromEntries(session.prices.map(row => [row.symbol, row.close]))]));
const results = [], fixtures = [];
for (const [id, weight] of Object.entries(C1_ACCOUNTING_WEIGHTS)) {
  const options = { ...context.options, initialCapital:100000, minimumTrade:750,
    thesisId:`risk-${id}`, thesisLabel:id, startDate:'2023-01-04', endDate:'2026-09-01',
    ...(id === 'cooldown15' ? { portfolioDrawdownCooldownSessions:15 } : {}),
    ...(id === 'sector40' ? { maxSectorPct:0.4 } : {}) };
  const run = simulatePointInTimePortfolio({ metadata:manifest.datasetMetadata, sessions }, options);
  let ledger = createC1SleeveAccounting(100000, options.startDate), index = 0;
  let maxCashError = 0, maxEquityError = 0;
  const mismatches = [], checkpoints = [];
  for (const point of run.curve) {
    while (index < run.trades.length && run.trades[index].date <= point.date) {
      const trade = run.trades[index];
      ledger = applyC1SleeveFill(ledger, { id:`${id}:${index}`, sleeve:id, date:trade.date,
        symbol:trade.symbol, side:trade.side, shares:trade.shares*weight, price:trade.price, fee:0 });
      index++;
    }
    const book = ledger.sleeves[id], count = Object.keys(book.positions).length;
    const marked = valueC1SleeveAccounting(ledger, pricesByDay.get(point.date)).sleeves[id];
    checkpoints.push({date:point.date,cash:point.cash,equity:point.equity,positions:point.positions,
      marks:Object.fromEntries(Object.keys(book.positions).map(symbol=>[symbol,pricesByDay.get(point.date)[symbol]]))});
    const cashError = Math.abs(book.cash-point.cash*weight);
    const equityError = Math.abs(marked.equity-point.equity*weight);
    maxCashError = Math.max(maxCashError,cashError); maxEquityError = Math.max(maxEquityError,equityError);
    // The original simulator rounds exported cash/equity to cents.
    if (cashError > 0.0051 || equityError > 0.0051 || count !== point.positions)
      mismatches.push({date:point.date,cashError,equityError,count,expectedCount:point.positions});
  }
  if (index !== run.trades.length) throw new Error('Unconsumed historical fills');
  results.push({id,orders:index,checkpoints:run.curve.length,maxCashError,maxEquityError,
    passed:mismatches.length===0,firstMismatches:mismatches.slice(0,5)});
  fixtures.push({ id, options, trades:run.trades.map(({date,symbol,side,shares,price})=>({date,symbol,side,shares,price})), curve:checkpoints });
  console.log(JSON.stringify(results.at(-1)));
}
const report = { purpose:'Frozen historical accounting reconciliation; not prospective evidence',
  simulatorSha256:hash(simulator), configurationSourceSha256:hash(source),
  manifestSha256:hash(fs.readFileSync(path.join(dataRoot,'manifest.json'))),
  checksumCoverage:`${checksums}/${manifest.chunks.length}`, results,
  passed:results.every(item=>item.passed), generatedAt:new Date().toISOString() };
fs.writeFileSync(output,JSON.stringify(report,null,2));
fs.writeFileSync(output.replace(/\.json$/,'.fixtures.json'),JSON.stringify(fixtures));
if (!report.passed) process.exitCode=1;

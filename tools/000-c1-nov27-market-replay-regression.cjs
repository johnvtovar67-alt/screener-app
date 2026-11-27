// One-off read-only investigation in this branch's existing preview build.
// It never leaves a runnable deployment or enters the release branch.
const { get, list } = require('@vercel/blob');
const { gunzipSync } = require('node:zlib');
const { createHash } = require('node:crypto');
const { createResearchModuleLoader } = require('./research-module-loader.cjs');
const { difference, validateObservation } = require('./inspect-c1-index-transition.cjs');

const date = '2026-11-27';
const reviewedHash = '88bad65241c12542c103157707cfa611eaffa53d7b1988637af8018f763f9c72';
const marketPath = 'research/c1-dated-index-production-v1/sp500';
const scope = marketPath + '/observations/' + date + '/';
const emit = (phase, data) => console.log('C1_NOV27_REPLAY', JSON.stringify({ phase, ...data }));
const digest = value => createHash('sha256').update(JSON.stringify(value, (_key, row) => row && typeof row === 'object' && !Array.isArray(row)
  ? Object.fromEntries(Object.keys(row).sort().map(key => [key, row[key]])) : row)).digest('hex');
const same = (a, b) => digest({ value: a }) === digest({ value: b });

async function readMarketFile(pathname) {
  if (pathname !== marketPath + '.json.gz' &&
      !(pathname.startsWith(scope) && /^[a-f0-9]{64}\.json\.gz$/.test(pathname.slice(scope.length)))) {
    throw new Error('Unexpected market archive path');
  }
  const result = await get(pathname, { access: 'private', useCache: false, abortSignal: AbortSignal.timeout(15000) });
  if (!result?.stream || result.statusCode !== 200) return null;
  const bytes = Buffer.from(await new Response(result.stream).arrayBuffer());
  if (bytes.length > 32 * 1024 * 1024) throw new Error('Market artifact exceeds limit');
  return JSON.parse(gunzipSync(bytes, { maxOutputLength: 128 * 1024 * 1024 }).toString());
}

function exactFillChanges(before, after, limit = 16) {
  const changes = [];
  for (let index = 0; index < Math.max(before.length, after.length); index++) {
    const a = before[index], b = after[index];
    if (same(a, b)) continue;
    const keys = ['id', 'date', 'symbol', 'sleeve', 'side', 'shares', 'price', 'fee'];
    const fields = keys.filter(key => a?.[key] !== b?.[key]);
    changes.push({ index, date: a?.date, symbol: a?.symbol, side: a?.side, sleeve: a?.sleeve,
      fields, beforePrice: a?.price, afterPrice: b?.price, beforeShares: a?.shares, afterShares: b?.shares, id: a?.id });
  }
  emit('fills', { count: changes.length, before: before.length, after: after.length });
  for (const change of changes.slice(0, limit)) emit('fill', change);
  return changes;
}

async function main() {
  if (process.env.VERCEL_ENV !== 'preview' || process.env.VERCEL_GIT_COMMIT_REF !== 'c1-nov27-market-replay') return;
  process.exitCode = 1;
  emit('scope', { environment: process.env.VERCEL_ENV, compatibleStore: process.env.BLOB_STORE_ID === 'store_lC22UIsWjB8e7yXZ' });
  if (process.env.BLOB_STORE_ID !== 'store_lC22UIsWjB8e7yXZ') return;
  const pure = createResearchModuleLoader(process.cwd());
  const market = pure.load('lib/marketSession.js');
  const book = await readMarketFile(marketPath + '.json.gz');
  if (!book) { emit('book', { found: false }); return; }
  const { recordHash, ...content } = book;
  if (book.contract !== 'c1-dated-index-book-v1' || book.universe !== 'sp500' ||
      book.model?.ledger?.kind !== 'virtual-model' || digest(content) !== recordHash) throw new Error('Market book integrity failed');
  const lastDate = book.model.sessions.at(-1).date;
  emit('book', { lastDate, recordHash, filesOnly: true });
  if (lastDate !== '2026-11-25') return;
  const page = await list({ prefix: scope, limit: 100 });
  if (page.hasMore || !page.blobs.length) { emit('observations', { count: page.blobs.length, hasMore: page.hasMore }); return; }
  const observations = [];
  for (let i = 0; i < page.blobs.length; i += 4) {
    const records = await Promise.all(page.blobs.slice(i, i + 4).map(async ({ pathname }) => {
      const row = validateObservation(await readMarketFile(pathname), market);
      if (pathname !== scope + row.observationHash + '.json.gz') throw new Error('Observation path disagrees with envelope');
      return row;
    }));
    observations.push(...records);
  }
  observations.sort((a, b) => a.observedAt.localeCompare(b.observedAt) || a.observationHash.localeCompare(b.observationHash));
  const latest = observations.find(row => row.observationHash === reviewedHash);
  if (!latest) throw new Error('Reviewed sample missing');
  const contemporaneous = observations.filter(row => row.observedAt <= latest.observedAt);
  emit('observations', { count: observations.length, first: observations[0].observationHash, latest: latest.observationHash, observedAt: latest.observedAt });
  const forward = pure.load('lib/c1ForwardModel.js');
  const runs = [];
  const instrumented = createResearchModuleLoader(process.cwd(), {
    'lib/c1ForwardModel.js': {
      ...forward,
      advanceC1ForwardModel(...args) {
        const result = forward.advanceC1ForwardModel(...args);
        runs.push(result);
        return result;
      },
    },
  });
  try {
    const result = instrumented.load('lib/c1DatedBook.js').acceptC1DatedInput(book, latest.payload, new Date(latest.observedAt), { observations: contemporaneous });
    const {isC1RecordedOpeningAudit} = instrumented.load('lib/c1RecordedOpeningRecovery.js');
    emit('acceptance', { status: 'accepted-in-memory', resultingSource: result.captures.at(-1).sessionDate,
      recordHash: result.recordHash, inputHash: result.captures.at(-1).hash,
      receiptValid: isC1RecordedOpeningAudit(result.reconciliations.at(-1), result, digest),
      historicalInputsPreserved: same(result.model.sessions.slice(0, -1), book.model.sessions),
      originalLedgerPreserved: same(result.model.ledger, book.model.ledger),
      originalRiskPreserved: same(forward.c1ForwardOperationalState(result.model), forward.c1ForwardOperationalState(runs[2])),
      exactRetry: instrumented.load('lib/c1DatedBook.js').acceptC1DatedInput(result, latest.payload, new Date(latest.observedAt), {observations: contemporaneous}) === result });
    try {
      const service = instrumented.load('lib/c1AccountService.js');
      const signing = instrumented.load('lib/portfolioGovernor.js');
      const portfolio = [{symbol:'CASH', role:'Swing', shares:10000, avgCost:1}];
      const capitalRecord = {version:2, highWater:10000, triggerDay:null,
        reconciliationRequired:false, portfolioSignature:signing.portfolioCompositionSignature(portfolio)};
      const account = service.adoptC1Account({portfolio, capitalRecord, book,
        now:new Date(book.captures.at(-1).observedAt)});
      const start = performance.now();
      const {decision} = service.deriveC1AccountAnalysis({account, book:result, now:new Date(latest.observedAt)});
      emit('synthetic-private-analysis', {status:'accepted', current:decision.current,
        source:decision.sourceSessionDate, elapsedMs:Math.round(performance.now()-start)});
    } catch (error) {
      emit('synthetic-private-analysis', {status:'rejected', reason:error?.message?.slice(0,140)});
    }
  } catch (error) {
    const diagnostic = error?.providerRevisionDiagnostic;
    emit('acceptance', { status: 'rejected', stage: diagnostic?.stage ?? null,
      changedPaths: diagnostic?.modelParity?.changedPathCount ?? null, changesHash: diagnostic?.modelParity?.changesHash ?? null,
      anchorCount: error?.priceAnchorMismatch?.mismatchCount ?? null });
  }
  if (runs.length < 2) return;
  const [original, revised] = runs;
  const changes = exactFillChanges(original.ledger.fills, revised.ledger.fills);
  const sleeves = Object.keys(original.ledger.sleeves);
  emit('model', { originalPaperStatus: original.paperExecutionStatus?.status, revisedPaperStatus: revised.paperExecutionStatus?.status,
    ledgerIsPreserved: same(book.model.ledger, original.ledger), pendingEqual: same(original.pendingBySleeve, revised.pendingBySleeve),
    originalPositions: Object.fromEntries(sleeves.map(id => [id, Object.keys(original.ledger.sleeves[id].positions).length])),
    revisedPositions: Object.fromEntries(sleeves.map(id => [id, Object.keys(revised.ledger.sleeves[id].positions).length])) });
  const oldState = forward.c1ForwardOperationalState(original), newState = forward.c1ForwardOperationalState(revised);
  for (const id of sleeves) {
    const old = oldState?.[id], next = newState?.[id];
    if (!old || !next) continue;
    emit('state', { id, changed: Object.keys(old).filter(key => !same(old[key], next[key])),
      changedPaths: difference({ ledger: old }, { ledger: next }).slice(0, 24).map(row => row.path) });
  }
  const affected = [...new Set(changes.map(row => row.symbol).filter(symbol => /^[A-Z][A-Z0-9.-]{0,15}$/.test(symbol)))];
  const oldBars = original.sessions.at(-2).prices;
  const newBars = revised.sessions.at(-2).prices;
  const originalBBY = oldBars.find(row => row.symbol === 'BBY');
  const isolated = JSON.parse(JSON.stringify(book.model));
  isolated.sessions.at(-1).prices = newBars.map(row => row.symbol === 'BBY' ? { ...row, open: originalBBY.open } : row);
  const preserved = forward.advanceC1ForwardModel(isolated, [latest.payload.session], new Date(latest.observedAt), { completedCloseQueue: true });
  const economic = result => Object.fromEntries(['ledger', 'pendingBySleeve', 'paperExecution', 'paperExecutionStatus', 'summary'].map(key => [key, result[key]]));
  const keptState = forward.c1ForwardOperationalState(preserved);
  const historyOnly = JSON.parse(JSON.stringify(book.model));
  historyOnly.sessions.at(-1).prices.find(row => row.symbol === 'BBY').open = newBars.find(row => row.symbol === 'BBY').open;
  const bbyOnly = forward.advanceC1ForwardModel(historyOnly, [latest.payload.session], new Date(latest.observedAt), { completedCloseQueue: true });
  emit('isolated', { economicEqual: same(economic(original), economic(preserved)), operationalEqual: same(oldState, keptState),
    bbyOnlyEconomicEqual: same(economic(revised), economic(bbyOnly)),
    bbyOnlyOperationalEqual: same(newState, forward.c1ForwardOperationalState(bbyOnly)),
    correctedBarsHash: digest(newBars), recordedEconomicHash: digest(economic(original)),
    recordedOperationalHash: digest(oldState), revisedEconomicHash: digest(economic(revised)),
    revisedOperationalHash: digest(newState),
    bbyConfirmationHashes: contemporaneous.filter(row => row.observationHash !== reviewedHash &&
      row.payload.priceEvidence.rows.some(bar => bar.symbol === 'BBY' && bar.date === lastDate &&
        bar.adjOpen === newBars.find(price => price.symbol === 'BBY').open &&
        bar.adjHigh === newBars.find(price => price.symbol === 'BBY').high &&
        bar.adjLow === newBars.find(price => price.symbol === 'BBY').low &&
        bar.adjClose === newBars.find(price => price.symbol === 'BBY').close &&
        bar.volume === newBars.find(price => price.symbol === 'BBY').volume)).map(row => row.observationHash) });
  for (const symbol of affected.slice(0, 8)) {
    const old = oldBars.find(row => row.symbol === symbol), next = newBars.find(row => row.symbol === symbol);
    if (old && next) emit('bar', { symbol,
      previous: Object.fromEntries(['open','high','low','close'].map(key => [key, old[key]])),
      revised: Object.fromEntries(['open','high','low','close'].map(key => [key, next[key]])) });
  }
  emit('model-differences', { paths: difference(original, revised).slice(0, 45).map(row => row.path) });
}
main().catch(error => { emit('unavailable', { error: error?.name ?? 'Error' }); process.exitCode = 1; });

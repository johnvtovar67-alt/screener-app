// Read-only original archive -> separate source-current compiler input artifact.
// No strategy implementation or factor formula is copied into this adapter.
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const { createResearchModuleLoader } = require('./research-module-loader.cjs');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const CONTRACT = 'c1-source-pinned-current253-historical-input-v1';
const CONDITIONAL_CONTRACT = 'c1-source-pinned-current253-conditional-historical-input-v1';
const canonical = value => {
  const symbol = String(value || '').replace('-', '.').toUpperCase().trim();
  return symbol === 'SATS' ? 'ECHO' : symbol;
};
function sourcePins(root, seeds) {
  const pins = {}, visit = relative => {
    if (pins[relative]) return;
    const file = path.resolve(root, relative), bytes = fs.readFileSync(file);
    pins[relative] = sha(bytes);
    for (const match of bytes.toString().matchAll(/import\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g)) {
      if (!match[1].startsWith('.')) continue;
      let dependency = path.resolve(path.dirname(file), match[1]);
      if (!path.extname(dependency)) dependency += '.js';
      visit(path.relative(root, dependency));
    }
  };
  seeds.forEach(visit); return pins;
}
function currentCompiler(root, universe = 'sp500') {
  const loader = createResearchModuleLoader(root);
  const live = loader.load('lib/c1LiveInput.js');
  const source = fs.readFileSync(path.join(root, 'lib/c1LiveInput.js'), 'utf8');
  const matches = [...source.matchAll(/minimumHistoryRows:\s*(\d+)/g)];
  assert.equal(matches.length, 1, 'Current live compiler history gate must have one source declaration');
  const minimumHistoryRows = Number(matches[0][1]);
  assert.equal(minimumHistoryRows, 253, 'This artifact contract binds the current253 source gate');
  const spec = live.C1_LIVE_UNIVERSES[universe];
  if (!spec) throw new Error('Unsupported source universe');
  return { loader, live, minimumHistoryRows, maxCandidates: spec.maxCandidates,
    compile: loader.load('lib/historicalSignalEvaluator.js').compilePointInTimeSignals,
    compact: loader.load('lib/replayDatasetCompaction.js').compactReplaySession,
    pins: sourcePins(root, ['lib/c1LiveInput.js', 'lib/replayDatasetCompaction.js']) };
}
function projectConditionalProfiles(rows) {
  // Only the source's scalar profile projection is modeled here. Applying its
  // index-count validator to a sector-valid subset invents a smaller index.
  // The original complete member set and all invalid sector facts are retained;
  // the unchanged live validator rejects them in strict mode.
  return rows.map(row => ({ symbol: row.symbol, name: row.name || row.companyName || row.symbol,
    sector: typeof row.sector === 'string' ? row.sector.trim() : row.sector }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}
function compileCurrentBatch(compiler, raw, start, count) {
  // Production compiles one observed date with fresh decision memory. Every
  // date has no fundamentals/events, so fresh discovery rows are empty and
  // that memory remains empty; batched processing is proved against live below.
  const result = compiler.compile(raw, { minimumHistoryRows: compiler.minimumHistoryRows,
    liquidity: { maxCandidates: compiler.maxCandidates },
    resume: { sessions: [], completedSessions: start, decisionMemory: [] }, maxSessions: count });
  assert.equal(result.sessions.length, Math.min(count, raw.sessions.length - start));
  for (const session of result.sessions) assert.equal(session.signals.length, 0,
    'Current empty-fundamentals source cannot manufacture a market-cap-qualified discovery signal');
  if (result.compilerCheckpoint) assert.equal(result.compilerCheckpoint.decisionMemory.length, 0,
    'Batching must not introduce cross-date label continuity into current daily compilation');
  const { generatedAt, ...metadata } = result.metadata;
  return { sessions: result.sessions.map(compiler.compact), metadata };
}
function prepareRawInput({ originalSessions, checkpoint, blueprint, signature, profiles, metadata, normalizeMembers, isSessionDay,
  modelDecisionClock = false, completedSessionDay }) {
  const histories = new Map();
  for (const [raw, bars] of Object.entries(checkpoint.histories)) {
    const symbol = canonical(raw);
    if (!histories.has(symbol) || raw === symbol) histories.set(symbol, bars);
  }
  const indices = new Map([...histories].map(([symbol, bars]) => [symbol, new Map(bars.map((bar, index) => [bar.date, index]))]));
  const usable = [...new Set(signature.usableSymbols.map(canonical))];
  const changes = blueprint.changes.map(change => ({ ...change,
    addedSymbol: canonical(change.addedSymbol), removedSymbol: canonical(change.removedSymbol) }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.addedSymbol.localeCompare(b.addedSymbol) || a.removedSymbol.localeCompare(b.removedSymbol));
  const delisted = Object.fromEntries(Object.entries(blueprint.delistedDates).map(([symbol, date]) => [canonical(symbol), date]));
  const members = new Set(blueprint.initialSymbols.map(canonical));
  let changeIndex = 0;
  const summary = { sessions: 0, priceRows: 0, originalSourceCountsMatched: 0,
    current253Rows: 0, original50Rows: 0, removedShortHistoryRows: 0,
    currentMissingPriceMemberRows: 0, missingProfileShortHistory: new Set(), sessionCohorts: [],
    currentLiveInputAccepted: false, archivedSectorGateExceptions: {}, historicalGapGateExceptions: [],
    benchmark550DayPrefixIncompleteDates: [], decisionClock: { originalBeforeCloseCount: 0, changedTimestamps: 0,
      originalTimestamps: [], modeled: modelDecisionClock,
      convention: modelDecisionClock ? 'Explicit counterfactual completed-day observation at 21:30 UTC, verified by the unchanged source calendar; no claim of historical acquisition timing.' : 'Original archived observation timestamp.' } };
  const sessions = originalSessions.map(original => {
    summary.decisionClock.originalTimestamps.push({ date: original.date, decisionAt: original.decisionAt });
    if (completedSessionDay && completedSessionDay(new Date(original.decisionAt)) !== original.date) summary.decisionClock.originalBeforeCloseCount++;
    const decisionAt = modelDecisionClock ? original.date + 'T21:30:00.000Z' : original.decisionAt;
    if (decisionAt !== original.decisionAt) summary.decisionClock.changedTimestamps++;
    if (modelDecisionClock) assert.equal(completedSessionDay(new Date(decisionAt)), original.date, 'Modeled observation must follow the source completed market session');
    while (changeIndex < changes.length && changes[changeIndex].date < original.date) {
      const change = changes[changeIndex++];
      if (change.removedSymbol) members.delete(change.removedSymbol);
      if (change.addedSymbol) members.add(change.addedSymbol);
    }
    const universeSymbols = usable.filter(symbol => members.has(symbol) && histories.get(symbol)?.[0]?.date <= original.date &&
      (!delisted[symbol] || delisted[symbol] >= original.date)).sort();
    assert.equal(universeSymbols.length, original.sourceUniverseCount, 'Accepted original membership reconstruction: ' + original.date);
    summary.originalSourceCountsMatched++;
    const missingCurrent = universeSymbols.filter(symbol => !indices.get(symbol)?.has(original.date));
    // Match collectC1LiveInput: a missing completed current bar is quarantined
    // before compiling membership. Keep its price history for held evidence.
    const activeUniverseSymbols = universeSymbols.filter(symbol => !missingCurrent.includes(symbol));
    for (const symbol of activeUniverseSymbols) {
      const sector = profiles.get(symbol)?.sector;
      if (!sector || /^(other|unknown|n\/a)$/i.test(sector.trim())) {
        if (!summary.archivedSectorGateExceptions[symbol]) summary.archivedSectorGateExceptions[symbol] = { sector: sector ?? null, dates: [] };
        summary.archivedSectorGateExceptions[symbol].dates.push(original.date);
      }
    }
    if (isSessionDay && original.date >= '2023-01-04') {
      // Source collectC1LiveInput requests a 550-calendar-day prefix. Do not
      // fabricate missing older benchmark prices merely because factors need
      // only 253 rows; report the acquisition-coverage limitation separately.
      const fromDate = new Date(Date.parse(original.date + 'T12:00:00Z') - 550 * 86400000).toISOString().slice(0, 10);
      const expectedDates = [];
      for (let time = Date.parse(fromDate + 'T12:00:00Z'); time <= Date.parse(original.date + 'T12:00:00Z'); time += 86400000) {
        const date = new Date(time).toISOString().slice(0, 10);
        if (isSessionDay(date)) expectedDates.push(date);
      }
      if (['SPY', 'QQQ'].some(symbol => histories.get(symbol)?.[0]?.date > expectedDates[0])) summary.benchmark550DayPrefixIncompleteDates.push(original.date);
      for (const symbol of activeUniverseSymbols) {
        const firstAvailable = histories.get(symbol).find(bar => bar.date >= fromDate)?.date;
        const gaps = expectedDates.filter(date => date >= firstAvailable && !indices.get(symbol).has(date));
        if (gaps.length) summary.historicalGapGateExceptions.push({ decisionDate: original.date, symbol, missingSessionDates: gaps });
      }
    }
    const expected253 = activeUniverseSymbols.filter(symbol => (indices.get(symbol)?.get(original.date) ?? -1) + 1 >= 253);
    const expected50 = universeSymbols.filter(symbol => (indices.get(symbol)?.get(original.date) ?? -1) + 1 >= 50);
    for (const symbol of expected253) if (!profiles.has(symbol)) throw new Error('Current253 member lacks archived name/sector: ' + symbol);
    for (const symbol of universeSymbols) if (!profiles.has(symbol)) summary.missingProfileShortHistory.add(symbol);
    // Use the actual live member sanitizer on each dated, evidenced member set.
    // Members with no saved name/sector can only have insufficient history and
    // remain in membership without fabricated security metadata or factors.
    if (normalizeMembers && expected253.length) for (const profile of normalizeMembers(activeUniverseSymbols.flatMap(symbol => profiles.has(symbol) ? [profiles.get(symbol)] : []), original.date)) profiles.set(profile.symbol, profile);
    summary.currentMissingPriceMemberRows += missingCurrent.length;
    summary.current253Rows += expected253.length; summary.original50Rows += expected50.length;
    summary.removedShortHistoryRows += expected50.length - expected253.length;
    summary.sessionCohorts.push({ date: original.date, originalSourceMembers: universeSymbols.length,
      original50: expected50.length, current253: expected253.length, current253SymbolsSha256: sha(JSON.stringify(expected253)),
      removedShortHistory: expected50.filter(symbol => !expected253.includes(symbol)), missingCurrentPrice: missingCurrent });
    summary.sessions++; summary.priceRows += original.prices.length;
    return { date: original.date, decisionAt, universeSymbols: activeUniverseSymbols,
      prices: original.prices, corporateActions: original.corporateActions };
  });
  const securities = [...profiles].sort(([a], [b]) => a.localeCompare(b)).map(([symbol, profile]) => ({
    symbol, name: profile.name, sector: profile.sector,
    listedAt: signature.fromDate, isEtf: false, isFund: false }));
  summary.missingProfileShortHistory = [...summary.missingProfileShortHistory].sort();
  return { raw: { metadata, securities, fundamentals: [], events: [], sessions }, summary };
}
function buildCurrentInput({ root = process.cwd(), originalRoot, outputRoot, conditionalArchivedMetadata = false, onProgress = console.log } = {}) {
  if (!originalRoot || !outputRoot || path.resolve(originalRoot) === path.resolve(outputRoot)) throw new Error('Separate original/output roots required');
  if (fs.existsSync(path.join(outputRoot, 'manifest.json'))) throw new Error('Derived manifest already exists; choose a new artifact directory');
  const manifestFile = path.join(originalRoot, 'manifest.json'), originalManifestFile = path.join(originalRoot, 'manifest.original.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile));
  const validationFile = path.join(originalRoot, 'original-validation.json'), validationBytes = fs.readFileSync(validationFile);
  const accepted = JSON.parse(validationBytes);
  assert.equal(accepted.passed, true, 'Original input validation must pass before current derivation');
  assert.equal(accepted.complete, true); assert.equal(accepted.originalManifestSha256, sha(fs.readFileSync(originalManifestFile)));
  const checkpointFile = path.join(originalRoot, 'pit-sp500-price-checkpoint-v1.json'), universeFile = path.join(originalRoot, 'pit-sp500-universe-v1.json');
  assert.equal(accepted.priceCheckpointSha256, sha(fs.readFileSync(checkpointFile)));
  assert.equal(accepted.universeSha256, sha(fs.readFileSync(universeFile)));
  const compiler = currentCompiler(root), profiles = new Map(), originalSessions = [], originalChunks = [];
  const inputContract = conditionalArchivedMetadata ? CONDITIONAL_CONTRACT : CONTRACT;
  const literalMetadataSourceGateErrors = [];
  for (const chunk of manifest.chunks) {
    const file = path.join(originalRoot, 'chunks', path.basename(chunk.pathname)), compressed = fs.readFileSync(file), raw = zlib.gunzipSync(compressed);
    assert.equal(compressed.length, chunk.compressedBytes);
    assert.equal(sha(compressed), chunk.compressedSha256 ?? chunk.originalSha256, 'Accepted original compressed identity');
    assert.equal(sha(raw), chunk.contentSha256, 'Accepted original decompressed identity');
    const parsed = JSON.parse(raw);
    assert.equal(parsed.sessions.length, chunk.end - chunk.start);
    for (const session of parsed.sessions) {
      for (const row of [...(session.positionSignals || []), ...(session.signals || [])]) {
        const symbol = canonical(row.symbol), profile = { symbol, name: row.companyName || row.name || symbol, sector: row.sector };
        // Preserve missing/Other labels as evidence. The actual live sanitizer
        // below must reject them; this adapter cannot invent a sector repair.
        if (profiles.has(symbol)) assert.deepEqual(profiles.get(symbol), profile, 'Undated archived profile changed within original dataset: ' + symbol);
        else profiles.set(symbol, profile);
      }
      originalSessions.push({ date: session.date, decisionAt: session.decisionAt,
        sourceUniverseCount: session.sourceUniverseCount, prices: session.prices, corporateActions: session.corporateActions || [] });
    }
    originalChunks.push({ pathname: chunk.pathname, compressedSha256: sha(compressed), contentSha256: sha(raw) });
    if (onProgress) onProgress(JSON.stringify({ phase: 'accepted-original-read', chunk: path.basename(file), sessions: originalSessions.length }));
  }
  const checkpoint = JSON.parse(fs.readFileSync(checkpointFile)), blueprint = JSON.parse(fs.readFileSync(universeFile)).privateBlueprint;
  const signature = JSON.parse(manifest.signature);
  const { raw, summary } = prepareRawInput({ originalSessions, checkpoint, blueprint, signature, profiles,
    normalizeMembers: (rows, date) => {
      if (!conditionalArchivedMetadata) return compiler.live.c1LiveMembers('sp500', rows);
      // Explicit offline counterfactual only: retain the observed invalid
      // metadata through the same scalar shape. No source input guard is
      // modified or declared passed; strict mode still calls the real validator.
      try { compiler.live.c1LiveMembers('sp500', rows); }
      catch (error) { literalMetadataSourceGateErrors.push({ date, observedNamedMemberCount: rows.length, sourceError: error.message }); }
      return projectConditionalProfiles(rows);
    },
    isSessionDay: compiler.loader.load('lib/marketSession.js').isUsMarketSessionDay,
    completedSessionDay: compiler.loader.load('lib/marketSession.js').latestCompletedMarketSessionDay,
    modelDecisionClock: conditionalArchivedMetadata,
    metadata: { ...manifest.datasetMetadata, fundamentalsPointInTime: false, fundamentalValuesRevisionSafe: false,
      eventRiskPointInTime: false, materialNewsHistoryComplete: false, source: inputContract } });
  const rawPriceDigest = sha(JSON.stringify(raw.sessions.map(session => session.prices)));
  fs.mkdirSync(path.join(outputRoot, 'chunks'), { recursive: true });
  const chunks = []; let datasetMetadata;
  for (const originalChunk of manifest.chunks) {
    const batch = compileCurrentBatch(compiler, raw, originalChunk.start, originalChunk.end - originalChunk.start);
    datasetMetadata = batch.metadata;
    for (const session of batch.sessions) {
      const actual = [...session.positionSignals, ...session.signals].map(row => row.symbol).sort();
      const expected = summary.sessionCohorts.find(row => row.date === session.date);
      assert.equal(actual.length, expected.current253, 'Current253 factor cohort count');
      assert.equal(sha(JSON.stringify(actual)), expected.current253SymbolsSha256, 'Current253 factor cohort identity');
      assert.ok([...session.positionSignals, ...session.signals].every(row => !row.cik && !row.cikNumber), 'Current live profile cannot inherit archived issuer IDs');
      assert.deepEqual(JSON.parse(JSON.stringify(session.prices)), JSON.parse(JSON.stringify(raw.sessions.find(row => row.date === session.date).prices)), 'Compiler must preserve every original price field/value');
    }
    const pathname = 'chunks/' + path.basename(originalChunk.pathname);
    const content = Buffer.from(JSON.stringify({ metadata: batch.metadata, sessions: batch.sessions }));
    const compressed = zlib.gzipSync(content);
    fs.writeFileSync(path.join(outputRoot, pathname), compressed);
    chunks.push({ pathname, start: originalChunk.start, end: originalChunk.end,
      firstDate: batch.sessions[0].date, lastDate: batch.sessions.at(-1).date,
      compressedBytes: compressed.length, compressedSha256: sha(compressed), contentSha256: sha(content) });
    if (onProgress) onProgress(JSON.stringify({ phase: 'current253-compile', chunk: pathname, sessions: originalChunk.end }));
    if (global.gc) global.gc();
  }
  assert.equal(sha(JSON.stringify(raw.sessions.map(session => session.prices))), rawPriceDigest, 'Original raw prices are immutable');
  const literalLiveInputGuardFailures = {
    metadataSourceGateErrors: literalMetadataSourceGateErrors,
    sectors: Object.entries(summary.archivedSectorGateExceptions).map(([symbol, row]) => ({ symbol, sector: row.sector,
      affectedSessionDates: row.dates.filter(date => date >= '2023-01-04') })).filter(row => row.affectedSessionDates.length),
    historyGaps: summary.historicalGapGateExceptions,
    benchmark550DayPrefixIncompleteDates: summary.benchmark550DayPrefixIncompleteDates,
  };
  const receipt = { contract: inputContract, passed: true, currentLiveInputAccepted: false, actualLiveInputAccepted: false, eligibleForAlphaClaim: false,
    runClass: conditionalArchivedMetadata ? 'conditional-current-account-policy-counterfactual' : 'source-current-input-derivation',
    acceptanceMeaning: 'Original reconstruction and source compiler/cohort hashes passed; this does not accept the historical data through actual current live-input acquisition guards.',
    originalManifestSha256: sha(fs.readFileSync(originalManifestFile)),
    acceptedManifestSha256: sha(fs.readFileSync(manifestFile)), originalValidationSha256: sha(validationBytes),
    priceCheckpointSha256: accepted.priceCheckpointSha256, universeSha256: accepted.universeSha256,
    sourcePins: compiler.pins, adapterSha256: sha(fs.readFileSync(__filename)), minimumHistoryRows: compiler.minimumHistoryRows,
    maxCandidates: compiler.maxCandidates, profileShape: ['symbol', 'name', 'sector'], fundamentals: [], events: [],
    originalChunks, summary, literalLiveInputGuardFailures, rawPriceContentSha256: rawPriceDigest,
    methodology: 'Actual compilePointInTimeSignals and compactReplaySession, current live253 gate before all cross-sectional percentiles; current no-fundamentals/no-events profile shape; dated reconstructed historical membership; accepted original price bars and corporate actions retained.',
    limitations: ['Archived provider sector/name classifications lack independent dated provenance.',
      'Daily adjusted OHLC snapshots do not certify as-known unrevised market data.',
      'No historical material-event, revision-safe fundamental or operational quote-freshness evidence is fabricated.',
      'Missing-current-price members are quarantined before derived membership, exactly as current source acquisition; accepted original price bars remain unchanged.',
      'Archived Other/missing sectors and observed historical price gaps fail actual current live-input guards; conditional mode retains those facts without declaring actual live-input acceptance.',
      'The full 550-calendar-day benchmark acquisition prefix is unavailable for early historical dates even when 253 rows establish the factor window.',
      'Conditional completed-session observations are modeled at 21:30 UTC to satisfy the current causal clock; original timestamps are preserved in the receipt and are not evidence of actual historical acquisition.',
      'Profiles absent from the original archive are allowed only when they never reach the current253 signal cohort.'] };
  fs.writeFileSync(path.join(outputRoot, 'acceptance.json'), JSON.stringify(receipt, null, 2) + '\n');
  const derived = { inputContract, schema: manifest.schema, signature: manifest.signature,
    currentLiveInputAccepted: false, actualLiveInputAccepted: false, eligibleForAlphaClaim: false, runClass: receipt.runClass,
    complete: true, completedSessions: summary.sessions, sessionDates: raw.sessions.map(session => session.date),
    datasetMetadata: { ...datasetMetadata, sectorBasis: 'archived-undated-provider-classification', currentInputContract: inputContract,
      currentLiveInputAccepted: false, actualLiveInputAccepted: false, eligibleForAlphaClaim: false, runClass: receipt.runClass }, chunks,
    acceptanceReceipt: { passed: true, actualLiveInputAccepted: false, eligibleForAlphaClaim: false,
      receiptPath: 'acceptance.json', receiptSha256: sha(fs.readFileSync(path.join(outputRoot, 'acceptance.json'))),
      originalManifestSha256: receipt.originalManifestSha256, currentFactorSourcePins: compiler.pins } };
  fs.writeFileSync(path.join(outputRoot, 'manifest.json'), JSON.stringify(derived, null, 2) + '\n');
  return derived;
}
if (require.main === module) {
  const args = process.argv.slice(2), [originalRoot, outputRoot] = args;
  try {
    const result = buildCurrentInput({ originalRoot, outputRoot, conditionalArchivedMetadata: args.includes('--conditional-archived-metadata') });
    console.log(JSON.stringify({ completed: true, inputContract: result.inputContract,
      sessions: result.completedSessions, chunks: result.chunks.length, receipt: result.acceptanceReceipt }));
  } catch (error) {
    if (originalRoot && outputRoot && !args.includes('--conditional-archived-metadata')) {
      const compiler = currentCompiler(process.cwd());
      const rejection = { contract: 'c1-strict-historical-live-input-rejection-v1', passed: false,
        currentLiveInputAccepted: false, actualLiveInputAccepted: false, eligibleForAlphaClaim: false, sourceError: error.message,
        sourceStack: error.stack, sourcePins: compiler.pins, adapterSha256: sha(fs.readFileSync(__filename)),
        originalValidationSha256: sha(fs.readFileSync(path.join(originalRoot, 'original-validation.json'))),
        originalManifestSha256: sha(fs.readFileSync(path.join(originalRoot, 'manifest.original.json'))),
        derivedManifestWritten: fs.existsSync(path.join(outputRoot, 'manifest.json')) };
      fs.writeFileSync(outputRoot + '.rejection.json', JSON.stringify(rejection, null, 2) + '\n');
    }
    throw error;
  }
}
module.exports = { CONTRACT, CONDITIONAL_CONTRACT, currentCompiler, projectConditionalProfiles, compileCurrentBatch, prepareRawInput, buildCurrentInput, sourcePins };

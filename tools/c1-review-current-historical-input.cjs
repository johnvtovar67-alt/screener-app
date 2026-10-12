// Hash/cohort/price review only: no compiler or policy replay.
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const arguments_ = process.argv.slice(2);
const [originalPath, derivedPath, selectedPath, outputPath] = arguments_;
if (!originalPath || !derivedPath || !selectedPath) throw new Error('Usage: node tools/c1-review-current-historical-input.cjs ORIGINAL_DATA_ROOT CONDITIONAL_DATA_ROOT SELECTED64_RECEIPT [OUTPUT.json] [--repo-root REPO_ROOT]');
const repoOption = arguments_.indexOf('--repo-root');
const root = path.resolve(repoOption >= 0 ? arguments_[repoOption + 1] : path.join(__dirname, '..'));
const originalRoot = path.resolve(originalPath), derivedRoot = path.resolve(derivedPath);
const selectedFile = path.resolve(selectedPath);
const output = outputPath && outputPath !== '--repo-root' ? path.resolve(outputPath) : path.join(root, 'work/independent-validation/derived-input-acceptance-review.json');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = value => { const symbol = String(value).replace('-', '.').toUpperCase().trim(); return symbol === 'SATS' ? 'ECHO' : symbol; };
const manifestBytes = fs.readFileSync(path.join(derivedRoot, 'manifest.json'));
const manifest = JSON.parse(manifestBytes), acceptanceBytes = fs.readFileSync(path.join(derivedRoot, manifest.acceptanceReceipt.receiptPath));
const acceptance = JSON.parse(acceptanceBytes), selectedBytes = fs.readFileSync(selectedFile);
const selected = JSON.parse(selectedBytes);
assert.equal(manifest.inputContract, 'c1-source-pinned-current253-conditional-historical-input-v1');
assert.equal(acceptance.contract, manifest.inputContract);
assert(manifest.complete && manifest.acceptanceReceipt.passed && acceptance.passed);
assert.equal(manifest.completedSessions, 1170); assert.equal(manifest.chunks.length, 24);
assert.equal(manifest.actualLiveInputAccepted, false); assert.equal(manifest.eligibleForAlphaClaim, false);
assert.equal(acceptance.actualLiveInputAccepted, false); assert.equal(acceptance.eligibleForAlphaClaim, false);
assert.equal(sha(acceptanceBytes), manifest.acceptanceReceipt.receiptSha256);
assert.equal(acceptance.minimumHistoryRows, 253); assert.equal(acceptance.maxCandidates, 500);
assert.deepEqual(acceptance.profileShape, ['symbol', 'name', 'sector']);
assert.deepEqual(acceptance.fundamentals, []); assert.deepEqual(acceptance.events, []);
assert(Object.values(acceptance.literalLiveInputGuardFailures).some(value => Array.isArray(value) && value.length));
const originalValidationBytes = fs.readFileSync(path.join(originalRoot, 'original-validation.json'));
const originalValidation = JSON.parse(originalValidationBytes);
assert(originalValidation.passed && originalValidation.complete);
assert.equal(sha(originalValidationBytes), acceptance.originalValidationSha256);
for (const [name, expected] of [['manifest.original.json', acceptance.originalManifestSha256], ['manifest.json', acceptance.acceptedManifestSha256],
  ['pit-sp500-price-checkpoint-v1.json', acceptance.priceCheckpointSha256], ['pit-sp500-universe-v1.json', acceptance.universeSha256]]) {
  assert.equal(sha(fs.readFileSync(path.join(originalRoot, name))), expected, name);
}
for (const [file, hash] of Object.entries(acceptance.sourcePins)) assert.equal(sha(fs.readFileSync(path.join(root, file))), hash, file);
assert.deepEqual(manifest.acceptanceReceipt.currentFactorSourcePins, acceptance.sourcePins);
assert.equal(sha(fs.readFileSync(path.join(root, 'tools/c1-build-current-historical-input.cjs'))), acceptance.adapterSha256);
const originalManifest = JSON.parse(fs.readFileSync(path.join(originalRoot, 'manifest.json')));
const signature = JSON.parse(originalManifest.signature);
const checkpoint = JSON.parse(fs.readFileSync(path.join(originalRoot, 'pit-sp500-price-checkpoint-v1.json')));
const blueprint = JSON.parse(fs.readFileSync(path.join(originalRoot, 'pit-sp500-universe-v1.json'))).privateBlueprint;
const histories = new Map();
for (const [raw, bars] of Object.entries(checkpoint.histories)) {
  const symbol = canonical(raw); if (!histories.has(symbol) || raw === symbol) histories.set(symbol, bars);
}
const indices = new Map([...histories].map(([symbol, bars]) => [symbol, new Map(bars.map((bar, index) => [bar.date, index]))]));
const usable = [...new Set(signature.usableSymbols.map(canonical))], members = new Set(blueprint.initialSymbols.map(canonical));
const changes = blueprint.changes.map(change => ({ ...change, addedSymbol: canonical(change.addedSymbol), removedSymbol: canonical(change.removedSymbol) }))
  .sort((a, b) => a.date.localeCompare(b.date) || a.addedSymbol.localeCompare(b.addedSymbol) || a.removedSymbol.localeCompare(b.removedSymbol));
const delisted = Object.fromEntries(Object.entries(blueprint.delistedDates).map(([symbol, date]) => [canonical(symbol), date]));
const calendar = require(path.join(root, 'tools/research-module-loader.cjs')).createResearchModuleLoader(root).load('lib/marketSession.js');
let changeIndex = 0, sessions = 0, priceRows = 0, currentRows = 0, originalRows = 0, missingCurrentCount = 0, changedClockCount = 0;
const rawPriceHash = crypto.createHash('sha256'); rawPriceHash.update('[');
for (let chunkIndex = 0; chunkIndex < manifest.chunks.length; chunkIndex++) {
  const chunk = manifest.chunks[chunkIndex], originalChunk = originalManifest.chunks[chunkIndex];
  assert.equal(chunk.start, originalChunk.start); assert.equal(chunk.end, originalChunk.end);
  assert.equal(chunk.firstDate, originalChunk.firstDate); assert.equal(chunk.lastDate, originalChunk.lastDate);
  const bytes = fs.readFileSync(path.join(derivedRoot, chunk.pathname)), raw = zlib.gunzipSync(bytes);
  assert.equal(bytes.length, chunk.compressedBytes); assert.equal(sha(bytes), chunk.compressedSha256); assert.equal(sha(raw), chunk.contentSha256);
  const oldBytes = fs.readFileSync(path.join(originalRoot, 'chunks', path.basename(originalChunk.pathname))), oldRaw = zlib.gunzipSync(oldBytes);
  assert.equal(oldBytes.length, originalChunk.compressedBytes); assert.equal(sha(oldBytes), originalChunk.compressedSha256 ?? originalChunk.originalSha256);
  assert.equal(sha(oldRaw), originalChunk.contentSha256);
  const frames = JSON.parse(raw).sessions, originals = JSON.parse(oldRaw).sessions;
  assert.equal(frames.length, chunk.end - chunk.start); assert.equal(frames.length, originals.length);
  for (let local = 0; local < frames.length; local++) {
    const frame = frames[local], original = originals[local], summary = acceptance.summary.sessionCohorts[sessions];
    assert.equal(frame.date, manifest.sessionDates[sessions]); assert.equal(frame.date, original.date); assert.equal(frame.date, summary.date);
    assert.equal(frame.decisionAt, frame.date + 'T21:30:00.000Z');
    assert.equal(calendar.latestCompletedMarketSessionDay(new Date(frame.decisionAt)), frame.date);
    assert.equal(acceptance.summary.decisionClock.originalTimestamps[sessions].decisionAt, original.decisionAt);
    if (frame.decisionAt !== original.decisionAt) changedClockCount++;
    assert.deepEqual(frame.prices, original.prices); assert.deepEqual(frame.corporateActions, original.corporateActions);
    if (sessions) rawPriceHash.update(','); rawPriceHash.update(JSON.stringify(original.prices));
    while (changeIndex < changes.length && changes[changeIndex].date < frame.date) {
      const change = changes[changeIndex++]; members.delete(change.removedSymbol); members.add(change.addedSymbol);
    }
    const originalMembers = usable.filter(symbol => members.has(symbol) && histories.get(symbol)?.[0]?.date <= frame.date && (!delisted[symbol] || delisted[symbol] >= frame.date)).sort();
    assert.equal(originalMembers.length, original.sourceUniverseCount);
    const missingCurrent = originalMembers.filter(symbol => !indices.get(symbol)?.has(frame.date));
    const activeMembers = originalMembers.filter(symbol => !missingCurrent.includes(symbol));
    const expected253 = activeMembers.filter(symbol => (indices.get(symbol)?.get(frame.date) ?? -1) + 1 >= 253);
    const expected50 = originalMembers.filter(symbol => (indices.get(symbol)?.get(frame.date) ?? -1) + 1 >= 50);
    assert.deepEqual(frame.universeSymbols, activeMembers);
    assert.equal(frame.signals.length, 0);
    const cohort = [...frame.positionSignals, ...frame.signals];
    assert.deepEqual(cohort.map(row => row.symbol).sort(), expected253);
    assert.equal(sha(JSON.stringify(expected253)), summary.current253SymbolsSha256);
    assert.equal(expected253.length, summary.current253); assert.equal(expected50.length, summary.original50);
    assert.deepEqual(missingCurrent, summary.missingCurrentPrice);
    assert(cohort.every(row => !row.cik && !row.cikNumber));
    priceRows += frame.prices.length; currentRows += cohort.length; originalRows += expected50.length; missingCurrentCount += missingCurrent.length; sessions++;
  }
  console.log(JSON.stringify({ reviewedChunk: chunkIndex + 1, sessions, priceRows, current253Rows: currentRows }));
  if (global.gc) global.gc();
}
rawPriceHash.update(']'); assert.equal(rawPriceHash.digest('hex'), acceptance.rawPriceContentSha256);
assert.equal(sessions, 1170); assert.equal(priceRows, 659220);
assert.equal(acceptance.summary.sessions, sessions); assert.equal(acceptance.summary.priceRows, priceRows);
assert.equal(acceptance.summary.current253Rows, currentRows); assert.equal(acceptance.summary.original50Rows, originalRows);
assert.equal(acceptance.summary.currentMissingPriceMemberRows, missingCurrentCount);
assert.equal(acceptance.summary.decisionClock.changedTimestamps, changedClockCount);
for (const selectedChunk of selected.derivedChunks) {
  const acceptedChunk = manifest.chunks.find(chunk => chunk.pathname === selectedChunk.pathname);
  assert(acceptedChunk); for (const key of ['compressedBytes', 'compressedSha256', 'contentSha256', 'start', 'end', 'firstDate', 'lastDate']) assert.equal(acceptedChunk[key], selectedChunk[key]);
}
const receipt = { contract: 'c1-independent-derived-input-acceptance-review-v1', passed: true,
  scope: 'Byte/hash/cohort/price/profile/clock/conditional-label review only; no policy or compiler replay.', actualLiveInputAccepted: false, eligibleForAlphaClaim: false,
  manifestSha256: sha(manifestBytes), acceptanceSha256: sha(acceptanceBytes), originalValidationSha256: sha(originalValidationBytes),
  originalManifestSha256: acceptance.originalManifestSha256, priceCheckpointSha256: acceptance.priceCheckpointSha256, universeSha256: acceptance.universeSha256,
  builderSha256: acceptance.adapterSha256, engineSha256: sha(fs.readFileSync(path.join(root, 'tools/c1-production-policy-replay.cjs'))),
  auditToolSha256: sha(fs.readFileSync(__filename)),
  checkedSourceFiles: Object.keys(acceptance.sourcePins).length, checkedChunks: 24, sessions, priceRows, current253Rows: currentRows, original50Rows: originalRows,
  currentMissingPriceMemberRows: missingCurrentCount, changedModelClockTimestamps: changedClockCount,
  selected64ReceiptSha256: sha(selectedBytes), selectedChunksMatchAcceptedManifest: selected.derivedChunks.length,
  allOriginalPricesAndCorporateActionsUnchanged: true, allCurrent253CohortsIndependentlyReconstructed: true, noArchivedIssuerIDs: true,
  literalLiveInputRejectionEvidencePreserved: true };
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(receipt, null, 2)); console.log(JSON.stringify({ completed: true, output, receipt }));

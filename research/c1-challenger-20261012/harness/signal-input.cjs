// Prepare exact recovered original bars through the existing source adapter;
// execute actual compilePointInTimeSignals for every compiler experiment.
// This module reads private inputs and returns private in-memory datasets. It
// never writes archives, publishes prices, fetches providers or substitutes bars.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const PROGRAM_ROOT = path.resolve(__dirname, '..');
const RECEIPT_ROOT = path.join(PROGRAM_ROOT, 'imported/docs/research/c1-validation-20261012');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const jsonEqual = (actual, expected, message) => assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);
const canonical = value => {
  const symbol = String(value || '').replace('-', '.').toUpperCase().trim();
  return symbol === 'SATS' ? 'ECHO' : symbol;
};
function readPublishedInputReceipts() {
  const persistence = JSON.parse(fs.readFileSync(path.join(RECEIPT_ROOT, 'current-input-persistent-receipt.json')));
  const encoded = fs.readFileSync(path.join(RECEIPT_ROOT, persistence.canonicalAcceptance.file));
  assert.equal(sha256(encoded), persistence.canonicalAcceptance.base64FileSha256, 'Published acceptance encoding hash');
  const compressed = Buffer.from(encoded.toString('utf8'), 'base64');
  assert.equal(sha256(compressed), persistence.canonicalAcceptance.gzipSha256, 'Published acceptance gzip hash');
  const bytes = zlib.gunzipSync(compressed);
  assert.equal(sha256(bytes), persistence.canonicalAcceptance.originalSha256, 'Published immutable acceptance hash');
  const accepted = JSON.parse(bytes);
  const exported = JSON.parse(fs.readFileSync(path.join(RECEIPT_ROOT, 'original-export-receipts.json')));
  return { accepted, exported, persistence };
}
function assertPrivateStorageAcceptance(value) {
  if (!value || value.privateStorageVerified !== true || value.providerLicensePermitsStorage !== true ||
      value.exactOriginalFiles !== true || !value.evidenceReference)
    throw new Error('Exact original inputs require evidenced private accessible storage and provider-permitted licensing before compilation');
}
function prepareExactSignalInput({ originalRoot, sourceRoot, loader, storageAcceptance } = {}) {
  assertPrivateStorageAcceptance(storageAcceptance);
  if (!originalRoot || !sourceRoot || !loader?.load) throw new Error('Explicit original root, pinned source root and research loader required');
  const { accepted, exported, persistence } = readPublishedInputReceipts();
  const readExact = (name, expectedHash) => {
    const bytes = fs.readFileSync(path.join(originalRoot, name));
    assert.equal(sha256(bytes), expectedHash, 'Exact original file hash: ' + name);
    return JSON.parse(bytes);
  };
  const manifest = readExact('manifest.json', accepted.acceptedManifestSha256);
  const originalManifest = readExact('manifest.original.json', accepted.originalManifestSha256);
  const validation = readExact('original-validation.json', accepted.originalValidationSha256);
  assert.equal(validation.passed, true, 'Original independent validation required');
  assert.equal(validation.complete, true, 'Complete 24-chunk validation required');
  assert.equal(validation.originalManifestSha256, accepted.originalManifestSha256);
  const checkpoint = readExact('pit-sp500-price-checkpoint-v1.json', accepted.priceCheckpointSha256);
  const blueprint = readExact('pit-sp500-universe-v1.json', accepted.universeSha256).privateBlueprint;
  assert.equal(manifest.chunks.length, 24, 'Complete original chunk set required');
  assert.equal(exported.chunks.length, 24);
  assert.equal(exported.originalManifestSha256, accepted.originalManifestSha256);
  assert.equal(exported.acceptedManifestSha256, accepted.acceptedManifestSha256);
  jsonEqual(manifest.sessionDates, originalManifest.sessionDates, 'Original dated session pool');
  const profiles = new Map();
  const originalSessions = [];
  const originalChunks = [];
  for (const chunk of manifest.chunks) {
    const published = exported.chunks.find(item => item.source.pathname === chunk.pathname)?.source;
    assert.ok(published, 'Chunk has published original identity');
    assert.equal(published.gzipRecompressed, false, 'Original gzip bytes required');
    const file = path.join(originalRoot, 'chunks', path.basename(chunk.pathname));
    const compressed = fs.readFileSync(file);
    assert.equal(compressed.length, published.bytes, 'Original compressed byte count');
    assert.equal(sha256(compressed), published.sha256, 'Original compressed chunk hash');
    const bytes = zlib.gunzipSync(compressed);
    assert.equal(bytes.length, published.uncompressedBytes, 'Original uncompressed byte count');
    assert.equal(sha256(bytes), published.contentSha256, 'Original chunk content hash');
    assert.equal(sha256(compressed), chunk.compressedSha256 ?? chunk.originalSha256);
    assert.equal(sha256(bytes), chunk.contentSha256);
    const parsed = JSON.parse(bytes);
    assert.equal(parsed.sessions.length, chunk.end - chunk.start);
    for (const [local, session] of parsed.sessions.entries()) {
      assert.equal(session.date, manifest.sessionDates[chunk.start + local], 'Original session order');
      // The scalar projection and canonical identifiers below are the existing
      // accepted adapter's projection; original archive files remain unchanged.
      for (const row of [...(session.positionSignals || []), ...(session.signals || [])]) {
        const symbol = canonical(row.symbol);
        const profile = { symbol, name: row.companyName || row.name || symbol, sector: row.sector };
        if (profiles.has(symbol)) jsonEqual(profiles.get(symbol), profile, 'Archived profile changed within original source');
        else profiles.set(symbol, profile);
      }
      originalSessions.push({ date: session.date, decisionAt: session.decisionAt,
        sourceUniverseCount: session.sourceUniverseCount, prices: session.prices,
        corporateActions: session.corporateActions || [] });
    }
    originalChunks.push({ pathname: chunk.pathname, compressedSha256: published.sha256, contentSha256: published.contentSha256 });
  }
  jsonEqual(originalChunks, accepted.originalChunks, 'All original published chunk identities');
  assert.equal(originalSessions.length, persistence.counts.sessions);
  const adapter = require(path.join(sourceRoot, 'tools/c1-build-current-historical-input.cjs'));
  const live = loader.load('lib/c1LiveInput.js');
  const calendar = loader.load('lib/marketSession.js');
  const liveSource = fs.readFileSync(path.join(sourceRoot, 'lib/c1LiveInput.js'), 'utf8');
  const gates = [...liveSource.matchAll(/minimumHistoryRows:\s*(\d+)/g)];
  assert.equal(gates.length, 1, 'Unique source live history gate');
  const minimumHistoryRows = Number(gates[0][1]);
  assert.equal(minimumHistoryRows, 253, 'Full source253 gate precedes percentiles');
  const maxCandidates = live.C1_LIVE_UNIVERSES.sp500.maxCandidates;
  assert.equal(maxCandidates, accepted.maxCandidates);
  const literalMetadataSourceGateErrors = [];
  const { raw, summary } = adapter.prepareRawInput({ originalSessions, checkpoint, blueprint,
    signature: JSON.parse(manifest.signature), profiles,
    normalizeMembers: (rows, date) => {
      try { live.c1LiveMembers('sp500', rows); }
      catch (error) { literalMetadataSourceGateErrors.push({ date, observedNamedMemberCount: rows.length, sourceError: error.message }); }
      return adapter.projectConditionalProfiles(rows);
    },
    isSessionDay: calendar.isUsMarketSessionDay,
    completedSessionDay: calendar.latestCompletedMarketSessionDay,
    modelDecisionClock: true,
    metadata: { ...manifest.datasetMetadata, fundamentalsPointInTime: false, fundamentalValuesRevisionSafe: false,
      eventRiskPointInTime: false, materialNewsHistoryComplete: false, source: adapter.CONDITIONAL_CONTRACT },
  });
  const rawPriceContentSha256 = sha256(JSON.stringify(raw.sessions.map(session => session.prices)));
  assert.equal(rawPriceContentSha256, accepted.rawPriceContentSha256, 'Exact accepted original OHLC prices, values and row order');
  jsonEqual(summary, accepted.summary, 'Source-compatible cohort, membership, archived sectors and decision clock');
  jsonEqual(literalMetadataSourceGateErrors, accepted.literalLiveInputGuardFailures.metadataSourceGateErrors,
    'Preserve literal archived-sector live guard failures');
  return { raw, summary, minimumHistoryRows, maxCandidates, chunks: manifest.chunks.map(chunk => ({
    pathname: chunk.pathname, start: chunk.start, end: chunk.end })),
  receipt: {
    contract: 'c1-exact-original-input-signal-recompilation-preparation-v1',
    originalManifestSha256: accepted.originalManifestSha256, acceptedManifestSha256: accepted.acceptedManifestSha256,
    originalValidationSha256: accepted.originalValidationSha256,
    priceCheckpointSha256: accepted.priceCheckpointSha256, universeSha256: accepted.universeSha256,
    rawPriceContentSha256, originalChunks, minimumHistoryRows, maxCandidates,
    privateStorageEvidenceReference: storageAcceptance.evidenceReference,
    originalInputFilesModified: false, pricesReconstructedOrSubstituted: false,
    originalTimestampsPreservedInSourceAndReceipt: true,
    derivedDecisionClock: accepted.summary.decisionClock.convention,
    literalLiveInputGuardFailures: accepted.literalLiveInputGuardFailures,
    currentLiveInputAccepted: false, actualLiveInputAccepted: false, eligibleForAlphaClaim: false,
    historicalPerformanceClaim: false,
    sourceIdentity: loader.identity?.() || null,
  } };
}
function compileSignalInputBatch({ prepared, loader, sourceRoot, start, count } = {}) {
  if (!prepared?.raw || !loader?.load || !sourceRoot || !Number.isSafeInteger(start) || start < 0 ||
      !Number.isSafeInteger(count) || count < 1 || start >= prepared.raw.sessions.length)
    throw new Error('Prepared exact inputs, pinned loader/root and bounded batch required');
  assert.equal(prepared.minimumHistoryRows, 253);
  const adapter = require(path.join(sourceRoot, 'tools/c1-build-current-historical-input.cjs'));
  const result = adapter.compileCurrentBatch({ compile: loader.load('lib/historicalSignalEvaluator.js').compilePointInTimeSignals,
    compact: loader.load('lib/replayDatasetCompaction.js').compactReplaySession,
    minimumHistoryRows: prepared.minimumHistoryRows, maxCandidates: prepared.maxCandidates,
  }, prepared.raw, start, count);
  for (const [local, session] of result.sessions.entries()) {
    const rawSession = prepared.raw.sessions[start + local];
    const cohort = prepared.summary.sessionCohorts.find(item => item.date === session.date);
    const actual = [...session.positionSignals, ...session.signals].map(row => row.symbol).sort();
    assert.equal(actual.length, cohort.current253, 'Exact full source253 percentile cohort count');
    assert.equal(sha256(JSON.stringify(actual)), cohort.current253SymbolsSha256, 'Exact full source253 cohort identity');
    jsonEqual(session.prices, rawSession.prices, 'Every original OHLC field/value and row order preserved');
    assert.equal(session.decisionAt, rawSession.decisionAt, 'Accepted derived clock preserved');
    assert.ok([...session.positionSignals, ...session.signals].every(row => !row.cik && !row.cikNumber), 'Unchanged current scalar issuer profile');
  }
  return result;
}
module.exports = { prepareExactSignalInput, compileSignalInputBatch, readPublishedInputReceipts, assertPrivateStorageAcceptance };

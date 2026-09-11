import { createHash } from 'node:crypto';
import { get, put } from '@vercel/blob';
import { gzipSync, gunzipSync } from 'node:zlib';
import { C1_LIVE_INPUT_CONTRACT } from './c1LiveInput';
import { c1DatedBookPath } from './c1DatedBookStore';
import { latestCompletedMarketSessionDay } from './marketSession';

const clone = value => JSON.parse(JSON.stringify(value));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const storage = {
  async write(path, record) {
    await put(path, gzipSync(JSON.stringify(record)), { access: 'private',
      addRandomSuffix: false, allowOverwrite: false, contentType: 'application/gzip', cacheControlMaxAge: 0 });
  },
  async read(path) {
    const response = await get(path, { access: 'private', useCache: false });
    if (!response) return null;
    if (response.statusCode !== 200) throw new Error('Index observation archive unavailable');
    return JSON.parse(gunzipSync(Buffer.from(await new Response(response.stream).arrayBuffer())).toString());
  }
};

// An observation is evidence, not an accepted model session. Preserve it before
// attempting the guarded transition, including when that transition rejects it.
// No reader promotes this archive, reconstructs old membership, or resets a book.
export async function archiveC1IndexObservation(input, { now = new Date(), store = storage,
  bookPath = c1DatedBookPath(input?.universe) } = {}) {
  if (input?.contract !== C1_LIVE_INPUT_CONTRACT || input.sourceSessionDate !== latestCompletedMarketSessionDay(now) ||
      input.session?.date !== input.sourceSessionDate || input.session?.decisionAt !== input.observedAt ||
      !Number.isFinite(Date.parse(input.observedAt)) || Date.parse(input.observedAt) > now.getTime() ||
      input.sourceReceipt?.membershipCheckedTwice !== true)
    throw new Error('Current provider observation required for archive');
  // The collector supplies market-only fields. Account/request fields are never
  // copied into this separate private archive.
  const fields = ['contract', 'universe', 'sourceSessionDate', 'observedAt', 'metadata', 'session',
    'memberCount', 'shortHistorySymbols', 'limitations', 'priorSessionPrices', 'sourceReceipt', 'priceEvidence'];
  const payload = clone(Object.fromEntries(fields.filter(key => input[key] !== undefined).map(key => [key, input[key]])));
  const observationHash = hash(payload);
  const record = { contract: 'c1-index-observation-v1', observationHash, observedAt: input.observedAt,
    sourceSessionDate: input.sourceSessionDate, acceptedModelInput: false, executable: false, payload };
  const path = bookPath.replace(/\.json\.gz$/, '') + '/observations/' + input.sourceSessionDate + '/' + observationHash + '.json.gz';
  try { await store.write(path, record); }
  catch {
    // Only an exact immutable duplicate resolves a create conflict. Never
    // overwrite a different record or interpret a permission error as success.
    let saved;
    try { saved = await store.read(path); } catch { throw new Error('Index observation archive unavailable'); }
    if (!saved || JSON.stringify(saved) !== JSON.stringify(record)) throw new Error('Index observation archive unavailable');
  }
  return { contract: 'c1-index-observation-receipt-v1', observationHash,
    sourceSessionDate: input.sourceSessionDate, observedAt: input.observedAt, acceptedModelInput: false };
}

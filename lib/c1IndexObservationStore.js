import { createHash } from 'node:crypto';
import { get, put, list } from '@vercel/blob';
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
  async list(prefix) {
    const result = await list({ prefix, limit: 100 });
    if (result.hasMore) throw new Error('Index observation recovery limit exceeded');
    return result.blobs.map(blob => blob.pathname);
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
// Recovery validates this immutable evidence before the usual guarded transition.
// It never reconstructs old membership or resets a book.
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

// Read only observations captured while this was the latest completed session.
// Hash, pathname and envelope must agree; callers cannot submit archive claims.
export async function readC1IndexObservations(day, { now = new Date(), store = storage,
  bookPath = c1DatedBookPath('sp500') } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > latestCompletedMarketSessionDay(now))
    throw new Error('Invalid index observation recovery date');
  const prefix = bookPath.replace(/\.json\.gz$/, '') + '/observations/' + day + '/';
  const paths = await store.list(prefix), records = [];
  for (const path of paths) {
    const r = await store.read(path), p = r?.payload;
    if (!r || r.contract !== 'c1-index-observation-v1' || r.acceptedModelInput !== false || r.executable !== false ||
        !p || p.contract !== C1_LIVE_INPUT_CONTRACT || p.universe !== 'sp500' ||
        r.observationHash !== hash(p) || path !== prefix + r.observationHash + '.json.gz' ||
        r.sourceSessionDate !== day || p.sourceSessionDate !== day || p.session?.date !== day ||
        r.observedAt !== p.observedAt || p.session.decisionAt !== p.observedAt ||
        !Number.isFinite(Date.parse(p.observedAt)) || Date.parse(p.observedAt) > now.getTime() ||
        latestCompletedMarketSessionDay(new Date(p.observedAt)) !== day ||
        p.sourceReceipt?.membershipCheckedTwice !== true)
      throw new Error('Index observation archive integrity failed');
    records.push(r);
  }
  return records.sort((a,b) => a.observedAt.localeCompare(b.observedAt) || a.observationHash.localeCompare(b.observationHash));
}

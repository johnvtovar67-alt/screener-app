import { get, put } from '@vercel/blob';
import { gzipSync, gunzipSync } from 'node:zlib';
import { acceptC1DatedInput, c1DatedBookView } from './c1DatedBook';

export function c1DatedBookPath(universe, environment = process.env.VERCEL_ENV, commit = process.env.VERCEL_GIT_COMMIT_SHA) {
  if (!['nasdaq', 'sp500'].includes(universe)) throw new Error('Explicit index universe required');
  if (environment === 'production') {
    if (universe !== 'sp500') throw new Error('The production index source is S&P 500');
    return 'research/c1-dated-index-production-v1/sp500.json.gz';
  }
  if (!/^[a-f0-9]{7,40}$/.test(commit || '')) throw new Error('Preview commit identity required');
  return `research/c1-dated-index-preview-${commit}/${universe}.json.gz`;
}
// This is the accepted September 10 input from PR #149. A release copies this
// exact observed book; it never invents a new observation or resets its clock.
export const C1_ACCEPTED_INDEX_SEED = Object.freeze({
  path: 'research/c1-dated-index-preview-4243623887da521168904284b0ab26040011ec90/sp500.json.gz',
  sessionDate: '2026-09-10',
  sourceHash: '9e39c40cd5c9a70025a4e68e72c6f5069cc47de463dcb93db669b35eede25592',
});
const storage = {
  async read(path) {
    const response = await get(path, { access: 'private', useCache: false });
    if (!response) return null;
    if (response.statusCode !== 200 || !response.blob?.etag) throw new Error('Dated model storage identity unavailable');
    return { etag: response.blob.etag, record: JSON.parse(gunzipSync(Buffer.from(await new Response(response.stream).arrayBuffer())).toString()) };
  },
  async write(path, record, etag) {
    return put(path, gzipSync(JSON.stringify(record)), { access: 'private', addRandomSuffix: false,
      allowOverwrite: Boolean(etag), ...(etag ? { ifMatch: etag } : {}), contentType: 'application/gzip', cacheControlMaxAge: 0 });
  }
};
export async function prepareStoredC1DatedBook({ now = new Date(), store = storage,
  path = c1DatedBookPath('sp500') } = {}) {
  const existing = await store.read(path);
  if (existing) {
    if (existing.record.universe !== 'sp500') throw new Error('Stored index universe mismatch');
    return c1DatedBookView(existing.record, [], now);
  }
  const seed = await store.read(C1_ACCEPTED_INDEX_SEED.path);
  if (!seed || seed.record.universe !== 'sp500' || seed.record.captures?.length !== 1 ||
      seed.record.captures[0].sessionDate !== C1_ACCEPTED_INDEX_SEED.sessionDate ||
      seed.record.captures[0].hash !== C1_ACCEPTED_INDEX_SEED.sourceHash)
    throw new Error('The accepted index seed is missing or changed; no new baseline permitted');
  const view = c1DatedBookView(seed.record, [], now);
  try { await store.write(path, seed.record); }
  catch (error) {
    const winner = await store.read(path);
    if (!winner || winner.record.recordHash !== seed.record.recordHash) throw error;
    return c1DatedBookView(winner.record, [], now);
  }
  return view;
}
export async function connectStoredC1DatedInput(input, { holdings = [], now = new Date(), store = storage,
  path = c1DatedBookPath(input.universe) } = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const saved = await store.read(path), next = acceptC1DatedInput(saved?.record || null, input, now);
    // Reject invalid account input before writing. The account itself is never stored.
    const view = c1DatedBookView(next, holdings, now);
    if (next === saved?.record) return view;
    try { await store.write(path, next, saved?.etag); return view; }
    catch (error) {
      if (attempt) throw error;
      // SDK create-conflicts can be generic BlobError instances. Establish a
      // competing saved record by reading it; never infer permission to overwrite.
      const winner = await store.read(path);
      if (!winner) throw error;
      const accepted = acceptC1DatedInput(winner.record, input, now);
      if (accepted === winner.record) return c1DatedBookView(accepted, holdings, now);
    }
  }
  throw new Error('Dated model write conflict');
}

// Fast read for both existing page APIs. Collection remains a separate bounded
// operation; ordinary page analysis never starts 500 provider requests.
export async function readStoredC1DatedBook(universe, { now = new Date(), store = storage,
  path = c1DatedBookPath(universe) } = {}) {
  const saved = await store.read(path);
  if (!saved) throw new Error('The '+universe+' index input has not been prepared');
  if (saved.record.universe !== universe) throw new Error('Stored index universe mismatch');
  return { record: saved.record, view: c1DatedBookView(saved.record, [], now), path };
}

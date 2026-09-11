import { get, put } from '@vercel/blob';
import { gzipSync, gunzipSync } from 'node:zlib';
import { acceptC1DatedInput, c1DatedBookView } from './c1DatedBook';

export function c1DatedBookPath(universe, environment = process.env.VERCEL_ENV, commit = process.env.VERCEL_GIT_COMMIT_SHA) {
  if (!['nasdaq', 'sp500'].includes(universe)) throw new Error('Explicit index universe required');
  if (environment === 'production') throw new Error('Dated model connection requires preview acceptance');
  if (!/^[a-f0-9]{7,40}$/.test(commit || '')) throw new Error('Preview commit identity required');
  return `research/c1-dated-index-preview-${commit}/${universe}.json.gz`;
}
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
export async function connectStoredC1DatedInput(input, { holdings = [], now = new Date(), store = storage,
  path = c1DatedBookPath(input.universe) } = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const saved = await store.read(path), next = acceptC1DatedInput(saved?.record || null, input, now);
    // Reject invalid account input before writing. The account itself is never stored.
    const view = c1DatedBookView(next, holdings, now);
    if (next === saved?.record) return view;
    try { await store.write(path, next, saved?.etag); return view; }
    catch (error) { if (attempt || !['BlobPreconditionFailedError', 'BlobAlreadyExistsError'].includes(error?.name)) throw error; }
  }
  throw new Error('Dated model write conflict');
}

import { timingSafeEqual } from 'node:crypto';
import { refreshC1Index } from '../../../lib/c1IndexLifecycle';

// Only application-owned messages enter logs. Never log arbitrary SDK errors,
// request headers, provider URLs/bodies, credentials, or portfolio data.
function failureDetail(error) {
  const message = String(error?.message || '');
  const known = [
    'Market data provider is not configured',
    'Market data provider request failed or timed out',
    'Market data provider returned invalid JSON',
    'Market data provider returned an empty or invalid result',
    'Live input acquisition stopped before completion',
    'Index membership or sectors changed during collection',
    'A new market session completed during collection; repeat the check',
    'Dated model storage identity unavailable',
    'Stored index universe mismatch',
    'The accepted index seed is missing or changed; no new baseline permitted',
    'Dated model record integrity failed; preserve the original',
    'A current, dated, provider-checked index input is required',
    'An existing model cannot switch index universes',
    'Previously accepted index input changed; original preserved',
    'Missing observed index session; no historical membership backfill',
    'Previous-session adjusted price anchors are required',
    'Dated model write conflict',
    'Index membership count is outside the declared range',
    'Invalid or duplicate index member',
    'Input observation timestamp is required',
    'Price history start date is required',
    'At least 253 benchmark sessions are required',
    'Current-session compilation did not complete',
    'Cannot determine next market session',
    'Incomplete forward session',
    'Invalid forward prices',
    'Forward observation timestamp unavailable',
    'No completed input sessions',
    'Forward decision timestamp unavailable or in the future',
    'Forward inputs are unordered or not current',
    'Unsupported forward model record',
    'Forward baseline execution predates observation or identity changed; original preserved',
    'Invalid diagnostic initialization window',
    'Missing forward session',
    'Execution before first eligible opening'
  ];
  if (known.includes(message)) return message;
  if (/^Market data provider returned HTTP [1-5][0-9]{2}$/.test(message)) return message;
  if (/^(Corporate action, removal, or price revision requires reconciliation: |Provider returned malformed price rows for |Current sector is missing for |Price history is missing for |Invalid, unordered, or unadjusted price history for |Current completed price is missing for |Price history contains a session gap for )[A-Z0-9.^-]{1,20}$/.test(message)) return message;
  const name = ['BlobError', 'BlobAccessError', 'BlobNotFoundError', 'BlobStoreNotFoundError',
    'BlobStoreSuspendedError', 'BlobServiceNotAvailable', 'BlobRequestAbortedError',
    'BlobPreconditionFailedError', 'SyntaxError', 'TypeError', 'AbortError'].includes(error?.name)
    ? error.name : 'Error';
  return 'Unclassified ' + name;
}

export const config = { maxDuration: 300 };
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[c1-index]', JSON.stringify({ status: 'failed', stage: 'configuration', reason: 'CRON_SECRET is not configured' }));
    return res.status(503).json({ error: 'Index collection is not configured' });
  }
  const supplied = Buffer.from(String(req.headers.authorization || ''));
  const expected = Buffer.from('Bearer ' + secret);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
    return res.status(401).json({ error: 'Unauthorized' });
  let stage = 'prepare';
  try {
    const result = await refreshC1Index({ onStage(next) {
      stage = next;
      console.info('[c1-index]', JSON.stringify({ status: 'running', stage }));
    } });
    stage = 'response';
    const body = { status: result.status, universe: result.universe,
      sourceSessionDate: result.sourceSessionDate, sourceHash: result.sourceHash,
      recordHash: result.recordHash, decisionId: result.decisionSnapshot.decisionId,
      executable: false, activationAuthorized: false };
    console.info('[c1-index]', JSON.stringify({ status: 'succeeded', sourceSessionDate: result.sourceSessionDate }));
    return res.status(200).json(body);
  } catch (error) {
    console.error('[c1-index]', JSON.stringify({ status: 'failed', stage, reason: failureDetail(error) }));
    return res.status(503).json({ status: 'index-unavailable', executable: false,
      error: String(error?.message || 'Index collection failed').slice(0, 220) });
  }
}

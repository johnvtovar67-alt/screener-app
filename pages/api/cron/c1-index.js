import { timingSafeEqual } from 'node:crypto';
import { refreshC1Index } from '../../../lib/c1IndexLifecycle';

export const config = { maxDuration: 300 };
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ error: 'Index collection is not configured' });
  const supplied = Buffer.from(String(req.headers.authorization || ''));
  const expected = Buffer.from('Bearer ' + secret);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
    return res.status(401).json({ error: 'Unauthorized' });
  try {
    const result = await refreshC1Index();
    return res.status(200).json({ status: result.status, universe: result.universe,
      sourceSessionDate: result.sourceSessionDate, sourceHash: result.sourceHash,
      recordHash: result.recordHash, decisionId: result.decisionSnapshot.decisionId,
      executable: false, activationAuthorized: false });
  } catch (error) {
    return res.status(503).json({ status: 'index-unavailable', executable: false,
      error: String(error?.message || 'Index collection failed').slice(0, 220) });
  }
}

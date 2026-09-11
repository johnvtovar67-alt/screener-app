import { collectC1LiveInput } from '../../../lib/c1LiveInputProvider';
import { latestCompletedMarketSessionDay } from '../../../lib/marketSession';

export const config = { maxDuration: 120 };
const cache = new Map(), inflight = new Map();
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Method not allowed' }); }
  if (process.env.VERCEL_ENV === 'production') return res.status(409).json({ status: 'preview-only',
    executable: false, productionChanged: false, error: 'Live input acceptance runs on the protected preview.' });
  const universe = req.query.universe || 'nasdaq';
  if (!['nasdaq', 'sp500'].includes(universe)) return res.status(400).json({ error: 'Choose nasdaq or sp500' });
  // S&P acquisition is larger; this preview deliberately does not run a second
  // index's 500 history calls or silently switch a production universe.
  if (universe === 'sp500') return res.status(422).json({ status: 'not-collected', executable: false,
    error: 'The S&P 500 compiler is supported offline; live acquisition requires a separate bounded collector.' });
  const key = universe + ':' + latestCompletedMarketSessionDay(new Date());
  try {
    const existing = cache.get(key);
    let input = existing && Date.now() - existing.at < 300000 ? existing.input : null;
    if (!input) {
      if (!inflight.has(key)) inflight.set(key, collectC1LiveInput({ universe }));
      try { input = await inflight.get(key); cache.clear(); cache.set(key, { at: Date.now(), input }); }
      finally { inflight.delete(key); }
    }
    return res.status(200).json({ status: 'compiled-input-only', contract: input.contract,
      universe: input.universe, sourceSessionDate: input.sourceSessionDate, observedAt: input.observedAt,
      memberCount: input.memberCount, evaluatedMembers: input.session.positionSignals?.length || 0,
      shortHistorySymbols: input.shortHistorySymbols, sourceReceipt: input.sourceReceipt,
      executable: false, eligibleForLiveCapital: false, eligibleForAlphaClaim: false,
      productionChanged: false, limitations: input.limitations });
  } catch (error) {
    return res.status(503).json({ status: 'input-unavailable', executable: false, productionChanged: false,
      error: String(error?.message || 'Live input collection failed').slice(0, 220) });
  }
}

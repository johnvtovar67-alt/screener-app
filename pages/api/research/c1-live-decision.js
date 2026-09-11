import { collectC1LiveInput } from '../../../lib/c1LiveInputProvider';
import { connectStoredC1DatedInput } from '../../../lib/c1DatedBookStore';
import { compareC1Holdings } from '../../../lib/c1HoldingsComparison';
import { latestCompletedMarketSessionDay } from '../../../lib/marketSession';

export const config = { maxDuration: 300, api: { bodyParser: { sizeLimit: '128kb' } } };
const cache = new Map(), inflight = new Map();
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  if (process.env.VERCEL_ENV === 'production') return res.status(409).json({ status: 'preview-only', executable: false,
    error: 'Dated model connection requires protected-preview acceptance.' });
  const universe = req.query.universe;
  if (!['nasdaq', 'sp500'].includes(universe)) return res.status(400).json({ error: 'An explicit nasdaq or sp500 universe is required' });
  const holdings = req.method === 'POST' ? req.body?.holdings : [];
  try { compareC1Holdings(holdings, null); }
  catch { return res.status(400).json({ error: 'Valid explicit holdings and roles required' }); }
  const key = universe + ':' + latestCompletedMarketSessionDay(new Date());
  try {
    const saved = cache.get(key);
    let input = saved && Date.now() - saved.at < 300000 ? saved.input : null;
    if (!input) {
      if (!inflight.has(key)) inflight.set(key, collectC1LiveInput({ universe, budgetMs: universe === 'sp500' ? 240000 : 100000 }));
      try { input = await inflight.get(key); cache.set(key, { at: Date.now(), input }); }
      finally { inflight.delete(key); }
    }
    const connected = await connectStoredC1DatedInput(input, { holdings });
    return res.status(200).json({ status: 'connected-diagnostic-only', ...connected,
      memberCount: input.memberCount, evaluatedMembers: input.session.positionSignals?.length || 0,
      shortHistorySymbols: input.shortHistorySymbols, accountStored: false, productionChanged: false });
  } catch (error) {
    return res.status(503).json({ status: 'connection-unavailable', executable: false, orders: [],
      error: String(error?.message || 'Dated model connection failed').slice(0, 220) });
  }
}

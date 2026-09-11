import { createHash } from 'node:crypto';
import { normalizeHistoricalBars } from './fmpResearchBacktest';
import { compileC1LiveInput, c1LiveMembers, C1_LIVE_UNIVERSES } from './c1LiveInput';
import { latestCompletedMarketSessionDay } from './marketSession';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Read-only acquisition, separate from every frozen research checkpoint and
// production portfolio. The deadline and concurrency limit bound a manual check.
export async function collectC1LiveInput({ universe = 'nasdaq', now = new Date(), fetcher = fetch,
  apiKey = process.env.FMP_API_KEY || process.env.FMP_KEY, budgetMs = 100000 } = {}) {
  const spec = Object.hasOwn(C1_LIVE_UNIVERSES, universe) && C1_LIVE_UNIVERSES[universe];
  if (!spec) throw new Error('Select a tested index universe: nasdaq or sp500');
  if (!apiKey) throw new Error('Market data provider is not configured');
  const through = latestCompletedMarketSessionDay(now);
  const fromDate = new Date(Date.parse(through + 'T12:00:00Z') - 550 * 86400000).toISOString().slice(0, 10);
  const deadline = Date.now() + budgetMs;
  let nextStart = 0, slot = Promise.resolve(), failed = false;
  async function request(endpoint, params = {}) {
    const previous = slot;
    let release;
    slot = new Promise(resolve => { release = resolve; });
    await previous;
    try {
      const delay = Math.max(0, nextStart - Date.now());
      if (Date.now() + delay >= deadline || failed) throw new Error('Live input acquisition stopped before completion');
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      nextStart = Date.now() + 300;
    } finally { release(); }
    const query = new URLSearchParams({ ...params, apikey: apiKey });
    // Never echo a provider URL/body: either can contain a credential.
    let response;
    try { response = await fetcher('https://financialmodelingprep.com/stable/' + endpoint + '?' + query,
      { cache: 'no-store', signal: AbortSignal.timeout(Math.max(1, Math.min(15000, deadline - Date.now()))) }); }
    catch { failed = true; throw new Error('Market data provider request failed or timed out'); }
    if (!response.ok) { failed = true; throw new Error('Market data provider returned HTTP ' + response.status); }
    const body = await response.json();
    const rows = Array.isArray(body) ? body : body?.historical;
    if (!Array.isArray(rows) || !rows.length) { failed = true; throw new Error('Market data provider returned an empty or invalid result'); }
    return rows;
  }
  const members = c1LiveMembers(universe, await request(spec.endpoint));
  const histories = {}, rawHashes = {};
  const symbols = [...members.map(row => row.symbol), 'SPY', 'QQQ'];
  let cursor = 0;
  const workers = Array.from({ length: 3 }, async () => {
    while (cursor < symbols.length && !failed) {
      const symbol = symbols[cursor++];
      try {
        const rows = await request('historical-price-eod/dividend-adjusted', { symbol, from: fromDate, to: through });
        const inRange = rows.filter(row => row.date >= fromDate && row.date <= through);
        const bars = normalizeHistoricalBars(inRange, { sourceAdjusted: true });
        if (bars.length !== inRange.length) throw new Error('Provider returned malformed price rows for ' + symbol);
        histories[symbol] = bars;
        rawHashes[symbol] = digest(inRange);
      } catch (error) { failed = true; throw error; }
    }
  });
  const settled = await Promise.allSettled(workers);
  const rejection = settled.find(result => result.status === 'rejected');
  if (rejection) throw rejection.reason;
  const after = c1LiveMembers(universe, await request(spec.endpoint));
  if (JSON.stringify(after) !== JSON.stringify(members)) throw new Error('Index membership or sectors changed during collection');
  const observedAt = new Date().toISOString();
  if (latestCompletedMarketSessionDay(new Date(observedAt)) !== through)
    throw new Error('A new market session completed during collection; repeat the check');
  const input = compileC1LiveInput({ universe, members, histories, observedAt, fromDate });
  return { ...input, sourceReceipt: { provider: 'FMP', membershipEndpoint: spec.endpoint,
    membershipSha256: digest(members), membershipCheckedTwice: true,
    priceEndpoint: 'historical-price-eod/dividend-adjusted', fromDate, throughDate: through,
    priceResponsesSha256: digest(Object.fromEntries(Object.entries(rawHashes).sort(([a], [b]) => a.localeCompare(b)))),
    compilerSource: 'historicalSignalEvaluator.compilePointInTimeSignals',
    sessionSha256: digest(input.session), collectedSymbols: symbols.length,
    productionChanged: false } };
}

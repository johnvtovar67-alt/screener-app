import { compilePointInTimeSignals } from './historicalSignalEvaluator';
import { compactReplaySession } from './replayDatasetCompaction';
import { isUsMarketSessionDay, latestCompletedMarketSessionDay } from './marketSession';

export const C1_LIVE_INPUT_CONTRACT = 'c1-dated-index-input-v1';
export const C1_LIVE_UNIVERSES = {
  nasdaq: { endpoint: 'nasdaq-constituent', label: 'FMP Nasdaq index', minimum: 90, maximum: 125, maxCandidates: 150 },
  sp500: { endpoint: 'sp500-constituent', label: 'FMP S&P 500 index', minimum: 490, maximum: 520, maxCandidates: 500 },
};
const symbolPattern = /^[A-Z][A-Z0-9.-]{0,15}$/;

export function c1LiveMembers(universe, rows) {
  const spec = Object.hasOwn(C1_LIVE_UNIVERSES, universe) && C1_LIVE_UNIVERSES[universe];
  if (!spec) throw new Error('Select a tested index universe: nasdaq or sp500');
  if (!Array.isArray(rows) || rows.length < spec.minimum || rows.length > spec.maximum)
    throw new Error('Index membership count is outside the declared range');
  const seen = new Set();
  return rows.map(row => {
    const symbol = row?.symbol;
    if (typeof symbol !== 'string' || !symbolPattern.test(symbol) || seen.has(symbol) || ['SPY', 'QQQ'].includes(symbol))
      throw new Error('Invalid or duplicate index member');
    seen.add(symbol);
    if (typeof row.sector !== 'string' || !row.sector.trim() || /^(other|unknown|n\/a)$/i.test(row.sector.trim()))
      throw new Error('Current sector is missing for ' + symbol);
    return { symbol, name: row.name || row.companyName || symbol, sector: row.sector.trim() };
  }).sort((a, b) => a.symbol.localeCompare(b.symbol));
}

// Compile only the newly observed completed session. The price prefix warms
// indicators; today's members and sectors are NEVER replayed as past decisions.
// This source does not reconstruct historical sectors or authorize a release.
export function compileC1LiveInput({ universe, members, histories, observedAt, fromDate }) {
  const observed = new Date(observedAt);
  if (!Number.isFinite(observed.getTime())) throw new Error('Input observation timestamp is required');
  const sessionDate = latestCompletedMarketSessionDay(observed);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate || '') || !Number.isFinite(Date.parse(fromDate)) ||
      new Date(fromDate).toISOString().slice(0, 10) !== fromDate || fromDate >= sessionDate)
    throw new Error('Price history start date is required');
  const profiles = c1LiveMembers(universe, members);
  const symbols = [...profiles.map(row => row.symbol), 'SPY', 'QQQ'];
  const bySymbol = new Map();
  for (const symbol of symbols) {
    const bars = histories?.[symbol];
    if (!Array.isArray(bars) || !bars.length) throw new Error('Price history is missing for ' + symbol);
    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i];
      if (!isUsMarketSessionDay(bar.date) || bar.date < fromDate || bar.date > sessionDate ||
          (i > 0 && bar.date <= bars[i - 1].date) || bar.adjusted !== true ||
          !['open', 'high', 'low', 'close'].every(key => typeof bar[key] === 'number' && Number.isFinite(bar[key]) && bar[key] > 0) ||
          typeof bar.volume !== 'number' || !Number.isFinite(bar.volume) || bar.volume < 0 ||
          bar.low > Math.min(bar.open, bar.close) || bar.high < Math.max(bar.open, bar.close))
        throw new Error('Invalid, unordered, or unadjusted price history for ' + symbol);
    }
    if (bars.at(-1).date !== sessionDate) throw new Error('Current completed price is missing for ' + symbol);
    bySymbol.set(symbol, new Map(bars.map(bar => [bar.date, bar])));
  }
  const dates = [];
  for (let time = Date.parse(fromDate + 'T12:00:00Z'); time <= Date.parse(sessionDate + 'T12:00:00Z'); time += 86400000) {
    const date = new Date(time).toISOString().slice(0, 10);
    if (isUsMarketSessionDay(date)) dates.push(date);
  }
  if (dates.length < 253) throw new Error('At least 253 benchmark sessions are required');
  const shortHistorySymbols = [];
  for (const symbol of symbols) {
    const bars = histories[symbol];
    const expected = ['SPY', 'QQQ'].includes(symbol) ? dates : dates.filter(date => date >= bars[0].date);
    if (expected.some(date => !bySymbol.get(symbol).has(date))) throw new Error('Price history contains a session gap for ' + symbol);
    if (bars.length < 253) shortHistorySymbols.push(symbol);
  }
  const memberSymbols = profiles.map(row => row.symbol);
  const raw = {
    metadata: { source: C1_LIVE_UNIVERSES[universe].label + ' observed current membership', corporateActionsAdjusted: true,
      pointInTime: false, universeMembershipPointInTime: false, survivorshipBiasFree: false },
    securities: profiles.map(row => ({ ...row, listedAt: fromDate, isEtf: false, isFund: false })),
    fundamentals: [], events: [],
    sessions: dates.map(date => ({ date, decisionAt: observed.toISOString(),
      universeSymbols: date === sessionDate ? memberSymbols : [],
      prices: symbols.flatMap(symbol => {
        const bar = bySymbol.get(symbol).get(date);
        return bar ? [{ ...bar, symbol }] : [];
      }) })),
  };
  const compiled = compilePointInTimeSignals(raw, {
    liquidity: { maxCandidates: C1_LIVE_UNIVERSES[universe].maxCandidates }, minimumHistoryRows: 253,
    resume: { sessions: [], completedSessions: dates.length - 1, decisionMemory: [] }, maxSessions: 1,
  });
  if (compiled.sessions.length !== 1 || compiled.sessions[0].date !== sessionDate || !compiled.compilerProgress.complete)
    throw new Error('Current-session compilation did not complete');
  const session = compactReplaySession(compiled.sessions[0]);
  // Strip the shared compiler's wall-clock generatedAt from the content identity.
  // Acquisition time is recorded separately in the source receipt.
  const { generatedAt, ...compilerMetadata } = compiled.metadata;
  return {
    contract: C1_LIVE_INPUT_CONTRACT, universe, sourceSessionDate: sessionDate, observedAt: observed.toISOString(),
    executable: false, eligibleForLiveCapital: false, eligibleForAlphaClaim: false,
    metadata: { ...compilerMetadata, liveUniverse: universe, liveInputContract: C1_LIVE_INPUT_CONTRACT,
      sectorBasis: 'provider-current-classification-at-observation', historyUse: 'indicator-warmup-only' },
    session, memberCount: profiles.length, shortHistorySymbols,
    limitations: ['Current index membership is observed at collection time, not independently certified historical membership.',
      'Current sector observations do not repair the saved backtest sector-history limitation.',
      'No historical holdings, live model book, corporate-action transition, or account-specific orders are inferred.'],
  };
}

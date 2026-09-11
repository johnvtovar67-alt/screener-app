import { quoteFreshness } from './expertDecision';
import { C1_FROZEN_OPTIONS } from './c1FrozenOptions';

const cashSymbols = new Set(['CASH', 'SWVXX', 'VMFXX', 'SPAXX', 'FDRXX', 'MMF']);
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;

// Account reference levels only. No sleeve assignment, fabricated fill, rank
// recommendation or trade order is derived from an aggregate holding snapshot.
export function c1HoldingRisk(positions, now = new Date()) {
  const lossLimitPct = C1_FROZEN_OPTIONS.base.minimumInitialStopPct;
  return (Array.isArray(positions) ? positions : []).filter(row =>
    row.role === 'Swing' && row.symbol !== 'MSTR' && !cashSymbols.has(row.symbol)
  ).map(row => {
    const basis = Number(row.avgCost), shares = Number(row.shares);
    const price = Number(row.price ?? row.currentPrice ?? row.lastPrice);
    const referencePrice = positive(basis) ? basis * (1 - lossLimitPct / 100) : null;
    const timestamp = Number(row.timestamp), quoteMs = timestamp > 1e12 ? timestamp : timestamp * 1000;
    const freshness = quoteFreshness(row, now);
    const verified = positive(price) && positive(shares) && !row.error &&
      !row.clientSnapshotFallback && !row.dataFeedSnapshotStale &&
      !String(row._fmpQuoteCache || '').startsWith('stale') &&
      Number.isFinite(quoteMs) && quoteMs <= now.getTime() && freshness.pass;
    const breached = verified && referencePrice !== null ? price <= referencePrice : null;
    return { symbol: row.symbol, shares: positive(shares) ? shares : null,
      averageCost: positive(basis) ? basis : null, lossLimitPct, referencePrice,
      price: positive(price) ? price : null, quoteVerified: Boolean(verified),
      quoteAt: positive(quoteMs) && quoteMs <= now.getTime() ? new Date(quoteMs).toISOString() : null,
      status: referencePrice === null ? 'basis-required' : !verified ? 'quote-unverified' : breached ? 'at-or-below-reference' : 'above-reference',
      downsideToReferencePct: verified && referencePrice !== null ? (price-referencePrice)/price*100 : null,
      accountBasis: 'entered-average-cost', executable: false, orders: [] };
  });
}

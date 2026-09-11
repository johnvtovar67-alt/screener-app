import { c1SymbolModelView } from './c1DecisionSnapshot';
const CASH_SYMBOLS = new Set(['CASH', 'SWVXX', 'VMFXX', 'SPAXX', 'FDRXX', 'MMF']);
// Read-only comparison. Brokerage snapshots cannot reconstruct model fills.
export function compareC1Holdings(holdings, model, decision=null) {
  if (!Array.isArray(holdings) || holdings.length > 500) throw new Error('Holdings array required');
  const seen = new Set(), positions = [];
  let cash = 0;
  for (const row of holdings) {
    const symbol = String(row?.symbol || '').trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9.-]{0,15}$/.test(symbol) || seen.has(symbol)) throw new Error('Invalid or duplicate symbol');
    seen.add(symbol);
    if (typeof row.shares !== 'number' || !Number.isFinite(row.shares) || row.shares < 0) throw new Error('Invalid shares');
    if (!['Core', 'Swing'].includes(row.role)) throw new Error('Explicit holding role required');
    if (CASH_SYMBOLS.has(symbol)) {
      const value = row.cashValue ?? (symbol === 'CASH' ? row.shares : null);
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('Explicit cash value required');
      if (row.role === 'Swing') cash += value;
      continue;
    }
    if (row.role === 'Core' || row.shares === 0) continue;
    positions.push({symbol, shares: row.shares});
  }
  const usable = model?.status === 'paper-only' && model.observedForwardSessions > 0;
  const virtual = model?.virtualShares;
  const valid = virtual && typeof virtual === 'object' && !Array.isArray(virtual) &&
    Object.entries(virtual).every(([s,n]) => /^[A-Z][A-Z0-9.-]{0,15}$/.test(s) && typeof n === 'number' && Number.isFinite(n) && n >= 0);
  const comparable = Boolean(usable && valid);
  return {
    status: comparable ? 'informational-only' : 'model-not-ready',
    sourceSessionDate: model?.sourceSessionDate || null,
    holdingsSource: 'user-declared-snapshot', brokerageVerified: false,
    historicalFillsReconciled: false, executable: false, orders: [],
    decisionId:decision?.decisionId||null,
    cash, positions: positions.map(p => ({...p,
      modelDecision:c1SymbolModelView(decision,p.symbol),
      modelPresence: comparable ? (virtual[p.symbol] > 0 ? 'present' : 'absent') : 'unknown'})),
    explanation: comparable
      ? 'Presence in the paper model is a comparison only. It does not establish an appropriate position size or a buy, hold, or sell recommendation.'
      : 'The paper model is unavailable, stale, or has no completed forward session. Existing holdings cannot be classified from this comparison.',
    limitation: 'Current share counts do not establish historical fills, deposits, withdrawals, or sleeve ownership. No allocation or trading instruction is inferred.'
  };
}

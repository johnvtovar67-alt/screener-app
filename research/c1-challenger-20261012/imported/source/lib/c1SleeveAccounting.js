// Model accounting only. This module cannot authorize brokerage orders or
// reconstruct sleeve ownership from an aggregate portfolio snapshot.
export const C1_ACCOUNTING_WEIGHTS = Object.freeze({ base: 0.25, cooldown15: 0.5, sector40: 0.25 });
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const nonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
function requireDay(day) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day)
    throw new Error('A valid session date is required');
}
function requireSymbol(symbol) {
  if (typeof symbol !== 'string' || !/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol))
    throw new Error('Invalid stock symbol');
}

export function createC1SleeveAccounting(initialCapital, startDate) {
  if (!positive(initialCapital)) throw new Error('Positive initial capital required');
  requireDay(startDate);
  return { version: 1, kind: 'virtual-model', initialCapital, startDate,
    sleeves: Object.fromEntries(Object.entries(C1_ACCOUNTING_WEIGHTS).map(([id, weight]) =>
      [id, { cash: initialCapital * weight, positions: {}, lastDate: startDate }])),
    fills: [] };
}

// Events are replayed on restore instead of trusting cached balances, rank or
// authority flags. Same-ID retries are idempotent; conflicting retries fail.
export function applyC1SleeveFill(state, event) {
  if (state?.version !== 1 || state?.kind !== 'virtual-model') throw new Error('Unsupported sleeve state');
  const { id, sleeve, date, symbol, side, shares, price, fee = 0 } = event || {};
  if (typeof id !== 'string' || !id.length || id.length > 200) throw new Error('Fill ID required');
  if (!own(C1_ACCOUNTING_WEIGHTS, sleeve)) throw new Error('Unknown sleeve');
  requireDay(date); requireSymbol(symbol);
  if (!['buy', 'sell'].includes(side) || !positive(shares) || !positive(price) || !nonnegative(fee))
    throw new Error('Invalid fill economics');
  const fill = { id, sleeve, date, symbol, side, shares, price, fee };
  const previous = state.fills.find(item => item.id === id);
  if (previous) {
    if (JSON.stringify(previous) !== JSON.stringify(fill)) throw new Error('Conflicting fill ID');
    return state;
  }
  const book = state.sleeves[sleeve];
  if (date < book.lastDate) throw new Error('Out-of-order sleeve fill');
  const delta = side === 'buy' ? shares : -shares;
  const remaining = (book.positions[symbol] || 0) + delta;
  const cash = book.cash - delta * price - fee;
  if (!Number.isFinite(cash) || cash < -1e-7) throw new Error('Insufficient sleeve cash');
  if (!Number.isFinite(remaining) || remaining < -1e-8) throw new Error('Cannot oversell sleeve');
  const positions = { ...book.positions };
  if (remaining <= 1e-8) delete positions[symbol]; else positions[symbol] = remaining;
  return { ...state, sleeves: { ...state.sleeves,
    [sleeve]: { cash: Math.max(0, cash), positions, lastDate: date } }, fills: [...state.fills, fill] };
}

export function restoreC1SleeveAccounting(record) {
  if (record?.version !== 1 || record?.kind !== 'virtual-model' || !Array.isArray(record.fills))
    throw new Error('Complete model fill history required; holdings alone cannot restore sleeves');
  return record.fills.reduce(applyC1SleeveFill,
    createC1SleeveAccounting(record.initialCapital, record.startDate));
}

export function valueC1SleeveAccounting(state, prices) {
  const restored = restoreC1SleeveAccounting(state);
  const virtualShares = {}, sleeves = {};
  let cash = 0, equity = 0;
  for (const [id, book] of Object.entries(restored.sleeves)) {
    let value = book.cash;
    for (const [symbol, shares] of Object.entries(book.positions)) {
      if (!own(prices, symbol) || !positive(prices[symbol])) throw new Error(`Missing mark: ${symbol}`);
      value += shares * prices[symbol];
      virtualShares[symbol] = (virtualShares[symbol] || 0) + shares;
    }
    if (!Number.isFinite(value)) throw new Error('Invalid marked equity');
    cash += book.cash; equity += value; sleeves[id] = { cash: book.cash, equity: value };
  }
  return { kind: 'virtual-model', cash, equity, virtualShares, sleeves };
}

export function proposeC1WholeShareReconciliation({ state, prices, heldShares = {}, cash,
  slippageBps = 12, commissionPerOrder = 0 }) {
  if (!nonnegative(cash) || !nonnegative(slippageBps) || slippageBps >= 10000 || !nonnegative(commissionPerOrder))
    throw new Error('Invalid cash or transaction cost');
  const model = valueC1SleeveAccounting(state, prices), sells = [], buys = [];
  let projectedCash = cash;
  for (const symbol of [...new Set([...Object.keys(model.virtualShares), ...Object.keys(heldShares)])].sort()) {
    requireSymbol(symbol);
    const held = heldShares[symbol] ?? 0;
    if (!Number.isSafeInteger(held) || held < 0) throw new Error('Whole nonnegative brokerage shares required');
    // Aggregate first, round once; independently flooring sleeve interests loses shares.
    const target = Math.floor(model.virtualShares[symbol] || 0), delta = target - held;
    if (!Number.isSafeInteger(target)) throw new Error('Invalid whole-share target');
    if (!delta) continue;
    if (!own(prices, symbol) || !positive(prices[symbol])) throw new Error(`Missing mark: ${symbol}`);
    const side = delta > 0 ? 'buy' : 'sell', shares = Math.abs(delta);
    const estimatedPrice = prices[symbol] * (1 + (delta > 0 ? 1 : -1) * slippageBps / 10000);
    const cashChange = -delta * estimatedPrice - commissionPerOrder;
    projectedCash += cashChange;
    (delta > 0 ? buys : sells).push({ symbol, side, shares, estimatedPrice, cashChange });
  }
  if (!Number.isFinite(projectedCash)) throw new Error('Invalid projected cash');
  return { scope: 'offline-model-reconciliation', executable: false, orders: [...sells, ...buys],
    projectedCash, fundingPass: projectedCash >= 0 };
}

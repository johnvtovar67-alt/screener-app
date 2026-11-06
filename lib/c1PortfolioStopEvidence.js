// Request-local annotations. No evidence is attached to persisted plans or fills.
const evidenceByObject = new WeakMap();
const projectedBySleeve = new WeakMap();

export function observeC1PortfolioStop(position, date, seed, peak, opening, limitPct, carried) {
  if (!seed || !(seed.actualDollarsPerModelDollar > 0) || !(peak > 0)) return;
  if (carried && evidenceByObject.has(position)) return;
  const scale = seed.actualDollarsPerModelDollar;
  evidenceByObject.set(position, Object.freeze({
    symbol: position.symbol, sleeve: seed.sleeve, date, limitPct,
    peak: peak * scale, opening: opening * scale, lossPct: 100 * (peak - opening) / peak
  }));
}

export function carryC1PortfolioStop(position, trade) {
  const evidence = evidenceByObject.get(position);
  if (evidence && trade.reason === 'portfolio-drawdown-stop') evidenceByObject.set(trade, evidence);
}

export function c1PortfolioStopFields(item, symbol, sleeve, reason) {
  const evidence = evidenceByObject.get(item);
  return reason === 'portfolio-drawdown-stop' && evidence?.symbol === symbol && evidence.sleeve === sleeve
    ? {portfolioStopEvidence: evidence} : {};
}

export function rememberC1ProjectedStop(sleeveRisk, order, trade) {
  const evidence = evidenceByObject.get(trade);
  if (!evidence || order.reason !== 'portfolio-drawdown-stop') return;
  if (!projectedBySleeve.has(sleeveRisk)) projectedBySleeve.set(sleeveRisk, new Map());
  projectedBySleeve.get(sleeveRisk).set(order.id, evidence);
}

export function c1ProjectedStopFields(plan, order) {
  const evidence = projectedBySleeve.get(plan.riskBySleeve?.[order.sleeve])?.get(order.id);
  return order.reason === 'portfolio-drawdown-stop' && evidence?.symbol === order.symbol && evidence.sleeve === order.sleeve
    ? {portfolioStopEvidence: evidence} : {};
}

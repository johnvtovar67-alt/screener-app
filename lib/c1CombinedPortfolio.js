import { restoreC1SleeveAccounting, valueC1SleeveAccounting } from './c1SleeveAccounting';

// Holdings of the exact combined model, not a new ranked target portfolio.
// Closing weights drift with prices. They must never become rebalance orders.
export function c1CombinedPortfolio(ledger, marks, sourceSessionDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sourceSessionDate || '') ||
      !Number.isFinite(Date.parse(sourceSessionDate)) ||
      new Date(sourceSessionDate).toISOString().slice(0,10)!==sourceSessionDate)
    throw new Error('Combined portfolio session required');
  const state = restoreC1SleeveAccounting(ledger);
  if(state.startDate>sourceSessionDate || state.fills.some(f=>f.date>sourceSessionDate))
    throw new Error('Combined portfolio cannot use future fills');
  const valued = valueC1SleeveAccounting(state, marks);
  if (!(valued.equity > 0)) throw new Error('Combined portfolio equity unavailable');
  const positions = Object.entries(valued.virtualShares).sort(([a],[b])=>a.localeCompare(b)).map(([symbol,shares])=>{
    const value=shares*marks[symbol];
    return {symbol,virtualShares:shares,modelValue:value,observedWeightPct:100*value/valued.equity,
      sleeveShares:Object.fromEntries(Object.entries(state.sleeves)
        .filter(([,b])=>b.positions[symbol]>0).map(([id,b])=>[id,b.positions[symbol]]))};
  });
  return {contract:'c1-combined-holdings-v1',sourceSessionDate,status:'model-holdings-only',
    executable:false,orders:[],cash:valued.cash,equity:valued.equity,
    cashWeightPct:100*valued.cash/valued.equity,positions,
    explanation:'Combined holdings of the three independent model books. Observed weights are not new allocation targets or instructions to rebalance.'};
}

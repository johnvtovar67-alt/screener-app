const CASH=['CASH','SWVXX','VMFXX','SPAXX','FDRXX','MMF'];

// C1 owns only the Swing book. Keep every Core row, including cash, intact.
// Reuse an existing Swing cash label so a Core CASH row is not duplicated.
export function mergeC1AccountPortfolio(portfolio,decision){
  const cash=portfolio.find(p=>p.role==='Swing'&&p.symbol==='CASH')||
    portfolio.find(p=>p.role==='Swing'&&CASH.includes(p.symbol));
  if(!cash)throw new Error('The recorded Swing cash balance is missing; reconcile the portfolio before updating it.');
  return [...portfolio.filter(p=>p.role==='Core'),
    ...decision.positions.map(p=>({symbol:p.symbol,shares:p.shares,avgCost:p.avgCost,openedAt:p.openedAt,role:'Swing',...(p.entryContext?{entryContext:p.entryContext}:{})})),
    {...cash,shares:decision.actualCash,avgCost:1,role:'Swing'}];
}


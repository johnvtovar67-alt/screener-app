const CASH=['CASH','SWVXX','VMFXX','SPAXX','FDRXX','MMF'];

export function isPortfolioCash(position){
  return CASH.includes(String(position?.symbol||'').toUpperCase());
}

// Legacy storage may contain a cash pseudo-position. It is brokerage metadata,
// never a security owned by a C1 sleeve or a source of C1 strategy cash.
export function portfolioHoldings(portfolio=[]){
  return portfolio.filter(position=>!isPortfolioCash(position));
}

// Used only before a private C1 account exists, to keep the existing adoption
// contract's explicit strategy-funding seed separate from securities and from
// an observed brokerage balance. Never apply this to an adopted account.
export function initialC1StrategyCash(portfolio=[]){
  return portfolio.filter(position=>position.role==='Swing'&&isPortfolioCash(position)).reduce((sum,position)=>sum+Number(position.shares)*Number(position.avgCost||1),0);
}
export function seedInitialC1StrategyCash(portfolio,balance){
  if(!Number.isFinite(balance)||balance<0||Math.abs(balance*100-Math.round(balance*100))>1e-7)throw new Error('Enter initial C1 strategy cash with cents precision.');
  const existing=portfolio.find(position=>position.role==='Swing'&&isPortfolioCash(position));
  return [...portfolio.filter(position=>position.role!=='Swing'||!isPortfolioCash(position)),{...existing,symbol:existing?.symbol||'CASH',shares:balance,avgCost:1,role:'Swing'}];
}

// C1 owns only the Swing securities. Keep every Core row, including cash,
// intact. After a recorded C1 fill, only explicit brokerage metadata can update
// an existing legacy Swing cash row; old accounts keep their cash entry intact.
export function mergeC1AccountPortfolio(portfolio,decision){
  return [...portfolio.filter(p=>p.role==='Core'),
    ...decision.positions.map(p=>({symbol:p.symbol,shares:p.shares,avgCost:p.avgCost,openedAt:p.openedAt,role:'Swing',...(p.entryContext?{entryContext:p.entryContext}:{})})),
    ...portfolio.filter(p=>p.role==='Swing'&&isPortfolioCash(p)).map((cash,index)=>
      index===0&&Number.isFinite(decision.brokerageCash)?{...cash,shares:decision.brokerageCash,avgCost:1}:cash)];
}


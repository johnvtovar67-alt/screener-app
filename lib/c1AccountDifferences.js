// Read-only comparison using the same account matching tolerances as the client gate.
export function c1AccountDifferences(decision,portfolio){
 if(!decision||!Array.isArray(portfolio))return [];
 const cashSymbols=new Set(['CASH','SWVXX','VMFXX','SPAXX','FDRXX','MMF']);
 const held=portfolio.filter(p=>p.role==='Swing'&&!cashSymbols.has(p.symbol)&&Number(p.shares)>0),issues=[];
 for(const symbol of new Set([...held.map(p=>p.symbol),...decision.positions.map(p=>p.symbol)])){
  const entered=held.filter(p=>p.symbol===symbol),recorded=decision.positions.filter(p=>p.symbol===symbol);
  if(entered.length!==1||recorded.length!==1){issues.push({symbol,field:'Holding rows',entered:entered.length,recorded:recorded.length});continue;}
  const p=entered[0],r=recorded[0];
  for(const [field,key,tolerance] of [['Shares','shares',1e-7],['Average cost','avgCost',.02]]){
   if(!Number.isFinite(Number(p[key]))||Math.abs(Number(p[key])-r[key])>tolerance)issues.push({symbol,field,entered:p[key],recorded:r[key]});
  }
  const date=String(p.openedAt||'').slice(0,10);
  if(date!==r.openedAt)issues.push({symbol,field:'First purchase date',entered:date||'Missing',recorded:r.openedAt,dateOnly:true});
 }
 const cash=portfolio.filter(p=>p.role==='Swing'&&cashSymbols.has(p.symbol)).reduce((sum,p)=>sum+Number(p.shares)*Number(p.avgCost||1),0);
 if(!Number.isFinite(cash)||Math.abs(cash-decision.actualCash)>=.005)issues.push({symbol:'CASH',field:'Cash balance',entered:cash,recorded:decision.actualCash});
 return issues;
}

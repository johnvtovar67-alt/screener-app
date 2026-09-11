// Supplemental observations belong to the private account, never the index.
// They can fill an absent price for an existing constituent, not add members,
// replace accepted prices, or supply missing strategy signals.
export function c1AccountBook(book, coverage) {
 if(!coverage)return book;
 const baseline=book.model.sessions.find(s=>s.date===coverage.sourceSessionDate);
 if(coverage.contract!=='c1-held-price-coverage-v1'||!baseline||!Array.isArray(coverage.rows)||!coverage.rows.length)throw new Error('Invalid supplemental account input');
 const seen=new Set(),prices=[...baseline.prices];
 for(const row of coverage.rows){
  const p=row.price;
  if(seen.has(row.symbol)||row.status!=='verified'||row.date!==baseline.date||p?.symbol!==row.symbol||p.date!==baseline.date||p.adjusted!==true||
   !['open','high','low','close'].every(k=>Number.isFinite(p[k])&&p[k]>0)||p.low>Math.min(p.open,p.close)||p.high<Math.max(p.open,p.close)||
   row.source?.provider!=='FMP'||row.source.endpoint!=='historical-price-eod/dividend-adjusted'||!Number.isFinite(Date.parse(row.source.observedAt)))throw new Error('Invalid verified holding observation');
  if(!baseline.universeSymbols.includes(row.symbol))throw new Error('Holding outside the dated C1 universe: '+row.symbol+'. A price alone does not establish C1 signal coverage.');
  if(![...(baseline.positionSignals||[]),...(baseline.signals||[])].some(s=>s.symbol===row.symbol))throw new Error('C1 holding signal unavailable: '+row.symbol);
  if(prices.some(p=>p.symbol===row.symbol))throw new Error('Supplemental observation cannot replace an accepted price: '+row.symbol);
  seen.add(row.symbol);prices.push({...p});
 }
 return {...book,model:{...book.model,sessions:book.model.sessions.map(s=>s===baseline?{...s,prices}:s)}};
}

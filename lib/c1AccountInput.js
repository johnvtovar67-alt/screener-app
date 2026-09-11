// Supplemental observations belong to the private account, never the index.
// They fill absent holding prices without adding index members or replacing
// accepted prices. Nonmembers get classification for risk, never rank signals.
export function c1AccountBook(book, coverage) {
 if(!coverage)return book;
 if(Array.isArray(coverage))return coverage.reduce((current,item)=>c1AccountBook(current,item),book);
 const baseline=book.model.sessions.find(s=>s.date===coverage.sourceSessionDate);
 if(coverage.contract!=='c1-held-price-coverage-v1'||!baseline||!Array.isArray(coverage.rows)||!coverage.rows.length)throw new Error('Invalid supplemental account input');
 const seen=new Set(),prices=[...baseline.prices],legacyHoldingSignals=[...(baseline.legacyHoldingSignals||[])];
 for(const row of coverage.rows){
  const p=row.price;
  if(seen.has(row.symbol)||row.status!=='verified'||row.date!==baseline.date||p?.symbol!==row.symbol||p.date!==baseline.date||p.adjusted!==true||
   !['open','high','low','close'].every(k=>Number.isFinite(p[k])&&p[k]>0)||p.low>Math.min(p.open,p.close)||p.high<Math.max(p.open,p.close)||
   row.source?.provider!=='FMP'||row.source.endpoint!=='historical-price-eod/dividend-adjusted'||!Number.isFinite(Date.parse(row.source.observedAt)))throw new Error('Invalid verified holding observation');
  if(!baseline.universeSymbols.includes(row.symbol)){
   const c=row.classification;
   if(c?.symbol!==row.symbol||c.provider!=='FMP'||c.endpoint!=='profile'||typeof c.sector!=='string'||!c.sector.trim()||typeof c.issuer!=='string'||!c.issuer||!Number.isFinite(Date.parse(c.observedAt)))throw new Error('Verified inherited holding classification required: '+row.symbol);
   const previous=book.model.sessions.flatMap(s=>s.legacyHoldingSignals||[]).find(s=>s.symbol===row.symbol);
   if(previous&&(previous.sector!==c.sector||previous.issuer!==c.issuer))throw new Error('Inherited holding classification changed: '+row.symbol);
   legacyHoldingSignals.push({symbol:row.symbol,sector:c.sector,issuer:c.issuer,inheritedRiskOnly:true});
  }else if(![...(baseline.positionSignals||[]),...(baseline.signals||[])].some(s=>s.symbol===row.symbol))throw new Error('C1 holding signal unavailable: '+row.symbol);
  if(prices.some(p=>p.symbol===row.symbol))throw new Error('Supplemental observation cannot replace an accepted price: '+row.symbol);
  seen.add(row.symbol);prices.push({...p});
 }
 return {...book,model:{...book.model,sessions:book.model.sessions.map(s=>s===baseline?{...s,prices,legacyHoldingSignals}:s)}};
}

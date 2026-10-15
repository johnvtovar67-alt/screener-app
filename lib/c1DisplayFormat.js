// Presentation only. Sector names never feed ranking, sizing, or account gates.
const sectors={
 technology:'Technology','information technology':'Technology',
 financial:'Financials',financials:'Financials','financial services':'Financials',
 healthcare:'Healthcare','health care':'Healthcare',
 'consumer cyclical':'Consumer Discretionary','consumer discretionary':'Consumer Discretionary',
 'consumer defensive':'Consumer Staples','consumer staples':'Consumer Staples',
 'basic materials':'Materials',materials:'Materials',
 'communication services':'Communication Services','communications services':'Communication Services',
 energy:'Energy',industrials:'Industrials',industrial:'Industrials',utilities:'Utilities','real estate':'Real Estate'
};

export function c1DisplaySector(...sources){
 for(const source of sources){
  const values=typeof source==='string'?[source]:[source?.sector,source?.sectorName,source?.entryEvidence?.sector,source?.profile?.sector,source?.classification?.sector];
  for(const value of values){
   if(typeof value!=='string')continue;
   const key=value.trim().replace(/\s+/g,' ').toLowerCase();
   if(Object.hasOwn(sectors,key))return sectors[key];
  }
 }
 return 'Sector unavailable';
}

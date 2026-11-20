// Presentation metadata only. C1 selection, exposure and financial records
// never consume this module. Profiles checked on 2026-11-20:
// MTD: https://www.fidelity.co.uk/factsheet-data/factsheet/US5926881054-mettler-toledo-international-inc/profile
// MSTR sector: https://www.sec.gov/Archives/edgar/data/1928561/000121390026050473/ea0287769-11_497k.htm
// MSTR theme: https://www.strategy.com/investor-relations
const DISPLAY_PROFILES={
  MTD:{sector:'Healthcare'},
  MSTR:{sector:'Technology',theme:'Bitcoin / Digital Assets'},
};
const symbolOf=row=>String(row?.symbol??row?.ticker??'').trim().toUpperCase();
const sectorOf=value=>typeof value==='string'&&value.trim()&&!/^(other|unknown|unclassified|unavailable|sector unavailable|n\/?a|none|null|undefined|[—-])$/i.test(value.trim())?value.trim():null;

export function portfolioSectorLabel({stock={},decision,position,openingPlan}={}){
  const symbol=symbolOf(stock);
  const candidate=decision?.sourceSessionDate&&decision.stockScreen?.sourceSessionDate===decision.sourceSessionDate?
    decision.stockScreen.candidates?.find(row=>symbolOf(row)===symbol):null;
  const exposure=decision?.sourceSessionDate&&openingPlan?.providerVerified===true&&openingPlan.sourceSessionDate===decision.sourceSessionDate?
    openingPlan.accountExposure?.holdings?.find(row=>symbolOf(row)===symbol):null;
  // Normalize each source before falling back: a literal "Other" must not
  // hide a known held/profile sector. A Core holding needs no Swing decision.
  const sector=[candidate?.sector,position?.entryContext?.sector,exposure?.sector,stock.sector]
    .map(sectorOf).find(Boolean)||DISPLAY_PROFILES[symbol]?.sector||'Sector unavailable';
  const theme=DISPLAY_PROFILES[symbol]?.theme;
  return theme?`${sector} · Theme: ${theme}`:sector;
}

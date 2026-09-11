// Shared by all page views. A stored selection is not capital authority.
export function c1Presentation(stock = {}) {
  const p=stock.productionPolicy;
  if(!String(p?.id||'').startsWith('c1-'))return null;
  const fresh=!stock.clientSnapshotFallback&&!stock.dataFeedSnapshotStale;
  const full=fresh&&p.status==='ready'&&p.independentlyValidated===true&&p.activationAuthorized===true&&p.selected===true;
  const d=stock.finalDecision||{};
  const pilot=fresh&&p.status==='limited-pilot'&&p.pilot===true&&
    Number.isInteger(p.pilotRank)&&p.pilotRank>=1&&p.pilotRank<=3&&
    d.source==='independent-limited-pilot'&&d.capitalConfirmed===true;
  const target=p.targetWeightPct;
  const validTarget=typeof target==='number'&&Number.isFinite(target)&&target>0&&target<=(pilot?1:100/3);
  const authorized=(full||pilot)&&validTarget;
  return {authorized,pilot:authorized&&pilot,targetWeightPct:authorized?target:0,
    entryLabel:authorized?(pilot?'Pilot — two-session confirmation required':'C1 Entry Cleared'):'C1 entry not authorized',
    reason:'C1 entry authority is unavailable or unvalidated. Refreshing prices alone does not authorize a purchase.'};
}
export function c1DisplayDecision(stock,decision) {
  const authority=c1Presentation(stock);
  if(!authority||authority.authorized||!['Strong Buy','Buy','Add'].includes(decision?.action))return decision;
  return {...decision,action:'Watch',timing:'Wait',size:'None',priority:'Not authorized',
    reason:authority.reason,planText:'No C1 purchase is authorized.',capitalConfirmed:false};
}

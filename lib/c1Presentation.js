// Shared by all page views. A stored selection is not capital authority.
export function c1Presentation(stock = {}) {
  const p=stock.productionPolicy;
  if(!String(p?.id||'').startsWith('c1-'))return null;
  const fresh=!stock.clientSnapshotFallback&&!stock.dataFeedSnapshotStale;
  const full=fresh&&p.status==='ready'&&p.independentlyValidated===true&&p.activationAuthorized===true&&p.selected===true;
  const target=p.targetWeightPct;
  const validTarget=typeof target==='number'&&Number.isFinite(target)&&target>0&&target<=100/3;
  // The owner reversed this overlay. Cached broad-screen policy must never
  // reinstate it in Single, Themes or an account-load failure.
  const superseded=p.status==='limited-pilot'||p.pilot===true;
  const authorized=full&&!superseded&&validTarget;
  return {authorized,pilot:false,superseded,targetWeightPct:authorized?target:0,
    entryLabel:authorized?'C1 Entry Cleared':'See C1 Opportunities',
    reason:'Use Opportunities for current C1 ratings and My Portfolio for account actions.'};
}
export function c1DisplayDecision(stock,decision) {
  const authority=c1Presentation(stock);
  if(authority?.superseded&&['independent-limited-pilot','c1-production-snapshot-pause'].includes(stock.finalDecision?.source))return {action:'Review',timing:'See Opportunities',size:'—',priority:'Stock analysis',reason:stock.recommendation?.expertDecision?.reason||stock.expertDecision?.reason||authority.reason,planText:authority.reason,nextTrigger:authority.reason,capitalConfirmed:false};
  if(!authority||authority.authorized||!['Strong Buy','Buy','Add'].includes(decision?.action))return decision;
  return {...decision,action:'Watch',timing:'Wait',size:'None',priority:'Not authorized',
    reason:authority.reason,planText:'No C1 purchase is authorized.',capitalConfirmed:false};
}

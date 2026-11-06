// Explain only failures from the existing completed-session momentum gate.
const reasons = new Map([
  ['Six accepted completed sessions and a valid symbol are required.','HISTORY_SHORT'],
  ['The six-session close history has a duplicate, missing, or invalid market session.','SESSION_SEQUENCE'],
  ['A valid accepted market-session date is required.','SESSION_DATE'],
  ['The accepted session is flagged stale.','SESSION_STALE'],
  ['Explicit session availability is invalid or later than its accepted decision boundary.','SESSION_AVAILABILITY'],
  ['The adjusted close is missing, stale, invalid, or dated to a different session.','CLOSE_INVALID'],
  ['Explicit price availability is invalid or later than its accepted decision boundary.','CLOSE_AVAILABILITY'],
  ['The accepted timing source contains duplicate symbol rows.','TIMING_DUPLICATE'],
  ['Explicit signal or timing availability is invalid or later than the accepted decision boundary.','TIMING_AVAILABILITY'],
  ['Recent price returns are not finite.','RETURNS_INVALID']
]);
const labels = {
  HISTORY_SHORT:'Six accepted trading sessions are required', SESSION_SEQUENCE:'The six accepted trading dates are not consecutive',
  SESSION_DATE:'The trading date is invalid', SESSION_STALE:'The session was marked stale',
  SESSION_AVAILABILITY:'The session was not available by its decision time', CLOSE_MISSING:'The accepted closing price is missing',
  CLOSE_DUPLICATE:'There are duplicate accepted closing prices', CLOSE_INVALID:'The adjusted closing price is invalid, stale or dated incorrectly',
  CLOSE_AVAILABILITY:'The closing price was not available by the decision time', TIMING_DUPLICATE:'There are duplicate timing records',
  TIMING_AVAILABILITY:'The timing record was not available by the decision time', TIMING_MISSING:'The timing record is missing or unavailable',
  MACD_MISSING:'The accepted timing record has no verified MACD direction', TIMING_DATE:'The timing record is dated to a different session',
  TIMING_SYMBOL:'The timing record belongs to another symbol', TIMING_INVALID:'The accepted timing record is stale or misaligned',
  RETURNS_INVALID:'The calculated returns are invalid', SOURCE_MISMATCH:'A matching completed-session momentum review is missing',
  INPUT_UNVERIFIED:'An accepted momentum input is unverified'
};
const iso = value => typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const symbolOf = row => String(row?.symbol || row?.ticker || '').trim().toUpperCase();
export function c1MarketMomentumIssues(gate, sessions, signal, date) {
  if (gate.available) return [];
  const issues = new Map();
  for (const limitation of gate.limitations || []) {
    const match = /^(\d{4}-\d{2}-\d{2}): (.+)$/.exec(limitation);
    const day = match?.[1] || date, message = match?.[2] || limitation;
    let code = reasons.get(message) || 'INPUT_UNVERIFIED';
    if (message==='Exactly one accepted price bar for the symbol is required.') {
      const rows=sessions.find(session=>session.date===day)?.prices || [];
      code=rows.some(row=>symbolOf(row)===symbolOf(signal))?'CLOSE_DUPLICATE':'CLOSE_MISSING';
    } else if (message==='Canonical same-session MACD direction is unavailable, stale, or misaligned.') {
      const timing=signal.entryTiming;
      if (!timing || timing.available!==true) code='TIMING_MISSING';
      else if (timing.asOf!=null && timing.asOf!==date) code='TIMING_DATE';
      else if (timing.symbol!=null && String(timing.symbol).trim().toUpperCase()!==symbolOf(signal)) code='TIMING_SYMBOL';
      else if (typeof timing.macdImproving!=='boolean') code='MACD_MISSING';
      else code='TIMING_INVALID';
    }
    if (iso(day)) issues.set(day+code,{date:day,code});
  }
  return [...issues.values()];
}

export function c1MissingMomentumText(candidate, date) {
  const gate=candidate.recentMomentumGate;
  if (!gate || gate.sourceSessionDate!==date) return labels.SOURCE_MISMATCH+' for '+date+'.';
  const grouped=new Map();
  for(const {date:day,code} of gate.missingInputs || []) {
    if(!iso(day)||!Object.hasOwn(labels,code))continue;
    if(!grouped.has(code))grouped.set(code,new Set());
    grouped.get(code).add(day);
  }
  const detail=[...grouped].map(([code,days])=>labels[code]+' for '+[...days].join(', ')+'.').join(' ');
  return (detail || 'Momentum inputs for '+date+' are unverified.')+' C1 rechecks when updated session evidence is accepted.';
}

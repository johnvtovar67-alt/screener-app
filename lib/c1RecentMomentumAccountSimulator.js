// Current owner-authorized manual account policy. Historical recorded economics
// remain authoritative; the new gate changes only the current recommendation
// and its explicit next-opening projection, never prior broker fills.
import {simulatePointInTimePortfolio as canonicalSimulator} from './c1AccountSimulator';
import {simulatePointInTimePortfolio as recentSimulator} from './c1RecentMomentumChallengerSimulator';
import {c1RecentMomentumLiveApplies} from './c1RecentMomentumLivePolicy';
import {isUsMarketSessionDay,marketSessionDistance} from './marketSession';

const validDay = date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0,10) === date && isUsMarketSessionDay(date);

export function simulatePointInTimePortfolio(dataset={},options={},openingAccount=null,actualExecutions=null) {
  const {recentMomentumSourceSessionDate,recentMomentumProjectionDate,...canonicalOptions}=options;
  const ownedSessions = Array.isArray(dataset.sessions) ? dataset.sessions : [];
  const sourceSessionDate = recentMomentumSourceSessionDate ?? ownedSessions.at(-1)?.date;
  if (!c1RecentMomentumLiveApplies(sourceSessionDate))
    return canonicalSimulator(dataset,canonicalOptions,openingAccount,actualExecutions);
  const projectionDate = recentMomentumProjectionDate ?? actualExecutions?.projectionDate ?? null;
  if (!validDay(sourceSessionDate) || !ownedSessions.some(session=>session.date===sourceSessionDate) ||
      projectionDate !== null && (!validDay(projectionDate) || marketSessionDistance(sourceSessionDate,projectionDate)!==1 ||
        ownedSessions.at(-1)?.date!==projectionDate) ||
      !projectionDate && ownedSessions.at(-1)?.date!==sourceSessionDate)
    throw new Error('Recent-momentum account policy requires its exact completed source and next-opening projection');
  const history = Array.isArray(dataset.recentMomentumHistorySessions) ? dataset.recentMomentumHistorySessions : ownedSessions;
  // Chronology is checked before a historical index supplies the six-close
  // window. Never sort or overwrite accepted account observations here.
  if (history.some((session,index)=>!validDay(session?.date) || index>0 && session.date<=history[index-1].date))
    throw new Error('Recent-momentum history requires unique chronological accepted sessions');
  const ownedByDate=new Map(ownedSessions.map(session=>[session.date,session]));
  // The account's validated session may contain supplemental held-price coverage
  // absent from the index book. It is authoritative for owned dates; preserve
  // earlier source history for the six-close momentum warmup without rewriting it.
  const reconciledHistory=history.map(session=>ownedByDate.get(session.date)||session);
  for (const session of ownedSessions.filter(session=>session.date<=sourceSessionDate)) {
    if (!history.some(row=>row.date===session.date))
      throw new Error('Recent-momentum history missing its accepted owned session');
  }
  return recentSimulator({...dataset,recentMomentumHistorySessions:reconciledHistory}, {...canonicalOptions,
    recentMomentumLivePolicy:{contract:'c1-recent-momentum-live-v1',sourceSessionDate,projectionDate}},openingAccount,actualExecutions);
}

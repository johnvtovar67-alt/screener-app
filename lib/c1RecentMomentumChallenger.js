// One isolated, offline Challenger. No application route imports this module.
import {simulatePointInTimePortfolio as championSimulator} from './c1AccountSimulator';
import {simulatePointInTimePortfolio as challengerSimulator} from './c1RecentMomentumChallengerSimulator';
import {C1_FROZEN_OPTIONS} from './c1FrozenOptions';
import {C1_ACCOUNTING_WEIGHTS} from './c1SleeveAccounting';
import {isUsMarketSessionDay} from './marketSession';

const clone = value => JSON.parse(JSON.stringify(value));
const ids = Object.keys(C1_ACCOUNTING_WEIGHTS);

function cashSeed(sleeve, date) {
  return {contract:'c1-prospective-account-seed-v1', sleeve, asOfSession:date,
    prospectiveAdoptionConfirmed:true, cash:100000, highWater:100000,
    remainingCooldownSessions:0, resumeAtNextOpen:false, positions:[]};
}

function combine(sleeves) {
  const reference = sleeves.base.curve;
  for (const id of ids) {
    if (sleeves[id].curve.length !== reference.length ||
        sleeves[id].curve.some((row, index) => row.date !== reference[index].date))
      throw new Error('Sleeve curves must use identical completed sessions');
  }
  const curve = reference.map((row, index) => ({date:row.date,
    equity:ids.reduce((sum,id)=>sum+C1_ACCOUNTING_WEIGHTS[id]*sleeves[id].curve[index].equity,0),
    cash:ids.reduce((sum,id)=>sum+C1_ACCOUNTING_WEIGHTS[id]*sleeves[id].curve[index].cash,0)}));
  let highWater = 100000, maxDrawdownPct = 0;
  for (const row of curve) {
    highWater = Math.max(highWater, row.equity);
    maxDrawdownPct = Math.min(maxDrawdownPct, (row.equity/highWater-1)*100);
  }
  const trades = ids.flatMap(sleeve => sleeves[sleeve].trades.map(trade => ({...trade, sleeve,
    portfolioModelShares:trade.shares*C1_ACCOUNTING_WEIGHTS[sleeve]})))
    .sort((a,b)=>a.date.localeCompare(b.date)||ids.indexOf(a.sleeve)-ids.indexOf(b.sleeve));
  return {sleeves, curve, trades,
    pendingDecisions:ids.flatMap(sleeve=>sleeves[sleeve].pendingDecisions.map(order=>({...order,sleeve}))),
    metrics:{endingEquity:curve.at(-1)?.equity??100000,
      totalReturnPct:((curve.at(-1)?.equity??100000)/100000-1)*100,
      maxDrawdownPct, transactionCount:trades.length},
    accounting:'Independent normalized $100,000 sleeve books combined at initial 25/50/25 weights; no inter-sleeve transfers or rebalancing. Model shares are not broker tickets.'};
}

// Inputs are existing local/accepted daily sessions. This is not an acquisition
// or archive-recovery entry point. Opening balances are simulation inputs only.
export function runC1RecentMomentumComparison({dataset, startDate, endDate, openingAccounts, completionRules={}}={}) {
  if (!dataset || !Array.isArray(dataset.sessions) || dataset.sessions.length<6)
    throw new Error('At least six existing dated sessions are required');
  const dates = dataset.sessions.map(session=>session?.date);
  if (dates.some((date,index)=>typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||
      !isUsMarketSessionDay(date)||(index>0&&date<=dates[index-1])))
    throw new Error('Existing sessions must have unique, chronological exchange dates');
  startDate = startDate??dates[5];
  endDate = endDate??dates.at(-1);
  if (!dates.includes(startDate)||!dates.includes(endDate)||endDate<startDate)
    throw new Error('Start and end must be existing completed sessions');
  if (openingAccounts && (Object.keys(openingAccounts).length!==ids.length || ids.some(id=>!openingAccounts[id])))
    throw new Error('Provide all three normalized opening sleeve accounts');
  if (!completionRules || typeof completionRules!=='object' ||
      Object.keys(completionRules).some(id=>!ids.includes(id)||!Array.isArray(completionRules[id])))
    throw new Error('Completion rules must be dated arrays keyed by C1 sleeve');
  const champion = {}, challenger = {};
  for (const sleeve of ids) {
    const seed = openingAccounts?.[sleeve]??cashSeed(sleeve,startDate);
    const options = {...clone(C1_FROZEN_OPTIONS[sleeve]), startDate, endDate,
      liquidateAtEnd:false, warmupSessions:6,
      ...(completionRules[sleeve]?{accountCompletionRules:clone(completionRules[sleeve])}:{})};
    // Both use actual-account mode so Champion includes the current authorized
    // early-rank and profit-rank overlays, not only the older frozen baseline.
    champion[sleeve] = championSimulator(clone(dataset), clone(options), clone(seed));
    challenger[sleeve] = challengerSimulator(clone(dataset), clone(options), clone(seed));
  }
  const championResult = combine(champion), challengerResult = combine(challenger);
  return {contract:'c1-recent-momentum-single-challenger-v1',
    scope:'offline-simulation-only', executable:false, startDate, endDate,
    champion:championResult, challenger:challengerResult,
    comparison:{returnDifferencePercentagePoints:challengerResult.metrics.totalReturnPct-championResult.metrics.totalReturnPct,
      endingEquityDifference:challengerResult.metrics.endingEquity-championResult.metrics.endingEquity,
      transactionCountDifference:challengerResult.metrics.transactionCount-championResult.metrics.transactionCount},
    limitations:['No performance validation or historical point-in-time data certification is implied.',
      'Each full portfolio path includes replacement holdings and recoveries; no avoided-loss-only return is reported.',
      'Synthetic checks establish decision mechanics, not investment superiority.']};
}

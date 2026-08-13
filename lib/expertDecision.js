// Expert decision layer shared by Opportunities and Portfolio Intelligence.
// Scores identify candidates; hard gates determine whether capital should be deployed.

const n = (v, fallback = 0) => {
  const x = Number(String(v ?? '').replace(/[%,$,]/g, ''));
  return Number.isFinite(x) ? x : fallback;
};
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const price = s => n(s?.price ?? s?.currentPrice ?? s?.lastPrice ?? s?.close);
const ma50 = s => n(s?.fiftyDayAverage ?? s?.priceAvg50 ?? s?.sma50 ?? s?.ma50);
const ma200 = s => n(s?.twoHundredDayAverage ?? s?.priceAvg200 ?? s?.sma200 ?? s?.ma200);
const volume = s => n(s?.volume);
const avgVolume = s => n(s?.avgVolume ?? s?.averageVolume ?? s?.avgVolume30Day);
const dayPct = s => n(s?.dayChangePct ?? s?.changesPercentage ?? s?.changePercentage, NaN);

export function expertGates(stock = {}, recommendation = {}) {
  const p = price(stock), m50 = ma50(stock), m200 = ma200(stock);
  const vs50 = p > 0 && m50 > 0 ? ((p - m50) / m50) * 100 : null;
  const rv = volume(stock) > 0 && avgVolume(stock) > 0 ? volume(stock) / avgVolume(stock) : null;
  const day = dayPct(stock);
  const momentum = n(recommendation.momentumScore ?? stock.momentumScore, 50);
  const technical = n(recommendation.technicalScore ?? stock.technicalScore, 50);
  const leadership = n(recommendation.leadershipScore ?? recommendation.relativeStrengthScore ?? stock.leadershipScore, 50);
  const entry = n(recommendation.entryQualityScore ?? stock.entryQualityScore, 50);
  const risk = n(recommendation.riskScore ?? stock.riskScore, 50);
  const extension = n(recommendation.extensionRisk ?? stock.extensionRisk, 50);
  const raw = n(recommendation.score ?? stock.score ?? stock.compositeScore, 50);
  const rr = n(recommendation?.riskPlan?.payoffRatio ?? stock?.riskPlan?.payoffRatio, 0);

  const below50 = m50 > 0 && p < m50;
  const below200 = m200 > 0 && p < m200;
  const weakReclaim = m50 > 0 && vs50 !== null && vs50 >= 0 && vs50 < 2 && ((!Number.isNaN(day) && day < 0) || momentum < 58);
  const trendPass = !below50 && !below200 && !weakReclaim;
  const volumePass = rv === null || rv >= 0.4;
  const participationPass = rv === null || rv >= 0.7 || (!Number.isNaN(day) && day > 0);
  const rrPass = rr === 0 || rr >= 1.75;
  const chase = extension >= 65 || (vs50 !== null && vs50 > 20) || (!Number.isNaN(day) && day > 8);
  const buyPass = trendPass && volumePass && participationPass && rrPass && !chase && technical >= 66 && leadership >= 68 && momentum >= 56 && entry >= 58 && risk <= 75 && raw >= 74;
  const starterPass = !below200 && !chase && volumePass && raw >= 64 && technical >= 52 && leadership >= 56 && entry >= 46 && risk <= 82;

  const failures = [];
  if (below200) failures.push('Below the 200-day trend.');
  else if (below50) failures.push('Below the 50-day trend; reclaim is not confirmed.');
  else if (weakReclaim) failures.push('Reclaim attempt is too early; require sustained confirmation above the 50-day line.');
  if (!volumePass) failures.push('Relative volume is too weak for a new position.');
  else if (!participationPass) failures.push('Price action lacks participation confirmation.');
  if (!rrPass) failures.push('Reward-to-risk is below the deployment standard.');
  if (chase) failures.push('Entry is extended/chase-prone.');
  if (leadership < 68) failures.push('Relative strength is below the Buy standard.');
  if (technical < 66) failures.push('Technical confirmation is below the Buy standard.');

  let action = 'Avoid';
  if (buyPass) action = 'Buy';
  else if (starterPass && trendPass && participationPass) action = 'Starter';
  else if (raw >= 52 || leadership >= 58 || technical >= 55) action = 'Watch';

  return {
    action, buyPass, starterPass, failures,
    expertOverride: raw >= 74 && action !== 'Buy',
    expertOverrideReason: raw >= 74 && action !== 'Buy' ? (failures[0] || 'A hard deployment gate blocks the raw Buy signal.') : '',
    trendStatus: trendPass ? 'Confirmed' : 'Not Confirmed',
    volumeStatus: participationPass ? 'Confirmed' : 'Not Confirmed',
    rewardRiskStatus: rrPass ? 'Pass' : 'Fail',
    capitalView: action === 'Buy' ? 'Deploy' : action === 'Starter' ? 'Probe' : action === 'Watch' ? 'Wait' : 'Redeploy Elsewhere',
    thesisScore: n(recommendation.businessQualityScore ?? recommendation.fundamentalScore ?? stock.fundamentalScore, raw),
    tradeSetupScore: Math.round(clamp(technical * .28 + momentum * .18 + leadership * .18 + entry * .20 + (100-risk) * .08 + (100-extension) * .08)),
    metrics: { vs50, relativeVolume: rv, rawScore: raw, technical, leadership, momentum, entry, risk, extension, payoffRatio: rr }
  };
}

export function applyExpertDecision(stock = {}, recommendation = {}) {
  const expert = expertGates(stock, recommendation);
  return {
    ...recommendation,
    label: expert.action,
    displayLabel: expert.action,
    recommendation: expert.action,
    tradeAction: expert.action,
    expertDecision: expert,
    expertOverride: expert.expertOverride,
    expertOverrideReason: expert.expertOverrideReason,
    thesisScore: expert.thesisScore,
    tradeSetupScore: expert.tradeSetupScore,
    capitalView: expert.capitalView,
  };
}

export function portfolioDecision({ stock = {}, recommendation = {}, position = {}, bestOpportunity = null } = {}) {
  const expert = expertGates(stock, recommendation);
  const role = String(position.role || stock.positionRole || 'Swing');
  const pnlPct = n(position.pnlPct ?? position.gainLossPct ?? stock.pnlPct, 0);
  const weightPct = n(position.weightPct ?? stock.weightPct, 0);
  const candidateScore = n(bestOpportunity?.tradeSetupScore ?? bestOpportunity?.score, 0);
  const currentScore = expert.tradeSetupScore;
  const replacementAdvantage = candidateScore > 0 ? candidateScore - currentScore : 0;
  const core = role.toLowerCase() === 'core';

  let action = 'Hold';
  if (core) {
    if (expert.action === 'Buy' && weightPct < 35) action = 'Add';
    else if (weightPct > 45) action = 'Trim';
    else action = 'Core Hold';
  } else if (expert.action === 'Buy' && weightPct < 15) action = 'Add';
  else if (weightPct > 18) action = 'Trim';
  else if (expert.action === 'Avoid' || (expert.action === 'Watch' && replacementAdvantage >= 18)) action = 'Exit';
  else if (expert.action === 'Watch' && pnlPct > 35 && expert.tradeSetupScore < 58) action = 'Trim';

  return {
    action, role, replacementAdvantage: Math.round(replacementAdvantage),
    capitalPriority: action === 'Add' ? 'Deploy' : action === 'Exit' ? 'Redeploy' : action === 'Trim' ? 'Reduce Risk' : 'Keep',
    expertDecision: expert,
    reason: action === 'Exit' && replacementAdvantage >= 18
      ? `Current setup is materially weaker than the best available opportunity (+${Math.round(replacementAdvantage)} replacement advantage).`
      : expert.failures[0] || (core ? 'Core role permits a longer holding period, but additions still require confirmation.' : 'Existing capital still earns its place at current setup quality.')
  };
}

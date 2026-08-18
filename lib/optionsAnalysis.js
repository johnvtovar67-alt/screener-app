// Phase 1 options-analysis policy.
// This module deliberately identifies structure candidates only.
// It must NOT produce an executable trade recommendation until quote quality,
// paired-leg economics, event risk, and portfolio context are all verified.

const n = (value, fallback = null) => {
  if (value === null || value === undefined || value === '') return fallback;
  const x = Number(value);
  return Number.isFinite(x) ? x : fallback;
};

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

export const OPTIONS_ANALYSIS_POLICY = Object.freeze({
  version: 'options_policy_v1_analysis_only',
  recommendationEnabled: false,
  maxRiskPerTrade: 2500,
  maxAggregateOpenRisk: 5000,
  shortPremium: Object.freeze({
    minDte: 21,
    maxDte: 60,
    minAbsDelta: 0.15,
    maxAbsDelta: 0.35,
    minOpenInterest: 100,
  }),
  execution: Object.freeze({
    requireBidAsk: true,
    requirePositiveBid: true,
  }),
});

export function calendarDte(expirationDate, now = new Date()) {
  if (!expirationDate) return null;
  const [y, m, d] = String(expirationDate).split('-').map(Number);
  if (![y, m, d].every(Number.isFinite)) return null;
  const expiryUtc = Date.UTC(y, m - 1, d);
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.ceil((expiryUtc - todayUtc) / 86400000);
}

function pass(label, ok, detail) {
  return { label, pass: Boolean(ok), detail };
}

function baseShortPremiumGates(contract = {}, policy = OPTIONS_ANALYSIS_POLICY, now = new Date()) {
  const dte = calendarDte(contract.expirationDate, now);
  const delta = n(contract.delta);
  const absDelta = delta === null ? null : Math.abs(delta);
  const oi = n(contract.openInterest);
  const iv = n(contract.impliedVolatility);
  const bid = n(contract.bid);
  const ask = n(contract.ask);

  const gates = [
    pass('DTE window', dte !== null && dte >= policy.shortPremium.minDte && dte <= policy.shortPremium.maxDte,
      dte === null ? 'Expiration unavailable' : `${dte} DTE; target ${policy.shortPremium.minDte}-${policy.shortPremium.maxDte}`),
    pass('Delta window', absDelta !== null && absDelta >= policy.shortPremium.minAbsDelta && absDelta <= policy.shortPremium.maxAbsDelta,
      absDelta === null ? 'Delta unavailable' : `|delta| ${absDelta.toFixed(3)}; target ${policy.shortPremium.minAbsDelta.toFixed(2)}-${policy.shortPremium.maxAbsDelta.toFixed(2)}`),
    pass('Open interest', oi !== null && oi >= policy.shortPremium.minOpenInterest,
      oi === null ? 'Open interest unavailable' : `${oi} OI; minimum ${policy.shortPremium.minOpenInterest}`),
    pass('IV data present', iv !== null && iv > 0,
      iv === null ? 'Implied volatility unavailable' : `IV ${(iv * 100).toFixed(1)}%; availability check only, not an IV-value judgment`),
    pass('Bid/ask available', bid !== null && ask !== null && bid > 0 && ask >= bid,
      bid === null || ask === null ? 'Execution quote unavailable on current data plan' : `Bid ${bid} / Ask ${ask}`),
  ];

  const structuralPass = gates.slice(0, 4).every(g => g.pass);
  const executionQuotePass = gates[4].pass;

  return { dte, absDelta, gates, structuralPass, executionQuotePass };
}

function blockersFrom(gates) {
  return gates.filter(g => !g.pass).map(g => `${g.label}: ${g.detail}`);
}

export function analyzeOptionContract(contract = {}, { policy = OPTIONS_ANALYSIS_POLICY, now = new Date() } = {}) {
  const type = String(contract.contractType || '').toLowerCase();
  const strike = n(contract.strike);
  const base = baseShortPremiumGates(contract, policy, now);
  const quoteBlocker = base.executionQuotePass ? [] : ['Execution pricing is unavailable; no options trade may be recommended.'];

  const cashRequired = type === 'put' && strike !== null ? strike * 100 : null;
  const cspExposurePass = cashRequired !== null && cashRequired <= policy.maxRiskPerTrade;
  const cspGates = [
    pass('Put contract', type === 'put', type === 'put' ? 'Put' : 'Not a put'),
    ...base.gates.slice(0, 4),
    pass('Initial exposure cap', cspExposurePass,
      cashRequired === null ? 'Cash-secured exposure cannot be calculated' : `${cashRequired.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} cash requirement vs ${policy.maxRiskPerTrade.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} initial cap`),
  ];
  const cspStructureCandidate = cspGates.every(g => g.pass);

  const putSpreadGates = [
    pass('Put contract', type === 'put', type === 'put' ? 'Put' : 'Not a put'),
    ...base.gates.slice(0, 4),
  ];
  const putSpreadShortLegCandidate = putSpreadGates.every(g => g.pass);

  const coveredCallGates = [
    pass('Call contract', type === 'call', type === 'call' ? 'Call' : 'Not a call'),
    ...base.gates.slice(0, 4),
  ];
  const coveredCallShortLegCandidate = coveredCallGates.every(g => g.pass);

  const collarLegCandidate = base.structuralPass && (type === 'put' || type === 'call');

  return {
    ticker: contract.ticker || null,
    contractType: type || null,
    expirationDate: contract.expirationDate || null,
    strike,
    dte: base.dte,
    absDelta: base.absDelta,
    data: {
      structuralPass: base.structuralPass,
      executionQuotePass: base.executionQuotePass,
      gates: base.gates,
    },
    strategies: {
      cashSecuredPut: {
        structureCandidate: cspStructureCandidate,
        executionReady: cspStructureCandidate && base.executionQuotePass,
        cashRequired,
        exposureCap: policy.maxRiskPerTrade,
        gates: cspGates,
        blockers: [...blockersFrom(cspGates), ...quoteBlocker],
      },
      putCreditSpreadShortLeg: {
        structureCandidate: putSpreadShortLegCandidate,
        executionReady: false,
        gates: putSpreadGates,
        blockers: [
          ...blockersFrom(putSpreadGates),
          ...quoteBlocker,
          'Paired long-put strike and net credit are required before max loss can be validated against the risk cap.',
        ],
      },
      coveredCallShortLeg: {
        structureCandidate: coveredCallShortLegCandidate,
        executionReady: false,
        gates: coveredCallGates,
        blockers: [
          ...blockersFrom(coveredCallGates),
          ...quoteBlocker,
          'Owned-share quantity and portfolio context must be verified before a covered call can be evaluated.',
        ],
      },
      collarLeg: {
        structureCandidate: collarLegCandidate,
        executionReady: false,
        blockers: [
          ...(collarLegCandidate ? [] : blockersFrom(base.gates.slice(0, 4))),
          ...quoteBlocker,
          'A collar requires owned-share context plus a matched call/put pair and net-cost analysis.',
        ],
      },
    },
    recommendation: {
      enabled: false,
      status: 'ANALYSIS ONLY',
      reason: 'Phase 1 intentionally prohibits executable options recommendations.',
    },
  };
}

export function summarizeOptionsAnalysis(rows = [], policy = OPTIONS_ANALYSIS_POLICY) {
  const count = fn => rows.filter(fn).length;
  return {
    policyVersion: policy.version,
    maxRiskPerTrade: policy.maxRiskPerTrade,
    maxAggregateOpenRisk: policy.maxAggregateOpenRisk,
    analyzedContracts: rows.length,
    structuralShortPremiumCandidates: count(x => x?.data?.structuralPass),
    cashSecuredPutStructureCandidates: count(x => x?.strategies?.cashSecuredPut?.structureCandidate),
    putCreditSpreadShortLegCandidates: count(x => x?.strategies?.putCreditSpreadShortLeg?.structureCandidate),
    coveredCallShortLegCandidates: count(x => x?.strategies?.coveredCallShortLeg?.structureCandidate),
    contractsWithExecutionQuotes: count(x => x?.data?.executionQuotePass),
    executionReadyRecommendations: 0,
    recommendationEnabled: false,
  };
}

// Phase 1 options-analysis policy.
// Phase 1 is intentionally limited to covered calls and cash-secured puts.
// The engine may identify structural candidates, but executable recommendations
// remain disabled until execution pricing and all authoritative context are verified.

const n = (value, fallback = null) => {
  if (value === null || value === undefined || value === '') return fallback;
  const x = Number(value);
  return Number.isFinite(x) ? x : fallback;
};

const normalizeAction = value => String(value || '').trim();
const money = value => n(value) === null
  ? 'Unavailable'
  : n(value).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export const OPTIONS_ANALYSIS_POLICY = Object.freeze({
  version: 'options_policy_v2_cc_csp_analysis_only',
  recommendationEnabled: false,
  maxRiskPerTrade: 2500,
  maxAggregateOpenRisk: 5000,
  maxCoveredCallContracts: 1,
  shortPremium: Object.freeze({
    minDte: 21,
    maxDte: 60,
    minOpenInterest: 100,
  }),
  cashSecuredPut: Object.freeze({
    minAbsDelta: 0.15,
    maxAbsDelta: 0.35,
    allowedStockActions: Object.freeze(['Strong Buy', 'Buy']),
  }),
  coveredCall: Object.freeze({
    minAbsDelta: 0.15,
    maxAbsDelta: 0.35,
    minimumOwnedShares: 100,
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

function blockersFrom(gates) {
  return gates.filter(g => !g.pass).map(g => `${g.label}: ${g.detail}`);
}

function eventGate(context = {}) {
  const block = context.eventBlockNewCapital;
  const manual = context.eventManualCheckRequired;
  const known = typeof block === 'boolean' && typeof manual === 'boolean';
  const ok = known && !block && !manual;
  const detail = !known
    ? 'Authoritative event-risk context unavailable'
    : ok
      ? (context.eventLabel ? `Clear: ${context.eventLabel}` : 'No event-risk block or manual check required')
      : `Blocked${block ? ' for new capital' : ''}${manual ? `${block ? ' and' : ''} pending manual event check` : ''}`;
  return pass('Event-risk gate', ok, detail);
}

function marketData(contract = {}, policy = OPTIONS_ANALYSIS_POLICY, now = new Date()) {
  const dte = calendarDte(contract.expirationDate, now);
  const oi = n(contract.openInterest);
  const iv = n(contract.impliedVolatility);
  const bid = n(contract.bid);
  const ask = n(contract.ask);
  const delta = n(contract.delta);
  const absDelta = delta === null ? null : Math.abs(delta);

  const commonGates = [
    pass('DTE window', dte !== null && dte >= policy.shortPremium.minDte && dte <= policy.shortPremium.maxDte,
      dte === null ? 'Expiration unavailable' : `${dte} DTE; target ${policy.shortPremium.minDte}-${policy.shortPremium.maxDte}`),
    pass('Open interest', oi !== null && oi >= policy.shortPremium.minOpenInterest,
      oi === null ? 'Open interest unavailable' : `${oi} OI; minimum ${policy.shortPremium.minOpenInterest}`),
    pass('IV data present', iv !== null && iv > 0,
      iv === null ? 'Implied volatility unavailable' : `IV ${(iv * 100).toFixed(1)}%; availability check only, not an IV-value judgment`),
  ];

  const executionQuoteGate = pass('Bid/ask available', bid !== null && ask !== null && bid > 0 && ask >= bid,
    bid === null || ask === null ? 'Execution quote unavailable on current data plan' : `Bid ${bid} / Ask ${ask}`);

  return { dte, absDelta, commonGates, executionQuoteGate, executionQuotePass: executionQuoteGate.pass };
}

function deltaGate(absDelta, min, max) {
  return pass('Delta window', absDelta !== null && absDelta >= min && absDelta <= max,
    absDelta === null ? 'Delta unavailable' : `|delta| ${absDelta.toFixed(3)}; target ${min.toFixed(2)}-${max.toFixed(2)}`);
}

function cspAuthorityGate(context = {}, policy = OPTIONS_ANALYSIS_POLICY) {
  const action = normalizeAction(context.stockAction);
  const ok = policy.cashSecuredPut.allowedStockActions.includes(action);
  return pass('Underlying stock authority', ok,
    action ? `${action}; CSP requires ${policy.cashSecuredPut.allowedStockActions.join(' or ')}` : 'Authoritative stock action unavailable');
}

function coveredCallAuthorityGate(context = {}) {
  const stockAction = normalizeAction(context.stockAction);
  const portfolioAction = normalizeAction(context.portfolioAction);
  // Phase 1 deliberately avoids capping Strong Buy / Buy upside. A covered call is
  // eligible only when the portfolio wants to Hold a Watch-quality name or Trim.
  const ok = portfolioAction === 'Trim' || (portfolioAction === 'Hold' && stockAction === 'Watch');
  const detail = !stockAction || !portfolioAction
    ? 'Authoritative stock and portfolio actions are both required'
    : ok
      ? `Stock ${stockAction}; portfolio ${portfolioAction}`
      : `Stock ${stockAction}; portfolio ${portfolioAction}. Phase 1 does not cap Buy/Strong Buy upside or use calls instead of an Exit.`;
  return pass('Covered-call authority', ok, detail);
}

export function analyzeOptionContract(contract = {}, {
  policy = OPTIONS_ANALYSIS_POLICY,
  now = new Date(),
  context = {},
} = {}) {
  const type = String(contract.contractType || '').toLowerCase();
  const strike = n(contract.strike);
  const market = marketData(contract, policy, now);
  const quoteBlocker = market.executionQuotePass ? [] : ['Execution pricing is unavailable; no options trade may be recommended.'];
  const evtGate = eventGate(context);

  const cashRequired = type === 'put' && strike !== null ? strike * 100 : null;
  const cspCapitalPass = cashRequired !== null && cashRequired <= policy.maxRiskPerTrade;
  const cashAvailable = n(context.cashAvailable);
  const cashKnown = cashAvailable !== null;
  const cspCashAvailablePass = cashKnown && cashRequired !== null && cashAvailable >= cashRequired;
  const cspGates = [
    pass('Put contract', type === 'put', type === 'put' ? 'Put' : 'Not a put'),
    ...market.commonGates,
    deltaGate(market.absDelta, policy.cashSecuredPut.minAbsDelta, policy.cashSecuredPut.maxAbsDelta),
    cspAuthorityGate(context, policy),
    evtGate,
    pass('Initial CSP capital cap', cspCapitalPass,
      cashRequired === null ? 'Cash-secured assignment capital cannot be calculated' : `${money(cashRequired)} assignment cash vs ${money(policy.maxRiskPerTrade)} Phase 1 cap`),
    pass('Cash available', cspCashAvailablePass,
      !cashKnown ? 'Portfolio cash context unavailable' : cashRequired === null ? 'Required cash unavailable' : `${money(cashAvailable)} available vs ${money(cashRequired)} required`),
  ];
  const cspStructureCandidate = cspGates.every(g => g.pass);

  const ownedShares = n(context.ownedShares, 0);
  const coveredContracts = ownedShares >= 100 ? Math.floor(ownedShares / 100) : 0;
  const ccSizePass = coveredContracts >= 1;
  const ccGates = [
    pass('Call contract', type === 'call', type === 'call' ? 'Call' : 'Not a call'),
    ...market.commonGates,
    deltaGate(market.absDelta, policy.coveredCall.minAbsDelta, policy.coveredCall.maxAbsDelta),
    pass('Owned shares', ccSizePass,
      `${ownedShares || 0} shares owned; minimum ${policy.coveredCall.minimumOwnedShares}`),
    coveredCallAuthorityGate(context),
    evtGate,
  ];
  const ccStructureCandidate = ccGates.every(g => g.pass);

  const relevantStructurePass = type === 'put' ? cspStructureCandidate : type === 'call' ? ccStructureCandidate : false;

  return {
    ticker: contract.ticker || null,
    contractType: type || null,
    expirationDate: contract.expirationDate || null,
    strike,
    dte: market.dte,
    absDelta: market.absDelta,
    data: {
      structuralPass: relevantStructurePass,
      executionQuotePass: market.executionQuotePass,
      gates: [...market.commonGates, market.executionQuoteGate],
    },
    context: {
      stockAction: normalizeAction(context.stockAction) || null,
      portfolioAction: normalizeAction(context.portfolioAction) || null,
      ownedShares,
      cashAvailable,
      eventBlockNewCapital: typeof context.eventBlockNewCapital === 'boolean' ? context.eventBlockNewCapital : null,
      eventManualCheckRequired: typeof context.eventManualCheckRequired === 'boolean' ? context.eventManualCheckRequired : null,
      eventLabel: context.eventLabel || null,
    },
    strategies: {
      cashSecuredPut: {
        structureCandidate: cspStructureCandidate,
        executionReady: false,
        cashRequired,
        capitalCap: policy.maxRiskPerTrade,
        gates: cspGates,
        blockers: [...blockersFrom(cspGates), ...quoteBlocker],
      },
      coveredCall: {
        structureCandidate: ccStructureCandidate,
        executionReady: false,
        ownedShares,
        coveredContractsAvailable: coveredContracts,
        phase1MaxContracts: policy.maxCoveredCallContracts,
        gates: ccGates,
        blockers: [...blockersFrom(ccGates), ...quoteBlocker],
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
    maxCoveredCallContracts: policy.maxCoveredCallContracts,
    analyzedContracts: rows.length,
    cashSecuredPutStructureCandidates: count(x => x?.strategies?.cashSecuredPut?.structureCandidate),
    coveredCallStructureCandidates: count(x => x?.strategies?.coveredCall?.structureCandidate),
    contractsWithExecutionQuotes: count(x => x?.data?.executionQuotePass),
    executionReadyRecommendations: 0,
    recommendationEnabled: false,
  };
}

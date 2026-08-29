// Read-only Massive options-chain diagnostics + transparent Phase 1 analysis.
// Phase 1 covers covered calls, cash-secured puts, and defined-risk put credit spreads.
// Executable recommendations remain prohibited until quote quality and all
// authoritative stock, event-risk, and portfolio context are verified.

import { analyzeOptionContract, buildPutCreditSpreadCandidates, OPTIONS_ANALYSIS_POLICY, summarizeOptionsAnalysis } from '../../lib/optionsAnalysis';
import { fetchFmpQuote } from '../../lib/fmpQuotes';

const BASE_URL = 'https://api.massive.com/v3/snapshot/options';

const cleanSymbol = (value='') => String(value).trim().toUpperCase().replace(/[^A-Z.\-]/g, '');
const toFmpSymbol = value => String(value || '').replace('.', '-').toUpperCase().trim();
const num = value => {
  if (value === null || value === undefined || value === '') return null;
  const x = Number(value);
  return Number.isFinite(x) ? x : null;
};
const intInRange = (value, fallback, lo, hi) => {
  const x = Number(value);
  return Number.isFinite(x) ? Math.max(lo, Math.min(hi, Math.round(x))) : fallback;
};
const optionalBool = value => {
  if (value === true || value === 'true' || value === '1' || value === 1) return true;
  if (value === false || value === 'false' || value === '0' || value === 0) return false;
  return null;
};

function isoDatePlusDays(days, now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function fetchUnderlyingPrice(symbol) {
  try{const row=await fetchFmpQuote(toFmpSymbol(symbol)),price=num(row?.price??row?.currentPrice??row?.lastPrice);if(price!==null&&price>0)return{price,source:'FMP stable',status:row._fmpQuoteCache==='live'?'Fresh quote obtained':`Quote obtained (${row._fmpQuoteCache})`};return{price:null,source:null,status:'FMP quote missing price'};}catch(error){return{price:null,source:null,status:error?.message||'FMP quote request failed'};}
}

function strikeBandFor(type, underlyingPrice) {
  if (!(underlyingPrice > 0)) return null;
  if (type === 'put') return { min: underlyingPrice * 0.75, max: underlyingPrice * 1.03, rationale: '75%-103% of current underlying for CSP and put-credit-spread analysis' };
  if (type === 'call') return { min: underlyingPrice * 0.97, max: underlyingPrice * 1.30, rationale: '97%-130% of current underlying for covered-call analysis' };
  return { min: underlyingPrice * 0.75, max: underlyingPrice * 1.30, rationale: '75%-130% of current underlying for Phase 1 options analysis' };
}

function summarize(contract={}) {
  const d = contract.details || {};
  const q = contract.last_quote || {};
  const t = contract.last_trade || {};
  const g = contract.greeks || {};
  const day = contract.day || {};
  const bid = num(q.bid ?? q.bid_price);
  const ask = num(q.ask ?? q.ask_price);
  const midpoint = bid !== null && ask !== null ? (bid + ask) / 2 : null;
  const spread = bid !== null && ask !== null ? Math.max(0, ask - bid) : null;
  const spreadPct = midpoint && midpoint > 0 && spread !== null ? (spread / midpoint) * 100 : null;

  return {
    ticker: d.ticker || contract.ticker || null,
    contractType: d.contract_type || null,
    expirationDate: d.expiration_date || null,
    strike: num(d.strike_price),
    sharesPerContract: num(d.shares_per_contract),
    exerciseStyle: d.exercise_style || null,
    bid,
    ask,
    midpoint,
    spread,
    spreadPct,
    lastTradePrice: num(t.price),
    volume: num(day.volume),
    openInterest: num(contract.open_interest),
    impliedVolatility: num(contract.implied_volatility),
    delta: num(g.delta),
    gamma: num(g.gamma),
    theta: num(g.theta),
    vega: num(g.vega),
    breakEvenPrice: num(contract.break_even_price),
    underlyingPrice: num(contract.underlying_asset?.price),
    quoteTimestamp: q.last_updated || q.sip_timestamp || null,
    tradeTimestamp: t.sip_timestamp || t.participant_timestamp || null,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  const symbol = cleanSymbol(req.query.symbol);
  if (!symbol) return res.status(400).json({ error: 'Missing symbol. Example: /api/options?symbol=MU&type=put' });
  if (!process.env.MASSIVE_API_KEY) return res.status(500).json({ error: 'MASSIVE_API_KEY is not configured' });

  const now = new Date();
  const type = ['call','put'].includes(String(req.query.type || '').toLowerCase()) ? String(req.query.type).toLowerCase() : '';
  const requestedLimit = Math.min(250, Math.max(1, Number(req.query.limit) || 100));
  const minDte = intInRange(req.query.minDte, OPTIONS_ANALYSIS_POLICY.shortPremium.minDte, 0, 365);
  const maxDte = intInRange(req.query.maxDte, OPTIONS_ANALYSIS_POLICY.shortPremium.maxDte, minDte, 365);
  const analysisContext = {
    stockAction: String(req.query.stockAction || '').trim() || null,
    portfolioAction: String(req.query.portfolioAction || '').trim() || null,
    ownedShares: num(req.query.ownedShares),
    cashAvailable: num(req.query.cashAvailable),
    eventBlockNewCapital: optionalBool(req.query.eventBlockNewCapital),
    eventManualCheckRequired: optionalBool(req.query.eventManualCheckRequired),
    eventLabel: String(req.query.eventLabel || '').trim() || null,
  };

  const underlying = await fetchUnderlyingPrice(symbol);
  const strikeBand = strikeBandFor(type, underlying.price);
  const params = new URLSearchParams({
    apiKey: process.env.MASSIVE_API_KEY,
    limit: String(requestedLimit),
    sort: 'expiration_date',
    order: 'asc',
  });

  if (req.query.expiration) {
    params.set('expiration_date', String(req.query.expiration));
  } else {
    params.set('expiration_date.gte', isoDatePlusDays(minDte, now));
    params.set('expiration_date.lte', isoDatePlusDays(maxDte, now));
  }

  if (type) params.set('contract_type', type);
  if (strikeBand) {
    params.set('strike_price.gte', strikeBand.min.toFixed(4));
    params.set('strike_price.lte', strikeBand.max.toFixed(4));
  }

  const url = `${BASE_URL}/${encodeURIComponent(symbol)}?${params.toString()}`;

  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Massive options request failed',
        status: response.status,
        providerStatus: body?.status || null,
        message: body?.error || body?.message || null,
      });
    }

    const contracts = Array.isArray(body.results) ? body.results.map(summarize) : [];
    const analyzedContracts = contracts.map(contract => ({
      ...contract,
      analysis: analyzeOptionContract(contract, { now, context: analysisContext }),
    }));
    const analysisRows = analyzedContracts.map(x => x.analysis);
    const putCreditSpreads = (type === 'put' || !type)
      ? buildPutCreditSpreadCandidates(contracts, { now, context: analysisContext })
      : [];
    const withQuote = contracts.filter(x => x.bid !== null || x.ask !== null).length;
    const withGreeks = contracts.filter(x => x.delta !== null || x.gamma !== null || x.theta !== null || x.vega !== null).length;
    const withIV = contracts.filter(x => x.impliedVolatility !== null).length;
    const withOI = contracts.filter(x => x.openInterest !== null).length;
    const withVolume = contracts.filter(x => x.volume !== null).length;
    const massiveUnderlyingPrices = contracts.map(x => x.underlyingPrice).filter(x => x !== null);
    const effectiveUnderlyingPrice = underlying.price ?? (massiveUnderlyingPrices.length ? massiveUnderlyingPrices[0] : null);
    const structuralCandidates = analyzedContracts.filter(x => x.analysis?.data?.structuralPass);

    return res.status(200).json({
      mode: 'options_chain_analysis_v5_cc_csp_put_spread_context_gated',
      readOnly: true,
      recommendationEnabled: false,
      provider: 'Massive',
      phase1Strategies: ['Covered Call', 'Cash-Secured Put', 'Put Credit Spread'],
      deferredStrategies: ['Collar', 'Call Credit Spread'],
      symbol,
      fetchedAt: now.toISOString(),
      requestId: body.request_id || null,
      analysisWindow: req.query.expiration ? { expiration: String(req.query.expiration) } : { minDte, maxDte },
      context: analysisContext,
      contextNote: 'Phase 1 context is supplied by the app layer for analysis. Executable recommendations remain disabled until this context is server-verified.',
      underlying: {
        price: effectiveUnderlyingPrice,
        source: underlying.price !== null ? underlying.source : (massiveUnderlyingPrices.length ? 'Massive' : null),
        status: underlying.status,
      },
      strikeSampling: strikeBand ? {
        minStrike: Number(strikeBand.min.toFixed(2)),
        maxStrike: Number(strikeBand.max.toFixed(2)),
        rationale: strikeBand.rationale,
      } : {
        minStrike: null,
        maxStrike: null,
        rationale: 'Underlying price unavailable; strike sampling could not be price-anchored.',
      },
      policy: OPTIONS_ANALYSIS_POLICY,
      returnedContracts: contracts.length,
      requestedLimit,
      coverage: {
        quotes: withQuote,
        greeks: withGreeks,
        impliedVolatility: withIV,
        openInterest: withOI,
        volume: withVolume,
      },
      analysisSummary: {
        ...summarizeOptionsAnalysis(analysisRows),
        putCreditSpreadStructuralCandidates: putCreditSpreads.length,
      },
      structuralCandidates: structuralCandidates.map(x => ({
        ticker: x.ticker,
        contractType: x.contractType,
        expirationDate: x.expirationDate,
        strike: x.strike,
        dte: x.analysis?.dte ?? null,
        delta: x.delta,
        openInterest: x.openInterest,
        impliedVolatility: x.impliedVolatility,
        executionQuotePass: x.analysis?.data?.executionQuotePass ?? false,
        cashSecuredPutCandidate: x.analysis?.strategies?.cashSecuredPut?.structureCandidate ?? false,
        coveredCallCandidate: x.analysis?.strategies?.coveredCall?.structureCandidate ?? false,
      })),
      putCreditSpreads,
      underlyingPrice: effectiveUnderlyingPrice,
      hasMore: Boolean(body.next_url),
      contracts: analyzedContracts,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Options analysis failed', message: error?.message || String(error) });
  }
}

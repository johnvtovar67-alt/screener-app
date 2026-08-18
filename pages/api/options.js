// Read-only Massive options-chain diagnostics + transparent Phase 1 analysis.
// This endpoint can identify structure candidates, but executable recommendations
// remain prohibited until quote quality, paired-leg economics, event risk, and
// portfolio context are all verified.

import { analyzeOptionContract, OPTIONS_ANALYSIS_POLICY, summarizeOptionsAnalysis } from '../../lib/optionsAnalysis';

const BASE_URL = 'https://api.massive.com/v3/snapshot/options';

const cleanSymbol = (value='') => String(value).trim().toUpperCase().replace(/[^A-Z.\-]/g, '');
const num = value => {
  if (value === null || value === undefined || value === '') return null;
  const x = Number(value);
  return Number.isFinite(x) ? x : null;
};
const intInRange = (value, fallback, lo, hi) => {
  const x = Number(value);
  return Number.isFinite(x) ? Math.max(lo, Math.min(hi, Math.round(x))) : fallback;
};

function isoDatePlusDays(days, now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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

  const symbol = cleanSymbol(req.query.symbol);
  if (!symbol) return res.status(400).json({ error: 'Missing symbol. Example: /api/options?symbol=MU&type=put' });
  if (!process.env.MASSIVE_API_KEY) return res.status(500).json({ error: 'MASSIVE_API_KEY is not configured' });

  const now = new Date();
  const requestedLimit = Math.min(250, Math.max(1, Number(req.query.limit) || 100));
  const minDte = intInRange(req.query.minDte, OPTIONS_ANALYSIS_POLICY.shortPremium.minDte, 0, 365);
  const maxDte = intInRange(req.query.maxDte, OPTIONS_ANALYSIS_POLICY.shortPremium.maxDte, minDte, 365);
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

  if (req.query.type && ['call','put'].includes(String(req.query.type).toLowerCase())) {
    params.set('contract_type', String(req.query.type).toLowerCase());
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
      analysis: analyzeOptionContract(contract, { now }),
    }));
    const analysisRows = analyzedContracts.map(x => x.analysis);
    const withQuote = contracts.filter(x => x.bid !== null || x.ask !== null).length;
    const withGreeks = contracts.filter(x => x.delta !== null || x.gamma !== null || x.theta !== null || x.vega !== null).length;
    const withIV = contracts.filter(x => x.impliedVolatility !== null).length;
    const withOI = contracts.filter(x => x.openInterest !== null).length;
    const withVolume = contracts.filter(x => x.volume !== null).length;
    const underlyingPrices = contracts.map(x => x.underlyingPrice).filter(x => x !== null);

    return res.status(200).json({
      mode: 'options_chain_analysis_v2',
      readOnly: true,
      recommendationEnabled: false,
      provider: 'Massive',
      symbol,
      fetchedAt: now.toISOString(),
      requestId: body.request_id || null,
      analysisWindow: req.query.expiration ? { expiration: String(req.query.expiration) } : { minDte, maxDte },
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
      analysisSummary: summarizeOptionsAnalysis(analysisRows),
      underlyingPrice: underlyingPrices.length ? underlyingPrices[0] : null,
      hasMore: Boolean(body.next_url),
      contracts: analyzedContracts,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Options analysis failed', message: error?.message || String(error) });
  }
}

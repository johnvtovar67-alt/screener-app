import {
  calcQualityScore,
  calcAsymmetryScore,
  calcTriggerScore,
  getStage,
  getRecommendation,
  buildTechnicalSnapshot,
  buildFundamentalSnapshot,
} from "../../lib/scoring";

function normalizeSymbol(symbol) {
  return String(symbol || "").replace("-", ".").toUpperCase();
}

function toFmpSymbol(symbol) {
  return String(symbol || "").replace(".", "-").toUpperCase();
}

function average(values) {
  const clean = values.filter((x) => Number.isFinite(Number(x))).map(Number);
  if (!clean.length) return null;
  return clean.reduce((a, b) => a + b, 0) / clean.length;
}

function max(values) {
  const clean = values.filter((x) => Number.isFinite(Number(x))).map(Number);
  if (!clean.length) return null;
  return Math.max(...clean);
}

async function getQuote(symbol) {
  const apiKey = process.env.FMP_API_KEY;

  if (!apiKey) {
    throw new Error("Missing FMP_API_KEY in Vercel environment variables.");
  }

  const fmpSymbol = toFmpSymbol(symbol);

  const url = `https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(
    fmpSymbol
  )}&apikey=${apiKey}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("FMP quote lookup failed.");
  }

  const data = await response.json();
  const q = Array.isArray(data) ? data[0] : data;

  if (!q || !q.symbol) {
    throw new Error("Ticker not found.");
  }

  return {
    symbol: normalizeSymbol(q.symbol),
    name: q.name || q.symbol,
    price: q.price ?? null,
    dayChangePct:
      q.changesPercentage ?? q.changePercentage ?? q.changePercent ?? null,
    marketCap: q.marketCap ?? null,
    avgVolume: q.avgVolume ?? q.volume ?? null,
    volume: q.volume ?? null,
    priceAvg50: q.priceAvg50 ?? q.priceAvg50d ?? null,
    priceAvg200: q.priceAvg200 ?? q.priceAvg200d ?? null,
    yearHigh: q.yearHigh ?? q.yearHighPrice ?? null,
    yearLow: q.yearLow ?? q.yearLowPrice ?? null,
    eps: q.eps ?? null,
    pe: q.pe ?? q.peRatio ?? null,
  };
}

async function fetchHistory(symbol) {
  const apiKey = process.env.FMP_API_KEY;
  const fmpSymbol = toFmpSymbol(symbol);

  const url = `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${encodeURIComponent(
    fmpSymbol
  )}&apikey=${apiKey}`;

  try {
    const response = await fetch(url);
    if (!response.ok) return [];

    const data = await response.json();
    const raw = Array.isArray(data) ? data : data?.historical || [];

    return raw
      .map((x) => ({
        date: x.date,
        open: Number(x.open),
        high: Number(x.high),
        low: Number(x.low),
        close: Number(x.close),
        volume: Number(x.volume),
      }))
      .filter((x) => Number.isFinite(x.close))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  } catch {
    return [];
  }
}

function enrichWithHistory(row, history) {
  if (!history.length) return row;

  const price = Number(row.price);
  const closes = history.map((x) => x.close);
  const highs = history.map((x) => x.high);
  const volumes = history.map((x) => x.volume);

  const ma20 = average(closes.slice(0, 20));
  const ma50 = average(closes.slice(0, 50));
  const ma200 = average(closes.slice(0, 200));

  const prev20High = max(highs.slice(1, 21));
  const avgVol20 = average(volumes.slice(1, 21));

  const pct5 = closes[5] ? ((price - closes[5]) / closes[5]) * 100 : null;
  const pct20 = closes[20] ? ((price - closes[20]) / closes[20]) * 100 : null;
  const pct60 = closes[60] ? ((price - closes[60]) / closes[60]) * 100 : null;

  const relativeVolume =
    row.volume && avgVol20 && avgVol20 > 0 ? row.volume / avgVol20 : null;

  const breakout20 =
    price && prev20High && relativeVolume != null
      ? price >= prev20High && relativeVolume >= 1.05
      : false;

  const pullback50 =
    price && ma50
      ? price > ma50 && (price - ma50) / ma50 <= 0.06
      : false;

  return {
    ...row,
    ma20,
    ma50,
    ma200,
    priceAvg50: ma50 ?? row.priceAvg50,
    priceAvg200: ma200 ?? row.priceAvg200,
    pct5,
    pct20,
    pct60,
    relativeVolume,
    breakout20,
    pullback50,
    historicalBars: history.length,
  };
}

function buildEntryNote(row) {
  return (
    row.recommendation?.entryNote ||
    row.entryNote ||
    "Wait for stronger price and volume confirmation."
  );
}

export default async function handler(req, res) {
  try {
    const symbol = String(req.query.symbol || "").trim().toUpperCase();

    if (!symbol) {
      return res.status(400).json({ error: "Missing symbol." });
    }

    const quote = await getQuote(symbol);
    const history = await fetchHistory(symbol);
    const base = enrichWithHistory(quote, history);

    const qualityScore = calcQualityScore(base);
    const asymmetryScore = calcAsymmetryScore(base);
    const triggerScore = calcTriggerScore(base);

    const scoredRow = {
      ...base,
      qualityScore,
      asymmetryScore,
      triggerScore,
    };

    const recommendation = getRecommendation(scoredRow);

    res.status(200).json({
      ...scoredRow,
      stage: getStage(scoredRow),
      recommendation,
      entryNote: buildEntryNote({ ...scoredRow, recommendation }),
      technicalSnapshot: buildTechnicalSnapshot(scoredRow),
      fundamentalSnapshot: buildFundamentalSnapshot(scoredRow),
    });
  } catch (err) {
    console.error("lookup error:", err);
    res.status(500).json({
      error: err.message || "Lookup failed.",
    });
  }
}

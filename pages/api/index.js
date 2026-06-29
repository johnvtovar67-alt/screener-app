// pages/api/index.js
// Single-symbol checker. Uses the same lib/scoring.js analyzeStock engine as the broad screener.

import { analyzeStock } from "../../lib/scoring";

function normalizeSymbol(symbol) {
  return String(symbol || "").replace("-", ".").toUpperCase().trim();
}

function toFmpSymbol(symbol) {
  return String(symbol || "").replace(".", "-").toUpperCase().trim();
}

function toNumber(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "string") {
    const cleaned = value.replace("%", "").replace(/,/g, "").trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : fallback;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toPositiveNumber(value, fallback = null) {
  const n = toNumber(value, fallback);
  if (n === null || !Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`FMP request failed: ${response.status}${text ? ` - ${text}` : ""}`);
  }
  return response.json();
}

function normalizeDayChangePct(row = {}, price = null, previousClose = null, change = null) {
  const rawCandidates = [row.changesPercentage, row.changePercentage, row.changePercent, row.percentChange]
    .map((value) => toNumber(value, null))
    .filter((value) => value !== null);

  const raw = rawCandidates.length ? rawCandidates[0] : null;
  let computed = null;

  if (price !== null && previousClose !== null && previousClose > 0) {
    computed = ((price - previousClose) / previousClose) * 100;
  } else if (change !== null && previousClose !== null && previousClose > 0) {
    computed = (change / previousClose) * 100;
  }

  if (computed !== null && Number.isFinite(computed)) {
    // Prefer arithmetic from price/previousClose when a vendor field is obviously off.
    if (raw === null) return computed;
    if (Math.abs(raw) > 25 && Math.abs(computed) < 15) return computed;
    if (Math.abs(raw * 100 - computed) < Math.abs(raw - computed)) return raw * 100;
    return raw;
  }

  return raw;
}

function normalizeQuote(rawQuote = {}, requestedSymbol = "") {
  const symbol = normalizeSymbol(rawQuote.symbol || requestedSymbol);
  const price = toPositiveNumber(rawQuote.price);
  const previousClose = toPositiveNumber(rawQuote.previousClose);
  const change = toNumber(rawQuote.change);
  const dayChangePct = normalizeDayChangePct(rawQuote, price, previousClose, change);

  return {
    ...rawQuote,
    symbol,
    ticker: symbol,
    name: rawQuote.name || rawQuote.companyName || symbol,
    companyName: rawQuote.companyName || rawQuote.name || symbol,
    price,
    currentPrice: price,
    lastPrice: price,
    close: price,
    previousClose,
    change,
    dayChangePct,
    changesPercentage: dayChangePct,
    changePercent: dayChangePct,
    volume: toPositiveNumber(rawQuote.volume),
    avgVolume: toPositiveNumber(rawQuote.avgVolume ?? rawQuote.averageVolume ?? rawQuote.volume),
    marketCap: toPositiveNumber(rawQuote.marketCap),
    priceAvg50: toPositiveNumber(rawQuote.priceAvg50 ?? rawQuote.priceAvg50d ?? rawQuote.fiftyDayAverage),
    fiftyDayAverage: toPositiveNumber(rawQuote.priceAvg50 ?? rawQuote.priceAvg50d ?? rawQuote.fiftyDayAverage),
    priceAvg200: toPositiveNumber(rawQuote.priceAvg200 ?? rawQuote.priceAvg200d ?? rawQuote.twoHundredDayAverage),
    twoHundredDayAverage: toPositiveNumber(rawQuote.priceAvg200 ?? rawQuote.priceAvg200d ?? rawQuote.twoHundredDayAverage),
    yearHigh: toPositiveNumber(rawQuote.yearHigh ?? rawQuote.yearHighPrice),
    yearLow: toPositiveNumber(rawQuote.yearLow ?? rawQuote.yearLowPrice),
    eps: toNumber(rawQuote.eps),
    pe: toNumber(rawQuote.pe ?? rawQuote.peRatio),
    beta: toNumber(rawQuote.beta, null),
    exchange: rawQuote.exchange || rawQuote.exchangeShortName || "",
    timestamp: rawQuote.timestamp || null,
  };
}

async function fetchQuote(symbol) {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) throw new Error("Missing FMP_API_KEY in environment variables.");

  const clean = toFmpSymbol(symbol);
  const urls = [
    `https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(clean)}&apikey=${apiKey}`,
    `https://financialmodelingprep.com/api/v3/quote/${encodeURIComponent(clean)}?apikey=${apiKey}`,
  ];

  let lastError = null;

  for (const url of urls) {
    try {
      const data = await fetchJson(url);
      const quote = Array.isArray(data) ? data[0] : data;
      if (quote && (quote.symbol || quote.price)) {
        const normalized = normalizeQuote(quote, symbol);
        if (normalized.symbol && normalized.price !== null) return normalized;
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(lastError?.message || `No quote data returned for ${symbol}.`);
}

function attachMarketRelativeData(row, spyQuote, qqqQuote) {
  return {
    ...row,
    spyDayChangePct: spyQuote?.dayChangePct ?? null,
    qqqDayChangePct: qqqQuote?.dayChangePct ?? null,
  };
}

export default async function handler(req, res) {
  try {
    res.setHeader("Cache-Control", "no-store, max-age=0");

    const symbol = String(req.query.symbol || "").trim().toUpperCase();
    if (!symbol) return res.status(400).json({ error: "Missing symbol." });

    const [quote, spyQuote, qqqQuote] = await Promise.all([
      fetchQuote(symbol),
      fetchQuote("SPY").catch(() => null),
      fetchQuote("QQQ").catch(() => null),
    ]);

    const base = attachMarketRelativeData(quote, spyQuote, qqqQuote);
    const stock = analyzeStock(base);

    return res.status(200).json({
      stock,
      meta: {
        mode: "single_symbol_screener_v2_shared_engine",
        decisionSource: "lib/scoring.js analyzeStock",
        spyChange: spyQuote?.dayChangePct ?? null,
        qqqChange: qqqQuote?.dayChangePct ?? null,
      },
    });
  } catch (err) {
    console.error("api/index error:", err);
    return res.status(500).json({
      error: "Failed to analyze symbol.",
      detail: err.message || "Unknown error.",
    });
  }
}

// pages/api/index.js

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
  return n !== null && Number.isFinite(n) && n > 0 ? n : fallback;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`FMP request failed: ${response.status}${text ? ` - ${text}` : ""}`);
  }
  return response.json();
}

function normalizeQuote(rawQuote = {}, requestedSymbol = "") {
  const symbol = normalizeSymbol(rawQuote.symbol || requestedSymbol);
  const price = toPositiveNumber(rawQuote.price);
  const previousClose = toPositiveNumber(rawQuote.previousClose);
  const change = toNumber(rawQuote.change);

  let dayChangePct = toNumber(rawQuote.changesPercentage);
  if (dayChangePct === null) dayChangePct = toNumber(rawQuote.changePercentage);
  if (dayChangePct === null) dayChangePct = toNumber(rawQuote.changePercent);
  if (dayChangePct === null && price !== null && previousClose !== null) {
    dayChangePct = ((price - previousClose) / previousClose) * 100;
  }
  if (dayChangePct === null && change !== null && previousClose !== null) {
    dayChangePct = (change / previousClose) * 100;
  }

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
    avgVolume: toPositiveNumber(rawQuote.avgVolume ?? rawQuote.averageVolume),
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
    const symbol = normalizeSymbol(req.query.symbol);
    if (!symbol) return res.status(400).json({ error: "Missing symbol." });

    const [quote, spyQuote, qqqQuote] = await Promise.all([
      fetchQuote(symbol),
      fetchQuote("SPY").catch(() => null),
      fetchQuote("QQQ").catch(() => null),
    ]);

    const stock = analyzeStock(attachMarketRelativeData(quote, spyQuote, qqqQuote));

    return res.status(200).json({
      stock,
      meta: {
        mode: "single_symbol_quote_screen",
        model: "shared_analyzeStock_v1",
        allowedActions: ["Buy", "Starter", "Watch", "Avoid"],
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

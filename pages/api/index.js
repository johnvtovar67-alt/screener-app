// pages/api/index.js

import {
  calcFundamentalScore,
  calcTechnicalScore,
  calcMomentumScore,
  calcRelativeStrengthScore,
  calcAsymmetryScore,
  calcTriggerScore,
  compositeScore,
  getRecommendation,
  getStage,
  buildTechnicalSnapshot,
  buildFundamentalSnapshot,
} from "../../lib/scoring";
import { fetchEventRiskMap, applyEventRiskGate } from "../../lib/eventRisk";

const PRIMARY_THEME_BY_SYMBOL = {
  NVDA: "AI Compute & Platforms",
  AMD: "AI Compute & Platforms",
  AVGO: "AI Compute & Platforms",
  ARM: "AI Compute & Platforms",
  MU: "AI Compute & Platforms",
  SMCI: "AI Compute & Platforms",
  DELL: "AI Compute & Platforms",
  HPE: "AI Compute & Platforms",
  PLTR: "AI Compute & Platforms",
  ORCL: "AI Compute & Platforms",
  MSFT: "AI Compute & Platforms",
  GOOGL: "AI Compute & Platforms",
  GOOG: "AI Compute & Platforms",
  META: "AI Compute & Platforms",
  AMZN: "AI Compute & Platforms",
  AAPL: "AI Compute & Platforms",

  ANET: "AI Networking",
  CSCO: "AI Networking",
  NTAP: "AI Networking",
  JNPR: "AI Networking",
  FFIV: "AI Networking",
  CIEN: "AI Networking",
  MRVL: "AI Networking",
  COHR: "AI Networking",
  AAOI: "AI Networking",

  CRWD: "Cybersecurity",
  PANW: "Cybersecurity",
  NET: "Cybersecurity",
  ZS: "Cybersecurity",
  DDOG: "Cybersecurity",
  SNOW: "Cybersecurity",
  MDB: "Cybersecurity",

  ETN: "Power & Electrification",
  PWR: "Power & Electrification",
  VRT: "Power & Electrification",
  FIX: "Power & Electrification",
  EME: "Power & Electrification",
  GEV: "Power & Electrification",
  CEG: "Power & Electrification",
  VST: "Power & Electrification",
  NRG: "Power & Electrification",
  TLN: "Power & Electrification",

  EQIX: "Digital Infrastructure",
  DLR: "Digital Infrastructure",
  AMT: "Digital Infrastructure",
  CCI: "Digital Infrastructure",
  XYL: "Digital Infrastructure",
  WTS: "Digital Infrastructure",
  HUBB: "Digital Infrastructure",

  CCJ: "Nuclear / Baseload",
  UEC: "Nuclear / Baseload",
  UUUU: "Nuclear / Baseload",
  LEU: "Nuclear / Baseload",
  BWXT: "Nuclear / Baseload",
  SMR: "Nuclear / Baseload",
  OKLO: "Nuclear / Baseload",
  NNE: "Nuclear / Baseload",
  NXE: "Nuclear / Baseload",
  DNN: "Nuclear / Baseload",

  MSTR: "BTC / Digital Assets",
  MARA: "BTC / Digital Assets",
  RIOT: "BTC / Digital Assets",
  CLSK: "BTC / Digital Assets",
  IREN: "BTC / Digital Assets",
  WULF: "BTC / Digital Assets",
  HUT: "BTC / Digital Assets",
  BTDR: "BTC / Digital Assets",
  CIFR: "BTC / Digital Assets",
  BITF: "BTC / Digital Assets",
  COIN: "BTC / Digital Assets",
  HOOD: "BTC / Digital Assets",
  SQ: "BTC / Digital Assets",

  RKLB: "Space & Satellites",
  ASTS: "Space & Satellites",
  RDW: "Space & Satellites",
  BKSY: "Space & Satellites",
  IRDM: "Space & Satellites",

  RTX: "Defense & National Security",
  LHX: "Defense & National Security",
  NOC: "Defense & National Security",
  LMT: "Defense & National Security",
  HII: "Defense & National Security",
  GD: "Defense & National Security",
  KTOS: "Defense & National Security",
  AVAV: "Autonomy & Drones",
  ONDS: "Autonomy & Drones",

  ABB: "Robotics & Automation",
  ROK: "Robotics & Automation",
  TER: "Robotics & Automation",
  CGNX: "Robotics & Automation",
  SYM: "Robotics & Automation",
  ISRG: "Robotics & Automation",

  ADSK: "Industrial Software",
  PTC: "Industrial Software",
  SNPS: "Industrial Software",
  CDNS: "Industrial Software",

  IONQ: "Quantum Computing",
  RGTI: "Quantum Computing",
  QBTS: "Quantum Computing",
  QUBT: "Quantum Computing",
  ARQQ: "Quantum Computing",
  IBM: "Quantum Computing",
  HON: "Quantum Computing",

  MRNA: "Platform Biotech",
  RXRX: "Platform Biotech",
  SDGR: "Platform Biotech",
  CRSP: "Platform Biotech",
  BEAM: "Platform Biotech",
  IOVA: "Platform Biotech",
  VKTX: "Platform Biotech",
  ALMS: "Platform Biotech",
  HIMS: "Platform Biotech",
};

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

function normalizeDailyPct({ price, previousClose, change, rawPct }) {
  let pct = toNumber(rawPct);

  if (price != null && previousClose != null && previousClose > 0) {
    const recalculated = ((price - previousClose) / previousClose) * 100;

    // FMP sometimes mixes fractional and percent formats. If the provided value
    // implies an absurd daily move but the price/previous close do not, trust the
    // price math.
    if (pct === null || Math.abs(pct) > 25 || Math.abs(pct - recalculated) > 5) {
      pct = recalculated;
    }
  }

  if (pct === null && change != null && previousClose != null && previousClose > 0) {
    pct = (change / previousClose) * 100;
  }

  if (pct !== null && Math.abs(pct) <= 1 && Math.abs(change || 0) > 1) {
    return pct;
  }

  return pct;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`FMP request failed: ${response.status}${text ? ` - ${text}` : ""}`);
  }
  return response.json();
}

function normalizeActionLabel(value) {
  const label = String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

  if (["BUY", "BUY NOW", "BUY IMMEDIATELY", "STRONG BUY"].includes(label)) return "Buy";
  if (["STARTER", "STARTER ONLY", "STARTER BUY", "BREAKOUT", "BREAKOUT BUY"].includes(label)) return "Starter";
  if (["WATCH", "WATCH FOR ENTRY", "WATCH CLOSELY", "NEAR MISS", "SETUP", "SETUP ONLY"].includes(label)) return "Watch";
  return "Avoid";
}

function clampScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function getConvictionGrade(stock = {}) {
  const score = clampScore(stock.score ?? stock.compositeScore);
  const trigger = clampScore(stock.triggerScore);
  const momentum = clampScore(stock.momentumScore);
  const technical = clampScore(stock.technicalScore);
  const action = normalizeActionLabel(stock?.recommendation?.label ?? stock?.recommendation?.displayLabel ?? stock?.action);

  const conviction = score * 0.42 + trigger * 0.23 + momentum * 0.2 + technical * 0.15;

  if (action === "Buy" && conviction >= 86) return "A+";
  if (conviction >= 82) return "A";
  if (conviction >= 76) return "A-";
  if (conviction >= 70) return "B+";
  if (conviction >= 62) return "B";
  return "C";
}

function getCatalyst(stock = {}) {
  const trigger = clampScore(stock.triggerScore);
  const momentum = clampScore(stock.momentumScore);
  const technical = clampScore(stock.technicalScore);
  const fresh = clampScore(stock.freshBreakoutScore ?? stock.technicalSnapshot?.freshBreakoutScore);
  const change = toNumber(stock.dayChangePct ?? stock.changesPercentage, 0);

  if (fresh >= 78 && trigger >= 78) return "Breakout";
  if (trigger >= 76 && momentum >= 70) return "Reclaim";
  if (technical >= 76 && momentum >= 72) return "RS Leader";
  if (change < -1 && technical >= 65) return "Pullback";
  if (momentum >= 70) return "Trend";
  return "Setup";
}

function getDecisionClock(stock = {}) {
  const action = normalizeActionLabel(stock?.recommendation?.label ?? stock?.action);
  const trigger = clampScore(stock.triggerScore);
  const momentum = clampScore(stock.momentumScore);

  if (action === "Buy") return "Immediate";
  if (action === "Starter" && trigger >= 72 && momentum >= 62) return "This Week";
  if (action === "Starter") return "Next 2 Weeks";
  if (action === "Watch") return "Monitor";
  return "Avoid Until Improved";
}

function enrichStock(stock = {}) {
  const symbol = normalizeSymbol(stock.symbol);
  const theme = PRIMARY_THEME_BY_SYMBOL[symbol] || "Other";

  return {
    ...stock,
    symbol,
    ticker: symbol,
    primaryTheme: theme,
    theme,
    convictionGrade: getConvictionGrade(stock),
    catalyst: getCatalyst(stock),
    decisionClock: getDecisionClock(stock),
    riskPlan: stock.riskPlan ?? stock.recommendation?.riskPlan ?? null,
  };
}

function normalizeQuote(rawQuote = {}, requestedSymbol = "") {
  const symbol = normalizeSymbol(rawQuote.symbol || requestedSymbol);
  const price = toPositiveNumber(rawQuote.price);
  const previousClose = toPositiveNumber(rawQuote.previousClose);
  const change = toNumber(rawQuote.change);
  const rawPct =
    rawQuote.changesPercentage ??
    rawQuote.changePercentage ??
    rawQuote.changePercent ??
    rawQuote.dayChangePct;

  const dayChangePct = normalizeDailyPct({ price, previousClose, change, rawPct });

  return {
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
    avgVolume: toPositiveNumber(rawQuote.avgVolume ?? rawQuote.volume),
    marketCap: toPositiveNumber(rawQuote.marketCap),
    priceAvg50: toPositiveNumber(rawQuote.priceAvg50 ?? rawQuote.priceAvg50d),
    fiftyDayAverage: toPositiveNumber(rawQuote.priceAvg50 ?? rawQuote.fiftyDayAverage),
    priceAvg200: toPositiveNumber(rawQuote.priceAvg200 ?? rawQuote.priceAvg200d),
    twoHundredDayAverage: toPositiveNumber(rawQuote.priceAvg200 ?? rawQuote.twoHundredDayAverage),
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

function buildScoredResult(base) {
  const fundamentalScore = calcFundamentalScore(base);
  const technicalScore = calcTechnicalScore(base);
  const momentumScore = calcMomentumScore(base);
  const relativeStrengthScore = calcRelativeStrengthScore(base);
  const asymmetryScore = calcAsymmetryScore(base);
  const triggerScore = calcTriggerScore(base);
  const score = compositeScore(base);
  const recommendation = getRecommendation(base);
  const action = normalizeActionLabel(recommendation?.label ?? recommendation?.displayLabel ?? recommendation?.tradeAction);

  const result = {
    ...base,
    score,
    compositeScore: score,
    fundamentalScore,
    technicalScore,
    momentumScore,
    relativeStrengthScore,
    asymmetryScore,
    triggerScore,
    recommendation: {
      ...recommendation,
      label: action,
      displayLabel: action,
      recommendation: action,
      tradeAction: action,
      score,
      triggerScore,
      momentumScore,
    },
    action,
    riskPlan: recommendation?.riskPlan ?? null,
    stage: getStage(base),
    technicalSnapshot: buildTechnicalSnapshot(base),
    fundamentalSnapshot: buildFundamentalSnapshot(base),
  };

  return enrichStock(result);
}

export default async function handler(req, res) {
  try {
    res.setHeader("Cache-Control", "no-store, max-age=0");

    const symbol = String(req.query.symbol || "").trim().toUpperCase();

    if (!symbol) {
      return res.status(400).json({ error: "Missing symbol." });
    }

    const [quote, spyQuote, qqqQuote] = await Promise.all([
      fetchQuote(symbol),
      fetchQuote("SPY").catch(() => null),
      fetchQuote("QQQ").catch(() => null),
    ]);

    const base = attachMarketRelativeData(quote, spyQuote, qqqQuote);
    const scored = buildScoredResult(base);
    const eventRiskMap = await fetchEventRiskMap([symbol]);
    const result = applyEventRiskGate(scored, eventRiskMap.get(normalizeSymbol(symbol)));

    if (!result?.symbol || result.price === null || result.price === undefined) {
      throw new Error(`No usable quote data returned for ${symbol}.`);
    }

    return res.status(200).json({
      stock: result,
      meta: {
        mode: "single_symbol_shared_model",
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

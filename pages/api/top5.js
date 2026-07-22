// pages/api/top5.js

import {
  compositeScore,
  calcFundamentalScore,
  calcTechnicalScore,
  calcMomentumScore,
  calcRelativeStrengthScore,
  calcAsymmetryScore,
  calcTriggerScore,
  getRecommendation,
  getTradeReadiness,
  buildTechnicalSnapshot,
  buildFundamentalSnapshot,
} from "../../lib/scoring";
import { fetchEventRiskMap, applyEventRiskGate } from "../../lib/eventRisk";

function normalizeSymbol(symbol) {
  return String(symbol || "").replace("-", ".").toUpperCase().trim();
}

function toFmpSymbol(symbol) {
  return String(symbol || "").replace(".", "-").toUpperCase().trim();
}

function uniqueSymbols(symbols = []) {
  const seen = new Set();
  return symbols
    .map((symbol) => normalizeSymbol(symbol))
    .filter((symbol) => {
      if (!symbol) return false;
      if (seen.has(symbol)) return false;
      seen.add(symbol);
      return true;
    });
}

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
  NVT: "Digital Infrastructure",

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

const CORE_OPPORTUNITY_SYMBOLS = [
  "NVDA","AMD","AVGO","ARM","MU","SMCI","DELL","HPE","PLTR","ORCL","MSFT","GOOGL","GOOG","META","AMZN","AAPL",
  "ANET","CSCO","NTAP","JNPR","FFIV","CIEN","MRVL","COHR","AAOI",
  "CRWD","PANW","NET","ZS","DDOG","SNOW","MDB",
  "ETN","PWR","VRT","FIX","EME","GEV","CEG","VST","NRG","TLN",
  "EQIX","DLR","AMT","XYL","WTS","HUBB","NVT",
  "CCJ","UEC","UUUU","LEU","BWXT","SMR","OKLO","NNE","NXE","DNN",
  "MSTR","MARA","RIOT","CLSK","IREN","WULF","HUT","BTDR","CIFR","BITF","COIN","HOOD","SQ",
  "RKLB","ASTS","RDW","BKSY","IRDM","RTX","LHX","NOC","LMT","HII","GD","KTOS","AVAV","ONDS",
  "ABB","ROK","TER","CGNX","SYM","ISRG","ADSK","PTC","SNPS","CDNS",
  "IONQ","RGTI","QBTS","QUBT","ARQQ","IBM","HON",
  "MRNA","RXRX","SDGR","CRSP","BEAM","IOVA","VKTX","ALMS","HIMS"
];


const APPROVED_OPPORTUNITY_THEMES = new Set([
  "AI Compute & Platforms",
  "AI Networking",
  "Cybersecurity",
  "Power & Electrification",
  "Digital Infrastructure",
  "Nuclear / Baseload",
  "BTC / Digital Assets",
  "Space & Satellites",
  "Defense & National Security",
  "Autonomy & Drones",
  "Robotics & Automation",
  "Industrial Software",
  "Quantum Computing",
  "Platform Biotech",
]);

function isOpportunityThemeMode(themeKey) {
  const clean = String(themeKey || "opportunities").toLowerCase();
  return clean === "opportunities" || clean === "broad";
}

function isApprovedOpportunity(row = {}) {
  return APPROVED_OPPORTUNITY_THEMES.has(row.primaryTheme || row.theme || "");
}

const THEME_CONFIG = {
  opportunities: {
    name: "Best Opportunities",
    description: "Fresh-capital screen. Excludes generic financials and income vehicles.",
    symbols: CORE_OPPORTUNITY_SYMBOLS,
  },
  broad: {
    name: "Best Opportunities",
    description: "Fresh-capital screen. Excludes generic financials and income vehicles.",
    symbols: CORE_OPPORTUNITY_SYMBOLS,
  },
  ai_compute: {
    name: "AI Compute & Platforms",
    description: "Compute, accelerators, cloud platforms, and AI application platforms.",
    symbols: Object.entries(PRIMARY_THEME_BY_SYMBOL).filter(([, t]) => t === "AI Compute & Platforms").map(([s]) => s),
  },
  ai_networking: {
    name: "AI Networking",
    description: "Networking, optical, and data-movement beneficiaries of AI buildout.",
    symbols: Object.entries(PRIMARY_THEME_BY_SYMBOL).filter(([, t]) => t === "AI Networking").map(([s]) => s),
  },
  cybersecurity: {
    name: "Cybersecurity",
    description: "Security platforms, cloud security, observability, and data infrastructure.",
    symbols: Object.entries(PRIMARY_THEME_BY_SYMBOL).filter(([, t]) => t === "Cybersecurity").map(([s]) => s),
  },
  power: {
    name: "Power & Electrification",
    description: "Power, grid, electrification, and AI-load growth beneficiaries.",
    symbols: Object.entries(PRIMARY_THEME_BY_SYMBOL).filter(([, t]) => t === "Power & Electrification").map(([s]) => s),
  },
  digital_infra: {
    name: "Digital Infrastructure",
    description: "Data centers, towers, water, cooling, and physical digital infrastructure.",
    symbols: Object.entries(PRIMARY_THEME_BY_SYMBOL).filter(([, t]) => t === "Digital Infrastructure").map(([s]) => s),
  },
  nuclear: {
    name: "Nuclear / Baseload",
    description: "Uranium, nuclear services, advanced nuclear, and baseload power.",
    symbols: Object.entries(PRIMARY_THEME_BY_SYMBOL).filter(([, t]) => t === "Nuclear / Baseload").map(([s]) => s),
  },
  btc: {
    name: "BTC / Digital Assets",
    description: "Bitcoin proxies, miners, exchanges, and digital-asset infrastructure.",
    symbols: Object.entries(PRIMARY_THEME_BY_SYMBOL).filter(([, t]) => t === "BTC / Digital Assets").map(([s]) => s),
  },
  defense: {
    name: "Defense & National Security",
    description: "Prime defense, national security, missiles, sensors, and space-defense exposure.",
    symbols: Object.entries(PRIMARY_THEME_BY_SYMBOL).filter(([, t]) => t === "Defense & National Security").map(([s]) => s),
  },
  space: {
    name: "Space & Satellites",
    description: "Launch, satellites, communications, and commercial space infrastructure.",
    symbols: Object.entries(PRIMARY_THEME_BY_SYMBOL).filter(([, t]) => t === "Space & Satellites").map(([s]) => s),
  },
  drones: {
    name: "Autonomy & Drones",
    description: "Autonomy, drones, and defense robotics.",
    symbols: Object.entries(PRIMARY_THEME_BY_SYMBOL).filter(([, t]) => t === "Autonomy & Drones").map(([s]) => s),
  },
  robotics: {
    name: "Robotics & Automation",
    description: "Robotics, industrial automation, and automated manufacturing.",
    symbols: Object.entries(PRIMARY_THEME_BY_SYMBOL).filter(([, t]) => t === "Robotics & Automation").map(([s]) => s),
  },
  industrial_software: {
    name: "Industrial Software",
    description: "Engineering, EDA, simulation, and product-design software.",
    symbols: Object.entries(PRIMARY_THEME_BY_SYMBOL).filter(([, t]) => t === "Industrial Software").map(([s]) => s),
  },
  quantum: {
    name: "Quantum Computing",
    description: "Quantum computing and larger firms with credible quantum exposure.",
    symbols: Object.entries(PRIMARY_THEME_BY_SYMBOL).filter(([, t]) => t === "Quantum Computing").map(([s]) => s),
  },
  biotech: {
    name: "Platform Biotech",
    description: "Platform-oriented healthcare and biotech names, not broad binary biotech.",
    symbols: Object.entries(PRIMARY_THEME_BY_SYMBOL).filter(([, t]) => t === "Platform Biotech").map(([s]) => s),
  },
};

function getThemeConfig(themeKey) {
  const clean = String(themeKey || "opportunities").toLowerCase();
  return THEME_CONFIG[clean] || THEME_CONFIG.opportunities;
}

function toNumber(value, fallback = null) {
  if (value == null || value === "") return fallback;
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
  if (n == null || !Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function safeScore(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function clampScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeDailyPct({ price, previousClose, change, rawPct }) {
  let pct = toNumber(rawPct);

  if (price != null && previousClose != null && previousClose > 0) {
    const recalculated = ((price - previousClose) / previousClose) * 100;
    if (pct === null || Math.abs(pct) > 25 || Math.abs(pct - recalculated) > 5) {
      pct = recalculated;
    }
  }

  if (pct === null && change != null && previousClose != null && previousClose > 0) {
    pct = (change / previousClose) * 100;
  }

  return pct;
}

function normalizeActionLabel(value) {
  const label = String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

  if (["BUY", "BUY NOW", "BUY IMMEDIATELY", "STRONG BUY"].includes(label)) return "Buy";
  if (["STARTER", "STARTER ONLY", "STARTER BUY", "BREAKOUT", "BREAKOUT BUY", "BREAKOUT STARTER"].includes(label)) return "Starter";
  if (["WATCH", "WATCH FOR ENTRY", "WATCH CLOSELY", "NEAR MISS", "SETUP", "SETUP ONLY"].includes(label)) return "Watch";
  return "Avoid";
}

function getAction(stock = {}) {
  const rec = stock?.recommendation && typeof stock.recommendation === "object" ? stock.recommendation : {};
  return normalizeActionLabel(
    rec.displayLabel ??
      rec.label ??
      rec.recommendation ??
      rec.tradeAction ??
      stock.displayLabel ??
      stock.label ??
      stock.recommendation ??
      stock.tradeAction ??
      stock.action
  );
}

function actionRank(actionOrStock) {
  const action = typeof actionOrStock === "string" ? actionOrStock : getAction(actionOrStock);
  if (action === "Buy") return 3;
  if (action === "Starter") return 2;
  if (action === "Watch") return 1;
  return 0;
}

function getConvictionGrade(stock = {}) {
  const score = clampScore(stock.score ?? stock.compositeScore);
  const trigger = clampScore(stock.triggerScore);
  const momentum = clampScore(stock.momentumScore);
  const technical = clampScore(stock.technicalScore);
  const action = getAction(stock);

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
  const action = getAction(stock);
  const trigger = clampScore(stock.triggerScore);
  const momentum = clampScore(stock.momentumScore);

  if (action === "Buy") return "Immediate";
  if (action === "Starter" && trigger >= 72 && momentum >= 62) return "This Week";
  if (action === "Starter") return "Next 2 Weeks";
  if (action === "Watch") return "Monitor";
  return "Avoid Until Improved";
}

function themeFor(symbol) {
  return PRIMARY_THEME_BY_SYMBOL[normalizeSymbol(symbol)] || "Other";
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`FMP request failed: ${response.status}${text ? ` - ${text}` : ""}`);
  }
  return response.json();
}

function chunkArray(items = [], size = 20) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function asQuoteArray(data) {
  if (Array.isArray(data)) return data.filter(Boolean);
  if (data && typeof data === "object") return [data];
  return [];
}

async function fetchStableQuoteChunk(symbols = [], apiKey) {
  const fmpSymbols = symbols.map(toFmpSymbol).join(",");
  const url = `https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(fmpSymbols)}&apikey=${apiKey}`;
  return asQuoteArray(await fetchJson(url));
}

async function fetchLegacyQuoteChunk(symbols = [], apiKey) {
  const fmpSymbols = symbols.map(toFmpSymbol).join(",");
  const url = `https://financialmodelingprep.com/api/v3/quote/${encodeURIComponent(fmpSymbols)}?apikey=${apiKey}`;
  return asQuoteArray(await fetchJson(url));
}

async function fetchQuoteChunk(symbols = [], apiKey) {
  if (!symbols.length) return [];

  try {
    const stable = await fetchStableQuoteChunk(symbols, apiKey);
    if (stable.length) return stable;
  } catch {}

  try {
    const legacy = await fetchLegacyQuoteChunk(symbols, apiKey);
    if (legacy.length) return legacy;
  } catch {}

  const individual = [];
  for (const symbol of symbols) {
    try {
      const rows = await fetchStableQuoteChunk([symbol], apiKey);
      if (rows.length) {
        individual.push(rows[0]);
        continue;
      }
    } catch {}

    try {
      const rows = await fetchLegacyQuoteChunk([symbol], apiKey);
      if (rows.length) individual.push(rows[0]);
    } catch {}
  }

  return individual;
}

async function fetchFmpQuotes(symbols = []) {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) throw new Error("Missing FMP_API_KEY in environment variables.");

  const cleanSymbols = uniqueSymbols(symbols);
  if (!cleanSymbols.length) return [];

  const chunks = chunkArray(cleanSymbols, 20);
  const all = [];

  for (const chunk of chunks) {
    const rows = await fetchQuoteChunk(chunk, apiKey);
    all.push(...rows);
  }

  const seen = new Set();
  return all.filter((row) => {
    const symbol = normalizeSymbol(row?.symbol);
    if (!symbol || seen.has(symbol)) return false;
    seen.add(symbol);
    return true;
  });
}

function normalizeQuote(row = {}) {
  const symbol = normalizeSymbol(row.symbol);
  const price = toPositiveNumber(row.price);
  const previousClose = toPositiveNumber(row.previousClose);
  const change = toNumber(row.change);
  const rawPct = row.changesPercentage ?? row.changePercentage ?? row.changePercent;

  const dayChangePct = normalizeDailyPct({ price, previousClose, change, rawPct });

  return {
    ...row,
    symbol,
    ticker: symbol,
    name: row.name || row.companyName || symbol,
    companyName: row.companyName || row.name || symbol,
    price,
    currentPrice: price,
    lastPrice: price,
    close: price,
    previousClose,
    change,
    dayChangePct,
    changesPercentage: dayChangePct,
    changePercent: dayChangePct,
    marketCap: toPositiveNumber(row.marketCap),
    volume: toPositiveNumber(row.volume),
    avgVolume: toPositiveNumber(row.avgVolume),
    priceAvg50: toPositiveNumber(row.priceAvg50),
    fiftyDayAverage: toPositiveNumber(row.priceAvg50 ?? row.fiftyDayAverage),
    priceAvg200: toPositiveNumber(row.priceAvg200),
    twoHundredDayAverage: toPositiveNumber(row.priceAvg200 ?? row.twoHundredDayAverage),
    yearHigh: toPositiveNumber(row.yearHigh),
    yearLow: toPositiveNumber(row.yearLow),
    eps: toNumber(row.eps),
    pe: toNumber(row.pe),
    beta: toNumber(row.beta, null),
    exchange: row.exchange || row.exchangeShortName || "",
    timestamp: row.timestamp || null,
  };
}

function scoreQuote(normalized = {}) {
  const score = compositeScore(normalized);
  const fundamentalScore = calcFundamentalScore(normalized);
  const technicalScore = calcTechnicalScore(normalized);
  const momentumScore = calcMomentumScore(normalized);
  const relativeStrengthScore = calcRelativeStrengthScore(normalized);
  const asymmetryScore = calcAsymmetryScore(normalized);
  const triggerScore = calcTriggerScore(normalized);
  const technicalSnapshot = buildTechnicalSnapshot(normalized);
  const fundamentalSnapshot = buildFundamentalSnapshot(normalized);
  const recommendation = getRecommendation(normalized);
  const action = normalizeActionLabel(recommendation?.label || getTradeReadiness(normalized));

  return {
    ...normalized,
    score,
    compositeScore: score,
    heatScore: score,
    fundamentalScore,
    technicalScore,
    momentumScore,
    relativeStrengthScore,
    asymmetryScore,
    triggerScore,
    primaryTheme: themeFor(normalized.symbol),
    theme: themeFor(normalized.symbol),
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
    technicalSnapshot,
    fundamentalSnapshot,
  };
}

function enrichOutput(stock = {}) {
  return {
    ...stock,
    primaryTheme: themeFor(stock.symbol),
    theme: themeFor(stock.symbol),
    convictionGrade: getConvictionGrade(stock),
    catalyst: getCatalyst(stock),
    decisionClock: getDecisionClock(stock),
    riskPlan: stock.riskPlan ?? stock.recommendation?.riskPlan ?? null,
  };
}

function rankScore(stock = {}) {
  const action = actionRank(stock);
  const convictionBias =
    stock.convictionGrade === "A+" ? 5 :
    stock.convictionGrade === "A" ? 4 :
    stock.convictionGrade === "A-" ? 3 :
    stock.convictionGrade === "B+" ? 2 :
    stock.convictionGrade === "B" ? 1 : 0;

  return (
    action * 1000 +
    safeScore(stock.score) * 2.2 +
    safeScore(stock.relativeStrengthScore) * 1.5 +
    safeScore(stock.technicalScore) * 1.25 +
    safeScore(stock.triggerScore) +
    safeScore(stock.momentumScore) +
    convictionBias
  );
}

function sortTopIdeas(a, b) {
  const actionDiff = actionRank(b) - actionRank(a);
  if (actionDiff !== 0) return actionDiff;

  const rankDiff = rankScore(b) - rankScore(a);
  if (rankDiff !== 0) return rankDiff;

  return safeScore(b.score) - safeScore(a.score);
}

function shareClassFamily(symbol) {
  const clean = normalizeSymbol(symbol);
  if (clean === "GOOG" || clean === "GOOGL") return "ALPHABET";
  return clean;
}

function dedupeShareClasses(rows = []) {
  const preferredSymbol = { ALPHABET: "GOOGL" };
  const bestByFamily = new Map();

  for (const row of rows) {
    const symbol = normalizeSymbol(row?.symbol);
    if (!symbol) continue;

    const family = shareClassFamily(symbol);
    const current = bestByFamily.get(family);

    if (!current) {
      bestByFamily.set(family, row);
      continue;
    }

    const preferred = preferredSymbol[family];
    if (preferred) {
      if (symbol === preferred && normalizeSymbol(current.symbol) !== preferred) {
        bestByFamily.set(family, row);
        continue;
      }
      if (normalizeSymbol(current.symbol) === preferred && symbol !== preferred) {
        continue;
      }
    }

    if (sortTopIdeas(row, current) < 0) bestByFamily.set(family, row);
  }

  return Array.from(bestByFamily.values());
}

function themeKeyForName(themeName) {
  const match = Object.entries(THEME_CONFIG).find(([, config]) => config.name === themeName);
  return match?.[0] || "opportunities";
}

function convictionToScore(grade) {
  if (grade === "A+") return 100;
  if (grade === "A") return 90;
  if (grade === "A-") return 82;
  if (grade === "B+") return 74;
  if (grade === "B") return 64;
  return 50;
}

function buildThemeLeadership(rows = []) {
  const byTheme = new Map();

  for (const row of rows) {
    if (!isApprovedOpportunity(row)) continue;
    const theme = row.primaryTheme || "Other";
    if (!byTheme.has(theme)) {
      byTheme.set(theme, {
        theme,
        key: themeKeyForName(theme),
        total: 0,
        buy: 0,
        starter: 0,
        watch: 0,
        avoid: 0,
        bestSymbol: row.symbol,
        bestAction: getAction(row),
        bestScore: -1,
        convictionTotal: 0,
        relativeStrengthTotal: 0,
        technicalTotal: 0,
        momentumTotal: 0,
        dayChangeTotal: 0,
        dayChangeCount: 0,
      });
    }

    const bucket = byTheme.get(theme);
    const action = getAction(row);
    const score = safeScore(row.score);

    bucket.total += 1;
    if (action === "Buy") bucket.buy += 1;
    else if (action === "Starter") bucket.starter += 1;
    else if (action === "Watch") bucket.watch += 1;
    else bucket.avoid += 1;

    bucket.convictionTotal += convictionToScore(row.convictionGrade);
    bucket.relativeStrengthTotal += safeScore(row.relativeStrengthScore);
    bucket.technicalTotal += safeScore(row.technicalScore);
    bucket.momentumTotal += safeScore(row.momentumScore);

    const dayChange = toNumber(row.dayChangePct ?? row.changesPercentage, null);
    if (dayChange !== null) {
      bucket.dayChangeTotal += dayChange;
      bucket.dayChangeCount += 1;
    }

    const candidateRank = rankScore(row);
    if (candidateRank > bucket.bestScore) {
      bucket.bestScore = candidateRank;
      bucket.bestSymbol = row.symbol;
      bucket.bestAction = action;
    }
  }

  return Array.from(byTheme.values())
    .map((theme) => {
      const total = Math.max(theme.total, 1);
      const avgConviction = theme.convictionTotal / total;
      const actionableBreadth = ((theme.buy + theme.starter) / total) * 100;
      const avgRelativeStrength = theme.relativeStrengthTotal / total;
      const avgTechnical = theme.technicalTotal / total;
      const avgMomentum = theme.momentumTotal / total;
      const avgDayChange = theme.dayChangeCount > 0 ? theme.dayChangeTotal / theme.dayChangeCount : 0;

      const healthScore = clampScore(
        avgConviction * 0.30 +
          actionableBreadth * 0.25 +
          avgRelativeStrength * 0.20 +
          avgTechnical * 0.15 +
          avgMomentum * 0.10
      );

      // Stateless Vercel functions do not have yesterday's theme score available.
      // This is a same-day rotation proxy: positive when the theme's current momentum,
      // breadth, and day change are improving versus a neutral baseline.
      const trendDelta = Math.max(
        -9,
        Math.min(
          9,
          Math.round((avgMomentum - 50) * 0.08 + (actionableBreadth - 25) * 0.04 + avgDayChange * 1.2)
        )
      );

      const trendDirection = trendDelta > 1 ? "up" : trendDelta < -1 ? "down" : "flat";
      const trendArrow = trendDirection === "up" ? "▲" : trendDirection === "down" ? "▼" : "►";
      const healthLabel = healthScore >= 75 ? "Strong" : healthScore >= 60 ? "Improving" : healthScore >= 45 ? "Neutral" : healthScore >= 30 ? "Weakening" : "Weak";

      return {
        ...theme,
        healthScore,
        averageStrength: healthScore,
        healthLabel,
        trendDelta,
        trendDirection,
        trendArrow,
        avgConviction: Math.round(avgConviction),
        actionableBreadth: Math.round(actionableBreadth),
        avgRelativeStrength: Math.round(avgRelativeStrength),
        avgTechnical: Math.round(avgTechnical),
        avgMomentum: Math.round(avgMomentum),
      };
    })
    .sort((a, b) => b.healthScore - a.healthScore)
    .slice(0, 6);
}

function bucketRows(rows = []) {
  const deDuplicated = dedupeShareClasses(rows.map(enrichOutput));
  const sorted = [...deDuplicated].sort(sortTopIdeas);
  const byAction = (label) => sorted.filter((stock) => getAction(stock) === label).sort(sortTopIdeas);

  const buys = byAction("Buy");
  const starters = byAction("Starter");
  const watches = byAction("Watch");
  const avoids = byAction("Avoid");

  const selected = [
    ...buys.slice(0, 6),
    ...starters.slice(0, 10),
    ...watches.slice(0, 14),
    ...avoids.slice(0, 8),
  ];

  const seen = new Set();
  const unique = [];

  for (const stock of selected) {
    const symbol = normalizeSymbol(stock.symbol);
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    unique.push(stock);
  }

  return unique;
}

export default async function handler(req, res) {
  try {
    res.setHeader("Cache-Control", "no-store, max-age=0");

    const themeKey = String(req.query.theme || "opportunities").toLowerCase();
    const selectedTheme = getThemeConfig(themeKey);
    const symbols = uniqueSymbols(selectedTheme.symbols);

    if (!symbols.length) {
      return res.status(502).json({
        error: "Quote refresh returned no usable stocks.",
        detail: "The selected theme has no symbols configured.",
      });
    }

    const [quotes, spyQuotes, qqqQuotes] = await Promise.all([
      fetchFmpQuotes(symbols),
      fetchFmpQuotes(["SPY"]).catch(() => []),
      fetchFmpQuotes(["QQQ"]).catch(() => []),
    ]);

    const spyQuote = spyQuotes?.[0] ? normalizeQuote(spyQuotes[0]) : null;
    const qqqQuote = qqqQuotes?.[0] ? normalizeQuote(qqqQuotes[0]) : null;

    const allRows = quotes
      .map(normalizeQuote)
      .filter((row) => row.symbol && row.price != null)
      .map((row) => ({
        ...row,
        spyDayChangePct: spyQuote?.dayChangePct ?? null,
        qqqDayChangePct: qqqQuote?.dayChangePct ?? null,
      }))
      .map(scoreQuote)
      .map(enrichOutput);

    const baseRows = isOpportunityThemeMode(themeKey)
      ? allRows.filter(isApprovedOpportunity)
      : allRows;

    const eventCandidates = baseRows.filter((row) => ["Buy", "Starter"].includes(getAction(row))).map((row) => row.symbol);
    const eventRiskMap = await fetchEventRiskMap(eventCandidates);
    const rows = baseRows.map((row) => applyEventRiskGate(row, eventRiskMap.get(normalizeSymbol(row.symbol))));

    if (!rows.length) {
      return res.status(502).json({
        error: "Quote refresh returned no usable stocks.",
        detail: isOpportunityThemeMode(themeKey)
          ? "No eligible approved-theme opportunity quotes were returned. Generic 'Other' names are intentionally excluded."
          : "FMP returned no usable quotes for the selected theme.",
      });
    }

    const bucketed = bucketRows(rows);
    const counts = bucketed.reduce(
      (acc, row) => {
        const action = getAction(row);
        acc.total += 1;
        if (action === "Buy") acc.buy += 1;
        else if (action === "Starter") acc.starter += 1;
        else if (action === "Watch") acc.watch += 1;
        else acc.avoid += 1;
        return acc;
      },
      { total: 0, buy: 0, starter: 0, watch: 0, avoid: 0 }
    );

    return res.status(200).json({
      stocks: bucketed,
      selectedTheme: {
        key: themeKey,
        name: selectedTheme.name,
        description: selectedTheme.description,
      },
      themeLeadership: buildThemeLeadership(rows),
      meta: {
        mode: "investment_operating_system_v3",
        source: "FMP",
        universeCount: symbols.length,
        returnedCount: bucketed.length,
        rawCount: rows.length,
        spyChange: spyQuote?.dayChangePct ?? null,
        qqqChange: qqqQuote?.dayChangePct ?? null,
        ...counts,
      },
    });
  } catch (err) {
    console.error("api/top5 error:", err);
    return res.status(500).json({
      error: "Failed to load trade screen.",
      detail: err.message || "Unknown error.",
    });
  }
}

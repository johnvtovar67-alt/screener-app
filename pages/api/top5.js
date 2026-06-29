// pages/api/top5.js
// Broad/theme screener. Uses the same lib/scoring.js analyzeStock engine as /api?symbol=.

import { analyzeStock } from "../../lib/scoring";

function normalizeSymbol(symbol) {
  return String(symbol || "").replace("-", ".").toUpperCase().trim();
}

function toFmpSymbol(symbol) {
  return String(symbol || "").replace(".", "-").toUpperCase().trim();
}

function uniqueSymbols(symbols = []) {
  const seen = new Set();
  return symbols.map(normalizeSymbol).filter((symbol) => {
    if (!symbol || seen.has(symbol)) return false;
    seen.add(symbol);
    return true;
  });
}

const THEME_CONFIG = {
  broad: {
    name: "Best Opportunities",
    tier: "All Primary Themes",
    description: "Fresh-capital screen using one primary theme per symbol. This deliberately excludes slow-growth banks, generic financials, airlines, cruises, broad retail, and other non-philosophy names from the default opportunity page.",
    symbols: [],
  },
  ai_infra: {
    name: "AI Compute & Platforms",
    tier: "Core Secular Growth",
    description: "Semiconductors, accelerators, AI platforms, servers, and scaled cloud platforms.",
    symbols: ["NVDA", "AMD", "AVGO", "ARM", "MU", "SMCI", "DELL", "HPE", "ORCL", "MSFT", "GOOG", "META", "AMZN", "PLTR"],
  },
  ai_networking: {
    name: "AI Networking",
    tier: "Core Secular Growth",
    description: "Switching, optical, connectivity, storage, and networking beneficiaries of AI/data-center buildout.",
    symbols: ["ANET", "MRVL", "CSCO", "CIEN", "AAOI", "LITE", "COHR", "NTAP", "JNPR"],
  },
  cybersecurity: {
    name: "Cybersecurity",
    tier: "Core Secular Growth",
    description: "Security software, identity, endpoint, network, and cloud-protection leaders.",
    symbols: ["CRWD", "PANW", "ZS", "NET", "FTNT", "OKTA", "S", "CYBR", "TENB", "VRNS", "QLYS", "DDOG"],
  },
  btc: {
    name: "BTC / Digital Assets",
    tier: "Core Secular Growth",
    description: "Bitcoin, miners, exchanges, and digital-asset infrastructure proxies.",
    symbols: ["MSTR", "MARA", "RIOT", "CLSK", "IREN", "WULF", "HUT", "BTDR", "CIFR", "BITF", "COIN", "HOOD", "SQ", "PYPL"],
  },
  ai_power: {
    name: "Power & Electrification",
    tier: "Core Secular Growth",
    description: "Grid, electrification, power equipment, and AI-load-growth beneficiaries.",
    symbols: ["GEV", "ETN", "PWR", "VRT", "FIX", "EME", "CEG", "VST", "NRG", "TLN", "HUBB", "NVT"],
  },
  cooling_water: {
    name: "Cooling & Water",
    tier: "Core Secular Growth",
    description: "Thermal management, cooling, HVAC, and water-infrastructure beneficiaries.",
    symbols: ["XYL", "WTS", "AOS", "PNR", "ITT", "DOV", "CARR", "TT"],
  },
  digital_infra: {
    name: "Digital Infrastructure",
    tier: "Industrial Transformation",
    description: "Data-center landlords, towers, and hard-asset digital-infrastructure picks and shovels.",
    symbols: ["EQIX", "DLR", "AMT", "CCI"],
  },
  nuclear: {
    name: "Nuclear / Baseload",
    tier: "Industrial Transformation",
    description: "Uranium, nuclear services, advanced nuclear, and baseload power.",
    symbols: ["CCJ", "UEC", "UUUU", "LEU", "BWXT", "SMR", "OKLO", "NNE", "NXE", "DNN"],
  },
  robotics: {
    name: "Robotics & Automation",
    tier: "Industrial Transformation",
    description: "Industrial automation, robotics, machine vision, surgical robotics, and factory automation.",
    symbols: ["SYM", "TER", "ROK", "CGNX", "ABBNY", "ISRG", "FANUY", "HON", "EMR", "ZBRA", "IR", "AME"],
  },
  industrial_software: {
    name: "Industrial Software",
    tier: "Industrial Transformation",
    description: "Design, engineering, EDA, simulation, product-lifecycle, and workflow software.",
    symbols: ["ADSK", "PTC", "SNPS", "CDNS", "ANSS", "BSY", "ROP", "TYL", "TEAM", "MDB"],
  },
  defense_space: {
    name: "Defense & National Security",
    tier: "National Security & Space",
    description: "Prime defense, defense electronics, missile defense, naval, and government technology.",
    symbols: ["LHX", "RTX", "NOC", "LMT", "KTOS", "AVAV", "HII", "GD", "LDOS", "BA", "TXT"],
  },
  space: {
    name: "Space & Satellites",
    tier: "National Security & Space",
    description: "Launch, satellites, space infrastructure, and space communications.",
    symbols: ["RKLB", "ASTS", "RDW", "BKSY", "IRDM"],
  },
  autonomy_drones: {
    name: "Autonomy & Drones",
    tier: "National Security & Space",
    description: "Autonomous systems, voice/AI agents, workflow automation, and drone-adjacent software.",
    symbols: ["AI", "SOUN", "PATH"],
  },
  quantum: {
    name: "Quantum Computing",
    tier: "Emerging Technologies",
    description: "Quantum pure plays and larger companies with credible quantum exposure.",
    symbols: ["IONQ", "RGTI", "QBTS", "QUBT", "ARQQ", "IBM"],
  },
  platform_biotech: {
    name: "Platform Biotech",
    tier: "Emerging Technologies",
    description: "Selective platform-healthcare and biotech names. Higher catalyst and binary risk.",
    symbols: ["MRNA", "ALMS", "VKTX", "RXRX", "SDGR", "DNA", "CRSP", "BEAM", "IOVA", "GERN", "ALT", "BCRX", "HIMS", "TMDX"],
  },
};

const PRIMARY_THEME_BY_SYMBOL = Object.entries(THEME_CONFIG).reduce((acc, [key, config]) => {
  if (key === "broad") return acc;
  for (const symbol of config.symbols) {
    const clean = normalizeSymbol(symbol);
    if (!acc[clean]) {
      acc[clean] = { key, name: config.name, tier: config.tier };
    }
  }
  return acc;
}, {});

THEME_CONFIG.broad.symbols = Object.keys(PRIMARY_THEME_BY_SYMBOL);

function getThemeConfig(themeKey) {
  const clean = String(themeKey || "broad").toLowerCase();
  return THEME_CONFIG[clean] || THEME_CONFIG.broad;
}

function getPrimaryThemeForSymbol(symbol) {
  return PRIMARY_THEME_BY_SYMBOL[normalizeSymbol(symbol)] || null;
}

function getThemesForSymbol(symbol) {
  const normalized = normalizeSymbol(symbol);
  const primary = getPrimaryThemeForSymbol(normalized);
  const themes = Object.entries(THEME_CONFIG)
    .filter(([key, config]) => key !== "broad" && config.symbols.map(normalizeSymbol).includes(normalized))
    .map(([key, config]) => ({
      key,
      name: config.name,
      tier: config.tier,
      primary: primary?.key === key,
    }));

  if (!primary) return themes;

  return themes.sort((a, b) => Number(b.primary) - Number(a.primary));
}

function getConvictionScore(stock = {}) {
  const score = Number(stock.score || stock.compositeScore || 0);
  const leadership = Number(stock.leadershipScore || stock.relativeStrengthScore || 0);
  const technical = Number(stock.technicalScore || 0);
  const entry = Number(stock.entryQualityScore || 0);
  const action = stock?.recommendation?.label || stock.label || stock.tradeAction || "Avoid";
  const actionBoost = action === "Buy" ? 8 : action === "Starter" ? 3 : action === "Watch" ? 0 : -8;
  const raw = score * 0.42 + leadership * 0.28 + technical * 0.20 + entry * 0.10 + actionBoost;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function getConvictionStars(score = 0) {
  if (score >= 86) return 5;
  if (score >= 76) return 4;
  if (score >= 66) return 3;
  if (score >= 56) return 2;
  return 1;
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

function normalizeDayChangePct(row = {}, price = null, previousClose = null, change = null) {
  const rawCandidates = [row.changesPercentage, row.changePercentage, row.changePercent, row.percentChange]
    .map((value) => toNumber(value, null))
    .filter((value) => value !== null);
  const raw = rawCandidates.length ? rawCandidates[0] : null;
  let computed = null;

  if (price != null && previousClose != null && previousClose > 0) {
    computed = ((price - previousClose) / previousClose) * 100;
  } else if (change != null && previousClose != null && previousClose > 0) {
    computed = (change / previousClose) * 100;
  }

  if (computed != null && Number.isFinite(computed)) {
    if (raw == null) return computed;
    if (Math.abs(raw) > 25 && Math.abs(computed) < 15) return computed;
    if (Math.abs(raw * 100 - computed) < Math.abs(raw - computed)) return raw * 100;
    return raw;
  }

  return raw;
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
      const stable = await fetchStableQuoteChunk([symbol], apiKey);
      if (stable.length) {
        individual.push(stable[0]);
        continue;
      }
    } catch {}
    try {
      const legacy = await fetchLegacyQuoteChunk([symbol], apiKey);
      if (legacy.length) individual.push(legacy[0]);
    } catch {}
  }
  return individual;
}

async function fetchFmpQuotes(symbols = []) {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) throw new Error("Missing FMP_API_KEY in environment variables.");

  const cleanSymbols = uniqueSymbols(symbols);
  const chunks = chunkArray(cleanSymbols, 20);
  const all = [];
  for (const chunk of chunks) all.push(...(await fetchQuoteChunk(chunk, apiKey)));

  const seen = new Set();
  return all.filter((row) => {
    const symbol = normalizeSymbol(row?.symbol);
    if (!symbol || seen.has(symbol)) return false;
    seen.add(symbol);
    return true;
  });
}

function normalizeQuote(row = {}, selectedTheme = null, spyQuote = null, qqqQuote = null) {
  const symbol = normalizeSymbol(row.symbol);
  const price = toPositiveNumber(row.price);
  const previousClose = toPositiveNumber(row.previousClose);
  const change = toNumber(row.change);
  const dayChangePct = normalizeDayChangePct(row, price, previousClose, change);
  const themes = getThemesForSymbol(symbol);

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
    avgVolume: toPositiveNumber(row.avgVolume ?? row.averageVolume ?? row.volume),
    priceAvg50: toPositiveNumber(row.priceAvg50 ?? row.fiftyDayAverage),
    fiftyDayAverage: toPositiveNumber(row.priceAvg50 ?? row.fiftyDayAverage),
    priceAvg200: toPositiveNumber(row.priceAvg200 ?? row.twoHundredDayAverage),
    twoHundredDayAverage: toPositiveNumber(row.priceAvg200 ?? row.twoHundredDayAverage),
    yearHigh: toPositiveNumber(row.yearHigh),
    yearLow: toPositiveNumber(row.yearLow),
    eps: toNumber(row.eps),
    pe: toNumber(row.pe),
    beta: toNumber(row.beta, null),
    exchange: row.exchange || row.exchangeShortName || "",
    timestamp: row.timestamp || null,
    themeKey: selectedTheme?.key === "broad" ? themes[0]?.key || null : selectedTheme?.key || null,
    themeName: selectedTheme?.key === "broad" ? themes[0]?.name || "Unassigned" : selectedTheme?.name || themes[0]?.name || "Unassigned",
    themeTier: selectedTheme?.key === "broad" ? themes[0]?.tier || "Unassigned" : selectedTheme?.tier || themes[0]?.tier || "Unassigned",
    primaryThemeKey: themes[0]?.key || null,
    primaryThemeName: themes[0]?.name || "Unassigned",
    primaryThemeTier: themes[0]?.tier || "Unassigned",
    themes,
    spyDayChangePct: spyQuote?.dayChangePct ?? null,
    qqqDayChangePct: qqqQuote?.dayChangePct ?? null,
  };
}

function canonicalSymbol(symbol) {
  const clean = normalizeSymbol(symbol);
  if (clean === "GOOGL") return "GOOG";
  if (clean === "BRK.B") return "BRK.A";
  return clean;
}

function actionRank(stock = {}) {
  const label = stock?.recommendation?.label || stock.label || stock.tradeAction || "Avoid";
  if (label === "Buy") return 3;
  if (label === "Starter") return 2;
  if (label === "Watch") return 1;
  return 0;
}

function dedupeShareClasses(rows = []) {
  const byCanonical = new Map();
  for (const row of rows) {
    const key = canonicalSymbol(row.symbol);
    const existing = byCanonical.get(key);
    if (!existing) {
      byCanonical.set(key, row);
      continue;
    }
    const rowRank = actionRank(row);
    const existingRank = actionRank(existing);
    if (rowRank > existingRank || (rowRank === existingRank && Number(row.score || 0) > Number(existing.score || 0))) {
      byCanonical.set(key, row);
    }
  }
  return [...byCanonical.values()];
}

function sortStocks(a, b) {
  const actionDiff = actionRank(b) - actionRank(a);
  if (actionDiff !== 0) return actionDiff;
  const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
  if (scoreDiff !== 0) return scoreDiff;
  return Number(b.leadershipScore || b.relativeStrengthScore || 0) - Number(a.leadershipScore || a.relativeStrengthScore || 0);
}

function countByAction(rows = [], action) {
  return rows.filter((stock) => (stock?.recommendation?.label || stock.label) === action).length;
}

export default async function handler(req, res) {
  try {
    res.setHeader("Cache-Control", "no-store, max-age=0");

    const themeKey = String(req.query.theme || "broad").toLowerCase();
    const selectedTheme = { key: themeKey, ...getThemeConfig(themeKey) };
    const requestedSymbols = uniqueSymbols(selectedTheme.symbols);

    if (!requestedSymbols.length) {
      return res.status(502).json({
        error: "Quote refresh returned no usable stocks.",
        detail: "The selected theme has no symbols configured.",
      });
    }

    const benchmarkSymbols = ["SPY", "QQQ"];
    const rawQuotes = await fetchFmpQuotes([...requestedSymbols, ...benchmarkSymbols]);
    const rawSpy = rawQuotes.find((row) => normalizeSymbol(row.symbol) === "SPY");
    const rawQqq = rawQuotes.find((row) => normalizeSymbol(row.symbol) === "QQQ");
    const spyQuote = rawSpy ? normalizeQuote(rawSpy, null, null, null) : null;
    const qqqQuote = rawQqq ? normalizeQuote(rawQqq, null, null, null) : null;

    const analyzed = rawQuotes
      .filter((row) => !benchmarkSymbols.includes(normalizeSymbol(row.symbol)))
      .map((row) => normalizeQuote(row, selectedTheme, spyQuote, qqqQuote))
      .filter((stock) => stock.symbol && Number.isFinite(Number(stock.price)) && Number(stock.price) > 0)
      .map(analyzeStock)
      .map((stock) => {
        const convictionScore = getConvictionScore(stock);
        return {
          ...stock,
          convictionScore,
          convictionStars: getConvictionStars(convictionScore),
        };
      });

    if (!analyzed.length) {
      return res.status(502).json({
        error: "Quote refresh returned no usable stocks.",
        detail: "FMP returned no usable quotes for the selected theme.",
      });
    }

    const stocks = dedupeShareClasses(analyzed).sort(sortStocks);

    return res.status(200).json({
      selectedTheme,
      count: stocks.length,
      stocks,
      meta: {
        mode: "investment_operating_system_primary_theme_v1",
        dataPath: "FMP batch quote + lib/scoring.js analyzeStock",
        decisionSource: "lib/scoring.js analyzeStock",
        philosophy: "Institutional-quality secular-growth leaders with actionable technical entries.",
        requestedSymbols: requestedSymbols.length,
        analyzedSymbols: analyzed.length,
        deDuplicatedSymbols: stocks.length,
        buyCount: countByAction(stocks, "Buy"),
        starterCount: countByAction(stocks, "Starter"),
        watchCount: countByAction(stocks, "Watch"),
        avoidCount: countByAction(stocks, "Avoid"),
        spyChange: spyQuote?.dayChangePct ?? null,
        qqqChange: qqqQuote?.dayChangePct ?? null,
      },
    });
  } catch (error) {
    console.error("api/top5 error:", error);
    return res.status(500).json({
      error: "Failed to load top ideas.",
      detail: error?.message || String(error),
    });
  }
}

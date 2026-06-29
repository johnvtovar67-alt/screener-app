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
    name: "Broad Market",
    tier: "All Themes",
    description: "Curated institutional-quality secular-growth universe.",
    symbols: [
      "NVDA", "AMD", "AVGO", "ARM", "MU", "SMCI", "DELL", "HPE", "ANET", "ORCL", "MSFT", "GOOG", "META", "AMZN", "AAPL", "TSLA", "PLTR",
      "CRWD", "NET", "DDOG", "SNOW", "MDB", "ZS", "PANW", "SHOP", "UBER", "ROKU", "SOUN", "BBAI", "AI", "AAOI",
      "SCHW", "BGC", "JPM", "BAC", "C", "WFC", "GS", "MS", "BX", "KKR", "APO", "SOFI", "AFRM", "HOOD", "COIN", "PYPL", "SQ", "ALLY", "RKT", "UPST",
      "ETN", "PWR", "VRT", "FIX", "EME", "GEV", "CEG", "VST", "NRG", "TLN", "KMI", "WMB", "TRGP", "LNG", "ET", "EPD", "OKE", "PAGP", "XOM", "CVX", "COP", "SLB", "HAL", "FCX", "CLF", "NUE", "STLD",
      "CCJ", "UEC", "UUUU", "LEU", "BWXT", "SMR", "OKLO", "NNE", "NXE", "DNN",
      "MSTR", "MARA", "RIOT", "CLSK", "IREN", "WULF", "HUT", "BTDR", "CIFR", "BITF",
      "HIMS", "BCRX", "ALMS", "VKTX", "RXRX", "SDGR", "DNA", "MRNA", "NVAX", "CRSP", "BEAM", "IOVA", "GERN", "ALT",
      "CELH", "CROX", "DKNG", "RCL", "CCL", "NCLH", "ABNB", "EXPE", "AAL", "UAL", "DAL", "LUV", "DIS", "NFLX", "TGT", "WMT", "COST",
      "AHR", "VICI", "O", "PLD", "DLR", "EQIX", "AMT", "CCI", "WELL",
      "RKLB", "ASTS", "RDW", "BKSY", "IRDM", "LHX", "RTX", "NOC", "LMT", "KTOS", "AVAV", "HII", "GD", "LDOS", "BA", "TXT",
      "SYM", "TER", "ROK", "CGNX", "ABBNY", "ISRG", "ADSK", "PTC", "SNPS", "CDNS", "FANUY", "HUBB", "NVT", "XYL", "WTS", "AOS", "PNR", "ITT", "DOV", "CARR", "TT",
      "IONQ", "RGTI", "QBTS", "QUBT", "ARQQ", "IBM", "HON"
    ],
  },
  ai_infra: {
    name: "AI Infrastructure",
    tier: "Core Secular Growth",
    description: "Semiconductors, servers, networking, data-center infrastructure, and AI platforms.",
    symbols: ["NVDA", "AMD", "AVGO", "ARM", "MU", "SMCI", "DELL", "HPE", "ANET", "VRT", "ETN", "PWR", "FIX", "EME", "ORCL", "MSFT", "GOOG", "META", "AMZN", "PLTR", "CRWD", "NET", "DDOG", "SNOW"],
  },
  ai_networking: {
    name: "AI Networking",
    tier: "Core Secular Growth",
    description: "Networking, switching, optical, and connectivity beneficiaries of AI/data-center buildout.",
    symbols: ["ANET", "AVGO", "MRVL", "CSCO", "JNPR", "CIEN", "AAOI", "LITE", "COHR", "NTAP", "DELL", "HPE", "SMCI"],
  },
  cybersecurity: {
    name: "Cybersecurity",
    tier: "Core Secular Growth",
    description: "Security software and identity/cloud protection leaders.",
    symbols: ["CRWD", "PANW", "ZS", "NET", "FTNT", "OKTA", "S", "CYBR", "TENB", "VRNS", "QLYS", "DDOG"],
  },
  btc: {
    name: "BTC / Digital Assets",
    tier: "Core Secular Growth",
    description: "Bitcoin, crypto infrastructure, exchanges, and digital-asset proxies.",
    symbols: ["MSTR", "MARA", "RIOT", "CLSK", "IREN", "WULF", "HUT", "BTDR", "CIFR", "BITF", "COIN", "HOOD", "SQ", "PYPL"],
  },
  ai_power: {
    name: "Power & Electrification",
    tier: "Core Secular Growth",
    description: "Power generation, grid, electrification, and energy infrastructure tied to AI load growth.",
    symbols: ["VST", "CEG", "NRG", "TLN", "GEV", "ETN", "PWR", "VRT", "FIX", "EME", "HUBB", "NVT", "KMI", "WMB", "TRGP", "LNG", "ET", "EPD", "OKE"],
  },
  cooling_water: {
    name: "Cooling & Water",
    tier: "Core Secular Growth",
    description: "Thermal management, water infrastructure, and cooling beneficiaries.",
    symbols: ["VRT", "ETN", "PWR", "FIX", "EME", "XYL", "WTS", "AOS", "PNR", "ITT", "DOV", "HUBB", "NVT", "CARR", "TT"],
  },
  digital_infra: {
    name: "Digital Infrastructure",
    tier: "Industrial Transformation",
    description: "Data-center landlords, towers, and physical digital-infrastructure picks and shovels.",
    symbols: ["EQIX", "DLR", "AMT", "CCI", "VRT", "ETN", "PWR", "ANET", "HUBB", "NVT", "TT", "CARR"],
  },
  nuclear: {
    name: "Nuclear / Baseload",
    tier: "Industrial Transformation",
    description: "Uranium, nuclear services, advanced nuclear, and baseload power.",
    symbols: ["CCJ", "UEC", "UUUU", "LEU", "BWXT", "SMR", "OKLO", "NNE", "CEG", "VST", "TLN", "GEV", "NXE", "DNN"],
  },
  robotics: {
    name: "Robotics & Automation",
    tier: "Industrial Transformation",
    description: "Industrial automation, robotics, machine vision, and surgical robotics.",
    symbols: ["SYM", "TER", "ROK", "CGNX", "ABBNY", "ISRG", "FANUY", "HON", "EMR", "ROBO", "ZBRA", "IR", "AME"],
  },
  industrial_software: {
    name: "Industrial Software",
    tier: "Industrial Transformation",
    description: "Design, engineering, EDA, simulation, and product-lifecycle software.",
    symbols: ["ADSK", "PTC", "SNPS", "CDNS", "ANSS", "BSY", "ROP", "TYL", "TEAM", "DDOG", "MDB"],
  },
  defense_space: {
    name: "Defense & Space",
    tier: "National Security & Space",
    description: "Space, missile defense, aerospace, defense electronics, drones, and national-security software.",
    symbols: ["RKLB", "ASTS", "RDW", "BKSY", "IRDM", "LHX", "RTX", "NOC", "LMT", "KTOS", "AVAV", "HII", "GD", "LDOS", "PLTR", "BA", "TXT"],
  },
  space: {
    name: "Space",
    tier: "National Security & Space",
    description: "Launch, satellites, space infrastructure, and space communications.",
    symbols: ["RKLB", "ASTS", "RDW", "BKSY", "IRDM", "LHX", "RTX", "NOC", "LMT", "KTOS", "BA"],
  },
  autonomy_drones: {
    name: "Autonomy & Drones",
    tier: "National Security & Space",
    description: "Drones, autonomous systems, defense software, and command/control platforms.",
    symbols: ["AVAV", "KTOS", "PLTR", "TXT", "LHX", "LDOS", "NOC", "RTX", "BA", "AI", "SOUN", "PATH"],
  },
  quantum: {
    name: "Quantum Computing",
    tier: "Emerging Technologies",
    description: "Quantum computing names and larger companies with quantum exposure.",
    symbols: ["IONQ", "RGTI", "QBTS", "QUBT", "ARQQ", "IBM", "GOOG", "MSFT", "NVDA", "HON", "AMZN"],
  },
  platform_biotech: {
    name: "Platform Biotech",
    tier: "Emerging Technologies",
    description: "Selective platform-healthcare and biotech names. Higher binary/catalyst risk.",
    symbols: ["MRNA", "ALMS", "VKTX", "RXRX", "SDGR", "DNA", "CRSP", "BEAM", "IOVA", "GERN", "ALT", "BCRX", "HIMS", "TMDX", "ISRG"],
  },
};

function getThemeConfig(themeKey) {
  const clean = String(themeKey || "broad").toLowerCase();
  return THEME_CONFIG[clean] || THEME_CONFIG.broad;
}

function getThemesForSymbol(symbol) {
  const normalized = normalizeSymbol(symbol);
  return Object.entries(THEME_CONFIG)
    .filter(([key, config]) => key !== "broad" && config.symbols.map(normalizeSymbol).includes(normalized))
    .map(([key, config]) => ({ key, name: config.name, tier: config.tier }));
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
    themeKey: selectedTheme?.key || null,
    themeName: selectedTheme?.name || themes[0]?.name || "Broad Market",
    themeTier: selectedTheme?.tier || themes[0]?.tier || "All Themes",
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
      .map(analyzeStock);

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
        mode: "screener_v2_shared_engine",
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

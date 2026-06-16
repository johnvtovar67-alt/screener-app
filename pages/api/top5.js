// pages/api/top5.js

import { analyzeStock } from "../../lib/scoring";

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
      if (!symbol || seen.has(symbol)) return false;
      seen.add(symbol);
      return true;
    });
}

const THEME_CONFIG = {
  broad: {
    name: "Broad Market",
    description:
      "Full broad-market discovery list using the institutional scoring model.",
    symbols: [
      "NVDA",
      "AMD",
      "AVGO",
      "ARM",
      "MU",
      "SMCI",
      "PLTR",
      "CRWD",
      "NET",
      "DDOG",
      "SNOW",
      "SHOP",
      "MDB",
      "ZS",
      "PANW",
      "ANET",
      "DELL",
      "HPE",
      "ORCL",
      "MSFT",
      "GOOGL",
      "GOOG",
      "META",
      "AMZN",
      "AAPL",
      "TSLA",
      "UBER",
      "ROKU",
      "SOUN",
      "BBAI",
      "AI",
      "AAOI",

      "SCHW",
      "BGC",
      "JPM",
      "BAC",
      "C",
      "WFC",
      "GS",
      "MS",
      "BX",
      "KKR",
      "APO",
      "SOFI",
      "AFRM",
      "HOOD",
      "COIN",
      "PYPL",
      "SQ",
      "ALLY",
      "RKT",
      "UPST",

      "ETN",
      "PWR",
      "VRT",
      "FIX",
      "EME",
      "GEV",
      "CEG",
      "VST",
      "NRG",
      "TLN",
      "KMI",
      "WMB",
      "TRGP",
      "LNG",
      "ET",
      "EPD",
      "OKE",
      "PAGP",
      "XOM",
      "CVX",
      "COP",
      "SLB",
      "HAL",
      "FCX",
      "CLF",
      "NUE",
      "STLD",

      "CCJ",
      "UEC",
      "UUUU",
      "LEU",
      "BWXT",
      "SMR",
      "OKLO",
      "NNE",

      "MSTR",
      "MARA",
      "RIOT",
      "CLSK",
      "IREN",
      "WULF",
      "HUT",
      "BTDR",
      "CIFR",
      "BITF",

      "HIMS",
      "BCRX",
      "ALMS",
      "VKTX",
      "RXRX",
      "SDGR",
      "DNA",
      "MRNA",
      "NVAX",
      "CRSP",
      "BEAM",
      "IOVA",
      "GERN",
      "ALT",

      "CELH",
      "CROX",
      "DKNG",
      "RCL",
      "CCL",
      "NCLH",
      "ABNB",
      "EXPE",
      "AAL",
      "UAL",
      "DAL",
      "LUV",
      "DIS",
      "NFLX",
      "TGT",
      "WMT",
      "COST",

      "AHR",
      "VICI",
      "O",
      "PLD",
      "DLR",
      "EQIX",
      "AMT",
      "CCI",
      "WELL",
    ],
  },

  btc: {
    name: "BTC / Digital Assets",
    description:
      "Bitcoin, crypto infrastructure, exchanges, and digital asset proxies.",
    symbols: [
      "MSTR",
      "MARA",
      "RIOT",
      "CLSK",
      "IREN",
      "WULF",
      "HUT",
      "BTDR",
      "CIFR",
      "BITF",
      "COIN",
      "HOOD",
      "SQ",
      "PYPL",
    ],
  },

  ai_power: {
    name: "AI Power & Energy",
    description:
      "Power generation, grid, electrification, and energy infrastructure tied to AI load growth.",
    symbols: [
      "VST",
      "CEG",
      "NRG",
      "TLN",
      "GEV",
      "ETN",
      "PWR",
      "VRT",
      "FIX",
      "EME",
      "KMI",
      "WMB",
      "TRGP",
      "LNG",
      "ET",
      "EPD",
      "OKE",
    ],
  },

  cooling_water: {
    name: "Cooling & Water",
    description:
      "Thermal management, water infrastructure, and cooling beneficiaries.",
    symbols: [
      "VRT",
      "ETN",
      "PWR",
      "FIX",
      "EME",
      "XYL",
      "WTS",
      "AOS",
      "PNR",
      "ITT",
      "DOV",
      "HUBB",
      "NVT",
      "CARR",
      "TT",
    ],
  },

  nuclear: {
    name: "Nuclear / Baseload",
    description:
      "Uranium, nuclear services, advanced nuclear, and baseload power.",
    symbols: [
      "CCJ",
      "UEC",
      "UUUU",
      "LEU",
      "BWXT",
      "SMR",
      "OKLO",
      "NNE",
      "CEG",
      "VST",
      "TLN",
      "GEV",
      "NXE",
      "DNN",
    ],
  },

  quantum: {
    name: "Quantum Computing",
    description:
      "Quantum computing names and larger companies with quantum exposure.",
    symbols: [
      "IONQ",
      "RGTI",
      "QBTS",
      "QUBT",
      "ARQQ",
      "IBM",
      "GOOGL",
      "MSFT",
      "NVDA",
      "HON",
      "AMZN",
    ],
  },

  ai_infra: {
    name: "AI Infrastructure",
    description:
      "Semiconductors, servers, networking, data center infrastructure, and AI platforms.",
    symbols: [
      "NVDA",
      "AMD",
      "AVGO",
      "ARM",
      "MU",
      "SMCI",
      "DELL",
      "HPE",
      "ANET",
      "VRT",
      "ETN",
      "PWR",
      "FIX",
      "EME",
      "ORCL",
      "MSFT",
      "GOOGL",
      "META",
      "AMZN",
      "PLTR",
      "CRWD",
      "NET",
      "DDOG",
      "SNOW",
    ],
  },
};



function getThemeConfig(themeKey) {
  const clean = String(themeKey || "broad").toLowerCase();
  return THEME_CONFIG[clean] || THEME_CONFIG.broad;
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

function normalizeActionLabel(value) {
  const label = String(value || "").toUpperCase().trim();
  if (label === "BUY") return "Buy";
  if (label === "STARTER") return "Starter";
  if (label === "WATCH") return "Watch";
  return "Avoid";
}

function actionRank(actionOrStock) {
  const action = typeof actionOrStock === "string" ? actionOrStock : normalizeActionLabel(actionOrStock?.recommendation?.label || actionOrStock?.label);
  if (action === "Buy") return 3;
  if (action === "Starter") return 2;
  if (action === "Watch") return 1;
  return 0;
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
  return asQuoteArray(await fetchJson(`https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(fmpSymbols)}&apikey=${apiKey}`));
}

async function fetchLegacyQuoteChunk(symbols = [], apiKey) {
  const fmpSymbols = symbols.map(toFmpSymbol).join(",");
  return asQuoteArray(await fetchJson(`https://financialmodelingprep.com/api/v3/quote/${encodeURIComponent(fmpSymbols)}?apikey=${apiKey}`));
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
  const all = [];
  for (const chunk of chunkArray(cleanSymbols, 20)) {
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

function calculateDayChangePct(row = {}, price = null, previousClose = null, change = null) {
  // FMP's stable quote payload has changed names over time. Prefer the actual
  // dollar change when available because stale percentage fields can produce
  // impossible +50% / -50% daily moves on normal large caps.
  const directChange = toNumber(change);
  const livePrice = toPositiveNumber(price);
  const prevClose = toPositiveNumber(previousClose);

  if (livePrice !== null && directChange !== null) {
    const derivedPrevious = livePrice - directChange;
    if (derivedPrevious > 0) {
      const derivedPct = (directChange / derivedPrevious) * 100;
      if (Number.isFinite(derivedPct) && Math.abs(derivedPct) <= 35) {
        return derivedPct;
      }
    }
  }

  if (livePrice !== null && prevClose !== null) {
    const derivedPct = ((livePrice - prevClose) / prevClose) * 100;
    if (Number.isFinite(derivedPct) && Math.abs(derivedPct) <= 35) {
      return derivedPct;
    }
  }

  const directFields = [
    row.changesPercentage,
    row.changePercentage,
    row.changePercent,
    row.dayChangePct,
  ];

  for (const field of directFields) {
    const pct = toNumber(field);
    if (pct !== null && Number.isFinite(pct) && Math.abs(pct) <= 35) {
      return pct;
    }
  }

  return null;
}

function normalizeQuote(row = {}) {
  const symbol = normalizeSymbol(row.symbol);
  const price = toPositiveNumber(row.price);
  const previousClose = toPositiveNumber(row.previousClose);
  const change = toNumber(row.change);
  const dayChangePct = calculateDayChangePct(row, price, previousClose, change);

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
    avgVolume: toPositiveNumber(row.avgVolume ?? row.averageVolume),
    priceAvg50: toPositiveNumber(row.priceAvg50 ?? row.priceAvg50d ?? row.fiftyDayAverage),
    fiftyDayAverage: toPositiveNumber(row.priceAvg50 ?? row.priceAvg50d ?? row.fiftyDayAverage),
    priceAvg200: toPositiveNumber(row.priceAvg200 ?? row.priceAvg200d ?? row.twoHundredDayAverage),
    twoHundredDayAverage: toPositiveNumber(row.priceAvg200 ?? row.priceAvg200d ?? row.twoHundredDayAverage),
    yearHigh: toPositiveNumber(row.yearHigh ?? row.yearHighPrice),
    yearLow: toPositiveNumber(row.yearLow ?? row.yearLowPrice),
    eps: toNumber(row.eps),
    pe: toNumber(row.pe ?? row.peRatio),
    beta: toNumber(row.beta, null),
    exchange: row.exchange || row.exchangeShortName || "",
    timestamp: row.timestamp || null,
  };
}

function attachMarketRelativeData(row, spyQuote, qqqQuote) {
  return {
    ...row,
    spyDayChangePct: spyQuote?.dayChangePct ?? null,
    qqqDayChangePct: qqqQuote?.dayChangePct ?? null,
  };
}

function sortStocks(a, b) {
  const actionDiff = actionRank(b) - actionRank(a);
  if (actionDiff) return actionDiff;
  const triggerDiff = Number(b.triggerScore || 0) - Number(a.triggerScore || 0);
  if (triggerDiff) return triggerDiff;
  return Number(b.score || 0) - Number(a.score || 0);
}

export default async function handler(req, res) {
  try {
    const themeKey = String(req.query.theme || "broad").toLowerCase();
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 25)));
    const includeAvoid = String(req.query.includeAvoid || "false").toLowerCase() === "true";
    const theme = getThemeConfig(themeKey);

    const symbols = uniqueSymbols([...(theme.symbols || []), "SPY", "QQQ"]);
    const rawQuotes = await fetchFmpQuotes(symbols);
    const normalized = rawQuotes.map(normalizeQuote).filter((row) => row.symbol && row.price !== null);

    const spyQuote = normalized.find((row) => row.symbol === "SPY") || null;
    const qqqQuote = normalized.find((row) => row.symbol === "QQQ") || null;

    const stocks = normalized
      .filter((row) => row.symbol !== "SPY" && row.symbol !== "QQQ")
      .map((row) => analyzeStock(attachMarketRelativeData(row, spyQuote, qqqQuote)))
      .filter((stock) => includeAvoid || stock.recommendation.label !== "Avoid")
      .sort(sortStocks);

    return res.status(200).json({
      theme: { key: themeKey, name: theme.name, description: theme.description },
      selectedTheme: { key: themeKey, name: theme.name, description: theme.description },
      stocks: stocks.slice(0, limit),
      top: stocks.slice(0, limit),
      results: stocks.slice(0, limit),
      allCount: normalized.length,
      returnedCount: stocks.slice(0, limit).length,
      meta: {
        mode: "broad_theme_screen",
        model: "shared_analyzeStock_v1",
        allowedActions: ["Buy", "Starter", "Watch", "Avoid"],
        spyChange: spyQuote?.dayChangePct ?? null,
        qqqChange: qqqQuote?.dayChangePct ?? null,
      },
    });
  } catch (err) {
    console.error("api/top5 error:", err);
    return res.status(500).json({
      error: "Failed to run screener.",
      detail: err.message || "Unknown error.",
    });
  }
}

// pages/api/top5.js

// This route intentionally uses the same API handler as the Single Symbol Action Check.
// The broad screener must never derive a different label from a separate quote-only path.

import singleSymbolHandler from "./index";

function normalizeSymbol(symbol) {
  return String(symbol || "").replace("-", ".").toUpperCase().trim();
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

function normalizeActionLabel(value) {
  const label = String(value || "").trim().toUpperCase();

  if (label === "BUY" || label === "BUY NOW" || label === "BUY IMMEDIATELY" || label === "STRONG BUY") {
    return "Buy";
  }

  if (
    label === "STARTER" ||
    label === "STARTER ONLY" ||
    label === "BREAKOUT BUY" ||
    label === "BREAKOUT" ||
    label === "BREAKOUT STARTER"
  ) {
    return "Starter";
  }

  if (
    label === "WATCH" ||
    label === "WATCH FOR ENTRY" ||
    label === "NEAR MISS" ||
    label === "SETUP" ||
    label === "SETUP ONLY" ||
    label === "WATCH CLOSELY"
  ) {
    return "Watch";
  }

  return "Avoid";
}

// This intentionally mirrors the exact priority used by the frontend's
// Single Symbol Action Check. The bug we are fixing is that broad-market cards
// were deriving labels from a different, quote-only path. If the single-symbol
// payload says ANET is Breakout Buy, top5 must preserve that label exactly.
function extractSingleSymbolAction(stock = {}) {
  const rec =
    stock?.recommendation && typeof stock.recommendation === "object"
      ? stock.recommendation
      : {};

  const rawLabel =
    rec?.displayLabel ??
    rec?.label ??
    rec?.recommendation ??
    rec?.tradeAction ??
    stock?.displayLabel ??
    stock?.label ??
    stock?.tradeAction ??
    stock?.action ??
    stock?.rating ??
    (typeof stock?.recommendation === "string" ? stock.recommendation : "");

  return normalizeActionLabel(rawLabel);
}

function forceRecommendationObject(stock = {}, action) {
  const existing =
    stock?.recommendation && typeof stock.recommendation === "object"
      ? stock.recommendation
      : {};

  return {
    ...existing,
    label: action,
    displayLabel: action,
    recommendation: action,
    tradeAction: action,
  };
}

function getPriceLike(stock = {}) {
  return toPositiveNumber(
    stock.price ?? stock.currentPrice ?? stock.lastPrice ?? stock.close ?? stock.quote?.price
  );
}

function normalizeSingleSymbolRow(rawStock = {}, requestedSymbol = "") {
  const symbol = normalizeSymbol(rawStock.symbol || rawStock.ticker || requestedSymbol);
  const price = getPriceLike(rawStock);
  const previousClose = toPositiveNumber(rawStock.previousClose ?? rawStock.quote?.previousClose);
  const change = toNumber(
    rawStock.change ??
      rawStock.dayChange ??
      rawStock.priceChange ??
      rawStock.regularMarketChange ??
      rawStock.quote?.change
  );

  let dayChangePct = toNumber(
    rawStock.dayChangePct ??
      rawStock.changesPercentage ??
      rawStock.changePercent ??
      rawStock.percentChange ??
      rawStock.quote?.changesPercentage ??
      rawStock.quote?.changePercent
  );

  if (dayChangePct == null && price != null && previousClose) {
    dayChangePct = ((price - previousClose) / previousClose) * 100;
  }

  if (dayChangePct == null && change != null && previousClose) {
    dayChangePct = (change / previousClose) * 100;
  }

  const action = extractSingleSymbolAction(rawStock);
  const recommendation = forceRecommendationObject(rawStock, action);
  const technicalSnapshot =
    rawStock.technicalSnapshot && typeof rawStock.technicalSnapshot === "object"
      ? rawStock.technicalSnapshot
      : {};

  const fundamentalSnapshot =
    rawStock.fundamentalSnapshot && typeof rawStock.fundamentalSnapshot === "object"
      ? rawStock.fundamentalSnapshot
      : {};

  const score = safeScore(
    recommendation.score ??
      rawStock.score ??
      rawStock.compositeScore ??
      rawStock.overallScore ??
      rawStock.heatScore
  );

  const triggerScore = safeScore(
    recommendation.triggerScore ?? rawStock.triggerScore ?? technicalSnapshot.triggerScore
  );
  const momentumScore = safeScore(
    recommendation.momentumScore ?? rawStock.momentumScore ?? technicalSnapshot.momentumScore
  );
  const expectationRisk = safeScore(
    recommendation.expectationRisk ??
      recommendation.riskScore ??
      rawStock.expectationRisk ??
      rawStock.riskScore ??
      technicalSnapshot.expectationRisk ??
      technicalSnapshot.riskScore
  );
  const extensionRisk = safeScore(
    recommendation.extensionRisk ?? rawStock.extensionRisk ?? technicalSnapshot.extensionRisk
  );
  const freshBreakoutScore = safeScore(
    recommendation.freshBreakoutScore ??
      rawStock.freshBreakoutScore ??
      technicalSnapshot.freshBreakoutScore
  );

  const row = {
    ...rawStock,
    symbol,
    ticker: symbol,
    name: rawStock.name || rawStock.companyName || rawStock.company || symbol,
    companyName: rawStock.companyName || rawStock.name || rawStock.company || symbol,
    price,
    currentPrice: price,
    lastPrice: price,
    close: price,
    previousClose,
    change,
    dayChangePct,
    changesPercentage: dayChangePct,
    changePercent: dayChangePct,
    marketCap: toPositiveNumber(rawStock.marketCap ?? rawStock.mktCap ?? rawStock.marketCapitalization),
    volume: toPositiveNumber(rawStock.volume ?? rawStock.vol),
    avgVolume: toPositiveNumber(
      rawStock.avgVolume ?? rawStock.averageVolume ?? rawStock.avgVolume10Day ?? rawStock.averageVolume10Day
    ),
    priceAvg50: toPositiveNumber(
      rawStock.priceAvg50 ?? rawStock.fiftyDayAverage ?? rawStock.sma50 ?? rawStock.ma50
    ),
    fiftyDayAverage: toPositiveNumber(
      rawStock.fiftyDayAverage ?? rawStock.priceAvg50 ?? rawStock.sma50 ?? rawStock.ma50
    ),
    priceAvg200: toPositiveNumber(
      rawStock.priceAvg200 ?? rawStock.twoHundredDayAverage ?? rawStock.sma200 ?? rawStock.ma200
    ),
    twoHundredDayAverage: toPositiveNumber(
      rawStock.twoHundredDayAverage ?? rawStock.priceAvg200 ?? rawStock.sma200 ?? rawStock.ma200
    ),
    yearHigh: toPositiveNumber(
      rawStock.yearHigh ?? rawStock.high52 ?? rawStock.fiftyTwoWeekHigh ?? rawStock["52WeekHigh"]
    ),
    yearLow: toPositiveNumber(
      rawStock.yearLow ?? rawStock.low52 ?? rawStock.fiftyTwoWeekLow ?? rawStock["52WeekLow"]
    ),
    eps: toNumber(rawStock.eps),
    pe: toNumber(rawStock.pe ?? rawStock.peRatio),
    beta: toNumber(rawStock.beta, null),
    exchange: rawStock.exchange || rawStock.exchangeShortName || "",
    score,
    compositeScore: score,
    recommendation,
    tradeReadiness: rawStock.tradeReadiness || null,
    technicalSnapshot,
    fundamentalSnapshot,
    triggerScore,
    momentumScore,
    expectationRisk,
    extensionRisk,
    lateChaseRisk: safeScore(recommendation.lateChaseRisk ?? rawStock.lateChaseRisk),
    freshBreakoutScore,
    context: recommendation.context ?? rawStock.context,
    dominantReason:
      recommendation.dominantReason ??
      rawStock.dominantReason ??
      rawStock.reason ??
      recommendation.reason,
    reason: recommendation.reason ?? rawStock.reason,
    actionWhy: recommendation.reason ?? rawStock.actionWhy ?? rawStock.reason,
    entryNote: recommendation.entryNote ?? rawStock.entryNote,
    triggerNeeded: recommendation.entryNote ?? rawStock.triggerNeeded ?? rawStock.entryNote,
    singleSymbolAction: action,
    decisionEngine: "single-symbol-api-required",
  };

  return {
    ...row,
    institutionalRank: rankScore(row),
  };
}

function actionRank(stock = {}) {
  const action = extractSingleSymbolAction(stock);

  if (action === "Buy") return 3;
  if (action === "Starter") return 2;
  if (action === "Watch") return 1;
  return 0;
}

function rankScore(stock = {}) {
  const rec = stock.recommendation || {};
  const actionPoints = actionRank(stock) * 1000000;
  const score = safeScore(rec.score ?? stock.score);
  const actionabilityScore = safeScore(rec.actionabilityScore);
  const institutionalScore = safeScore(rec.institutionalScore);
  const triggerScore = safeScore(rec.triggerScore ?? stock.triggerScore);
  const momentumScore = safeScore(rec.momentumScore ?? stock.momentumScore);
  const freshBreakoutScore = safeScore(rec.freshBreakoutScore ?? stock.freshBreakoutScore);
  const riskScore = safeScore(
    rec.expectationRisk ?? rec.riskScore ?? stock.expectationRisk ?? stock.riskScore
  );
  const extensionRisk = safeScore(rec.extensionRisk ?? stock.extensionRisk);

  return (
    actionPoints +
    score * 1000 +
    actionabilityScore * 40 +
    institutionalScore * 30 +
    triggerScore * 25 +
    momentumScore * 20 +
    freshBreakoutScore * 10 -
    riskScore * 8 -
    extensionRisk * 6
  );
}

function sortTopIdeas(a, b) {
  const actionDiff = actionRank(b) - actionRank(a);
  if (actionDiff !== 0) return actionDiff;

  const rankDiff = safeScore(b.institutionalRank) - safeScore(a.institutionalRank);
  if (rankDiff !== 0) return rankDiff;

  const triggerDiff = safeScore(b.triggerScore) - safeScore(a.triggerScore);
  if (triggerDiff !== 0) return triggerDiff;

  const momentumDiff = safeScore(b.momentumScore) - safeScore(a.momentumScore);
  if (momentumDiff !== 0) return momentumDiff;

  return safeScore(b.score) - safeScore(a.score);
}

function bucketRows(rows = []) {
  const sorted = [...rows].sort(sortTopIdeas);
  const byAction = (label) =>
    sorted.filter((stock) => extractSingleSymbolAction(stock) === label).sort(sortTopIdeas);

  const selected = [
    ...byAction("Buy"),
    ...byAction("Starter"),
    ...byAction("Watch").slice(0, 12),
    ...byAction("Avoid").slice(0, 8),
  ];

  const seen = new Set();
  const unique = [];

  for (const stock of selected) {
    const symbol = normalizeSymbol(stock.symbol);
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    unique.push(stock);
  }

  return unique.slice(0, 75);
}


function createCaptureResponse(symbol) {
  const capture = {
    statusCode: 200,
    body: null,
    headers: {},
    ended: false,
  };

  const res = {
    setHeader(name, value) {
      capture.headers[String(name).toLowerCase()] = value;
      return res;
    },
    status(code) {
      capture.statusCode = Number(code) || 200;
      return res;
    },
    json(payload) {
      capture.body = payload;
      capture.ended = true;
      return res;
    },
    send(payload) {
      capture.body = payload;
      capture.ended = true;
      return res;
    },
    end(payload) {
      if (payload !== undefined && capture.body == null) capture.body = payload;
      capture.ended = true;
      return res;
    },
  };

  return { capture, res };
}

async function runSingleSymbolHandlerDirect(req, symbol) {
  const cleanSymbol = normalizeSymbol(symbol);
  if (!cleanSymbol) throw new Error("Missing symbol for single-symbol engine.");

  const { capture, res } = createCaptureResponse(cleanSymbol);

  const mockReq = {
    ...req,
    method: "GET",
    query: {
      ...(req?.query || {}),
      symbol: cleanSymbol,
      source: "top5-direct-single-symbol",
    },
    headers: {
      ...(req?.headers || {}),
      "x-screener-internal": "top5-direct-single-symbol-required-v12",
    },
  };

  await singleSymbolHandler(mockReq, res);

  if (capture.statusCode >= 400) {
    const detail =
      typeof capture.body === "object"
        ? capture.body?.detail || capture.body?.error || JSON.stringify(capture.body).slice(0, 180)
        : String(capture.body || "").slice(0, 180);
    throw new Error(
      `${cleanSymbol}: direct single-symbol engine failed with HTTP ${capture.statusCode}${
        detail ? ` - ${detail}` : ""
      }`
    );
  }

  const data = capture.body;
  const stock = data?.stock || data?.result || data?.data || data;

  if (!stock || typeof stock !== "object") {
    throw new Error(`${cleanSymbol}: direct single-symbol engine returned no stock object.`);
  }

  const row = normalizeSingleSymbolRow(stock, cleanSymbol);

  if (!row.symbol || row.price == null || !Number.isFinite(Number(row.price))) {
    throw new Error(`${cleanSymbol}: direct single-symbol engine returned an unusable price.`);
  }

  return {
    ...row,
    decisionEngine: "direct-single-symbol-handler-required-v12",
  };
}

async function mapWithConcurrency(items = [], concurrency = 5, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;

      try {
        results[index] = { ok: true, value: await mapper(items[index], index) };
      } catch (error) {
        results[index] = {
          ok: false,
          symbol: items[index],
          error: error?.message || String(error),
        };
      }
    }
  }

  const workerCount = Math.min(concurrency, Math.max(items.length, 1));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export default async function handler(req, res) {
  try {
    res.setHeader("Cache-Control", "no-store, max-age=0");

    const themeKey = String(req.query.theme || "broad").toLowerCase();
    const selectedTheme = getThemeConfig(themeKey);
    const symbols = uniqueSymbols(selectedTheme.symbols);

    if (!symbols.length) {
      return res.status(502).json({
        error: "Quote refresh returned no usable stocks.",
        detail: "The selected theme has no symbols configured.",
      });
    }

    const results = await mapWithConcurrency(symbols, 5, (symbol) =>
      runSingleSymbolHandlerDirect(req, symbol)
    );

    const rows = results.filter((r) => r.ok).map((r) => r.value);
    const failures = results.filter((r) => !r.ok);

    // Do not silently fall back to a different broad-screener decision engine.
    // If this fails, it should fail loudly instead of showing ANET as Starter Only
    // while the single-symbol checker says Breakout Buy.
    if (!rows.length) {
      return res.status(502).json({
        error: "Broad screener could not use the single-symbol decision engine.",
        detail:
          failures[0]?.error ||
          "No rows came back from /api?symbol. Showing stale or quote-only labels would be misleading.",
        failures: failures.slice(0, 12),
      });
    }

    const stocks = bucketRows(rows);

    const countByAction = (label) =>
      rows.filter((stock) => extractSingleSymbolAction(stock) === label).length;

    return res.status(200).json({
      selectedTheme,
      count: stocks.length,
      stocks,
      meta: {
        mode: "direct_single_symbol_handler_required_v12_four_decisions",
        dataPath: "direct pages/api/index.js handler",
        decisionSource: "pages/api/index.js handler invoked directly",
        fallbackUsed: false,
        directHandlerImport: true,
        requestedSymbols: symbols.length,
        analyzedSymbols: rows.length,
        failedSymbols: failures.length,
        buyCount: countByAction("Buy"),
        starterCount: countByAction("Starter"),
        watchCount: countByAction("Watch"),
        avoidCount: countByAction("Avoid"),
        failures: failures.slice(0, 8),
      },
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to load top ideas.",
      detail: error?.message || String(error),
    });
  }
}

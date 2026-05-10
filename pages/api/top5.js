// pages/api/top5.js

import { buildRawListedUniverse } from "../../src/lib/universe";
import { applyLiquidityFilter } from "../../src/lib/liquidity-filter";

import {
  passesInstitutionalFilter,
  calcFundamentalScore,
  calcTechnicalScore,
  calcMomentumScore,
  calcRelativeStrengthScore,
  calcAsymmetryScore,
  calcTriggerScore,
  calcExpectationRisk,
  compositeScore,
  getRecommendation,
  getStage,
  getThemeMaturity,
  getSetupGrade,
  buildTechnicalSnapshot,
  buildFundamentalSnapshot,
} from "../../lib/scoring";

function normalizeSymbol(symbol) {
  return String(symbol || "").replace("-", ".").toUpperCase();
}

function toFmpSymbol(symbol) {
  return String(symbol || "").replace(".", "-").toUpperCase();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const THEMES = {
  broad: {
    name: "Broad Market",
    description: "Full broad-market screen using your standard asymmetric setup rules.",
    symbols: [],
  },
  btc: {
    name: "BTC / Digital Assets",
    description: "BTC, digital collateral, custody, exchanges, miners, and crypto infrastructure.",
    symbols: [
      "MSTR", "COIN", "HOOD", "MARA", "RIOT", "CLSK", "HUT", "BTDR", "IREN",
      "WULF", "BITF", "CIFR",
    ],
  },
  ai_power: {
    name: "AI Power & Energy",
    description: "Electricity demand, power systems, grid, datacenter energy, and industrial electrification.",
    symbols: [
      "ETN", "PWR", "NVT", "HUBB", "GEV", "VRT", "CEG", "VST", "NRG",
      "KMI", "WMB", "TRGP", "LNG",
    ],
  },
  cooling_water: {
    name: "Cooling & Water",
    description: "Datacenter cooling, liquid cooling, thermal management, water systems, and flow control.",
    symbols: [
      "CARR", "XYL", "ECL", "FLS", "MOD", "TT", "JCI", "WTS", "AOS",
    ],
  },
  nuclear: {
    name: "Nuclear / Baseload",
    description: "Uranium, nuclear generation, SMRs, and stable baseload power for AI demand.",
    symbols: [
      "CCJ", "CEG", "OKLO", "SMR", "BWXT", "LEU", "UEC", "UUUU",
    ],
  },
  quantum: {
    name: "Quantum Computing",
    description: "Early-stage quantum compute and next-generation processing.",
    symbols: [
      "IONQ", "QBTS", "RGTI", "ARQQ", "QUBT",
    ],
  },
  ai_infra: {
    name: "AI Infrastructure",
    description: "Networking, optics, memory, packaging, and AI compute infrastructure.",
    symbols: [
      "MRVL", "MU", "COHR", "LITE", "AMKR", "FORM", "AEIS", "AAOI", "CIEN",
      "SMCI", "ARM", "AMD", "AVGO",
    ],
  },
};

const SEED_SYMBOLS = [
  "AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "TSLA", "AVGO", "AMD", "NFLX",
  "COIN", "HOOD", "MSTR", "MARA", "RIOT", "CLSK", "HIMS", "SOFI", "PLTR", "SOUN",
  "BBAI", "BGC", "BCRX", "FLYW", "CROX", "CELH", "UPST", "AFRM", "RKT", "DKNG",
  "SHOP", "NET", "CRWD", "DDOG", "SNOW", "ROKU", "UBER", "LYFT", "SQ", "PYPL",
  "SCHW", "JPM", "BAC", "C", "WFC", "GS", "MS", "BX", "KKR", "APO",
  "AAOI", "AAL", "UAL", "DAL", "RCL", "CCL", "NCLH", "SMCI", "MU", "ARM",
  ...Object.values(THEMES).flatMap((theme) => theme.symbols),
];

function prioritizeUniverse(fullUniverse, themeKey = "broad") {
  const selectedTheme = THEMES[themeKey] || THEMES.broad;

  if (themeKey !== "broad" && selectedTheme.symbols?.length) {
    return [...new Set(selectedTheme.symbols.map(normalizeSymbol))].map((symbol) => ({ symbol }));
  }

  const raw = fullUniverse
    .filter((x) => x.symbol)
    .map((x) => normalizeSymbol(x.symbol))
    .filter((s) => s.length <= 5)
    .filter((s) => !s.includes("."))
    .filter((s) => !s.includes("-"));

  const combined = [...new Set([...SEED_SYMBOLS, ...raw])];

  return combined.slice(0, 300).map((symbol) => ({ symbol }));
}

async function fetchSingleQuote(symbol, apiKey) {
  const clean = toFmpSymbol(symbol);
  const url = `https://financialmodelingprep.com/stable/quote?symbol=${clean}&apikey=${apiKey}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      const text = await response.text();
      console.error("FMP single quote failed", response.status, clean, text);
      return null;
    }

    const data = await response.json();
    const q = Array.isArray(data) ? data[0] : data;

    if (!q?.symbol || q.price == null) {
      return null;
    }

    return {
      symbol: normalizeSymbol(q.symbol),
      name: q.name || q.symbol,
      price: q.price ?? null,
      dayChangePct:
        q.changesPercentage ??
        q.changePercentage ??
        q.changePercent ??
        null,
      change: q.change ?? null,
      volume: q.volume ?? null,
      avgVolume: q.avgVolume ?? q.volume ?? null,
      marketCap: q.marketCap ?? null,
      priceAvg50: q.priceAvg50 ?? q.priceAvg50d ?? null,
      priceAvg200: q.priceAvg200 ?? q.priceAvg200d ?? null,
      yearHigh: q.yearHigh ?? q.yearHighPrice ?? null,
      yearLow: q.yearLow ?? q.yearLowPrice ?? null,
      eps: q.eps ?? null,
      pe: q.pe ?? q.peRatio ?? null,
    };
  } catch (err) {
    console.error("FMP quote fetch error", clean, err);
    return null;
  }
}

async function fetchQuotes(symbols) {
  const apiKey = process.env.FMP_API_KEY;

  if (!apiKey) {
    throw new Error("Missing FMP_API_KEY.");
  }

  const results = [];

  for (const symbol of symbols) {
    const quote = await fetchSingleQuote(symbol, apiKey);

    if (quote) {
      results.push(quote);
    }

    await sleep(50);
  }

  return results;
}

function attachMarketRelativeData(row, market) {
  return {
    ...row,
    spyDayChangePct: market?.SPY?.dayChangePct ?? null,
    qqqDayChangePct: market?.QQQ?.dayChangePct ?? null,
  };
}

function scoreRow(base) {
  const fundamentalScore = calcFundamentalScore(base);
  const technicalScore = calcTechnicalScore(base);
  const momentumScore = calcMomentumScore(base);
  const relativeStrengthScore = calcRelativeStrengthScore(base);
  const asymmetryScore = calcAsymmetryScore(base);
  const triggerScore = calcTriggerScore(base);
  const expectationRisk = calcExpectationRisk(base);
  const score = compositeScore(base);
  const recommendation = getRecommendation(base);
  const themeMaturity = getThemeMaturity(base);
  const setupGrade = getSetupGrade(base);

  return {
    ...base,
    fundamentalScore,
    technicalScore,
    momentumScore,
    relativeStrengthScore,
    asymmetryScore,
    triggerScore,
    expectationRisk,
    score,
    recommendation,
    themeMaturity,
    setupGrade,
    stage: getStage(base),
    technicalSnapshot: buildTechnicalSnapshot(base),
    fundamentalSnapshot: buildFundamentalSnapshot(base),
  };
}

function sortScored(scored) {
  const actionRank = {
    "BUY NOW": 4,
    "WATCH FOR ENTRY": 3,
    WATCH: 2,
    AVOID: 1,
  };

  const setupRank = {
    A: 4,
    B: 3,
    "B-": 2,
    C: 1,
  };

  scored.sort((a, b) => {
    return (
      (actionRank[b.recommendation?.label] || 0) -
        (actionRank[a.recommendation?.label] || 0) ||
      (setupRank[b.setupGrade] || 0) - (setupRank[a.setupGrade] || 0) ||
      (b.triggerScore ?? 0) - (a.triggerScore ?? 0) ||
      (b.relativeStrengthScore ?? 0) - (a.relativeStrengthScore ?? 0) ||
      (b.momentumScore ?? 0) - (a.momentumScore ?? 0) ||
      (a.expectationRisk ?? 100) - (b.expectationRisk ?? 100) ||
      (b.score ?? 0) - (a.score ?? 0)
    );
  });

  return scored;
}

export default async function handler(req, res) {
  try {
    const themeKey = String(req.query.theme || "broad").toLowerCase();
    const selectedTheme = THEMES[themeKey] || THEMES.broad;

    const fullUniverse = await buildRawListedUniverse();
    const prioritizedUniverse = prioritizeUniverse(fullUniverse, themeKey);

    const symbols = prioritizedUniverse.map((x) => x.symbol);
    const allSymbols = [...new Set(["SPY", "QQQ", ...symbols])];

    const quotes = await fetchQuotes(allSymbols);

    if (!quotes.length) {
      throw new Error("No quotes returned from FMP.");
    }

    const quoteMap = new Map();
    quotes.forEach((q) => quoteMap.set(q.symbol, q));

    const market = {
      SPY: quoteMap.get("SPY"),
      QQQ: quoteMap.get("QQQ"),
    };

    const tradableQuotes = quotes.filter(
      (q) => q.symbol !== "SPY" && q.symbol !== "QQQ"
    );

    const liquidityMinimums =
      themeKey === "quantum"
        ? {
            minPrice: 3,
            minMarketCap: 150000000,
            minAvgVolume: 300000,
          }
        : {
            minPrice: 5,
            minMarketCap: 300000000,
            minAvgVolume: 500000,
          };

    const tradable = applyLiquidityFilter(prioritizedUniverse, tradableQuotes, liquidityMinimums);

    const scored = tradable
      .map((row) => {
        const quote = quoteMap.get(normalizeSymbol(row.symbol)) || {};

        const base = attachMarketRelativeData(
          {
            ...row,
            ...quote,
            symbol: normalizeSymbol(row.symbol),
            name: quote.name || row.name || row.symbol,
            themeKey,
            themeName: selectedTheme.name,
          },
          market
        );

        if (!passesInstitutionalFilter(base) && themeKey !== "quantum") return null;

        return scoreRow(base);
      })
      .filter(Boolean);

    sortScored(scored);

    const topIdeas = scored.slice(0, themeKey === "broad" ? 150 : 50);

    return res.status(200).json({
      stocks: topIdeas,
      themes: THEMES,
      selectedTheme: {
        key: themeKey,
        ...selectedTheme,
      },
      meta: {
        totalUniverse: fullUniverse.length,
        prioritizedUniverse: prioritizedUniverse.length,
        quotes: quotes.length,
        spyChange: market?.SPY?.dayChangePct ?? null,
        qqqChange: market?.QQQ?.dayChangePct ?? null,
        scored: scored.length,
        finalResults: topIdeas.length,
        themeKey,
        themeName: selectedTheme.name,
      },
    });
  } catch (err) {
    console.error("top5 error:", err);

    return res.status(500).json({
      error: err.message || "Failed to build screener.",
    });
  }
}

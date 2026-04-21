function hashString(str) {
  let hash = 0;

  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }

  return hash;
}

function seededBetween(seed, min, max) {
  const x = Math.sin(seed) * 10000;
  const frac = x - Math.floor(x);
  return min + frac * (max - min);
}

const BUCKET_PROFILES = {
  value: {
    price: [8, 60],
    dayChangePct: [-1.5, 1.8],
    oneMonthPct: [2, 12],
    threeMonthPct: [6, 22],
    vs50dPct: [1, 8],
    relativeVolume: [0.85, 1.2],
    volatility: [1.8, 3.5],
    revenueGrowthPct: [2, 14],
    epsGrowthPct: [5, 20],
    operatingMarginPct: [8, 28],
    debtToEquity: [0.2, 1.3],
    valuationScore: [68, 90],
    sentimentScoreRaw: [45, 65],
  },
  quality: {
    price: [40, 250],
    dayChangePct: [-1.2, 1.8],
    oneMonthPct: [4, 14],
    threeMonthPct: [8, 24],
    vs50dPct: [2, 10],
    relativeVolume: [0.9, 1.2],
    volatility: [1.6, 3.0],
    revenueGrowthPct: [5, 20],
    epsGrowthPct: [8, 28],
    operatingMarginPct: [14, 38],
    debtToEquity: [0.05, 1.2],
    valuationScore: [40, 78],
    sentimentScoreRaw: [50, 72],
  },
  growth: {
    price: [18, 180],
    dayChangePct: [-1.8, 2.3],
    oneMonthPct: [6, 18],
    threeMonthPct: [12, 32],
    vs50dPct: [3, 12],
    relativeVolume: [0.95, 1.35],
    volatility: [2.4, 4.8],
    revenueGrowthPct: [12, 35],
    epsGrowthPct: [15, 45],
    operatingMarginPct: [6, 24],
    debtToEquity: [0.02, 0.9],
    valuationScore: [28, 64],
    sentimentScoreRaw: [56, 80],
  },
  sub25: {
    price: [3, 24.8],
    dayChangePct: [-2.4, 2.8],
    oneMonthPct: [4, 20],
    threeMonthPct: [8, 36],
    vs50dPct: [2, 13],
    relativeVolume: [0.9, 1.5],
    volatility: [2.8, 6.4],
    revenueGrowthPct: [4, 26],
    epsGrowthPct: [-8, 28],
    operatingMarginPct: [-6, 18],
    debtToEquity: [0.02, 1.8],
    valuationScore: [35, 86],
    sentimentScoreRaw: [48, 80],
  },
  cyclical: {
    price: [12, 220],
    dayChangePct: [-1.6, 1.9],
    oneMonthPct: [3, 13],
    threeMonthPct: [7, 24],
    vs50dPct: [1, 9],
    relativeVolume: [0.85, 1.25],
    volatility: [2.0, 4.2],
    revenueGrowthPct: [3, 18],
    epsGrowthPct: [6, 26],
    operatingMarginPct: [6, 22],
    debtToEquity: [0.08, 1.2],
    valuationScore: [50, 84],
    sentimentScoreRaw: [45, 68],
  },
  financial: {
    price: [10, 120],
    dayChangePct: [-1.3, 1.6],
    oneMonthPct: [2, 12],
    threeMonthPct: [5, 20],
    vs50dPct: [1, 7],
    relativeVolume: [0.85, 1.18],
    volatility: [1.6, 3.8],
    revenueGrowthPct: [2, 16],
    epsGrowthPct: [4, 24],
    operatingMarginPct: [5, 32],
    debtToEquity: [0.05, 1.6],
    valuationScore: [42, 82],
    sentimentScoreRaw: [45, 68],
  },
  event: {
    price: [4, 1800],
    dayChangePct: [-2.8, 3.2],
    oneMonthPct: [6, 22],
    threeMonthPct: [12, 42],
    vs50dPct: [3, 15],
    relativeVolume: [1.0, 1.65],
    volatility: [3.8, 7.0],
    revenueGrowthPct: [2, 22],
    epsGrowthPct: [-10, 30],
    operatingMarginPct: [-8, 16],
    debtToEquity: [0.02, 1.2],
    valuationScore: [20, 58],
    sentimentScoreRaw: [60, 88],
  },
};

function buildMetric(seedBase, profile, key, decimals = 2) {
  const [min, max] = profile[key];
  const value = seededBetween(seedBase, min, max);
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

export function buildStockFromBase(base) {
  const profile = BUCKET_PROFILES[base.bucket] || BUCKET_PROFILES.value;
  const seed = hashString(`${base.symbol}-${base.bucket}`);

  return {
    symbol: base.symbol,
    name: base.name || base.symbol,
    price: buildMetric(seed + 1, profile, "price"),
    dayChangePct: buildMetric(seed + 2, profile, "dayChangePct"),
    oneMonthPct: buildMetric(seed + 3, profile, "oneMonthPct"),
    threeMonthPct: buildMetric(seed + 4, profile, "threeMonthPct"),
    vs50dPct: buildMetric(seed + 5, profile, "vs50dPct"),
    relativeVolume: buildMetric(seed + 6, profile, "relativeVolume"),
    volatility: buildMetric(seed + 7, profile, "volatility"),
    revenueGrowthPct: buildMetric(seed + 8, profile, "revenueGrowthPct"),
    epsGrowthPct: buildMetric(seed + 9, profile, "epsGrowthPct"),
    operatingMarginPct: buildMetric(seed + 10, profile, "operatingMarginPct"),
    debtToEquity: buildMetric(seed + 11, profile, "debtToEquity"),
    valuationScore: Math.round(
      buildMetric(seed + 12, profile, "valuationScore", 0)
    ),
    sentimentScoreRaw: Math.round(
      buildMetric(seed + 13, profile, "sentimentScoreRaw", 0)
    ),
  };
}

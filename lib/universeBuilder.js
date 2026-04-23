function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function seeded(base, min, max, offset = 0) {
  const h = (hashCode(base) + offset) % 1000;
  const pct = h / 999;
  return min + (max - min) * pct;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function inferThemeTags(symbol, name = "", bucket = "") {
  const s = symbol.toUpperCase();
  const n = name.toLowerCase();
  const b = bucket.toLowerCase();
  const tags = [];

  if (
    ["AI", "SOUN", "BBAI", "PLTR", "PATH", "NET", "SNOW", "MDB", "CFLT", "ESTC"].includes(s) ||
    n.includes("ai") ||
    b === "ai_crypto"
  ) {
    tags.push("ai");
  }

  if (
    ["MSTR", "RIOT", "MARA", "CLSK", "HUT", "BTBT", "CORZ", "CIFR", "IREN", "CAN", "BITF", "ARBK", "WULF", "COIN"].includes(s)
  ) {
    tags.push("bitcoin", "crypto", "miner");
  }

  if (
    ["ASTS", "RKLB", "JOBY", "ACHR", "LILM", "BKSY", "SPIR", "SATS"].includes(s) ||
    n.includes("space") ||
    n.includes("satellite")
  ) {
    tags.push("space", "satellite");
  }

  if (n.includes("defense") || n.includes("aerospace")) {
    tags.push("defense");
  }

  return tags;
}

function inferBucketProfile(bucket = "") {
  const b = bucket.toLowerCase();

  if (b === "ai_crypto") {
    return {
      marketCapMin: 2e9,
      marketCapMax: 80e9,
      revMin: 8,
      revMax: 38,
      epsMin: 2,
      epsMax: 32,
      marginMin: -5,
      marginMax: 24,
      volMin: 1.05,
      volMax: 2.2,
      oneMonthMin: 2,
      oneMonthMax: 22,
      threeMonthMin: 6,
      threeMonthMax: 40,
      debtMin: 0.1,
      debtMax: 1.3,
    };
  }

  if (b === "space_quantum" || b === "event" || b === "sub25") {
    return {
      marketCapMin: 5e8,
      marketCapMax: 15e9,
      revMin: -5,
      revMax: 28,
      epsMin: -8,
      epsMax: 24,
      marginMin: -12,
      marginMax: 18,
      volMin: 1.0,
      volMax: 2.0,
      oneMonthMin: 0,
      oneMonthMax: 20,
      threeMonthMin: 0,
      threeMonthMax: 36,
      debtMin: 0.1,
      debtMax: 1.8,
    };
  }

  if (b === "growth") {
    return {
      marketCapMin: 2e9,
      marketCapMax: 90e9,
      revMin: 5,
      revMax: 35,
      epsMin: 0,
      epsMax: 30,
      marginMin: -2,
      marginMax: 26,
      volMin: 1.0,
      volMax: 1.9,
      oneMonthMin: 1,
      oneMonthMax: 18,
      threeMonthMin: 5,
      threeMonthMax: 30,
      debtMin: 0.1,
      debtMax: 1.5,
    };
  }

  if (b === "quality") {
    return {
      marketCapMin: 15e9,
      marketCapMax: 300e9,
      revMin: 4,
      revMax: 22,
      epsMin: 4,
      epsMax: 24,
      marginMin: 10,
      marginMax: 34,
      volMin: 0.9,
      volMax: 1.5,
      oneMonthMin: -2,
      oneMonthMax: 12,
      threeMonthMin: 0,
      threeMonthMax: 24,
      debtMin: 0.05,
      debtMax: 1.0,
    };
  }

  return {
    marketCapMin: 2e9,
    marketCapMax: 120e9,
    revMin: 0,
    revMax: 20,
    epsMin: 0,
    epsMax: 20,
    marginMin: 3,
    marginMax: 24,
    volMin: 0.9,
    volMax: 1.6,
    oneMonthMin: -2,
    oneMonthMax: 12,
    threeMonthMin: 0,
    threeMonthMax: 20,
    debtMin: 0.1,
    debtMax: 1.6,
  };
}

function buildSyntheticPrice(symbol, bucket) {
  const b = (bucket || "").toLowerCase();

  if (b === "sub25" || b === "event" || b === "space_quantum") {
    return round(seeded(symbol, 2.5, 24.5, 11), 2);
  }

  if (b === "ai_crypto") {
    return round(seeded(symbol, 3.0, 35.0, 17), 2);
  }

  return round(seeded(symbol, 8.0, 180.0, 23), 2);
}

export function buildStockFromBase(base) {
  const symbol = base.symbol;
  const name = base.name || base.symbol;
  const bucket = base.bucket || "other";
  const profile = inferBucketProfile(bucket);

  const price = buildSyntheticPrice(symbol, bucket);
  const dayChangePct = round(seeded(symbol, -2.4, 2.4, 31), 2);

  const oneMonthPct = round(seeded(symbol, profile.oneMonthMin, profile.oneMonthMax, 41), 1);
  const threeMonthPct = round(seeded(symbol, profile.threeMonthMin, profile.threeMonthMax, 51), 1);
  const revenueGrowthPct = round(seeded(symbol, profile.revMin, profile.revMax, 61), 1);
  const epsGrowthPct = round(seeded(symbol, profile.epsMin, profile.epsMax, 71), 1);
  const operatingMarginPct = round(seeded(symbol, profile.marginMin, profile.marginMax, 81), 1);
  const debtToEquity = round(seeded(symbol, profile.debtMin, profile.debtMax, 91), 2);
  const relativeVolume = round(seeded(symbol, profile.volMin, profile.volMax, 101), 2);
  const marketCap = Math.round(seeded(symbol, profile.marketCapMin, profile.marketCapMax, 111));
  const institutionalScore = Math.round(seeded(symbol, 38, 86, 121));
  const volatility = round(seeded(symbol, 2.8, 8.8, 131), 2);

  const sma20 = round(price * seeded(symbol, 0.96, 1.04, 141), 2);
  const sma50 = round(price * seeded(symbol, 0.92, 1.06, 151), 2);
  const sma200 = round(price * seeded(symbol, 0.85, 1.10, 161), 2);

  const rsi14 = round(seeded(symbol, 38, 68, 171), 1);
  const macd = round(seeded(symbol, -1.8, 2.4, 181), 2);
  const macdSignal = round(seeded(symbol, -1.5, 2.0, 191), 2);

  return {
    symbol,
    name,
    bucket,

    price,
    dayChangePct,
    oneMonthPct,
    threeMonthPct,

    revenueGrowthPct,
    epsGrowthPct,
    operatingMarginPct,
    debtToEquity,

    relativeVolume,
    relativeVolume20d: relativeVolume,
    volatility,
    atrPct: volatility,

    sma20,
    sma50,
    sma200,
    rsi14,
    macd,
    macdSignal,

    marketCap,
    institutionalScore,
    institutionalOwnershipPct: institutionalScore,

    themeTags: inferThemeTags(symbol, name, bucket),
  };
}

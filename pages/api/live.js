function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function scoreLinear(value, low, high) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  if (high === low) return 50;
  const raw = ((value - low) / (high - low)) * 100;
  return clamp(raw, 0, 100);
}

function average(values) {
  const valid = values.filter((v) => Number.isFinite(v));
  if (!valid.length) return null;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

function stdDev(values) {
  const valid = values.filter((v) => Number.isFinite(v));
  if (valid.length < 2) return null;
  const avg = average(valid);
  const variance =
    valid.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / valid.length;
  return Math.sqrt(variance);
}

function getReturnPct(closes, lookback) {
  if (!Array.isArray(closes) || closes.length <= lookback) return null;

  const current = closes[0];
  const prior = closes[lookback];

  if (!Number.isFinite(current) || !Number.isFinite(prior) || prior === 0) {
    return null;
  }

  return ((current / prior) - 1) * 100;
}

function getSma(closes, length) {
  if (!Array.isArray(closes) || closes.length < length) return null;
  return average(closes.slice(0, length));
}

function buildTechnicals({
  price,
  previousClose,
  currentVolume,
  closes,
  volumes,
}) {
  const oneDayPct =
    Number.isFinite(price) &&
    Number.isFinite(previousClose) &&
    previousClose !== 0
      ? ((price / previousClose) - 1) * 100
      : getReturnPct(closes, 1);

  const oneMonthPct = getReturnPct(closes, 21);
  const threeMonthPct = getReturnPct(closes, 63);

  const sma20 = getSma(closes, 20);
  const vsSma20Pct =
    Number.isFinite(price) && Number.isFinite(sma20) && sma20 !== 0
      ? ((price / sma20) - 1) * 100
      : null;

  const dailyReturns = [];
  for (let i = 0; i < Math.min(closes.length - 1, 20); i += 1) {
    const current = closes[i];
    const prior = closes[i + 1];
    if (Number.isFinite(current) && Number.isFinite(prior) && prior !== 0) {
      dailyReturns.push((current / prior) - 1);
    }
  }

  const volatility20 =
    dailyReturns.length >= 5 ? stdDev(dailyReturns) * 100 : null;

  const avgVolume20 =
    Array.isArray(volumes) && volumes.length >= 20
      ? average(volumes.slice(0, 20))
      : average(volumes);

  const relativeVolume =
    Number.isFinite(currentVolume) &&
    Number.isFinite(avgVolume20) &&
    avgVolume20 > 0
      ? currentVolume / avgVolume20
      : null;

  const score1M = scoreLinear(oneMonthPct, -20, 25);
  const score3M = scoreLinear(threeMonthPct, -30, 40);
  const scoreVsSma20 = scoreLinear(vsSma20Pct, -15, 20);
  const scoreRelVol = scoreLinear(relativeVolume, 0.5, 2.0);
  const scoreVolatility =
    volatility20 === null ? null : 100 - scoreLinear(volatility20, 1, 6);

  const scoreParts = [
    { value: score1M, weight: 0.3 },
    { value: score3M, weight: 0.3 },
    { value: scoreVsSma20, weight: 0.2 },
    { value: scoreRelVol, weight: 0.1 },
    { value: scoreVolatility, weight: 0.1 },
  ];

  const weighted = scoreParts.filter((p) => Number.isFinite(p.value));
  const weightSum = weighted.reduce((sum, p) => sum + p.weight, 0);

  const technicalScore =
    weightSum > 0
      ? weighted.reduce((sum, p) => sum + p.value * p.weight, 0) / weightSum
      : null;

  return {
    oneDayPct,
    oneMonthPct,
    threeMonthPct,
    sma20,
    vsSma20Pct,
    volatility20,
    avgVolume20,
    relativeVolume,
    technicalScore,
  };
}

function pickBestName(searchJson, fallbackSymbol) {
  const candidates = Array.isArray(searchJson?.data) ? searchJson.data : [];

  const exact =
    candidates.find(
      (item) =>
        String(item.symbol || "").toUpperCase() ===
        String(fallbackSymbol || "").toUpperCase()
    ) || candidates[0];

  return (
    exact?.instrument_name ||
    exact?.name ||
    exact?.display_name ||
    exact?.company_name ||
    fallbackSymbol
  );
}

export default async function handler(req, res) {
  try {
    const rawSymbol = req.query.symbol || "";
    const symbol = String(rawSymbol).trim().toUpperCase();

    if (!symbol) {
      return res.status(400).json({ error: "Missing symbol" });
    }

    const apiKey = process.env.TWELVE_DATA_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "Missing TWELVE_DATA_API_KEY" });
    }

    const quoteUrl = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(
      symbol
    )}&apikey=${apiKey}`;

    const searchUrl = `https://api.twelvedata.com/symbol_search?symbol=${encodeURIComponent(
      symbol
    )}&apikey=${apiKey}`;

    const timeSeriesUrl = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(
      symbol
    )}&interval=1day&outputsize=70&apikey=${apiKey}`;

    const [quoteRes, searchRes, timeSeriesRes] = await Promise.all([
      fetch(quoteUrl, { cache: "no-store" }),
      fetch(searchUrl, { cache: "no-store" }),
      fetch(timeSeriesUrl, { cache: "no-store" }),
    ]);

    const [quoteJson, searchJson, timeSeriesJson] = await Promise.all([
      quoteRes.json(),
      searchRes.json(),
      timeSeriesRes.json(),
    ]);

    if (!quoteRes.ok || quoteJson?.status === "error") {
      return res.status(404).json({
        error: quoteJson?.message || "No match found",
        symbol,
      });
    }

    if (!timeSeriesRes.ok || timeSeriesJson?.status === "error") {
      return res.status(404).json({
        error: timeSeriesJson?.message || "Could not load time series",
        symbol,
      });
    }

    const values = Array.isArray(timeSeriesJson?.values)
      ? timeSeriesJson.values
      : [];

    const closes = values.map((row) => toNumber(row.close)).filter(Number.isFinite);
    const volumes = values.map((row) => toNumber(row.volume)).filter(Number.isFinite);

    const price =
      toNumber(quoteJson?.close) ??
      toNumber(quoteJson?.price) ??
      toNumber(quoteJson?.last) ??
      toNumber(values?.[0]?.close);

    const previousClose =
      toNumber(quoteJson?.previous_close) ??
      toNumber(values?.[1]?.close) ??
      null;

    const currentVolume =
      toNumber(quoteJson?.volume) ?? toNumber(values?.[0]?.volume) ?? null;

    const technicals = buildTechnicals({
      price,
      previousClose,
      currentVolume,
      closes,
      volumes,
    });

    const technicalScore = Number.isFinite(technicals.technicalScore)
      ? Math.round(technicals.technicalScore)
      : null;

    const fundamentalScore = null;

    const compositeScore =
      technicalScore !== null && fundamentalScore !== null
        ? Math.round(technicalScore * 0.55 + fundamentalScore * 0.45)
        : technicalScore;

    const name =
      quoteJson?.name ||
      pickBestName(searchJson, symbol) ||
      symbol;

    return res.status(200).json({
      symbol,
      name,
      exchange:
        quoteJson?.exchange ||
        timeSeriesJson?.meta?.exchange ||
        null,
      currency:
        quoteJson?.currency ||
        timeSeriesJson?.meta?.currency ||
        null,
      price,
      previousClose,
      volume: currentVolume,
      analytics: {
        oneDayPct: technicals.oneDayPct,
        oneMonthPct: technicals.oneMonthPct,
        threeMonthPct: technicals.threeMonthPct,
        sma20: technicals.sma20,
        vsSma20Pct: technicals.vsSma20Pct,
        volatility20: technicals.volatility20,
        avgVolume20: technicals.avgVolume20,
        relativeVolume: technicals.relativeVolume,
        technicalScore,
        fundamentalScore,
        compositeScore,
      },
    });
  } catch (error) {
    return res.status(500).json({
      error: "Server error",
      details: String(error),
    });
  }
}

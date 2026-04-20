function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function scoreBucket(value, goodMin, cautionMin) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return { score: 50, color: "yellow", label: "Neutral" };
  }

  if (value >= goodMin) {
    return { score: 85, color: "green", label: "Strong" };
  }

  if (value >= cautionMin) {
    return { score: 55, color: "yellow", label: "Mixed" };
  }

  return { score: 25, color: "red", label: "Weak" };
}

function scoreReverseBucket(value, goodMax, cautionMax) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return { score: 50, color: "yellow", label: "Neutral" };
  }

  if (value <= goodMax) {
    return { score: 85, color: "green", label: "Strong" };
  }

  if (value <= cautionMax) {
    return { score: 55, color: "yellow", label: "Mixed" };
  }

  return { score: 25, color: "red", label: "Weak" };
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

function getColor(score) {
  if (score >= 70) return "green";
  if (score >= 45) return "yellow";
  return "red";
}

function weightedAverage(items) {
  const valid = items.filter(
    (item) => Number.isFinite(item.score) && Number.isFinite(item.weight)
  );

  if (!valid.length) return null;

  const weightSum = valid.reduce((sum, item) => sum + item.weight, 0);
  if (!weightSum) return null;

  const total = valid.reduce((sum, item) => sum + item.score * item.weight, 0);
  return Math.round(total / weightSum);
}

function pickName(symbol, quoteJson, searchJson) {
  if (quoteJson?.name) return quoteJson.name;

  const candidates = Array.isArray(searchJson?.data) ? searchJson.data : [];
  const exact =
    candidates.find(
      (item) =>
        String(item.symbol || "").toUpperCase() === String(symbol).toUpperCase()
    ) || candidates[0];

  return (
    exact?.instrument_name ||
    exact?.name ||
    exact?.display_name ||
    exact?.company_name ||
    symbol
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

    const timeSeriesUrl = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(
      symbol
    )}&interval=1day&outputsize=70&previous_close=true&apikey=${apiKey}`;

    const searchUrl = `https://api.twelvedata.com/symbol_search?symbol=${encodeURIComponent(
      symbol
    )}&apikey=${apiKey}`;

    const [quoteRes, timeSeriesRes, searchRes] = await Promise.all([
      fetch(quoteUrl, { cache: "no-store" }),
      fetch(timeSeriesUrl, { cache: "no-store" }),
      fetch(searchUrl, { cache: "no-store" }),
    ]);

    const [quoteJson, timeSeriesJson, searchJson] = await Promise.all([
      quoteRes.json(),
      timeSeriesRes.json(),
      searchRes.json(),
    ]);

    if (!quoteRes.ok || quoteJson?.status === "error") {
      return res.status(404).json({
        error: quoteJson?.message || "Quote not found",
        symbol,
      });
    }

    if (!timeSeriesRes.ok || timeSeriesJson?.status === "error") {
      return res.status(404).json({
        error: timeSeriesJson?.message || "Time series not found",
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
      toNumber(timeSeriesJson?.meta?.previous_close) ??
      toNumber(values?.[1]?.close);

    const dayChangePct =
      Number.isFinite(price) &&
      Number.isFinite(previousClose) &&
      previousClose !== 0
        ? ((price / previousClose) - 1) * 100
        : null;

    const oneMonthPct = getReturnPct(closes, 21);
    const threeMonthPct = getReturnPct(closes, 63);

    const sma20 = getSma(closes, 20);
    const vsSma20Pct =
      Number.isFinite(price) && Number.isFinite(sma20) && sma20 !== 0
        ? ((price / sma20) - 1) * 100
        : null;

    const currentVolume =
      toNumber(quoteJson?.volume) ?? toNumber(values?.[0]?.volume) ?? null;

    const avgVolume20 =
      volumes.length >= 20 ? average(volumes.slice(0, 20)) : average(volumes);

    const relativeVolume =
      Number.isFinite(currentVolume) &&
      Number.isFinite(avgVolume20) &&
      avgVolume20 > 0
        ? currentVolume / avgVolume20
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

    // Technical drivers
    const trendDriver = scoreBucket(vsSma20Pct, 3, -2);
    const momentumDriver = scoreBucket(oneMonthPct, 5, -3);
    const mediumMomentumDriver = scoreBucket(threeMonthPct, 10, 0);
    const volumeDriver = scoreBucket(relativeVolume, 1.1, 0.85);
    const volatilityDriver = scoreReverseBucket(volatility20, 2.2, 3.5);

    const technicalScore = weightedAverage([
      { score: trendDriver.score, weight: 0.25 },
      { score: momentumDriver.score, weight: 0.25 },
      { score: mediumMomentumDriver.score, weight: 0.25 },
      { score: volumeDriver.score, weight: 0.15 },
      { score: volatilityDriver.score, weight: 0.10 },
    ]);

    // First-pass placeholders for the prototype layout
    // These are intentionally conservative until we wire real fundamentals/sentiment feeds
    const priceLevelDriver = scoreReverseBucket(price, 25, 60);
    const qualityDriver = { score: 55, color: "yellow", label: "Awaiting fundamentals" };
    const valuationDriver = priceLevelDriver;
    const balanceSheetDriver = { score: 55, color: "yellow", label: "Awaiting fundamentals" };
    const sentimentDriver = scoreBucket(dayChangePct, 1.0, -1.0);
    const tapeDriver = scoreBucket(relativeVolume, 1.15, 0.9);

    const fundamentalScore = weightedAverage([
      { score: qualityDriver.score, weight: 0.4 },
      { score: valuationDriver.score, weight: 0.35 },
      { score: balanceSheetDriver.score, weight: 0.25 },
    ]);

    const sentimentScore = weightedAverage([
      { score: sentimentDriver.score, weight: 0.5 },
      { score: tapeDriver.score, weight: 0.5 },
    ]);

    const compositeScore = weightedAverage([
      { score: technicalScore, weight: 0.55 },
      { score: fundamentalScore, weight: 0.30 },
      { score: sentimentScore, weight: 0.15 },
    ]);

    return res.status(200).json({
      symbol,
      name: pickName(symbol, quoteJson, searchJson),
      price,
      dayChangePct,
      compositeScore,
      compositeColor: getColor(compositeScore),
      drivers: {
        technical: [
          {
            label: "Trend vs 20D Avg",
            value: vsSma20Pct,
            display:
              vsSma20Pct === null ? "—" : `${vsSma20Pct > 0 ? "+" : ""}${vsSma20Pct.toFixed(2)}%`,
            score: trendDriver.score,
            color: trendDriver.color,
            note: trendDriver.label,
          },
          {
            label: "1M Momentum",
            value: oneMonthPct,
            display:
              oneMonthPct === null ? "—" : `${oneMonthPct > 0 ? "+" : ""}${oneMonthPct.toFixed(2)}%`,
            score: momentumDriver.score,
            color: momentumDriver.color,
            note: momentumDriver.label,
          },
          {
            label: "3M Momentum",
            value: threeMonthPct,
            display:
              threeMonthPct === null ? "—" : `${threeMonthPct > 0 ? "+" : ""}${threeMonthPct.toFixed(2)}%`,
            score: mediumMomentumDriver.score,
            color: mediumMomentumDriver.color,
            note: mediumMomentumDriver.label,
          },
          {
            label: "Relative Volume",
            value: relativeVolume,
            display: relativeVolume === null ? "—" : `${relativeVolume.toFixed(2)}x`,
            score: volumeDriver.score,
            color: volumeDriver.color,
            note: volumeDriver.label,
          },
          {
            label: "20D Volatility",
            value: volatility20,
            display: volatility20 === null ? "—" : `${volatility20.toFixed(2)}%`,
            score: volatilityDriver.score,
            color: volatilityDriver.color,
            note: volatilityDriver.label,
          },
        ],
        fundamental: [
          {
            label: "Quality",
            value: null,
            display: "Pending",
            score: qualityDriver.score,
            color: qualityDriver.color,
            note: qualityDriver.label,
          },
          {
            label: "Valuation Bias",
            value: price,
            display: price === null ? "—" : `$${price.toFixed(2)}`,
            score: valuationDriver.score,
            color: valuationDriver.color,
            note: valuationDriver.label,
          },
          {
            label: "Balance Sheet",
            value: null,
            display: "Pending",
            score: balanceSheetDriver.score,
            color: balanceSheetDriver.color,
            note: balanceSheetDriver.label,
          },
        ],
        sentiment: [
          {
            label: "Daily Price Action",
            value: dayChangePct,
            display:
              dayChangePct === null ? "—" : `${dayChangePct > 0 ? "+" : ""}${dayChangePct.toFixed(2)}%`,
            score: sentimentDriver.score,
            color: sentimentDriver.color,
            note: sentimentDriver.label,
          },
          {
            label: "Tape / Participation",
            value: relativeVolume,
            display: relativeVolume === null ? "—" : `${relativeVolume.toFixed(2)}x`,
            score: tapeDriver.score,
            color: tapeDriver.color,
            note: tapeDriver.label,
          },
        ],
      },
    });
  } catch (error) {
    return res.status(500).json({
      error: "Server error",
      details: String(error),
    });
  }
}

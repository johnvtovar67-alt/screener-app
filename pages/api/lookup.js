// pages/api/lookup.js

import {
  calcFundamentalScore,
  calcTechnicalScore,
  calcMomentumScore,
  calcAsymmetryScore,
  calcTriggerScore,
  compositeScore,
  getRecommendation,
  getStage,
  buildTechnicalSnapshot,
  buildFundamentalSnapshot,
} from "../../lib/scoring";

function normalizeSymbol(symbol) {
  return String(symbol || "")
    .replace("-", ".")
    .toUpperCase();
}

function toFmpSymbol(symbol) {
  return String(symbol || "")
    .replace(".", "-")
    .toUpperCase();
}

async function fetchQuote(symbol) {
  const apiKey = process.env.FMP_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Missing FMP_API_KEY."
    );
  }

  const clean =
    toFmpSymbol(symbol);

  const url =
    `https://financialmodelingprep.com/stable/quote?symbol=${clean}&apikey=${apiKey}`;

  const response =
    await fetch(url);

  if (!response.ok) {
    const text =
      await response.text();

    throw new Error(
      `FMP lookup failed: ${response.status} ${text}`
    );
  }

  const data =
    await response.json();

  const quote =
    Array.isArray(data)
      ? data[0]
      : data;

  if (!quote?.symbol) {
    throw new Error(
      "No quote returned."
    );
  }

  return {
    symbol:
      normalizeSymbol(
        quote.symbol
      ),

    name:
      quote.name ||
      quote.symbol,

    price:
      quote.price ??
      null,

    dayChangePct:
      quote.changesPercentage ??
      quote.changePercentage ??
      quote.changePercent ??
      null,

    volume:
      quote.volume ??
      null,

    avgVolume:
      quote.avgVolume ??
      quote.volume ??
      null,

    marketCap:
      quote.marketCap ??
      null,

    priceAvg50:
      quote.priceAvg50 ??
      null,

    priceAvg200:
      quote.priceAvg200 ??
      null,

    yearHigh:
      quote.yearHigh ??
      null,

    yearLow:
      quote.yearLow ??
      null,

    eps:
      quote.eps ??
      null,

    pe:
      quote.pe ??
      null,
  };
}

export default async function handler(
  req,
  res
) {
  try {
    const symbol =
      String(
        req.query.symbol || ""
      )
        .trim()
        .toUpperCase();

    if (!symbol) {
      return res.status(400).json({
        error:
          "Missing symbol.",
      });
    }

    const stock =
      await fetchQuote(symbol);

    const result = {
      ...stock,

      fundamentalScore:
        calcFundamentalScore(
          stock
        ),

      technicalScore:
        calcTechnicalScore(
          stock
        ),

      momentumScore:
        calcMomentumScore(
          stock
        ),

      asymmetryScore:
        calcAsymmetryScore(
          stock
        ),

      triggerScore:
        calcTriggerScore(
          stock
        ),

      score:
        compositeScore(
          stock
        ),

      recommendation:
        getRecommendation(
          stock
        ),

      stage:
        getStage(stock),

      technicalSnapshot:
        buildTechnicalSnapshot(
          stock
        ),

      fundamentalSnapshot:
        buildFundamentalSnapshot(
          stock
        ),
    };

    return res.status(200).json({
      stock: result,
    });
  } catch (err) {
    console.error(
      "lookup error:",
      err
    );

    return res.status(500).json({
      error:
        err.message ||
        "Lookup failed.",
    });
  }
}

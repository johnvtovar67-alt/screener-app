// Pure rank, context and eligibility functions; copied verbatim from the canonical account simulator.
// Numeric helpers and symbol/sector semantics remain supplied by that engine.
export function createC1SimulatorRanking({number,optionalNumber,clamp,average,symbolOf,sectorOf}) {
function stableResearchHash(value = "") {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function centeredPercentile(value) {
  return clamp(optionalNumber(value, 50), 0, 100) - 50;
}

function momentumExtensionSigma(factors = {}) {
  const annualizedVolatilityPct = optionalNumber(factors.volatility60Pct, null);
  if (!(annualizedVolatilityPct > 0)) return null;
  const annualizedVolatility = annualizedVolatilityPct / 100;
  const observations = [
    [optionalNumber(factors.return60Ex5, null), 55],
    [optionalNumber(factors.return120Ex20, null), 100],
  ];
  const extensions = observations
    .filter(([returnPct]) => returnPct !== null && returnPct > -100)
    .map(([returnPct, sessions]) => {
      const expectedMove = annualizedVolatility * Math.sqrt(sessions / 252);
      return expectedMove > 0
        ? Math.log1p(returnPct / 100) / expectedMove
        : null;
    })
    .filter(Number.isFinite);
  return extensions.length ? Math.max(...extensions) : null;
}

function researchRank(signal = {}, config = {}, context = {}) {
  const factors = signal.researchFactors || {};
  const timing = signal.entryTiming || {};
  if (config.researchRankMode === "filing-inflection") {
    const weights = config.filingInflectionWeights || {};
    const weighted = (key, value) => number(weights[key], 0) * value;
    const scaled = (field, scale) => {
      const value = optionalNumber(factors[field], null);
      return value === null ? -2 : clamp(value / scale, -2, 2);
    };
    const residual20 =
      0.5 * clamp(optionalNumber(timing.alpha20VsSpy, 0) / 15, -2, 2) +
      0.5 * clamp(optionalNumber(timing.alpha20VsQqq, 0) / 15, -2, 2);
    const residual60 =
      0.5 * clamp(optionalNumber(timing.alpha60VsSpy, 0) / 25, -2, 2) +
      0.5 * clamp(optionalNumber(timing.alpha60VsQqq, 0) / 25, -2, 2);
    const age = optionalNumber(factors.sessionsSinceFiling, Infinity);
    const maxAge = Math.max(1, number(config.maxSessionsSinceFiling, 40));
    const recency = Number.isFinite(age)
      ? clamp(1 - age / maxAge, 0, 1)
      : -2;
    return (
      100 *
      (weighted("revenueGrowth", scaled("revenueGrowthPct", 30)) +
        weighted(
          "revenueAcceleration",
          scaled("revenueAccelerationPctPoints", 25),
        ) +
        weighted(
          "profitabilityGrowth",
          scaled("profitabilityGrowthPct", 50),
        ) +
        weighted("marginChange", scaled("marginChangePctPoints", 8)) +
        weighted("cashFlowGrowth", scaled("cashFlowGrowthPct", 50)) +
        weighted(
          "cashConversionChange",
          scaled("cashConversionChangePctPoints", 12),
        ) +
        weighted("residual20", residual20) +
        weighted("residual60", residual60) +
        weighted("recency", recency))
    );
  }
  if (config.researchRankMode === "post-earnings-drift") {
    const weights = config.earningsDriftWeights || {};
    const weighted = (key, value) => number(weights[key], 0) * value;
    const surprise = clamp(
      optionalNumber(factors.earningsSurpriseScore, -2),
      -2,
      2,
    );
    const residual20 =
      0.5 * clamp(optionalNumber(timing.alpha20VsSpy, 0) / 15, -2, 2) +
      0.5 * clamp(optionalNumber(timing.alpha20VsQqq, 0) / 15, -2, 2);
    const residual60 =
      0.5 * clamp(optionalNumber(timing.alpha60VsSpy, 0) / 25, -2, 2) +
      0.5 * clamp(optionalNumber(timing.alpha60VsQqq, 0) / 25, -2, 2);
    const age = optionalNumber(factors.sessionsSinceEarnings, Infinity);
    const maxAge = Math.max(1, number(config.maxSessionsSinceEarnings, 60));
    const recency = Number.isFinite(age)
      ? clamp(1 - age / maxAge, 0, 1)
      : -2;
    return (
      100 *
      (weighted("surprise", surprise) +
        weighted("residual20", residual20) +
        weighted("residual60", residual60) +
        weighted("recency", recency))
    );
  }
  if (config.researchRankMode === "attention-shock-breakout-continuation") {
    const weights = config.attentionShockWeights || {};
    const weighted = (key, value) => number(weights[key], 0) * value;
    const relativeVolume = optionalNumber(factors.relativeVolume20, null);
    const distanceFromHigh = optionalNumber(
      factors.distanceFromYearHighPct,
      null,
    );
    const return5 = optionalNumber(factors.return5, null);
    const relativeStrength20 = optionalNumber(timing.alpha20VsSpy, null);
    return (
      100 *
      (weighted(
        "activityShock",
        relativeVolume > 0
          ? clamp(Math.log(relativeVolume) / Math.log(3), 0, 2)
          : -2,
      ) +
        weighted(
          "breakoutProximity",
          distanceFromHigh === null
            ? -2
            : clamp((distanceFromHigh + 5) / 5, 0, 1),
        ) +
        weighted(
          "followthrough",
          return5 === null ? -2 : clamp(return5 / 12, 0, 1),
        ) +
        weighted(
          "relativeStrength20",
          relativeStrength20 === null
            ? -2
            : clamp(relativeStrength20 / 10, -1, 2),
        ))
    );
  }
  if (config.researchRankMode === "attention-shock-only") {
    const relativeVolume = optionalNumber(factors.relativeVolume20, null);
    return relativeVolume > 0
      ? 100 * clamp(Math.log(relativeVolume) / Math.log(3), 0, 2)
      : -200;
  }
  if (config.researchRankMode === "breakout-followthrough-only") {
    const distanceFromHigh = optionalNumber(
      factors.distanceFromYearHighPct,
      null,
    );
    const return5 = optionalNumber(factors.return5, null);
    if (distanceFromHigh === null || return5 === null) return -200;
    return (
      100 *
      (0.6 * clamp((distanceFromHigh + 5) / 5, 0, 1) +
        0.4 * clamp(return5 / 12, 0, 1))
    );
  }
  if (config.researchRankMode === "benchmark-residual-momentum") {
    const weights = config.benchmarkResidualWeights || {};
    const weighted = (key, value) => number(weights[key], 0) * value;
    const relative120 =
      0.5 * clamp(optionalNumber(timing.alpha120VsSpy, 0) / 35, -2, 2) +
      0.5 * clamp(optionalNumber(timing.alpha120VsQqq, 0) / 35, -2, 2);
    const relative60 =
      0.5 * clamp(optionalNumber(timing.alpha60VsSpy, 0) / 25, -2, 2) +
      0.5 * clamp(optionalNumber(timing.alpha60VsQqq, 0) / 25, -2, 2);
    const sectorMomentumPercentile = optionalNumber(
      context.sectorMomentumPercentileBySymbol?.[symbolOf(signal)],
      null,
    );
    const sectorAwareMomentum =
      sectorMomentumPercentile === null
        ? -2
        : (0.5 * centeredPercentile(factors.momentumPercentile) +
            0.5 * centeredPercentile(sectorMomentumPercentile)) /
          50;
    const lowVolatility = clamp(
      (35 - optionalNumber(factors.volatility60Pct, 35)) / 35,
      -2,
      1,
    );
    const drawdownResilience =
      centeredPercentile(factors.drawdownResiliencePercentile) / 50;
    const controlledPullback =
      centeredPercentile(factors.controlledPullbackScore) / 50;
    return (
      100 *
      (weighted("relative120", relative120) +
        weighted("relative60", relative60) +
        weighted("sectorAwareMomentum", sectorAwareMomentum) +
        weighted("lowVolatility", lowVolatility) +
        weighted("drawdownResilience", drawdownResilience) +
        weighted("controlledPullback", controlledPullback))
    );
  }
  if (config.researchRankMode === "nasdaq-residual-path-quality") {
    const weights = config.nasdaqResidualPathWeights || {};
    const weighted = (key, value) => number(weights[key], 0) * value;
    const relative120 =
      0.5 * clamp(optionalNumber(timing.alpha120VsSpy, 0) / 35, -2, 2) +
      0.5 * clamp(optionalNumber(timing.alpha120VsQqq, 0) / 35, -2, 2);
    const relative60 =
      0.5 * clamp(optionalNumber(timing.alpha60VsSpy, 0) / 25, -2, 2) +
      0.5 * clamp(optionalNumber(timing.alpha60VsQqq, 0) / 25, -2, 2);
    return (
      100 *
      (weighted("relative120", relative120) +
        weighted("relative60", relative60) +
        weighted(
          "continuity",
          centeredPercentile(factors.continuousInformationPercentile) / 50,
        ) +
        weighted(
          "accelerationRestraint",
          centeredPercentile(factors.accelerationRestraintPercentile) / 50,
        ) +
        weighted(
          "lotteryRestraint",
          centeredPercentile(factors.lotteryRestraintPercentile) / 50,
        ) +
        weighted(
          "lowVolatility",
          centeredPercentile(factors.stabilityPercentile) / 50,
        ) +
        weighted(
          "drawdownResilience",
          centeredPercentile(factors.drawdownResiliencePercentile) / 50,
        ) +
        weighted(
          "anchor",
          centeredPercentile(factors.highProximityPercentile) / 50,
        ))
    );
  }
  if (config.researchRankMode === "conditional-short-term-reversal") {
    const weights = config.shortTermReversalWeights || {};
    const weighted = (key, value) => number(weights[key], 0) * value;
    const return5 = optionalNumber(factors.return5, null);
    const reversalPressure =
      return5 === null ? -2 : clamp(1 - Math.abs(return5 + 4) / 6, -2, 1);
    const relativeTrend =
      0.5 * clamp(optionalNumber(timing.alpha120VsSpy, 0) / 25, -2, 2) +
      0.5 * clamp(optionalNumber(timing.alpha120VsQqq, 0) / 25, -2, 2);
    const lowVolatility = clamp(
      (35 - optionalNumber(factors.volatility60Pct, 35)) / 35,
      -2,
      1,
    );
    const liquidity = clamp(
      Math.log10(Math.max(1, observedDollarVolume(signal))) / 3 - 2,
      -2,
      1,
    );
    return (
      100 *
      (weighted("reversalPressure", reversalPressure) +
        weighted("relativeTrend", relativeTrend) +
        weighted("lowVolatility", lowVolatility) +
        weighted("liquidity", liquidity))
    );
  }
  if (config.researchRankMode === "industry-leadership-momentum") {
    const weights = config.industryLeadershipWeights || {};
    const weighted = (key, value) => number(weights[key], 0) * value;
    const sectorTrend = clamp(
      optionalNumber(
        context.sectorLeadershipBySymbol?.[symbolOf(signal)],
        -50,
      ) / 25,
      -2,
      2,
    );
    const stockResidual =
      0.5 * clamp(optionalNumber(timing.alpha120VsSpy, 0) / 35, -2, 2) +
      0.5 * clamp(optionalNumber(timing.alpha120VsQqq, 0) / 35, -2, 2);
    const withinSector =
      centeredPercentile(
        context.sectorMomentumPercentileBySymbol?.[symbolOf(signal)],
      ) / 50;
    const continuity =
      centeredPercentile(factors.continuousInformationPercentile) / 50;
    const lowVolatility = clamp(
      (40 - optionalNumber(factors.volatility60Pct, 40)) / 40,
      -2,
      1,
    );
    return (
      100 *
      (weighted("sectorTrend", sectorTrend) +
        weighted("stockResidual", stockResidual) +
        weighted("withinSector", withinSector) +
        weighted("continuity", continuity) +
        weighted("lowVolatility", lowVolatility))
    );
  }
  if (config.researchRankMode === "anchored-gradual-leadership") {
    const weights = config.anchoredGradualWeights || {};
    const weighted = (key, value) => number(weights[key], 0) * value;
    const relativeStrength =
      0.3 * clamp(optionalNumber(timing.alpha60VsSpy, 0) / 25, -2, 2) +
      0.2 * clamp(optionalNumber(timing.alpha60VsQqq, 0) / 25, -2, 2) +
      0.3 * clamp(optionalNumber(timing.alpha120VsSpy, 0) / 35, -2, 2) +
      0.2 * clamp(optionalNumber(timing.alpha120VsQqq, 0) / 35, -2, 2);
    const relativeVolume = optionalNumber(factors.relativeVolume20, null);
    const lowShockVolume =
      relativeVolume > 0
        ? clamp(1 - Math.abs(Math.log(relativeVolume)) / Math.log(2.5), -1, 1)
        : -1;
    const averageDollarVolume = optionalNumber(
      timing.averageDollarVolume20,
      0,
    );
    const liquidity =
      averageDollarVolume > 0
        ? clamp(Math.log10(averageDollarVolume / 20_000_000) / 2, -1, 1)
        : -1;
    return (
      100 *
      (weighted(
        "anchor",
        centeredPercentile(factors.highProximityPercentile) / 50,
      ) +
        weighted(
          "recency",
          centeredPercentile(factors.highRecencyPercentile) / 50,
        ) +
        weighted(
          "continuity",
          centeredPercentile(factors.continuousInformationPercentile) / 50,
        ) +
        weighted(
          "intermediate",
          centeredPercentile(factors.intermediateLeadershipPercentile) / 50,
        ) +
        weighted("relativeStrength", relativeStrength) +
        weighted(
          "drawdownResilience",
          centeredPercentile(factors.drawdownResiliencePercentile) / 50,
        ) +
        weighted("lowShockVolume", lowShockVolume) +
        weighted("liquidity", liquidity))
    );
  }
  if (config.researchRankMode === "multi-horizon-price-alpha") {
    const weights = config.priceAlphaWeights || {};
    const weighted = (key, value) => number(weights[key], 0) * value;
    const relativeStrength =
      0.3 * clamp(optionalNumber(timing.alpha60VsSpy, 0) / 25, -2, 2) +
      0.2 * clamp(optionalNumber(timing.alpha60VsQqq, 0) / 25, -2, 2) +
      0.3 * clamp(optionalNumber(timing.alpha120VsSpy, 0) / 35, -2, 2) +
      0.2 * clamp(optionalNumber(timing.alpha120VsQqq, 0) / 35, -2, 2);
    const averageDollarVolume = optionalNumber(
      timing.averageDollarVolume20,
      0,
    );
    const liquidity =
      averageDollarVolume > 0
        ? clamp(Math.log10(averageDollarVolume / 20_000_000) / 2, -1, 1)
        : -1;
    return (
      100 *
      (weighted(
        "momentum",
        centeredPercentile(factors.momentumPercentile) / 50,
      ) +
        weighted(
          "longMomentum",
          clamp(optionalNumber(factors.return120Ex20, 0) / 60, -2, 2),
        ) +
        weighted(
          "mediumMomentum",
          clamp(optionalNumber(factors.return60Ex5, 0) / 40, -2, 2),
        ) +
        weighted(
          "shortMomentum",
          clamp(optionalNumber(factors.return20, 0) / 25, -2, 2),
        ) +
        weighted(
          "veryShortMomentum",
          clamp(optionalNumber(factors.return5, 0) / 15, -2, 2),
        ) +
        weighted("relativeStrength", relativeStrength) +
        weighted(
          "stability",
          centeredPercentile(factors.stabilityPercentile) / 50,
        ) +
        weighted(
          "lowVolatility",
          clamp(
            (35 - optionalNumber(factors.volatility60Pct, 35)) / 35,
            -2,
            1,
          ),
        ) +
        weighted(
          "technical",
          centeredPercentile(timing.shortTermTechnicalScore) / 50,
        ) +
        weighted(
          "pullback",
          centeredPercentile(factors.controlledPullbackScore) / 50,
        ) +
        weighted("liquidity", liquidity))
    );
  }
  if (config.researchRankMode === "momentum-spine") {
    const weights = config.momentumSpineWeights || {};
    const weighted = (key, value) => number(weights[key], 0) * value;
    const dualBenchmarkRelative = (spy, qqq, scale) =>
      0.5 * clamp(optionalNumber(spy, 0) / scale, -2, 2) +
      0.5 * clamp(optionalNumber(qqq, 0) / scale, -2, 2);
    const volatility20 = optionalNumber(factors.volatility20Pct, null);
    const volatility60 = optionalNumber(factors.volatility60Pct, null);
    const contraction =
      volatility20 === null || volatility60 === null || volatility60 <= 0
        ? -1
        : clamp(1 - volatility20 / volatility60, -1, 1);
    const return5 = optionalNumber(factors.return5, null);
    const return20 = optionalNumber(factors.return20, null);
    const reacceleration =
      return5 === null || return20 === null
        ? -1
        : clamp((return5 - return20 / 4) / 8, -1, 1);
    const relativeVolume = optionalNumber(factors.relativeVolume20, null);
    const volumeConfirmation =
      relativeVolume === null || relativeVolume <= 0
        ? -1
        : clamp(Math.log(relativeVolume) / Math.log(2), -1, 1);
    const shortRunRestraint =
      return5 === null
        ? -1
        : return5 >= -3 && return5 <= 5
          ? 1 - Math.abs(return5 - 1) / 8
          : clamp(1 - Math.abs(return5 - 1) / 10, -1, 1);
    return (
      100 *
      (weighted(
        "momentum",
        centeredPercentile(factors.momentumPercentile) / 50,
      ) +
        weighted(
          "relative120",
          dualBenchmarkRelative(
            timing.alpha120VsSpy,
            timing.alpha120VsQqq,
            35,
          ),
        ) +
        weighted(
          "relative60",
          dualBenchmarkRelative(
            timing.alpha60VsSpy,
            timing.alpha60VsQqq,
            25,
          ),
        ) +
        weighted(
          "continuity",
          centeredPercentile(factors.continuousInformationPercentile) / 50,
        ) +
        weighted(
          "anchor",
          centeredPercentile(factors.highProximityPercentile) / 50,
        ) +
        weighted(
          "stability",
          centeredPercentile(factors.stabilityPercentile) / 50,
        ) +
        weighted(
          "pullback",
          centeredPercentile(factors.controlledPullbackScore) / 50,
        ) +
        weighted(
          "technical",
          centeredPercentile(timing.shortTermTechnicalScore) / 50,
        ) +
        weighted("contraction", contraction) +
        weighted("reacceleration", reacceleration) +
        weighted("volumeConfirmation", volumeConfirmation) +
        weighted("shortRunRestraint", shortRunRestraint))
    );
  }
  if (config.researchRankMode === "durable-quality-momentum") {
    const quality = centeredPercentile(factors.qualityPercentile);
    const momentum = centeredPercentile(factors.momentumPercentile);
    const stability = centeredPercentile(factors.stabilityPercentile);
    const sectorQuality = centeredPercentile(
      factors.sectorQualityPercentile,
    );
    const relativeStrength =
      clamp(
        0.65 * optionalNumber(timing.alpha60VsSpy, 0) +
          0.35 * optionalNumber(timing.alpha60VsQqq, 0),
        -25,
        25,
      ) * 2;
    const lowVolatility = clamp(
      50 - optionalNumber(factors.volatility60Pct, 50),
      -50,
      50,
    );
    const weakestCoreSignal = Math.min(quality, momentum);
    return (
      0.25 * quality +
      0.2 * momentum +
      0.15 * stability +
      0.1 * sectorQuality +
      0.1 * relativeStrength +
      0.1 * lowVolatility +
      0.1 * weakestCoreSignal
    );
  }
  if (config.researchRankMode === "price-pattern") {
    const weights = config.pricePatternWeights || {};
    const feature = (key, value, minimum, maximum) =>
      number(weights[key], 0) * clamp(optionalNumber(value, 0), minimum, maximum);
    return (
      feature("return120Ex20", factors.return120Ex20, -60, 120) +
      feature("return60Ex5", factors.return60Ex5, -50, 100) +
      feature("return20", factors.return20, -35, 50) +
      feature("return5", factors.return5, -20, 25) +
      feature("volatility60Pct", factors.volatility60Pct, 0, 120) +
      feature("alpha60VsSpy", timing.alpha60VsSpy, -40, 60) +
      feature("alpha60VsQqq", timing.alpha60VsQqq, -40, 60) +
      feature(
        "controlledPullbackScore",
        factors.controlledPullbackScore,
        0,
        100,
      )
    );
  }
  if (config.researchRankMode === "quality-momentum-leadership") {
    const relativeStrength =
      clamp(
        0.65 * optionalNumber(timing.alpha60VsSpy, 0) +
          0.35 * optionalNumber(timing.alpha60VsQqq, 0),
        -25,
        25,
      ) * 2;
    return (
      0.3 * centeredPercentile(factors.momentumPercentile) +
      0.25 * centeredPercentile(factors.qualityPercentile) +
      0.1 * centeredPercentile(factors.sectorQualityPercentile) +
      0.1 * centeredPercentile(factors.stabilityPercentile) +
      0.15 * relativeStrength +
      0.05 * centeredPercentile(timing.shortTermTechnicalScore) +
      0.05 * centeredPercentile(factors.controlledPullbackScore)
    );
  }
  if (config.researchRankMode === "momentum-dominant-quality-blend") {
    const relativeStrength =
      clamp(
        0.65 * optionalNumber(timing.alpha60VsSpy, 0) +
          0.35 * optionalNumber(timing.alpha60VsQqq, 0),
        -25,
        25,
      ) * 2;
    return (
      0.55 * centeredPercentile(factors.momentumPercentile) +
      0.15 * relativeStrength +
      0.1 * centeredPercentile(factors.qualityPercentile) +
      0.05 * centeredPercentile(factors.sectorQualityPercentile) +
      0.05 * centeredPercentile(factors.stabilityPercentile) +
      0.05 * centeredPercentile(timing.shortTermTechnicalScore) +
      0.05 * centeredPercentile(factors.controlledPullbackScore)
    );
  }
  if (config.researchRankMode === "adaptive-quality-momentum") {
    if (context.useQualityDefense === true)
      return centeredPercentile(factors.qualityPercentile);
    const relativeStrength =
      clamp(
        0.65 * optionalNumber(timing.alpha60VsSpy, 0) +
          0.35 * optionalNumber(timing.alpha60VsQqq, 0),
        -25,
        25,
      ) * 2;
    return (
      0.55 * centeredPercentile(factors.momentumPercentile) +
      0.15 * relativeStrength +
      0.1 * centeredPercentile(factors.qualityPercentile) +
      0.05 * centeredPercentile(factors.sectorQualityPercentile) +
      0.05 * centeredPercentile(factors.stabilityPercentile) +
      0.05 * centeredPercentile(timing.shortTermTechnicalScore) +
      0.05 * centeredPercentile(factors.controlledPullbackScore)
    );
  }
  if (config.researchRankMode === "adaptive-factor-leadership") {
    if (context.useQualityLeadership === true)
      return centeredPercentile(factors.qualityPercentile);
    const relativeStrength =
      clamp(
        0.65 * optionalNumber(timing.alpha60VsSpy, 0) +
          0.35 * optionalNumber(timing.alpha60VsQqq, 0),
        -25,
        25,
      ) * 2;
    return (
      0.55 * centeredPercentile(factors.momentumPercentile) +
      0.15 * relativeStrength +
      0.1 * centeredPercentile(factors.qualityPercentile) +
      0.05 * centeredPercentile(factors.sectorQualityPercentile) +
      0.05 * centeredPercentile(factors.stabilityPercentile) +
      0.05 * centeredPercentile(timing.shortTermTechnicalScore) +
      0.05 * centeredPercentile(factors.controlledPullbackScore)
    );
  }
  if (config.researchRankMode === "adaptive-factor-leadership-20") {
    if (context.useQualityLeadership20 === true)
      return centeredPercentile(factors.qualityPercentile);
    const relativeStrength =
      clamp(
        0.65 * optionalNumber(timing.alpha60VsSpy, 0) +
          0.35 * optionalNumber(timing.alpha60VsQqq, 0),
        -25,
        25,
      ) * 2;
    return (
      0.55 * centeredPercentile(factors.momentumPercentile) +
      0.15 * relativeStrength +
      0.1 * centeredPercentile(factors.qualityPercentile) +
      0.05 * centeredPercentile(factors.sectorQualityPercentile) +
      0.05 * centeredPercentile(factors.stabilityPercentile) +
      0.05 * centeredPercentile(timing.shortTermTechnicalScore) +
      0.05 * centeredPercentile(factors.controlledPullbackScore)
    );
  }
  if (config.researchRankMode === "persistent-factor-leadership-20") {
    if (context.usePersistentQualityLeadership === true)
      return centeredPercentile(factors.qualityPercentile);
    const relativeStrength =
      clamp(
        0.65 * optionalNumber(timing.alpha60VsSpy, 0) +
          0.35 * optionalNumber(timing.alpha60VsQqq, 0),
        -25,
        25,
      ) * 2;
    return (
      0.55 * centeredPercentile(factors.momentumPercentile) +
      0.15 * relativeStrength +
      0.1 * centeredPercentile(factors.qualityPercentile) +
      0.05 * centeredPercentile(factors.sectorQualityPercentile) +
      0.05 * centeredPercentile(factors.stabilityPercentile) +
      0.05 * centeredPercentile(timing.shortTermTechnicalScore) +
      0.05 * centeredPercentile(factors.controlledPullbackScore)
    );
  }
  if (config.researchRankMode === "confirmed-quality-defense") {
    if (context.useConfirmedQualityDefense === true)
      return centeredPercentile(factors.qualityPercentile);
    const relativeStrength =
      clamp(
        0.65 * optionalNumber(timing.alpha60VsSpy, 0) +
          0.35 * optionalNumber(timing.alpha60VsQqq, 0),
        -25,
        25,
      ) * 2;
    return (
      0.55 * centeredPercentile(factors.momentumPercentile) +
      0.15 * relativeStrength +
      0.1 * centeredPercentile(factors.qualityPercentile) +
      0.05 * centeredPercentile(factors.sectorQualityPercentile) +
      0.05 * centeredPercentile(factors.stabilityPercentile) +
      0.05 * centeredPercentile(timing.shortTermTechnicalScore) +
      0.05 * centeredPercentile(factors.controlledPullbackScore)
    );
  }
  if (config.researchRankMode === "momentum-first-entry-disciplined-blend") {
    const relativeStrength =
      clamp(
        0.65 * optionalNumber(timing.alpha60VsSpy, 0) +
          0.35 * optionalNumber(timing.alpha60VsQqq, 0),
        -25,
        25,
      ) * 2;
    return (
      0.7 * centeredPercentile(factors.momentumPercentile) +
      0.15 * relativeStrength +
      0.05 * centeredPercentile(factors.qualityPercentile) +
      0.05 * centeredPercentile(factors.stabilityPercentile) +
      0.05 * centeredPercentile(factors.controlledPullbackScore)
    );
  }
  if (config.researchRankMode === "momentum-only")
    return centeredPercentile(factors.momentumPercentile);
  if (config.researchRankMode === "quality-only")
    return centeredPercentile(factors.qualityPercentile);
  if (config.researchRankMode === "bull-cycle-pullback-control")
    return (
      0.5 * centeredPercentile(factors.momentumPercentile) +
      0.3 * centeredPercentile(timing.shortTermTechnicalScore) +
      0.2 * centeredPercentile(factors.controlledPullbackScore)
    );
  if (config.researchRankMode === "random-placebo")
    return (
      (stableResearchHash(
        `${number(config.researchRandomSeed, 0)}|${symbolOf(signal)}`,
      ) /
        0xffffffff) *
        100 -
      50
    );
  const base =
    config.baseRankWeight * number(signal.capitalEfficiencyScore, signal.score);
  const shortTermAlpha = number(timing.alpha20VsSpy, 0);
  const relative =
    config.relativeStrengthRankWeight *
      (0.65 * number(timing.alpha60VsSpy, 0) +
        0.35 * number(timing.alpha20VsSpy, 0)) -
    config.shortTermAlphaRankPenalty *
      Math.max(0, shortTermAlpha - config.shortTermAlphaRankPenaltyThreshold);
  const factor =
    config.researchFactorRankWeight *
      (optionalNumber(factors.globalCompositePercentile, 50) - 50) +
    config.qualityRankWeight *
      (optionalNumber(factors.qualityPercentile, 50) - 50) +
    config.sectorQualityRankWeight *
      (optionalNumber(factors.sectorQualityPercentile, 50) - 50) +
    config.momentumRankWeight *
      (optionalNumber(factors.momentumPercentile, 50) - 50) +
    config.valueRankWeight *
      (optionalNumber(factors.valuePercentile, 50) - 50) +
    config.stabilityRankWeight *
      (optionalNumber(factors.stabilityPercentile, 50) - 50);
  const pullback =
    config.controlledPullbackRankWeight *
    (optionalNumber(factors.controlledPullbackScore, 50) - 50);
  return base + relative + factor + pullback;
}

function crossSectionalRankContext(signals = []) {
  const momentumBySector = new Map();
  for (const signal of signals) {
    const momentum = optionalNumber(
      signal?.researchFactors?.momentumPercentile,
      null,
    );
    if (!Number.isFinite(momentum)) continue;
    const sector = sectorOf(signal);
    if (!momentumBySector.has(sector)) momentumBySector.set(sector, []);
    momentumBySector.get(sector).push({
      symbol: symbolOf(signal),
      momentum,
    });
  }
  const sectorMomentumPercentileBySymbol = {};
  const sectorLeadershipBySymbol = {};
  for (const peers of momentumBySector.values()) {
    const ordered = [...peers].sort(
      (left, right) =>
        left.momentum - right.momentum ||
        left.symbol.localeCompare(right.symbol),
    );
    for (let index = 0; index < ordered.length; index++)
      sectorMomentumPercentileBySymbol[ordered[index].symbol] =
        ordered.length < 2 ? 50 : (index / (ordered.length - 1)) * 100;
  }
  const leadershipBySector = new Map();
  for (const signal of signals) {
    const values = [
      signal?.entryTiming?.alpha120VsSpy,
      signal?.entryTiming?.alpha120VsQqq,
    ].map(Number).filter(Number.isFinite);
    if (values.length !== 2) continue;
    const sector = sectorOf(signal);
    if (!leadershipBySector.has(sector)) leadershipBySector.set(sector, []);
    leadershipBySector.get(sector).push({
      symbol: symbolOf(signal),
      value: average(values),
    });
  }
  for (const peers of leadershipBySector.values()) {
    const ordered = peers.map((peer) => peer.value).sort((a, b) => a - b);
    const middle = Math.floor(ordered.length / 2);
    const median = ordered.length % 2
      ? ordered[middle]
      : (ordered[middle - 1] + ordered[middle]) / 2;
    for (const peer of peers) sectorLeadershipBySymbol[peer.symbol] = median;
  }
  const observations = signals
    .map((signal) => ({
      alpha60: optionalNumber(signal?.entryTiming?.alpha60VsSpy, null),
      momentum: optionalNumber(
        signal?.researchFactors?.momentumPercentile,
        null,
      ),
    }))
    .filter(
      (row) => Number.isFinite(row.alpha60) && Number.isFinite(row.momentum),
    );
  if (observations.length < 20)
    return {
      useQualityDefense: true,
      momentumBreadthPct: null,
      medianMomentumPercentile: null,
      observedSignals: observations.length,
      sectorMomentumPercentileBySymbol,
      sectorLeadershipBySymbol,
    };
  const momentumBreadthPct =
    (observations.filter((row) => row.alpha60 > 0).length /
      observations.length) *
    100;
  const sortedMomentum = observations
    .map((row) => row.momentum)
    .sort((left, right) => left - right);
  const midpoint = Math.floor(sortedMomentum.length / 2);
  const medianMomentumPercentile =
    sortedMomentum.length % 2
      ? sortedMomentum[midpoint]
      : (sortedMomentum[midpoint - 1] + sortedMomentum[midpoint]) / 2;
  const leadershipObservations = signals
    .map((signal) => ({
      quality: optionalNumber(signal?.researchFactors?.qualityPercentile, null),
      momentum: optionalNumber(signal?.researchFactors?.momentumPercentile, null),
      return5: optionalNumber(signal?.researchFactors?.return5, null),
      return20: optionalNumber(signal?.researchFactors?.return20, null),
    }))
    .filter(
      (row) =>
        Number.isFinite(row.quality) &&
        Number.isFinite(row.momentum) &&
        Number.isFinite(row.return5),
    );
  const topCount = Math.max(5, Math.ceil(leadershipObservations.length * 0.25));
  const medianReturn = (rows, key = "return5") => {
    const values = rows.map((row) => row[key]).filter(Number.isFinite).sort((left, right) => left - right);
    if (!values.length) return null;
    const middle = Math.floor(values.length / 2);
    return values.length % 2
      ? values[middle]
      : (values[middle - 1] + values[middle]) / 2;
  };
  const qualityLeaderReturn5 = medianReturn(
    [...leadershipObservations]
      .sort((left, right) => right.quality - left.quality)
      .slice(0, topCount),
  );
  const momentumLeaderReturn5 = medianReturn(
    [...leadershipObservations]
      .sort((left, right) => right.momentum - left.momentum)
      .slice(0, topCount),
  );
  const qualityLeaderReturn20 = medianReturn(
    [...leadershipObservations]
      .sort((left, right) => right.quality - left.quality)
      .slice(0, topCount),
    "return20",
  );
  const momentumLeaderReturn20 = medianReturn(
    [...leadershipObservations]
      .sort((left, right) => right.momentum - left.momentum)
      .slice(0, topCount),
    "return20",
  );
  return {
    useQualityDefense:
      momentumBreadthPct < 50 || medianMomentumPercentile < 50,
    momentumBreadthPct,
    medianMomentumPercentile,
    observedSignals: observations.length,
    sectorMomentumPercentileBySymbol,
    sectorLeadershipBySymbol,
    useQualityLeadership:
      leadershipObservations.length >= 20 &&
      qualityLeaderReturn5 > momentumLeaderReturn5,
    qualityLeaderReturn5,
    momentumLeaderReturn5,
    useQualityLeadership20:
      leadershipObservations.length >= 20 &&
      Number.isFinite(qualityLeaderReturn20) &&
      Number.isFinite(momentumLeaderReturn20) &&
      qualityLeaderReturn20 > momentumLeaderReturn20,
    useConfirmedQualityDefense:
      leadershipObservations.length >= 20 &&
      momentumBreadthPct < 50 &&
      Number.isFinite(qualityLeaderReturn20) &&
      Number.isFinite(momentumLeaderReturn20) &&
      qualityLeaderReturn20 > momentumLeaderReturn20,
    qualityLeaderReturn20,
    momentumLeaderReturn20,
  };
}

function expandedResearchSource(config = {}) {
  return ["full-evidence", "price-only", "earnings-event"].includes(
    config.researchSignalSource,
  );
}

function entrySignalPool(session = {}, config = {}) {
  if (!expandedResearchSource(config)) return session.signals || [];
  const bySymbol = new Map();
  for (const signal of [
    ...(session.positionSignals || []),
    ...(session.signals || []),
  ]) {
    const symbol = symbolOf(signal);
    if (symbol) bySymbol.set(symbol, signal);
  }
  return [...bySymbol.values()];
}

function observedDollarVolume(signal = {}) {
  const timingDollarVolume = optionalNumber(
    signal.entryTiming?.averageDollarVolume20,
    null,
  );
  if (timingDollarVolume > 0) return timingDollarVolume;
  const price = optionalNumber(
    signal.price ?? signal.currentPrice ?? signal.lastPrice ?? signal.close,
    null,
  );
  const volume = optionalNumber(
    signal.avgVolume ?? signal.averageVolume ?? signal.volume,
    null,
  );
  return price > 0 && volume > 0 ? price * volume : null;
}

function entrySignalQualifies(signal = {}, config = {}) {
  const expanded = expandedResearchSource(config);
  const priceOnly = config.researchSignalSource === "price-only";
  const independentlyResearchable =
    priceOnly ||
    config.researchSignalSource === "earnings-event" ||
    config.researchSignalSource === "filing-event";
  const timing = signal.entryTiming || {};
  const factors = signal.researchFactors || {};
  const price = optionalNumber(
    signal.price ?? signal.currentPrice ?? signal.lastPrice ?? signal.close,
    null,
  );
  const average50 = optionalNumber(
    signal.priceAvg50 ?? signal.fiftyDayAverage ?? signal.sma50 ?? signal.ma50,
    null,
  );
  const average200 = optionalNumber(
    signal.priceAvg200 ??
      signal.twoHundredDayAverage ??
      signal.sma200 ??
      signal.ma200,
    null,
  );
  const priceVs50Pct =
    price > 0 && average50 > 0 ? (price / average50 - 1) * 100 : null;
  const observedExtensionSigma = momentumExtensionSigma(factors);
  const allowedRegimes = Array.isArray(config.allowedBenchmarkRegimes)
    ? new Set(config.allowedBenchmarkRegimes.map(String))
    : null;
  const anchoredGradualFactorsComplete = [
    factors.highProximityPercentile,
    factors.highRecencyPercentile,
    factors.continuousInformationPercentile,
    factors.intermediateLeadershipPercentile,
    factors.drawdownResiliencePercentile,
  ].every(Number.isFinite);
  const benchmarkResidualFactorsComplete = [
    timing.alpha60VsSpy,
    timing.alpha60VsQqq,
    timing.alpha120VsSpy,
    timing.alpha120VsQqq,
    factors.momentumPercentile,
    factors.volatility60Pct,
    factors.drawdownResiliencePercentile,
  ].every(Number.isFinite);
  const shortTermReversalFactorsComplete = [
    timing.alpha120VsSpy,
    timing.alpha120VsQqq,
    factors.return5,
    factors.volatility60Pct,
  ].every(Number.isFinite);
  const industryLeadershipFactorsComplete = [
    timing.alpha120VsSpy,
    timing.alpha120VsQqq,
    factors.momentumPercentile,
    factors.continuousInformationPercentile,
    factors.volatility60Pct,
  ].every(Number.isFinite);
  const attentionShockFactorsComplete = [
    timing.alpha20VsSpy,
    factors.relativeVolume20,
    factors.return5,
    factors.distanceFromYearHighPct,
  ].every(Number.isFinite);
  const earningsSurpriseFactorsComplete = [
    factors.earningsSurpriseScore,
    factors.sessionsSinceEarnings,
  ].every(Number.isFinite);
  const filingChangeFactorsComplete = [
    factors.filingCoverageFields,
    factors.filingAlignedPeriodEnds,
    factors.sessionsSinceFiling,
    factors.revenueGrowthPct,
    factors.profitabilityGrowthPct,
    factors.cashFlowGrowthPct,
    factors.marginChangePctPoints,
    factors.cashConversionChangePctPoints,
  ].every(Number.isFinite);
  const nasdaqResidualPathFactorsComplete = [
    timing.alpha60VsSpy,
    timing.alpha60VsQqq,
    timing.alpha120VsSpy,
    timing.alpha120VsQqq,
    factors.continuousInformationPercentile,
    factors.accelerationRestraintPercentile,
    factors.lotteryRestraintPercentile,
    factors.stabilityPercentile,
    factors.drawdownResiliencePercentile,
    factors.highProximityPercentile,
  ].every(Number.isFinite);

  return Boolean(
    (expanded || ["Strong Buy", "Buy"].includes(signal.action)) &&
    (independentlyResearchable || signal.fundamentalDataVerified === true) &&
    (independentlyResearchable || signal.eventRiskVerified === true) &&
    (expanded
      ? timing.available === true &&
        (!config.requireEntryTimingPass || timing.pass === true)
      : signal.entryTimingVerified === true) &&
    (!config.blockChaseEntries || timing.chase !== true) &&
    (!config.requireLiquidityPass || timing.liquidityPass === true) &&
    (!Number.isFinite(config.minimumAverageDollarVolume) ||
      optionalNumber(observedDollarVolume(signal), -Infinity) >=
        config.minimumAverageDollarVolume) &&
    (!Number.isFinite(config.minimumPrice) ||
      optionalNumber(price, -Infinity) >= config.minimumPrice) &&
    (!config.requireAnchoredGradualFactors ||
      anchoredGradualFactorsComplete) &&
    (!config.requireBenchmarkResidualFactors ||
      benchmarkResidualFactorsComplete) &&
    (!config.requireShortTermReversalFactors ||
      shortTermReversalFactorsComplete) &&
    (!config.requireIndustryLeadershipFactors ||
      industryLeadershipFactorsComplete) &&
    (!config.requireAttentionShockFactors ||
      attentionShockFactorsComplete) &&
    (!config.requireEarningsSurpriseFactors ||
      earningsSurpriseFactorsComplete) &&
    (!config.requireFilingChangeFactors || filingChangeFactorsComplete) &&
    (!config.requireFilingPeriodAlignment ||
      optionalNumber(factors.filingAlignedPeriodEnds, 0) === 1) &&
    (!Number.isFinite(config.minimumFilingCoverageFields) ||
      optionalNumber(factors.filingCoverageFields, 0) >=
        config.minimumFilingCoverageFields) &&
    (!Number.isFinite(config.minSessionsSinceFiling) ||
      optionalNumber(factors.sessionsSinceFiling, -Infinity) >=
        config.minSessionsSinceFiling) &&
    (!Number.isFinite(config.maxSessionsSinceFiling) ||
      optionalNumber(factors.sessionsSinceFiling, Infinity) <=
        config.maxSessionsSinceFiling) &&
    (!Number.isFinite(config.minimumRevenueGrowthPct) ||
      optionalNumber(factors.revenueGrowthPct, -Infinity) >=
        config.minimumRevenueGrowthPct) &&
    (!Number.isFinite(config.minimumProfitabilityGrowthPct) ||
      optionalNumber(factors.profitabilityGrowthPct, -Infinity) >=
        config.minimumProfitabilityGrowthPct) &&
    (!Number.isFinite(config.minimumCashFlowGrowthPct) ||
      optionalNumber(factors.cashFlowGrowthPct, -Infinity) >=
        config.minimumCashFlowGrowthPct) &&
    (!Number.isFinite(config.minimumMarginChangePctPoints) ||
      optionalNumber(factors.marginChangePctPoints, -Infinity) >=
        config.minimumMarginChangePctPoints) &&
    (!Number.isFinite(config.minimumCashConversionChangePctPoints) ||
      optionalNumber(factors.cashConversionChangePctPoints, -Infinity) >=
        config.minimumCashConversionChangePctPoints) &&
    (!config.requireNasdaqResidualPathFactors ||
      nasdaqResidualPathFactorsComplete) &&
    (!Number.isFinite(config.minEarningsSurpriseScore) ||
      optionalNumber(factors.earningsSurpriseScore, -Infinity) >=
        config.minEarningsSurpriseScore) &&
    (!Number.isFinite(config.minSessionsSinceEarnings) ||
      optionalNumber(factors.sessionsSinceEarnings, -Infinity) >=
        config.minSessionsSinceEarnings) &&
    (!Number.isFinite(config.maxSessionsSinceEarnings) ||
      optionalNumber(factors.sessionsSinceEarnings, Infinity) <=
        config.maxSessionsSinceEarnings) &&
    (!config.requireTrendAlignment ||
      (price > average50 && average50 > average200)) &&
    (!Number.isFinite(config.minPriceVs50Pct) ||
      optionalNumber(priceVs50Pct, -Infinity) >= config.minPriceVs50Pct) &&
    (!Number.isFinite(config.maxPriceVs50Pct) ||
      optionalNumber(priceVs50Pct, Infinity) <= config.maxPriceVs50Pct) &&
    (!allowedRegimes || allowedRegimes.has(String(timing.benchmarkRegime))) &&
    (!config.requireRelativeStrength ||
      timing.relativeStrengthVerified === true) &&
    (!config.requireStrongEntryTiming || timing.strongPass === true) &&
    (!Number.isFinite(config.minShortTermTechnicalScore) ||
      number(timing.shortTermTechnicalScore, -Infinity) >=
        config.minShortTermTechnicalScore) &&
    (!Number.isFinite(config.minAlpha20VsSpy) ||
      number(timing.alpha20VsSpy, -Infinity) >= config.minAlpha20VsSpy) &&
    (!Number.isFinite(config.maxAlpha20VsSpy) ||
      number(timing.alpha20VsSpy, Infinity) <= config.maxAlpha20VsSpy) &&
    (!Number.isFinite(config.minAlpha60VsSpy) ||
      number(timing.alpha60VsSpy, -Infinity) >= config.minAlpha60VsSpy) &&
    (!Number.isFinite(config.maxAlpha60VsSpy) ||
      number(timing.alpha60VsSpy, Infinity) <= config.maxAlpha60VsSpy) &&
    (!Number.isFinite(config.minAlpha60VsQqq) ||
      number(timing.alpha60VsQqq, -Infinity) >= config.minAlpha60VsQqq) &&
    (!Number.isFinite(config.minAlpha120VsSpy) ||
      number(timing.alpha120VsSpy, -Infinity) >= config.minAlpha120VsSpy) &&
    (!Number.isFinite(config.minAlpha120VsQqq) ||
      number(timing.alpha120VsQqq, -Infinity) >= config.minAlpha120VsQqq) &&
    (!Number.isFinite(config.minReturn120Ex20) ||
      optionalNumber(factors.return120Ex20, -Infinity) >=
        config.minReturn120Ex20) &&
    (!Number.isFinite(config.minRelativeVolume20) ||
      optionalNumber(factors.relativeVolume20, -Infinity) >=
        config.minRelativeVolume20) &&
    (!Number.isFinite(config.minReturn5Pct) ||
      optionalNumber(factors.return5, -Infinity) >= config.minReturn5Pct) &&
    (!Number.isFinite(config.maxReturn5Pct) ||
      optionalNumber(factors.return5, Infinity) <= config.maxReturn5Pct) &&
    (!Number.isFinite(config.minDistanceFromYearHighPct) ||
      optionalNumber(factors.distanceFromYearHighPct, -Infinity) >=
        config.minDistanceFromYearHighPct) &&
    (!Number.isFinite(config.maxReturn20Pct) ||
      optionalNumber(factors.return20, Infinity) <= config.maxReturn20Pct) &&
    (!Number.isFinite(config.maxReturn60Ex5Pct) ||
      optionalNumber(factors.return60Ex5, Infinity) <=
        config.maxReturn60Ex5Pct) &&
    (!Number.isFinite(config.maxReturn120Ex20Pct) ||
      optionalNumber(factors.return120Ex20, Infinity) <=
        config.maxReturn120Ex20Pct) &&
    (!Number.isFinite(config.maxMomentumExtensionSigma) ||
      optionalNumber(observedExtensionSigma, Infinity) <=
        config.maxMomentumExtensionSigma) &&
    (!config.blockDefensiveEntries || timing.benchmarkRegime !== "defensive") &&
    (timing.benchmarkRegime !== "defensive" ||
      !Number.isFinite(config.defensiveRegimeMinAlpha60) ||
      number(timing.alpha60VsSpy, -Infinity) >=
        config.defensiveRegimeMinAlpha60) &&
    optionalNumber(factors.factorCoverage, 0) >=
      config.minimumResearchFactorCoverage &&
    (!Number.isFinite(config.minQualityPercentile) ||
      optionalNumber(factors.qualityPercentile, -Infinity) >=
        config.minQualityPercentile) &&
    (!Number.isFinite(config.minMomentumPercentile) ||
      optionalNumber(factors.momentumPercentile, -Infinity) >=
        config.minMomentumPercentile) &&
    (!Number.isFinite(config.minCompositePercentile) ||
      optionalNumber(factors.globalCompositePercentile, -Infinity) >=
        config.minCompositePercentile) &&
    (!Number.isFinite(config.minSectorCompositePercentile) ||
      optionalNumber(factors.sectorCompositePercentile, -Infinity) >=
        config.minSectorCompositePercentile) &&
    (!Number.isFinite(config.minValuePercentile) ||
      optionalNumber(factors.valuePercentile, -Infinity) >=
        config.minValuePercentile) &&
    (!Number.isFinite(config.minStabilityPercentile) ||
      optionalNumber(factors.stabilityPercentile, -Infinity) >=
        config.minStabilityPercentile) &&
    (!Number.isFinite(config.maxVolatility60Pct) ||
      optionalNumber(factors.volatility60Pct, Infinity) <=
        config.maxVolatility60Pct),
  );
}

  return {researchRank,crossSectionalRankContext,expandedResearchSource,entrySignalPool,entrySignalQualifies};
}

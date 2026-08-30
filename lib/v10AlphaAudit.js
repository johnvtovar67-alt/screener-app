import {
  createWalkForwardFolds,
  simulatePointInTimePortfolio,
  validatePointInTimeDataset,
} from "./walkForwardBacktest";
import {
  V10_EVIDENCE_REQUIREMENTS,
  V10_STRICT_PLACEBO_SEEDS,
  V10_THESIS_ID,
  v10AuditControlDefinitions,
  v10StrategyOptions,
} from "./v10ResearchContract";

const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const average = (values = []) =>
  values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : 0;
const standardDeviation = (values = []) => {
  if (values.length < 2) return 0;
  const center = average(values);
  return Math.sqrt(
    values.reduce((total, value) => total + (value - center) ** 2, 0) /
      (values.length - 1),
  );
};
const round = (value, digits = 2) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};
const percentile = (values = [], level = 0.5) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[
    Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil(level * sorted.length) - 1),
    )
  ];
};

function compoundMetric(runs = [], field) {
  return (
    runs.reduce(
      (value, run) => value * (1 + number(run.metrics?.[field]) / 100),
      1,
    ) - 1
  );
}

function compoundBenchmark(runs = [], symbol) {
  return (
    runs.reduce(
      (value, run) =>
        value *
        (1 +
          number(
            run.metrics?.benchmarkComparisons?.[symbol]?.simpleReturnPct,
          ) /
            100),
      1,
    ) - 1
  );
}

function closedRoundTrips(runs = []) {
  const completed = [];
  for (const [runIndex, run] of runs.entries()) {
    const entries = new Map(
      (run.trades || [])
        .filter((trade) => trade.side === "buy")
        .map((trade) => [trade.positionId, trade]),
    );
    for (const trade of run.trades || []) {
      if (trade.side !== "sell" || trade.positionClosed !== true) continue;
      const entry = entries.get(trade.positionId);
      const entryNotional = number(entry?.shares) * number(entry?.price);
      const pnl = number(trade.roundTripPnl, trade.realizedPnl);
      completed.push({
        runIndex,
        pnl,
        returnPct: entryNotional > 0 ? (pnl / entryNotional) * 100 : null,
        reason: String(trade.reason || "unknown"),
      });
    }
  }
  return completed;
}

function summarizeRuns(runs = []) {
  const totalReturn = compoundMetric(runs, "totalReturnPct");
  const dailyReturns = runs.flatMap((run) => run.metrics?.dailyReturns || []);
  const volatility = standardDeviation(dailyReturns);
  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  for (const dailyReturn of dailyReturns) {
    equity *= 1 + dailyReturn;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, equity / peak - 1);
  }
  const completed = closedRoundTrips(runs);
  const grossProfit = completed.reduce(
    (total, trade) => total + Math.max(0, trade.pnl),
    0,
  );
  const grossLoss = Math.abs(
    completed.reduce((total, trade) => total + Math.min(0, trade.pnl), 0),
  );
  const observedReturns = completed
    .map((trade) => trade.returnPct)
    .filter(Number.isFinite);
  const sessions = runs.reduce(
    (total, run) => total + Math.max(1, run.curve?.length || 0),
    0,
  );
  const weighted = (field) =>
    sessions
      ? runs.reduce(
          (total, run) =>
            total +
            number(run.metrics?.[field]) * Math.max(1, run.curve?.length || 0),
          0,
        ) / sessions
      : 0;
  const benchmarkComparisons = {};
  for (const symbol of V10_EVIDENCE_REQUIREMENTS.requiredBenchmarks) {
    const benchmarkReturn = compoundBenchmark(runs, symbol);
    benchmarkComparisons[symbol] = {
      simpleReturnPct: round(benchmarkReturn * 100),
      excessReturnPct: round((totalReturn - benchmarkReturn) * 100),
    };
  }
  return {
    totalReturnPct: round(totalReturn * 100),
    sharpe: volatility
      ? round((average(dailyReturns) / volatility) * Math.sqrt(252), 3)
      : 0,
    maxDrawdownPct: round(maxDrawdown * 100),
    profitFactor: grossLoss ? round(grossProfit / grossLoss, 3) : null,
    expectancyPct: observedReturns.length
      ? round(average(observedReturns), 3)
      : null,
    closedTrades: completed.length,
    averageActiveExposurePct: round(weighted("averageActiveExposurePct")),
    averageBenchmarkSleevePct: round(weighted("averageBenchmarkSleevePct")),
    annualizedTurnoverPct: round(weighted("annualizedTurnoverPct")),
    benchmarkComparisons,
  };
}

function holdoutAttestation(metadata = {}) {
  const attestation = metadata.v10HoldoutAttestation || {};
  return {
    sealedBeforeEvaluation: attestation.sealedBeforeEvaluation === true,
    excludedFromV7ThroughV10Development:
      attestation.excludedFromV7ThroughV10Development === true,
    thesisFrozenBeforeReveal: attestation.thesisFrozenBeforeReveal === true,
  };
}

export function runV10AlphaAudit(dataset = {}, options = {}) {
  const validation = validatePointInTimeDataset(dataset, {
    minimumSessions: options.minimumSessions ?? 1_008,
  });
  if (!validation.valid) {
    const error = new Error(
      `Point-in-time dataset rejected:\n- ${validation.errors.join("\n- ")}`,
    );
    error.validation = validation;
    throw error;
  }
  const dates = dataset.sessions.map((session) => session.date);
  const folds = createWalkForwardFolds(dates, options.folds);
  if (folds.length < 3)
    throw new Error(
      `V10 requires at least three complete walk-forward folds; received ${folds.length}.`,
    );
  const placeboSeedCount = Math.max(
    1,
    Math.floor(number(options.placeboSeedCount, V10_STRICT_PLACEBO_SEEDS)),
  );
  const strategy = v10StrategyOptions({
    slippageBps: number(options.slippageBps, 12),
    commissionPerOrder: number(options.commissionPerOrder, 0),
  });
  const controls = v10AuditControlDefinitions();
  const activeRuns = [];
  const momentumRuns = [];
  const qualityRuns = [];
  const transparentBullCyclePullbackRuns = [];
  const placeboRunsBySeed = Array.from(
    { length: placeboSeedCount },
    () => [],
  );
  for (const fold of folds) {
    const window = { startDate: fold.test.start, endDate: fold.test.end };
    activeRuns.push(
      simulatePointInTimePortfolio(dataset, { ...strategy, ...window }),
    );
    momentumRuns.push(
      simulatePointInTimePortfolio(dataset, {
        ...strategy,
        ...controls[0],
        thesisId: controls[0].controlId,
        selectionEligible: false,
        ...window,
      }),
    );
    qualityRuns.push(
      simulatePointInTimePortfolio(dataset, {
        ...strategy,
        ...controls[1],
        thesisId: controls[1].controlId,
        selectionEligible: false,
        ...window,
      }),
    );
    transparentBullCyclePullbackRuns.push(
      simulatePointInTimePortfolio(dataset, {
        ...strategy,
        ...controls[2],
        thesisId: controls[2].controlId,
        selectionEligible: false,
        ...window,
      }),
    );
    for (let seedIndex = 0; seedIndex < placeboSeedCount; seedIndex++) {
      placeboRunsBySeed[seedIndex].push(
        simulatePointInTimePortfolio(dataset, {
          ...strategy,
          thesisId: `random-placebo-${seedIndex + 1}`,
          selectionEligible: false,
          researchRankMode: "random-placebo",
          researchRandomSeed: seedIndex + 1,
          ...window,
        }),
      );
      if (typeof options.onProgress === "function")
        options.onProgress({
          fold: fold.fold,
          foldCount: folds.length,
          placeboSeed: seedIndex + 1,
          placeboSeedCount,
        });
    }
  }
  const summary = summarizeRuns(activeRuns);
  const momentum = summarizeRuns(momentumRuns);
  const quality = summarizeRuns(qualityRuns);
  const transparentBullCyclePullback = summarizeRuns(
    transparentBullCyclePullbackRuns,
  );
  const placeboSummaries = placeboRunsBySeed.map(summarizeRuns);
  const placeboReturns = placeboSummaries.map((run) => run.totalReturnPct);
  const placebo95 = percentile(
    placeboReturns,
    V10_EVIDENCE_REQUIREMENTS.placeboPercentileToBeat,
  );
  const attestation = holdoutAttestation(dataset.metadata);
  const foldRows = folds.map((fold, index) => ({
    fold: fold.fold,
    windows: fold,
    metrics: summarizeRuns([activeRuns[index]]),
  }));
  const checks = {
    strictPointInTimeDataset: validation.credibleForResearch === true,
    atLeastThreeWalkForwardFolds: folds.length >= 3,
    holdoutSealedBeforeEvaluation: attestation.sealedBeforeEvaluation,
    holdoutExcludedFromDevelopment:
      attestation.excludedFromV7ThroughV10Development,
    thesisFrozenBeforeHoldoutReveal: attestation.thesisFrozenBeforeReveal,
    positiveSimpleAlphaVsSpy:
      number(summary.benchmarkComparisons.SPY?.excessReturnPct, -Infinity) > 0,
    positiveSimpleAlphaVsQqq:
      number(summary.benchmarkComparisons.QQQ?.excessReturnPct, -Infinity) > 0,
    beatsSpyInMajorityOfFolds:
      foldRows.filter(
        (fold) => fold.metrics.benchmarkComparisons.SPY.excessReturnPct > 0,
      ).length >
      folds.length * V10_EVIDENCE_REQUIREMENTS.minimumPositiveAlphaFoldShare,
    beatsQqqInMajorityOfFolds:
      foldRows.filter(
        (fold) => fold.metrics.benchmarkComparisons.QQQ.excessReturnPct > 0,
      ).length >
      folds.length * V10_EVIDENCE_REQUIREMENTS.minimumPositiveAlphaFoldShare,
    positiveExpectancy: number(summary.expectancyPct, -Infinity) > 0,
    profitFactorAboveOne: number(summary.profitFactor, -Infinity) > 1,
    minimumClosedRoundTrips:
      summary.closedTrades >=
      V10_EVIDENCE_REQUIREMENTS.minimumClosedRoundTrips,
    minimumActiveStockExposure:
      summary.averageActiveExposurePct >=
      V10_EVIDENCE_REQUIREMENTS.minimumAverageActiveStockExposurePct,
    noBenchmarkCompletionSleeve: summary.averageBenchmarkSleevePct === 0,
    beatsSimpleMomentumControl:
      summary.totalReturnPct > momentum.totalReturnPct,
    beatsSimpleQualityControl: summary.totalReturnPct > quality.totalReturnPct,
    beatsTransparentBullCyclePullbackControl:
      summary.totalReturnPct > transparentBullCyclePullback.totalReturnPct,
    strictPlaceboCount:
      placeboSeedCount >=
      V10_EVIDENCE_REQUIREMENTS.strictPointInTimePlaceboSeeds,
    beatsRandomPlacebo95thPercentile: summary.totalReturnPct > placebo95,
  };
  const pass = Object.values(checks).every(Boolean);
  return {
    generatedAt: new Date().toISOString(),
    thesisId: V10_THESIS_ID,
    thesis: strategy,
    selectionPolicy: "single-predeclared-thesis-no-selector",
    primaryAlphaMeasure: V10_EVIDENCE_REQUIREMENTS.primaryAlphaMeasure,
    validation,
    holdoutAttestation: attestation,
    foldCount: folds.length,
    folds: foldRows,
    summary,
    controls: {
      sameUniverseLifecycleSizingAndCosts: true,
      simpleMomentum: momentum,
      simpleQuality: quality,
      transparentBullCyclePullback,
      randomPlacebo: {
        seedCount: placeboSeedCount,
        medianTotalReturnPct: percentile(placeboReturns, 0.5),
        percentile95TotalReturnPct: placebo95,
        minimumTotalReturnPct: Math.min(...placeboReturns),
        maximumTotalReturnPct: Math.max(...placeboReturns),
        returnsBySeed: placeboReturns.map((totalReturnPct, index) => ({
          seed: index + 1,
          totalReturnPct,
        })),
      },
    },
    evidenceAssessment: {
      status: pass
        ? "eligible-for-independent-review"
        : "alpha-not-demonstrated",
      pass,
      checks,
      capitalClaimAuthorized: false,
      explanation: pass
        ? "The frozen thesis passed the strict historical evidence gates; independent review and an immutable forward paper record are still required before live promotion."
        : "At least one strict data, independence, benchmark, trade-quality or placebo gate failed.",
    },
  };
}

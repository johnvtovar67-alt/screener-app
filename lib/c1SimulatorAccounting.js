// Pure portfolio result accounting; trading, fills and ownership stay in the simulator.
// The caller supplies its original numeric helpers and immutable stop-reason set.
export function createC1SimulatorAccounting({number,optionalNumber,clamp,round,average,standardDeviation,STOP_EXIT_REASONS}) {
function roundTripDiagnostics(trades = []) {
  const entries = new Map(
    trades
      .filter((trade) => trade.side === "buy")
      .map((trade) => [trade.positionId, trade]),
  );
  const completed = trades
    .filter((trade) => trade.side === "sell" && trade.positionClosed === true)
    .map((trade) => {
      const entry = entries.get(trade.positionId);
      const entryNotional = number(entry?.shares, 0) * number(entry?.price, 0);
      return {
        returnPct:
          entryNotional > 0
            ? (number(trade.roundTripPnl, trade.realizedPnl) / entryNotional) *
              100
            : null,
        reason: String(trade.reason || "unknown"),
        holdingSessions: number(trade.holdingSessions, null),
        mfePct: number(trade.mfePct, null),
        maePct: number(trade.maePct, null),
      };
    })
    .filter((trade) => Number.isFinite(trade.returnPct));
  const values = completed.map((trade) => trade.returnPct);
  const winners = values.filter((value) => value > 0);
  const losers = values.filter((value) => value < 0);
  const holdings = completed
    .map((trade) => trade.holdingSessions)
    .filter(Number.isFinite);
  const exitsByReason = {};
  for (const trade of completed)
    exitsByReason[trade.reason] = number(exitsByReason[trade.reason], 0) + 1;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    expectancyPct: values.length ? round(average(values), 2) : null,
    medianReturnPct: values.length
      ? round(sorted[Math.floor(sorted.length / 2)], 2)
      : null,
    averageWinnerPct: winners.length ? round(average(winners), 2) : null,
    averageLoserPct: losers.length ? round(average(losers), 2) : null,
    winLossPayoffRatio:
      winners.length && losers.length
        ? round(average(winners) / Math.abs(average(losers)), 3)
        : null,
    averageHoldingSessions: holdings.length
      ? round(average(holdings), 1)
      : null,
    averageMfePct: completed.some((trade) => Number.isFinite(trade.mfePct))
      ? round(
          average(
            completed.map((trade) => trade.mfePct).filter(Number.isFinite),
          ),
          2,
        )
      : null,
    averageMaePct: completed.some((trade) => Number.isFinite(trade.maePct))
      ? round(
          average(
            completed.map((trade) => trade.maePct).filter(Number.isFinite),
          ),
          2,
        )
      : null,
    stopOutRatePct: completed.length
      ? round(
          (completed.filter((trade) => STOP_EXIT_REASONS.has(trade.reason))
            .length /
            completed.length) *
            100,
          2,
        )
      : null,
    exitsByReason,
  };
}

function benchmarkAttribution(curve = [], benchmarkCurve = []) {
  const benchmarkReturn =
    benchmarkCurve.length > 1 && benchmarkCurve[0].value > 0
      ? benchmarkCurve.at(-1).value / benchmarkCurve[0].value - 1
      : 0;
  const benchmarkByDate = new Map(
    benchmarkCurve.map((row) => [row.date, number(row.value)]),
  );
  let exposureMatchedBenchmark = 1;
  for (let index = 1; index < curve.length; index++) {
    const priorBenchmark = benchmarkByDate.get(curve[index - 1].date);
    const currentBenchmark = benchmarkByDate.get(curve[index].date);
    if (!(priorBenchmark > 0) || !(currentBenchmark > 0)) continue;
    const priorEquity = number(curve[index - 1].equity);
    const recordedExposure = optionalNumber(
      curve[index - 1].benchmarkExposure,
      null,
    );
    const priorExposure = Number.isFinite(recordedExposure)
      ? clamp(recordedExposure, 0, 1)
      : priorEquity > 0
        ? clamp(1 - number(curve[index - 1].cash) / priorEquity, 0, 1)
        : 0;
    exposureMatchedBenchmark *=
      1 + (currentBenchmark / priorBenchmark - 1) * priorExposure;
  }
  return {
    benchmarkReturn,
    exposureMatchedBenchmarkReturn: exposureMatchedBenchmark - 1,
  };
}

function metricsFromCurve(
  curve = [],
  trades = [],
  benchmarkCurve = [],
  benchmarkCurves = {},
) {
  if (!curve.length)
    return {
      totalReturnPct: 0,
      cagrPct: 0,
      maxDrawdownPct: 0,
      sharpe: 0,
      sortino: 0,
      trades: 0,
    };
  const values = curve.map((row) => number(row.equity));
  const dailyReturns = [];
  let peak = values[0];
  let maxDrawdown = 0;
  for (let index = 1; index < values.length; index++) {
    if (values[index - 1] > 0)
      dailyReturns.push(values[index] / values[index - 1] - 1);
    peak = Math.max(peak, values[index]);
    if (peak > 0) maxDrawdown = Math.min(maxDrawdown, values[index] / peak - 1);
  }
  const years = Math.max(1 / 252, (curve.length - 1) / 252);
  const totalReturn = values[0] > 0 ? values.at(-1) / values[0] - 1 : 0;
  const volatility = standardDeviation(dailyReturns);
  const downside = standardDeviation(dailyReturns.filter((value) => value < 0));
  const closed = trades.filter(
    (trade) => trade.side === "sell" && trade.positionClosed === true,
  );
  const tradePnl = (trade) => number(trade.roundTripPnl, trade.realizedPnl);
  const wins = closed.filter((trade) => tradePnl(trade) > 0);
  const grossProfit = closed.reduce(
    (sum, trade) => sum + Math.max(0, tradePnl(trade)),
    0,
  );
  const grossLoss = Math.abs(
    closed.reduce((sum, trade) => sum + Math.min(0, tradePnl(trade)), 0),
  );
  const primaryAttribution = benchmarkAttribution(curve, benchmarkCurve);
  const benchmarkComparisons = {};
  for (const [symbol, comparisonCurve] of Object.entries(
    benchmarkCurves || {},
  )) {
    const attribution = benchmarkAttribution(curve, comparisonCurve);
    benchmarkComparisons[symbol] = {
      simpleReturnPct: round(attribution.benchmarkReturn * 100, 2),
      excessReturnPct: round(
        (totalReturn - attribution.benchmarkReturn) * 100,
        2,
      ),
      exposureMatchedReturnPct: round(
        attribution.exposureMatchedBenchmarkReturn * 100,
        2,
      ),
      exposureMatchedAlphaPct: round(
        (totalReturn - attribution.exposureMatchedBenchmarkReturn) * 100,
        2,
      ),
      cashDragPct: round(
        (attribution.exposureMatchedBenchmarkReturn -
          attribution.benchmarkReturn) *
          100,
        2,
      ),
    };
  }
  const averageEquity = average(values);
  const tradedNotional = trades.reduce(
    (sum, trade) => sum + number(trade.shares) * number(trade.price),
    0,
  );
  const averageActiveExposure = average(
    curve.map((row) => {
      const recorded = optionalNumber(row.activeExposure, null);
      if (Number.isFinite(recorded)) return clamp(recorded, 0, 1);
      return number(row.equity) > 0
        ? clamp(1 - number(row.cash) / number(row.equity), 0, 1)
        : 0;
    }),
  );
  const averageExposure = average(
    curve.map((row) => {
      const recorded = optionalNumber(row.benchmarkExposure, null);
      return Number.isFinite(recorded)
        ? clamp(recorded, 0, 1)
        : number(row.equity) > 0
          ? clamp(1 - number(row.cash) / number(row.equity), 0, 1)
          : 0;
    }),
  );
  const averageBenchmarkSleeve = average(
    curve.map((row) =>
      number(row.equity) > 0
        ? clamp(number(row.benchmarkSleeveValue, 0) / number(row.equity), 0, 1)
        : 0,
    ),
  );
  return {
    totalReturnPct: round(totalReturn * 100, 2),
    cagrPct: round((Math.pow(1 + totalReturn, 1 / years) - 1) * 100, 2),
    maxDrawdownPct: round(maxDrawdown * 100, 2),
    annualizedVolatilityPct: round(volatility * Math.sqrt(252) * 100, 2),
    sharpe: volatility
      ? round((average(dailyReturns) / volatility) * Math.sqrt(252), 3)
      : 0,
    sortino: downside
      ? round((average(dailyReturns) / downside) * Math.sqrt(252), 3)
      : 0,
    trades: trades.length,
    closedTrades: closed.length,
    winRatePct: closed.length
      ? round((wins.length / closed.length) * 100, 2)
      : 0,
    profitFactor: grossLoss ? round(grossProfit / grossLoss, 3) : null,
    benchmarkReturnPct: round(primaryAttribution.benchmarkReturn * 100, 2),
    excessReturnPct: round(
      (totalReturn - primaryAttribution.benchmarkReturn) * 100,
      2,
    ),
    exposureMatchedBenchmarkReturnPct: round(
      primaryAttribution.exposureMatchedBenchmarkReturn * 100,
      2,
    ),
    exposureMatchedAlphaPct: round(
      (totalReturn - primaryAttribution.exposureMatchedBenchmarkReturn) * 100,
      2,
    ),
    cashDragVsBenchmarkPct: round(
      (primaryAttribution.exposureMatchedBenchmarkReturn -
        primaryAttribution.benchmarkReturn) *
        100,
      2,
    ),
    benchmarkComparisons,
    averageExposurePct: round(averageExposure * 100, 2),
    averageActiveExposurePct: round(averageActiveExposure * 100, 2),
    averageBenchmarkSleevePct: round(averageBenchmarkSleeve * 100, 2),
    turnoverPct: averageEquity
      ? round((tradedNotional / averageEquity) * 100, 2)
      : 0,
    annualizedTurnoverPct:
      averageEquity && curve.length
        ? round(
            (tradedNotional / averageEquity) * (252 / curve.length) * 100,
            2,
          )
        : 0,
    tradeDiagnostics: roundTripDiagnostics(trades),
    dailyReturns,
  };
}

  return {metricsFromCurve};
}

// Deterministic point-in-time portfolio simulator and walk-forward evaluator.
//
// This module does not download data and it does not grant credibility to a
// backtest merely because the arithmetic ran. validatePointInTimeDataset rejects
// look-ahead timestamps, current-only universes, unadjusted prices, missing event
// history, and other common sources of false alpha before capital is simulated.

export const POINT_IN_TIME_SCHEMA = "screener-pit-v1";

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIONS = new Set(["Strong Buy", "Buy", "Watch", "Avoid", "Paused"]);
const EXIT_ACTIONS = new Set(["Exit", "Rotate"]);
const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const timestamp = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};
const symbolOf = (value) =>
  String(value?.symbol || value?.ticker || value || "")
    .toUpperCase()
    .trim();
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round = (value, digits = 6) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};
const average = (items) =>
  items.length ? items.reduce((sum, value) => sum + value, 0) / items.length : 0;
const standardDeviation = (items) => {
  if (items.length < 2) return 0;
  const mean = average(items);
  return Math.sqrt(
    items.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      (items.length - 1),
  );
};

export function validatePointInTimeDataset(dataset = {}, options = {}) {
  const minimumSessions = Math.max(2, number(options.minimumSessions, 756));
  const errors = [];
  const warnings = [];
  const metadata = dataset.metadata || {};
  const sessions = Array.isArray(dataset.sessions) ? dataset.sessions : [];
  const requireFlag = (key, message) => {
    if (metadata[key] !== true) errors.push(message);
  };

  if (metadata.schema !== POINT_IN_TIME_SCHEMA)
    errors.push(`Dataset schema must be ${POINT_IN_TIME_SCHEMA}.`);
  requireFlag(
    "pointInTime",
    "Dataset must explicitly certify point-in-time construction.",
  );
  requireFlag(
    "survivorshipBiasFree",
    "Dataset must include historical listings and delisted securities.",
  );
  requireFlag(
    "universeMembershipPointInTime",
    "Each session must use the securities listed on that date, not today's universe.",
  );
  requireFlag(
    "delistedSecuritiesIncluded",
    "Delisted securities are required; a current-symbol list is not valid history.",
  );
  requireFlag(
    "delistingReturnsComplete",
    "Delisting cash/recovery outcomes are required so vanished positions cannot be carried at their last quote.",
  );
  requireFlag(
    "corporateActionsAdjusted",
    "Split/dividend-adjusted historical prices are required.",
  );
  requireFlag(
    "fundamentalsPointInTime",
    "Historical fundamentals must be selected by their public availability time.",
  );
  requireFlag(
    "fundamentalValuesRevisionSafe",
    "Historical fundamental values must be as originally available, not silently restated with later knowledge.",
  );
  requireFlag(
    "eventRiskPointInTime",
    "Historical earnings/material-event checks are required for every actionable signal.",
  );
  requireFlag(
    "materialNewsHistoryComplete",
    "Historical material-news coverage is required; earnings dates alone do not reproduce the pre-trade gate.",
  );
  requireFlag(
    "portfolioDecisionInputsComplete",
    "Historical signal rows must preserve the inputs required to replay the production portfolio-decision policy.",
  );
  requireFlag(
    "capitalPolicyInputsComplete",
    "Historical signal rows must preserve the inputs required to replay the production capital-allocation policy.",
  );
  if (metadata.fundamentalAvailabilityField !== "acceptedDate")
    errors.push(
      "Fundamental availability must use SEC acceptedDate, not fiscal period end or filing date alone.",
    );
  if (!metadata.benchmarkSymbol)
    errors.push("A benchmark symbol is required for out-of-sample comparison.");
  if (sessions.length < minimumSessions)
    errors.push(
      `At least ${minimumSessions} ordered market sessions are required; received ${sessions.length}.`,
    );

  let priorDate = "";
  let actionableRows = 0;
  let delistedRows = 0;
  let historicalDelistedMembership = 0;
  let delistingEvents = 0;
  let sourceUniverseObservations = 0;
  const dateSet = new Set();
  for (let sessionIndex = 0; sessionIndex < sessions.length; sessionIndex++) {
    const session = sessions[sessionIndex] || {};
    const date = String(session.date || "");
    const decisionAt = timestamp(session.decisionAt);
    const signals = Array.isArray(session.signals) ? session.signals : [];
    const prices = Array.isArray(session.prices) ? session.prices : [];
    const corporateActions = Array.isArray(session.corporateActions)
      ? session.corporateActions
      : [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      errors.push(`Session ${sessionIndex} has an invalid YYYY-MM-DD date.`);
    if (dateSet.has(date)) errors.push(`Duplicate session date ${date}.`);
    dateSet.add(date);
    if (priorDate && date <= priorDate)
      errors.push(`Sessions are not strictly increasing at ${date}.`);
    priorDate = date;
    if (decisionAt === null)
      errors.push(`Session ${date || sessionIndex} is missing decisionAt.`);
    if (
      !prices.some(
        (row) => symbolOf(row) === symbolOf(metadata.benchmarkSymbol),
      )
    )
      errors.push(`Session ${date} is missing ${metadata.benchmarkSymbol} prices.`);
    if (!(number(session.sourceUniverseCount, 0) > 0))
      errors.push(`Session ${date} is missing its source-universe count.`);
    sourceUniverseObservations += number(session.sourceUniverseCount, 0);
    historicalDelistedMembership += number(
      session.historicalDelistedMembership,
      0,
    );
    for (const row of prices) {
      const symbol = symbolOf(row) || "unknown";
      if (row.adjusted !== true)
        errors.push(
          `${symbol} on ${date} does not explicitly certify adjusted OHLCV.`,
        );
      for (const field of ["open", "high", "low", "close"])
        if (!(number(row[field], 0) > 0))
          errors.push(`${symbol} on ${date} is missing a valid ${field} price.`);
    }
    for (const action of corporateActions) {
      if (String(action.type || "").toLowerCase() !== "delisting") continue;
      delistingEvents++;
      if (!symbolOf(action))
        errors.push(`A delisting event on ${date} is missing its symbol.`);
      if (number(action.valuePerShare, -1) < 0)
        errors.push(
          `${symbolOf(action) || "unknown"} on ${date} is missing a non-negative delisting value per share.`,
        );
    }

    const seen = new Set();
    for (const signal of signals) {
      const symbol = symbolOf(signal);
      if (!symbol) {
        errors.push(`Session ${date} contains a signal without a symbol.`);
        continue;
      }
      if (seen.has(symbol))
        errors.push(`Session ${date} contains duplicate signal ${symbol}.`);
      seen.add(symbol);
      if (!ACTIONS.has(signal.action))
        errors.push(`Session ${date} has invalid action for ${symbol}.`);
      const availabilityFields = [
        "marketAvailableAt",
        "fundamentalsAvailableAt",
        "eventRiskAvailableAt",
      ];
      for (const field of availabilityFields) {
        const availableAt = timestamp(signal[field]);
        if (availableAt === null)
          errors.push(`${symbol} on ${date} is missing ${field}.`);
        else if (decisionAt !== null && availableAt > decisionAt)
          errors.push(
            `${symbol} on ${date} uses ${field} after the decision timestamp (look-ahead).`,
          );
      }
      const listedAt = timestamp(signal.listedAt);
      const delistedAt = timestamp(signal.delistedAt);
      if (listedAt === null)
        errors.push(`${symbol} on ${date} is missing listedAt.`);
      else if (decisionAt !== null && listedAt > decisionAt)
        errors.push(`${symbol} appears before its listing on ${date}.`);
      if (delistedAt !== null) {
        delistedRows++;
        if (String(signal.delistedAt).slice(0, 10) < date)
          errors.push(`${symbol} appears after delisting on ${date}.`);
      }
      if (["Buy", "Strong Buy"].includes(signal.action)) {
        actionableRows++;
        if (signal.fundamentalDataVerified !== true)
          errors.push(
            `${symbol} on ${date} is actionable without verified point-in-time fundamentals.`,
          );
        if (signal.fundamentalRevisionSafe !== true)
          errors.push(
            `${symbol} on ${date} is actionable without revision-safe original fundamental values.`,
          );
        if (signal.eventRiskVerified !== true)
          errors.push(
            `${symbol} on ${date} is actionable without verified point-in-time event risk.`,
          );
        if (signal.eventHistoryComplete !== true)
          errors.push(
            `${symbol} on ${date} is actionable without complete as-known material-event history.`,
          );
        if (signal.entryTimingVerified !== true)
          errors.push(
            `${symbol} on ${date} is actionable without historical entry-timing verification.`,
          );
      }
    }
  }
  if (
    sessions.length >= 252 &&
    delistedRows === 0 &&
    historicalDelistedMembership === 0
  )
    errors.push(
      "No historical delisted membership was observed across a one-year-plus sample.",
    );
  if (
    sessions.length >= 252 &&
    historicalDelistedMembership > 0 &&
    delistingEvents === 0
  )
    errors.push(
      "Historical delisted membership exists, but no delisting return/recovery events were supplied.",
    );
  if (actionableRows === 0)
    warnings.push("Dataset contains no actionable observations; mechanics can run but alpha cannot be measured.");
  if (sourceUniverseObservations === 0)
    errors.push("Historical source-universe breadth was not recorded.");
  if (!metadata.dataVendorEntitlementsVerified)
    warnings.push(
      "Vendor entitlement/capability verification is not recorded; do not present results as production-grade research.",
    );

  return {
    valid: errors.length === 0,
    credibleForResearch:
      errors.length === 0 &&
      metadata.dataVendorEntitlementsVerified === true &&
      sessions.length >= 756 &&
      actionableRows > 0,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    stats: {
      sessions: sessions.length,
      actionableRows,
      delistedRows,
      historicalDelistedMembership,
      delistingEvents,
      averageSourceUniverseSize: sessions.length
        ? Math.round(sourceUniverseObservations / sessions.length)
        : 0,
    },
  };
}

export function createWalkForwardFolds(
  dates = [],
  {
    trainSessions = 504,
    validationSessions = 126,
    testSessions = 126,
    stepSessions = 126,
  } = {},
) {
  const folds = [];
  const required = trainSessions + validationSessions + testSessions;
  for (
    let start = 0, fold = 1;
    start + required <= dates.length;
    start += stepSessions, fold++
  ) {
    const trainEnd = start + trainSessions;
    const validationEnd = trainEnd + validationSessions;
    const testEnd = validationEnd + testSessions;
    folds.push({
      fold,
      train: { start: dates[start], end: dates[trainEnd - 1] },
      validation: {
        start: dates[trainEnd],
        end: dates[validationEnd - 1],
      },
      test: { start: dates[validationEnd], end: dates[testEnd - 1] },
    });
  }
  return folds;
}

function priceMap(session = {}) {
  return new Map(
    (session.prices || []).map((row) => [symbolOf(row), row]).filter(([key]) => key),
  );
}

function factorOf(signal = {}) {
  return String(signal.factor || signal.primaryTheme || signal.sector || "Other");
}

function updatePersistence(state, signals = []) {
  const observed = new Set();
  for (const signal of signals) {
    const symbol = symbolOf(signal);
    if (!symbol) continue;
    observed.add(symbol);
    const prior = state.get(symbol) || { buySessions: 0, strongSessions: 0 };
    if (signal.action === "Strong Buy")
      state.set(symbol, {
        buySessions: prior.buySessions + 1,
        strongSessions: prior.strongSessions + 1,
        currentAction: signal.action,
      });
    else if (signal.action === "Buy")
      state.set(symbol, {
        buySessions: prior.buySessions + 1,
        strongSessions: prior.strongSessions,
        currentAction: signal.action,
      });
    else if (["Watch", "Avoid"].includes(signal.action))
      state.set(symbol, {
        buySessions: 0,
        strongSessions: 0,
        currentAction: signal.action,
      });
    else if (signal.action === "Paused")
      state.set(symbol, { ...prior, currentAction: signal.action });
  }
  return observed;
}

function persistenceEligible(signal, state, capitalSignalEligible = null) {
  const current = state.get(symbolOf(signal));
  const persistent =
    signal.action === "Strong Buy" ||
    (signal.action === "Buy" && number(current?.buySessions, 0) >= 2);
  if (typeof capitalSignalEligible === "function")
    return Boolean(
      capitalSignalEligible({
        target: signal,
        action: signal.action,
        persistence: {
          persistent,
          actionableDays: number(current?.buySessions, 0),
          strongDays: number(current?.strongSessions, 0),
          historyAvailable: true,
          interrupted: false,
        },
      })?.pass,
    );
  return persistent;
}

function equityValue(cash, positions, prices) {
  let value = cash;
  for (const [symbol, position] of positions) {
    const row = prices.get(symbol);
    const mark = number(row?.close, position.lastPrice);
    value += position.shares * mark;
  }
  return value;
}

function factorExposure(positions, prices) {
  const factors = new Map();
  for (const [symbol, position] of positions) {
    const mark = number(prices.get(symbol)?.close, position.lastPrice);
    factors.set(
      position.factor,
      number(factors.get(position.factor), 0) + position.shares * mark,
    );
  }
  return factors;
}

function tradePrice(rawPrice, side, slippageBps) {
  const price = number(rawPrice, 0);
  const impact = number(slippageBps, 0) / 10_000;
  return side === "buy" ? price * (1 + impact) : price * (1 - impact);
}

function metricsFromCurve(curve = [], trades = [], benchmarkCurve = []) {
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
  const closed = trades.filter((trade) => trade.side === "sell");
  const wins = closed.filter((trade) => number(trade.realizedPnl) > 0);
  const grossProfit = closed.reduce(
    (sum, trade) => sum + Math.max(0, number(trade.realizedPnl)),
    0,
  );
  const grossLoss = Math.abs(
    closed.reduce(
      (sum, trade) => sum + Math.min(0, number(trade.realizedPnl)),
      0,
    ),
  );
  const benchmarkReturn =
    benchmarkCurve.length > 1 && benchmarkCurve[0].value > 0
      ? benchmarkCurve.at(-1).value / benchmarkCurve[0].value - 1
      : 0;
  const averageEquity = average(values);
  const tradedNotional = trades.reduce(
    (sum, trade) => sum + number(trade.shares) * number(trade.price),
    0,
  );
  const averageExposure = average(
    curve.map((row) =>
      number(row.equity) > 0
        ? 1 - number(row.cash) / number(row.equity)
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
    winRatePct: closed.length ? round((wins.length / closed.length) * 100, 2) : 0,
    profitFactor: grossLoss ? round(grossProfit / grossLoss, 3) : null,
    benchmarkReturnPct: round(benchmarkReturn * 100, 2),
    excessReturnPct: round((totalReturn - benchmarkReturn) * 100, 2),
    averageExposurePct: round(averageExposure * 100, 2),
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
    dailyReturns,
  };
}

export function simulatePointInTimePortfolio(dataset = {}, options = {}) {
  const config = {
    initialCapital: 100_000,
    maxPositions: 10,
    buyTargetPct: 0.06,
    strongBuyTargetPct: 0.09,
    buyMaxPositionPct: 0.08,
    strongBuyMaxPositionPct: 0.12,
    buyMaxFactorPct: 0.3,
    strongBuyMaxFactorPct: 0.35,
    minimumTrade: 750,
    slippageBps: 10,
    commissionPerOrder: 0,
    blockedSymbols: [],
    startDate: null,
    endDate: null,
    warmupSessions: 2,
    positionDecision: null,
    capitalAllowance: null,
    portfolioRiskSnapshot: null,
    portfolioContributionGate: null,
    capitalSignalEligible: null,
    ...options,
  };
  const allSessions = Array.isArray(dataset.sessions) ? dataset.sessions : [];
  const startIndex = config.startDate
    ? allSessions.findIndex((session) => session.date >= config.startDate)
    : 0;
  const effectiveStart = startIndex < 0 ? allSessions.length : startIndex;
  const warmupStart = Math.max(0, effectiveStart - config.warmupSessions);
  const sessions = allSessions.slice(warmupStart).filter(
    (session) => !config.endDate || session.date <= config.endDate,
  );
  const blocked = new Set(config.blockedSymbols.map(symbolOf));
  const persistence = new Map();
  const positions = new Map();
  const pending = [];
  const trades = [];
  const curve = [];
  const benchmarkCurve = [];
  let cash = config.initialCapital;
  let benchmarkShares = null;

  for (const session of sessions) {
    const prices = priceMap(session);
    const active = session.date >= (config.startDate || session.date);
    const delistingActions = (session.corporateActions || []).filter(
      (action) => String(action.type || "").toLowerCase() === "delisting",
    );
    const delistedToday = new Set(delistingActions.map(symbolOf));

    if (active) {
      // Delisting/acquisition proceeds are explicit dataset outcomes. Never keep
      // marking a vanished security at its last quote.
      for (const action of delistingActions) {
        const symbol = symbolOf(action),position = positions.get(symbol);
        if (!position) continue;
        const valuePerShare = Math.max(0, number(action.valuePerShare, 0));
        const proceeds = Math.max(
          0,
          position.shares * valuePerShare - config.commissionPerOrder,
        );
        const realizedPnl =
          proceeds - position.shares * position.entryPrice;
        cash += proceeds;
        trades.push({
          date: session.date,
          symbol,
          side: "sell",
          reason: "delisting-outcome",
          shares: position.shares,
          price: valuePerShare,
          realizedPnl,
        });
        positions.delete(symbol);
      }
      // Stops were known before today's range. Gap-through exits fill at the open;
      // otherwise the stop price is used, with the same adverse slippage as any sell.
      for (const [symbol, position] of [...positions]) {
        const row = prices.get(symbol);
        if (!row || !(position.stopPrice > 0)) continue;
        if (number(row.low, Infinity) <= position.stopPrice) {
          const rawFill =
            number(row.open, position.stopPrice) < position.stopPrice
              ? number(row.open)
              : position.stopPrice;
          const fill = tradePrice(rawFill, "sell", config.slippageBps);
          const proceeds = position.shares * fill - config.commissionPerOrder;
          const realizedPnl =
            position.shares * (fill - position.entryPrice) -
            config.commissionPerOrder;
          cash += proceeds;
          trades.push({
            date: session.date,
            symbol,
            side: "sell",
            reason: "invalidation-stop",
            shares: position.shares,
            price: fill,
            realizedPnl,
          });
          positions.delete(symbol);
        }
      }

      // Close-generated orders always execute at this next session's open.
      const todaysOrders = pending.splice(0, pending.length);
      const sellOrders = todaysOrders.filter((order) => order.side === "sell");
      const buyOrders = todaysOrders.filter((order) => order.side === "buy");
      for (const order of sellOrders) {
        const position = positions.get(order.symbol);
        const row = prices.get(order.symbol);
        if (!position || !row || !(number(row.open) > 0)) continue;
        const shares = Math.min(
          position.shares,
          order.fraction < 1
            ? Math.max(1, Math.floor(position.shares * order.fraction))
            : position.shares,
        );
        const fill = tradePrice(row.open, "sell", config.slippageBps);
        const proceeds = shares * fill - config.commissionPerOrder;
        const realizedPnl =
          shares * (fill - position.entryPrice) - config.commissionPerOrder;
        cash += proceeds;
        trades.push({
          date: session.date,
          symbol: order.symbol,
          side: "sell",
          reason: order.reason,
          shares,
          price: fill,
          realizedPnl,
        });
        position.shares -= shares;
        if (position.shares <= 0) positions.delete(order.symbol);
      }
      for (const order of buyOrders.sort((a, b) => b.rank - a.rank)) {
        if (
          delistedToday.has(order.symbol) ||
          positions.has(order.symbol) ||
          positions.size >= config.maxPositions
        )
          continue;
        const row = prices.get(order.symbol);
        if (!row || !(number(row.open) > 0)) continue;
        const currentEquity = equityValue(cash, positions, prices);
        const fill = tradePrice(row.open, "buy", config.slippageBps);
        const targetPct =
          order.action === "Strong Buy"
            ? config.strongBuyTargetPct
            : config.buyTargetPct;
        const maxPositionPct =
          order.action === "Strong Buy"
            ? config.strongBuyMaxPositionPct
            : config.buyMaxPositionPct;
        const maxFactorPct =
          order.action === "Strong Buy"
            ? config.strongBuyMaxFactorPct
            : config.buyMaxFactorPct;
        let budget = Math.min(
          cash - config.commissionPerOrder,
          currentEquity * targetPct,
        );
        if (
          typeof config.capitalAllowance === "function" &&
          typeof config.portfolioRiskSnapshot === "function"
        ) {
          const holdings = [...positions].map(([symbol, position]) => ({
            ...(position.stock || {}),
            symbol,
            role: "Swing",
            value:
              position.shares *
              number(prices.get(symbol)?.close, position.lastPrice),
          }));
          holdings.push({ symbol: "CASH", role: "Swing", value: cash });
          const risk = config.portfolioRiskSnapshot(holdings);
          const allowance = config.capitalAllowance({
            target: order.signal || { symbol: order.symbol },
            action: order.action,
            requested: budget,
            risk,
          });
          if (allowance?.blocked) continue;
          budget = Math.min(budget, Math.max(0, number(allowance?.amount)));
          if (typeof config.portfolioContributionGate === "function") {
            const contribution = config.portfolioContributionGate({
              target: order.signal || { symbol: order.symbol, price: fill },
              approvedAmount: budget,
              risk,
              existingValue: 0,
            });
            if (!contribution?.pass) continue;
            if (number(contribution.invested, 0) > 0)
              budget = Math.min(budget, number(contribution.invested));
          }
        } else {
          const factors = factorExposure(positions, prices);
          const factorRoom = Math.max(
            0,
            currentEquity * maxFactorPct - number(factors.get(order.factor), 0),
          );
          budget = Math.min(
            budget,
            currentEquity * maxPositionPct,
            factorRoom,
          );
        }
        const shares = Math.floor(Math.max(0, budget) / fill);
        const cost = shares * fill + config.commissionPerOrder;
        if (shares < 1 || cost < config.minimumTrade || cost > cash) continue;
        cash -= cost;
        positions.set(order.symbol, {
          symbol: order.symbol,
          shares,
          entryPrice: fill,
          enteredAt: session.date,
          lastPrice: fill,
          stopPrice: order.stopPrice,
          factor: order.factor,
          stock: order.signal || null,
        });
        trades.push({
          date: session.date,
          symbol: order.symbol,
          side: "buy",
          reason: order.action,
          shares,
          price: fill,
          realizedPnl: null,
        });
      }
    }

    for (const [symbol, position] of positions) {
      const row = prices.get(symbol);
      if (row?.close > 0) position.lastPrice = number(row.close);
    }
    updatePersistence(persistence, session.signals || []);

    if (active) {
      const equity = equityValue(cash, positions, prices);
      curve.push({
        date: session.date,
        equity: round(equity, 2),
        cash: round(cash, 2),
        positions: positions.size,
      });
      const benchmark = prices.get(symbolOf(dataset.metadata?.benchmarkSymbol));
      if (benchmark && number(benchmark.close) > 0) {
        if (benchmarkShares === null) {
          const entry = number(benchmark.open, number(benchmark.close));
          benchmarkShares = entry > 0 ? config.initialCapital / entry : 0;
        }
        benchmarkCurve.push({
          date: session.date,
          value: benchmarkShares * number(benchmark.close),
        });
      }

      const signalMap = new Map(
        (session.signals || []).map((signal) => [symbolOf(signal), signal]),
      );
      for (const [symbol, position] of positions) {
        const signal = signalMap.get(symbol);
        if (!signal) continue;
        const mark = number(prices.get(symbol)?.close, position.lastPrice);
        const positionSnapshot = {
          symbol,
          role: "Swing",
          shares: position.shares,
          averageCost: position.entryPrice,
          openedAt: position.enteredAt,
          pnlPct:
            position.entryPrice > 0
              ? ((mark - position.entryPrice) / position.entryPrice) * 100
              : 0,
          weightPct: equity > 0 ? ((position.shares * mark) / equity) * 100 : 0,
        };
        const replayedDecision =
          typeof config.positionDecision === "function"
            ? config.positionDecision({
                stock: signal,
                recommendation: signal.recommendation || {},
                position: positionSnapshot,
                now: new Date(session.decisionAt),
              })
            : null;
        const portfolioAction = String(
          replayedDecision?.action || signal.positionAction || "Hold",
        );
        if (EXIT_ACTIONS.has(portfolioAction))
          pending.push({
            side: "sell",
            symbol,
            fraction: 1,
            reason: portfolioAction.toLowerCase(),
          });
        else if (portfolioAction === "Reduce" || portfolioAction === "Trim")
          pending.push({
            side: "sell",
            symbol,
            fraction: clamp(number(signal.reduceFraction, 0.5), 0.1, 1),
            reason: portfolioAction.toLowerCase(),
          });
        const stop = number(signal.riskPlan?.invalidationPrice, 0);
        if (stop > 0 && stop < number(prices.get(symbol)?.close, Infinity))
          position.stopPrice = Math.max(number(position.stopPrice, 0), stop);
      }

      const candidates = (session.signals || [])
        .filter(
          (signal) =>
            ["Strong Buy", "Buy"].includes(signal.action) &&
            !positions.has(symbolOf(signal)) &&
            !blocked.has(symbolOf(signal)) &&
            signal.fundamentalDataVerified === true &&
            signal.eventRiskVerified === true &&
            signal.entryTimingVerified === true &&
            persistenceEligible(
              signal,
              persistence,
              config.capitalSignalEligible,
            ),
        )
        .sort(
          (a, b) =>
            number(b.capitalEfficiencyScore, b.score) -
              number(a.capitalEfficiencyScore, a.score) ||
            symbolOf(a).localeCompare(symbolOf(b)),
        );
      const pendingSymbols = new Set(
        pending.filter((order) => order.side === "buy").map((order) => order.symbol),
      );
      for (const signal of candidates) {
        const symbol = symbolOf(signal);
        if (pendingSymbols.has(symbol)) continue;
        pending.push({
          side: "buy",
          symbol,
          action: signal.action,
          rank: number(signal.capitalEfficiencyScore, signal.score),
          factor: factorOf(signal),
          stopPrice: number(signal.riskPlan?.invalidationPrice, 0),
          signal,
        });
        pendingSymbols.add(symbol);
      }
    }
  }
  const metrics = metricsFromCurve(curve, trades, benchmarkCurve);
  return {
    config,
    metrics,
    curve,
    benchmarkCurve,
    trades,
    endingCash: round(cash, 2),
    openPositions: [...positions.values()],
  };
}

function selectionScore(metrics = {}) {
  const sharpe = number(metrics.sharpe, -10);
  const drawdownPenalty = Math.abs(Math.min(0, number(metrics.maxDrawdownPct))) / 20;
  const tradePenalty = number(metrics.closedTrades) < 10 ? 1 : 0;
  return sharpe - drawdownPenalty - tradePenalty;
}

export function runWalkForwardBacktest(dataset = {}, options = {}) {
  const validation = validatePointInTimeDataset(dataset, {
    minimumSessions: options.minimumSessions ?? 756,
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
  if (!folds.length)
    throw new Error("No complete train/validation/test walk-forward fold is available.");
  const parameterGrid =
    Array.isArray(options.parameterGrid) && options.parameterGrid.length
      ? options.parameterGrid
      : [{}];
  const foldResults = [];
  const combinedDailyReturns = [];
  let compounded = 1;
  let benchmarkCompounded = 1;

  for (const fold of folds) {
    const evaluated = parameterGrid.map((parameters, index) => {
      const train = simulatePointInTimePortfolio(dataset, {
        ...parameters,
        ...(options.simulationOptions || {}),
        positionDecision: options.positionDecision,
        startDate: fold.train.start,
        endDate: fold.train.end,
      });
      const validationRun = simulatePointInTimePortfolio(dataset, {
        ...parameters,
        ...(options.simulationOptions || {}),
        positionDecision: options.positionDecision,
        startDate: fold.validation.start,
        endDate: fold.validation.end,
      });
      const robustScore = Math.min(
        selectionScore(train.metrics),
        selectionScore(validationRun.metrics),
      );
      return { index, parameters, train, validationRun, robustScore };
    });
    evaluated.sort(
      (a, b) => b.robustScore - a.robustScore || a.index - b.index,
    );
    const selected = evaluated[0];
    const test = simulatePointInTimePortfolio(dataset, {
      ...selected.parameters,
      ...(options.simulationOptions || {}),
      positionDecision: options.positionDecision,
      startDate: fold.test.start,
      endDate: fold.test.end,
    });
    compounded *= 1 + number(test.metrics.totalReturnPct) / 100;
    benchmarkCompounded *=
      1 + number(test.metrics.benchmarkReturnPct) / 100;
    combinedDailyReturns.push(...(test.metrics.dailyReturns || []));
    foldResults.push({
      fold: fold.fold,
      windows: fold,
      selectedParameters: selected.parameters,
      selectionScore: round(selected.robustScore, 4),
      trainMetrics: { ...selected.train.metrics, dailyReturns: undefined },
      validationMetrics: {
        ...selected.validationRun.metrics,
        dailyReturns: undefined,
      },
      testMetrics: { ...test.metrics, dailyReturns: undefined },
      testTrades: test.trades,
    });
  }
  const dailyVolatility = standardDeviation(combinedDailyReturns);
  const totalTestSessions = foldResults.reduce(
    (sum, fold) =>
      sum +
      dataset.sessions.filter(
        (session) =>
          session.date >= fold.windows.test.start &&
          session.date <= fold.windows.test.end,
      ).length,
    0,
  );
  const years = Math.max(1 / 252, totalTestSessions / 252);
  const oosReturn = compounded - 1;
  const oosBenchmarkReturn = benchmarkCompounded - 1;
  const outOfSampleClosedTrades = foldResults.reduce(
    (sum, fold) => sum + number(fold.testMetrics.closedTrades),
    0,
  );
  const minimumOosClosedTrades = Math.max(
    1,
    number(options.minimumOosClosedTrades, 30),
  );
  const researchEligible =
    validation.credibleForResearch &&
    typeof options.positionDecision === "function" &&
    typeof options.simulationOptions?.capitalAllowance === "function" &&
    typeof options.simulationOptions?.portfolioRiskSnapshot === "function" &&
    typeof options.simulationOptions?.portfolioContributionGate === "function" &&
    typeof options.simulationOptions?.capitalSignalEligible === "function" &&
    outOfSampleClosedTrades >= minimumOosClosedTrades;
  return {
    generatedAt: new Date().toISOString(),
    methodology: {
      pointInTime: true,
      nextSessionExecution: true,
      parameterSelectionUsesTestData: false,
      ordinaryBuyPersistenceSessions: 2,
      strongBuyImmediateAfterHardGates: true,
      slippageAndWholeShares: true,
      delistingOutcomesRealized: true,
      productionCapitalPolicyReplayed:
        typeof options.simulationOptions?.capitalAllowance === "function" &&
        typeof options.simulationOptions?.portfolioRiskSnapshot === "function" &&
        typeof options.simulationOptions?.portfolioContributionGate === "function" &&
        typeof options.simulationOptions?.capitalSignalEligible === "function",
      minimumOosClosedTrades,
    },
    validation,
    foldCount: foldResults.length,
    folds: foldResults,
    outOfSample: {
      sessions: totalTestSessions,
      compoundedReturnPct: round(oosReturn * 100, 2),
      cagrPct: round((Math.pow(1 + oosReturn, 1 / years) - 1) * 100, 2),
      sharpe: dailyVolatility
        ? round(
            (average(combinedDailyReturns) / dailyVolatility) * Math.sqrt(252),
            3,
          )
        : 0,
      closedTrades: outOfSampleClosedTrades,
      worstFoldDrawdownPct: Math.min(
        ...foldResults.map((fold) => number(fold.testMetrics.maxDrawdownPct)),
      ),
      benchmarkCompoundedReturnPct: round(oosBenchmarkReturn * 100, 2),
      excessCompoundedReturnPct: round(
        (oosReturn - oosBenchmarkReturn) * 100,
        2,
      ),
    },
    claimStatus: researchEligible
      ? "eligible-for-independent-review"
      : validation.credibleForResearch &&
          typeof options.positionDecision === "function" &&
          typeof options.simulationOptions?.capitalAllowance === "function" &&
          typeof options.simulationOptions?.portfolioRiskSnapshot === "function" &&
          typeof options.simulationOptions?.portfolioContributionGate === "function" &&
          typeof options.simulationOptions?.capitalSignalEligible === "function"
        ? "insufficient-out-of-sample-trades"
        : "mechanics-only",
  };
}

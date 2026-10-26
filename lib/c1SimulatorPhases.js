// Pure queue, fill-price/economics and exit-eligibility phases. State commits stay in the account simulator.
export function createC1SimulatorPhases({number,optionalNumber,clamp,symbolOf,factorOf,sectorOf,issuerOf,entrySignalQualifies,expandedResearchSource,persistenceEligible,researchRank}) {
function queueC1Entries({config,session,sessionIndex,allocationBlocked,cooldownThrough,researchPersistence,persistence,rankedSelection,rankRebalance,rankedPool,entrySignals,rankContext,accountSeed,positions,completionEligible,rankedTargetCount,previousPending}) {
  const pending = previousPending.slice();
      const eligibleForRankedEntry = (signal) =>
        entrySignalQualifies(signal, config) &&
        !allocationBlocked.has(symbolOf(signal)) &&
        sessionIndex > number(cooldownThrough.get(symbolOf(signal)), -1) &&
        (expandedResearchSource(config)
          ? number(
              researchPersistence.get(symbolOf(signal))?.qualifiedSessions,
              0,
            ) >= config.minimumQualifiedSessions
          : persistenceEligible(
              signal,
              persistence,
              config.capitalSignalEligible,
            ));
      const rankedEligibleSignals = rankedSelection
        ? rankRebalance
          ? rankedPool.filter(eligibleForRankedEntry)
          : []
        : entrySignals.filter(eligibleForRankedEntry).sort(
            (a, b) =>
              researchRank(b, config, rankContext) -
                researchRank(a, config, rankContext) ||
              symbolOf(a).localeCompare(symbolOf(b)),
          );
      const rankedTargetIndexBySymbol = new Map(
        rankedEligibleSignals.map((signal, index) => [symbolOf(signal), index]),
      );
      const nextCompletionRule = accountSeed && config.accountCompletionRules?.find(rule=>rule.priorDate===session.date);
      const candidates = rankedEligibleSignals
        .filter(signal => !positions.has(symbolOf(signal)) || (completionEligible(positions.get(symbolOf(signal)),nextCompletionRule) && !pending.some(o=>o.symbol===symbolOf(signal)&&o.side==='sell')))
        .slice(
          0,
          rankedSelection
            ? Math.max(
                rankedTargetCount,
                Math.floor(
                  number(config.rankedEntryQueueCount, rankedTargetCount * 3),
                ),
              )
            : undefined,
        );
      const pendingSymbols = new Set(
        pending
          .filter((order) => order.side === "buy")
          .map((order) => order.symbol),
      );
      const entryCandidates =
        rankedSelection && !rankRebalance ? [] : candidates;
      for (const signal of entryCandidates) {
        const symbol = symbolOf(signal);
        if (pendingSymbols.has(symbol)) continue;
        const action = expandedResearchSource(config)
          ? signal.entryTiming?.strongPass === true
            ? "Strong Buy"
            : "Buy"
          : signal.action;
        pending.push({
          side: "buy",
          symbol,
          action,
          ...(positions.has(symbol)?{completeExisting:true}:{}),
          // Preserve the same causal cross-sectional context used to select
          // the close-generated queue. Recomputing a context-sensitive rank
          // without that context can invert an adaptive quality/momentum
          // decision before the order reaches the next open.
          rank: researchRank(signal, config, rankContext),
          targetPct: Array.isArray(config.rankedTargetWeights)
            ? optionalNumber(
                config.rankedTargetWeights[
                  rankedTargetIndexBySymbol.get(symbol)
                ],
                null,
              )
            : config.rankedAdaptiveEqualWeightEnabled === true
              ? 0.99 / rankedTargetCount
            : null,
          factor: factorOf(signal),
          sector: sectorOf(signal),
          issuer: issuerOf(signal),
          stopPrice: number(signal.riskPlan?.invalidationPrice, 0),
          signal,
        });
        pendingSymbols.add(symbol);
      }
  return pending.slice(previousPending.length);
}

function c1SaleEconomics({position,shares,fill,commission}) {
    const quantity = Math.min(position.shares, Math.max(0, shares));
    if (!(quantity > 0)) return null;
    const entryCommissionAllocated =
      position.initialShares > 0
        ? position.entryCommission * (quantity / position.initialShares)
        : 0;
    const realizedPnl =
      quantity * (fill - position.entryPrice) -
      commission -
      entryCommissionAllocated;
  return {quantity,entryCommissionAllocated,realizedPnl};
}

function c1PurchaseEconomics({budget,fill,completion,existing,recordedBuy,config}) {
        const plannedShares=Math.min(Math.floor(Math.max(0,budget)/fill),completion&&Number.isFinite(existing.entryTargetShares)?Math.max(0,existing.entryTargetShares-existing.shares):Infinity);
        const shares = recordedBuy ? recordedBuy.shares : plannedShares;
        const executionCommission = recordedBuy ? recordedBuy.fee : config.commissionPerOrder;
        const cost = shares * fill + executionCommission;
  return {plannedShares,shares,executionCommission,cost};
}

function c1ExitEligibility({sessionIndex,position,mark,signal,config}) {
        const heldSessions = Math.max(
          0,
          sessionIndex - number(position.enteredSessionIndex, sessionIndex),
        );
        const pnlPct =
          position.entryPrice > 0 ? (mark / position.entryPrice - 1) * 100 : 0;
        const alpha20 = number(signal.entryTiming?.alpha20VsSpy, null);
        const alpha60 = number(signal.entryTiming?.alpha60VsSpy, null);
        const relativeExit =
          Number.isFinite(config.relativeExitAlpha20) &&
          heldSessions >= config.relativeExitMinHoldSessions &&
          Number.isFinite(alpha20) &&
          alpha20 < config.relativeExitAlpha20;
        const trendExit =
          Number.isFinite(config.trendExitAlpha60) &&
          heldSessions >= config.trendExitMinHoldSessions &&
          Number.isFinite(alpha60) &&
          alpha60 < config.trendExitAlpha60 &&
          mark < number(signal.priceAvg50, 0);
        const timeExit =
          Number.isFinite(config.timeStopSessions) &&
          heldSessions >= config.timeStopSessions &&
          pnlPct <= config.timeStopMaxReturnPct;
  return {heldSessions,pnlPct,alpha20,alpha60,relativeExit,trendExit,timeExit};
}

function tradePrice(rawPrice, side, slippageBps) {
  const price = number(rawPrice, 0);
  const impact = number(slippageBps, 0) / 10_000;
  return side === "buy" ? price * (1 + impact) : price * (1 - impact);
}

  return {queueC1Entries,c1SaleEconomics,c1PurchaseEconomics,c1ExitEligibility,tradePrice};
}

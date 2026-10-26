// Read-only screen consumption: no provider, account, persistence or global-cache access.
const normalizeSymbol = (s) => String(s || "").replace("-", ".").toUpperCase().trim();

function serializeStockForClient(row = {}) {
  const {
      fundamentalSnapshot: _fundamentalSnapshot,
      preTradeCheck: _duplicatePreTradeCheck,
      ...publicRow
    } = row,
    recommendation = { ...(row.recommendation || {}) };

  // These objects already exist at the top level. Sending them again inside
  // recommendation made the broad response exceed 5 MB without adding any
  // browser-visible evidence or changing a decision.
  for (const key of [
    "expertDecision",
    "riskPlan",
    "entryTiming",
    "eventRisk",
    "preTradeCheck",
    "thesis",
    "entryNote",
    "triggerNeeded",
    "dominantReason",
    "actionSummary",
    "context",
    "categoryRiskNote",
    "breakoutStructure",
  ])
    delete recommendation[key];

  if (recommendation.gateSummary)
    recommendation.gateSummary = {
      entryQualityLabel: recommendation.gateSummary.entryQualityLabel,
    };

  return {
    ...publicRow,
    recommendation,
    technicalSnapshot: row.technicalSnapshot
      ? { entryQualityLabel: row.technicalSnapshot.entryQualityLabel }
      : null,
  };
}

export function compactRowsForClient(rows = [], limit = 80, includeSymbol = "", screenSymbols = "") {
  const requestedSymbol = normalizeSymbol(includeSymbol);
  const requiredScreenSymbols=new Set(String(screenSymbols).split(",").slice(0,9).map(normalizeSymbol).filter(Boolean));
  const required = rows.filter((row) =>
    (requestedSymbol && normalizeSymbol(row?.symbol) === requestedSymbol) ||
    requiredScreenSymbols.has(normalizeSymbol(row?.symbol)) ||
    row?.productionPolicy?.selected === true ||
    row?.productionPolicy?.pilot === true ||
    ["Buy", "Strong Buy"].includes(row?.finalDecision?.action) ||
    ["Buy", "Strong Buy"].includes(row?.signalChange?.from),
  );
  const ranked = [...rows].sort((a, b) => {
    const score = (row) => Number(
      row?.finalDecision?.relativeCapitalScore ??
      row?.finalDecision?.capitalEfficiencyScore ??
      row?.recommendation?.expertDecision?.capitalScore ??
      row?.compositeScore ??
      0,
    );
    return score(b) - score(a);
  });
  const seen = new Set(), compact = [];
  for (const row of [...required, ...ranked]) {
    const key = normalizeSymbol(row?.symbol);
    if (!key || seen.has(key)) continue;
    seen.add(key);compact.push(row);
    if (compact.length >= Math.max(limit, required.length)) break;
  }
  return compact;
}

// Copy before freezing so consumer immutability never freezes producer-owned cache objects.
function freezeScreenValue(value) {
  if (value === null || typeof value !== "object") return value;
  for (const key of Object.keys(value)) freezeScreenValue(value[key]);
  return Object.freeze(value);
}
function immutableScreenValue(value) {
  // Match the existing HTTP JSON contract (including dates/toJSON, omitted
  // undefined values and nonfinite numbers) before isolating the read view.
  return freezeScreenValue(JSON.parse(JSON.stringify(value)));
}

export function readC1ScreenSnapshot({ broadSnapshot, broadRows, rows, clientRows, themeLeadership, themeKey, config, performanceObservationRecorded, MIN_QUOTE_COVERAGE_PCT }) {
    const fundamentalsComplete = rows.filter(
        (r) => r.fundamentalDataStatus === "complete",
      ).length,
      fundamentalsDeferred = rows.filter(
        (r) => r.fundamentalDataStatus === "deferred",
      ).length,
      fundamentalsUnavailable = rows.filter(
        (r) => r.fundamentalDataStatus === "unavailable",
      ).length,
      fundamentalCoveragePct = Math.round(
        (fundamentalsComplete / Math.max(1, rows.length)) * 100,
      ),
      fundamentalFeedStatus =
        fundamentalsComplete === 0 && fundamentalsUnavailable > 0
          ? "unavailable"
          : fundamentalCoveragePct < 75
            ? "degraded"
            : "healthy",
      actionable = rows.filter((r) =>
        ["Buy", "Strong Buy"].includes(r.finalDecision?.action),
      ),
      actionableThemes = new Set(
        actionable.map((r) => r.primaryTheme).filter(Boolean),
      ).size;
    return immutableScreenValue({
        stocks: clientRows.map(serializeStockForClient),
        themeLeadership,
        selectedTheme: {
          key: themeKey,
          name: config.name,
          description:
            config.description ||
            "Focused research list filtered from the authoritative broad opportunity decisions.",
        },
        meta: {
          mode: actionable.some((row) => row.productionPolicy?.pilot === true)
            ? "independent_limited_pilot"
            : actionable.length
              ? "c1_active_swing"
              : "independent_confirmation_fail_closed",
          productionPolicy: {
            decisionSnapshot: broadSnapshot.productionPolicySnapshot?.decisionSnapshot || null,
            forwardAccounting: broadSnapshot.productionPolicySnapshot?.forwardAccounting || null,
            id: broadSnapshot.productionPolicySnapshot?.policyId || null,
            label: broadSnapshot.productionPolicySnapshot?.policyLabel || null,
            status:
              actionable.some((row) => row.productionPolicy?.pilot === true)
                ? "limited-pilot"
                : rows.find((row) => row.productionPolicy)?.productionPolicy?.status ||
                  broadSnapshot.productionPolicySnapshot?.status ||
                  "unavailable",
            pilotMaxNames: 3,
            pilotMaxWeightPct: 1,
            pilotRequiresTwoSessionPersistence: true,
            sourceSessionDate:
              broadSnapshot.productionPolicySnapshot?.sourceSessionDate || null,
            snapshotAgeSessions:
              broadSnapshot.productionPolicySnapshot?.snapshotAgeSessions ?? null,
            targetCount: rows.some(
              (row) => row.productionPolicy?.activationAuthorized === true,
            )
              ? broadSnapshot.productionPolicySnapshot?.targetCount || 3
              : actionable.some((row) => row.productionPolicy?.pilot === true)
                ? 3
                : 0,
            targetWeightPct:
              rows.find((row) => row.productionPolicy)?.productionPolicy
                ?.targetWeightPct ?? 0,
            weights: broadSnapshot.productionPolicySnapshot?.weights || null,
            sleeves: broadSnapshot.productionPolicySnapshot?.sleeves || null,
            portfolioDrawdownStopPct:
              broadSnapshot.productionPolicySnapshot?.portfolioDrawdownStopPct || 12,
            v12HardGovernorEnabled: false,
            independentlyValidated:
              rows.find((row) => row.productionPolicy)?.productionPolicy
                ?.independentlyValidated === true,
            activationAuthorized:
              rows.find((row) => row.productionPolicy)?.productionPolicy
                ?.activationAuthorized === true,
            evidenceStatus:
              rows.find((row) => row.productionPolicy)?.productionPolicy
                ?.evidenceStatus ||
              "provisional-post-selection-development-candidate",
          },
          universeDesign:
            "all liquid U.S.-listed common stocks are considered; C1 ranks price-only momentum among names above the $5 price and $300 million trailing-dollar-volume floors, blocks MSTR, and applies current quote and material-event safety checks",
          universeSize: broadSnapshot.universeSize,
          strategicUniverseSize: broadSnapshot.strategicCount,
          dynamicUniverseSize: broadSnapshot.dynamicCount,
          configuredMarketCycleSize:
            broadSnapshot.configuredMarketCycleCount,
          fullMarketDiscoveryStatus:
            broadSnapshot.fullMarketDiscoveryStatus,
          fullMarketDiscoveryStale:
            broadSnapshot.fullMarketDiscoveryStale,
          fullMarketDiscoveryAsOf:
            broadSnapshot.fullMarketDiscoveryBuiltAt,
          fullMarketDiscoveryIssue:
            broadSnapshot.fullMarketDiscoveryIssue,
          fullMarketDiscoveryIssueAt:
            broadSnapshot.fullMarketDiscoveryIssueAt,
          fullMarketDiscoveryStage:
            broadSnapshot.fullMarketDiscoveryStage,
          fullMarketSourceUniverseSize:
            broadSnapshot.fullMarketSourceUniverseSize,
          fullMarketEligibleUniverseSize:
            broadSnapshot.fullMarketEligibleUniverseSize,
          fullMarketLiquidityCoveragePct:
            broadSnapshot.fullMarketLiquidityCoveragePct,
          fullMarketLiquiditySource:
            broadSnapshot.fullMarketLiquiditySource,
          fullMarketLiquidityProxyFloor:
            broadSnapshot.fullMarketLiquidityProxyFloor,
          fullMarketLiquidityLookbackSessions:
            broadSnapshot.fullMarketLiquidityLookbackSessions,
          fullMarketProviderCallCeiling:
            broadSnapshot.fullMarketProviderCallCeiling,
          fullMarketCoarseUniverseCapped:
            broadSnapshot.fullMarketCoarseUniverseCapped,
          fullMarketCandidateCount:
            broadSnapshot.fullMarketCandidateCount,
          fullMarketLiquidityRules:
            broadSnapshot.fullMarketDiscoveryConfig,
          freshCapitalLiquidityRule: {
            source: "symbol_history",
            lookbackSessions: 20,
            minimumVerifiedSessions: 15,
            minimumAverageDollarVolume:
              broadSnapshot.fullMarketDiscoveryConfig?.minAvgDollarVolume ||
              10_000_000,
            enforcement: "hard_gate_before_buy",
          },
          marketCycleRadar: broadSnapshot.cycle.groups.map((g) => ({
            name: g.name,
            proxy: g.proxy,
            state: g.state,
            score: g.score,
          })),
          selectedMarketCycles: broadSnapshot.cycle.selected.map((g) => ({
            name: g.name,
            proxy: g.proxy,
            state: g.state,
            score: g.score,
            members: g.members,
          })),
          quotesReceived: broadRows.length,
          coveragePct: broadSnapshot.quoteCoveragePct,
          quoteCoverageRequiredPct: MIN_QUOTE_COVERAGE_PCT,
          quoteCoverageAdequate: broadSnapshot.quoteCoverageAdequate,
          staleQuoteCount: broadSnapshot.staleQuoteCount,
          returned: rows.length,
          clientReturned: clientRows.length,
          strongBuys: rows.filter(
            (r) => r.finalDecision?.action === "Strong Buy",
          ).length,
          buys: rows.filter((r) => r.finalDecision?.action === "Buy").length,
          watches: rows.filter((r) => r.finalDecision?.action === "Watch")
            .length,
          qualifiedWatches: rows.filter(
            (r) => r.finalDecision?.priority === "Qualified Watch",
          ).length,
          actionableNames: actionable.length,
          actionableThemes,
          fundamentalsComplete,
          fundamentalsDeferred,
          fundamentalsUnavailable,
          fundamentalsIncomplete: rows.length - fundamentalsComplete,
          fundamentalCoveragePct,
          fundamentalFeedStatus,
          quoteFeedStatus: broadSnapshot.staleFeed
            ? "stale-verified"
            : broadSnapshot.quoteCoverageAdequate
              ? "live"
              : "incomplete",
          performanceObservationRecorded,
          snapshotAsOf: new Date(
            broadSnapshot.snapshotBuiltAt || broadSnapshot.ts || Date.now(),
          ).toISOString(),
          snapshotAgeSeconds: Math.max(
            0,
            Math.round(
              (Date.now() -
                Number(broadSnapshot.snapshotBuiltAt || broadSnapshot.ts || Date.now())) /
                1000,
            ),
          ),
        },
      });
}

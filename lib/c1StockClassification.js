// Screen-only classification restored from C1 deployment fb6133e (2026-09-04).
// These constants are historical screen selection rules, NOT account limits.
const V11_PRODUCTION_TARGET_COUNT=3,V11_PRODUCTION_ENTRY_QUEUE_COUNT=9;
const C1_MINIMUM_AVERAGE_DOLLAR_VOLUME=300_000_000;
const V11_PRODUCTION_MAX_ENTRY_GAP_PCT=3;
const C1_BLOCKED_SYMBOLS=['MSTR','SCHW'];
const number = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const clamp = (value, low = 0, high = 100) =>
  Math.max(low, Math.min(high, number(value, low)));
const symbolOf = (value) =>
  String(value?.symbol || value?.ticker || value || "")
    .replace("-", ".")
    .toUpperCase()
    .trim();
const centeredPercentile = (value) => clamp(value, 0, 100) - 50;
const round = (value, places = 2) => {
  const scale = 10 ** places;
  return Math.round(number(value, 0) * scale) / scale;
};

function issuerOf(signal = {}) {
  const cik = String(signal.cik || signal.cikNumber || "")
    .replace(/\D/g, "")
    .replace(/^0+/, "");
  if (cik) return `cik:${cik}`;
  const name = String(signal.companyName || signal.name || "")
    .toUpperCase()
    .replace(/\b(?:CLASS [A-Z]|COMMON STOCK|ORDINARY SHARES?)\b/g, " ")
    .replace(
      /\b(?:INCORPORATED|INC|CORPORATION|CORP|COMPANY|CO|PLC|LTD|LIMITED|HOLDINGS?|GROUP)\b/g,
      " ",
    )
    .replace(/[^A-Z0-9]/g, "");
  return name ? `name:${name}` : `symbol:${symbolOf(signal)}`;
}

export function v11ProductionRankScore(signal = {}) {
  const factors = signal.researchFactors || {};
  return centeredPercentile(factors.momentumPercentile);
}

export function v11SourceSignalEligible(signal = {}) {
  const factors = signal.researchFactors || {};
  const timing = signal.entryTiming || {};
  const symbol = symbolOf(signal);
  const price = number(
    signal.price ?? signal.currentPrice ?? signal.lastPrice ?? signal.close,
    null,
  );
  return Boolean(
    symbol &&
      !C1_BLOCKED_SYMBOLS.includes(symbol) &&
      price >= 5 &&
      timing.liquidityPass === true &&
      number(timing.averageDollarVolume20, 0) >=
        C1_MINIMUM_AVERAGE_DOLLAR_VOLUME &&
      Number.isFinite(number(factors.momentumPercentile, null))
  );
}

function sourcePool(session = {}) {
  const bySymbol = new Map();
  for (const signal of [
    ...(Array.isArray(session.positionSignals) ? session.positionSignals : []),
    ...(Array.isArray(session.signals) ? session.signals : []),
  ]) {
    const symbol = symbolOf(signal);
    if (symbol) bySymbol.set(symbol, signal);
  }
  return [...bySymbol.values()];
}

export function buildC1StockScreenSnapshot(session = {}, createdAt = new Date()) {
  const sourceSessionDate = String(session.date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sourceSessionDate))
    throw new Error("V11 production snapshot requires a dated source session");
  const candidates = sourcePool(session)
    .filter(v11SourceSignalEligible)
    .map((signal) => {
      const factors = signal.researchFactors || {};
      const timing = signal.entryTiming || {};
      const sourcePrice = number(
        signal.price ?? signal.currentPrice ?? signal.lastPrice ?? signal.close,
        null,
      );
      return {
        symbol: symbolOf(signal),
        companyName: signal.companyName || signal.name || symbolOf(signal),
        sector: String(signal.sector || signal.primaryTheme || "Other"),
        issuer: issuerOf(signal),
        sourcePrice,
        policyScore: round(v11ProductionRankScore(signal), 4),
        factorCoverage: number(factors.factorCoverage, 0),
        momentumPercentile: number(factors.momentumPercentile, null),
        qualityPercentile: number(factors.qualityPercentile, null),
        sectorQualityPercentile: number(
          factors.sectorQualityPercentile,
          null,
        ),
        stabilityPercentile: number(factors.stabilityPercentile, null),
        controlledPullbackScore: number(
          factors.controlledPullbackScore,
          null,
        ),
        alpha60VsSpy: number(timing.alpha60VsSpy, null),
        alpha60VsQqq: number(timing.alpha60VsQqq, null),
        shortTermTechnicalScore: number(
          timing.shortTermTechnicalScore,
          null,
        ),
        sourceTiming: {
          available: timing.available === true,
          pass: timing.pass === true,
          strongPass: timing.strongPass === true,
          chase: timing.chase === true,
          liquidityPass: timing.liquidityPass === true,
          liquidityVerified: timing.liquidityVerified !== false,
          liquiditySessions: number(timing.liquiditySessions, null),
          averageDollarVolume20: number(
            timing.averageDollarVolume20,
            null,
          ),
          asOf: String(timing.asOf || sourceSessionDate).slice(0, 10),
        },
      };
    })
    .sort(
      (left, right) =>
        right.policyScore - left.policyScore ||
        left.symbol.localeCompare(right.symbol),
    )
    .map((candidate, index) => ({ ...candidate, researchRank: index + 1 }))
    .slice(0, V11_PRODUCTION_ENTRY_QUEUE_COUNT);
  if (candidates.length < V11_PRODUCTION_TARGET_COUNT)
    throw new Error(
      `C1 production snapshot has insufficient qualified candidates (${candidates.length}/${V11_PRODUCTION_TARGET_COUNT})`,
    );
  return {contract:'c1-stock-screen-v1',sourceSessionDate,candidates};
}

function currentEventRisk(row = {}) {
  return (
    row.eventRisk ||
    row.preTradeCheck ||
    row.recommendation?.eventRisk ||
    row.recommendation?.preTradeCheck ||
    {}
  );
}

function currentTiming(row = {}, candidate = {}, snapshot = {}) {
  const live = row.entryTiming || row.recommendation?.entryTiming || {};
  if (live.available === true) return live;
  const source = candidate.sourceTiming || {};
  const sourceSessionDate = String(snapshot?.sourceSessionDate || "");
  const requiredSessionDate = String(snapshot?.requiredSessionDate || "");
  if (
    source.available === true &&
    sourceSessionDate &&
    sourceSessionDate === requiredSessionDate &&
    String(source.asOf || sourceSessionDate) >= requiredSessionDate
  )
    return { ...source, sourceSnapshotFallback: true };
  return live;
}

function operationalGate(row = {}, candidate = {}, snapshot = {}) {
  const expert =
    row.recommendation?.expertDecision || row.expertDecision || {};
  const metrics = expert.metrics || {};
  const event = currentEventRisk(row);
  const timing = currentTiming(row, candidate, snapshot);
  const eventStatus = String(event.status || "").toLowerCase();
  const price = number(
    row.price ?? row.currentPrice ?? row.lastPrice ?? row.close,
    null,
  );
  const entryGapPct =
    price > 0 && candidate.sourcePrice > 0
      ? ((price - candidate.sourcePrice) / candidate.sourcePrice) * 100
      : null;
  const checks = {
    quoteVerified: metrics.quoteFreshnessPass === true,
    eventClear:
      event.blockNewCapital !== true &&
      !["blocked", "manual"].includes(eventStatus),
    momentumAvailable: Number.isFinite(number(candidate.momentumPercentile, null)),
    liquidityVerified:
      timing.liquidityPass === true &&
      number(timing.averageDollarVolume20, number(candidate.sourceTiming?.averageDollarVolume20, 0)) >=
        C1_MINIMUM_AVERAGE_DOLLAR_VOLUME,
    priceFloor: price >= 5,
    excludedSymbol: !C1_BLOCKED_SYMBOLS.includes(symbolOf(row)),
    openingGapClear:
      entryGapPct === null ||
      entryGapPct <= V11_PRODUCTION_MAX_ENTRY_GAP_PCT,
  };
  const pass = Object.values(checks).every(Boolean);
  let reason = "Current operational gates pass.";
  if (!checks.quoteVerified)
    reason = "Current quote verification is incomplete; fresh capital is paused.";
  else if (!checks.eventClear)
    reason = "A current material-event block prevents fresh capital.";
  else if (!checks.momentumAvailable)
    reason = "The current momentum rank is unavailable; fresh capital is paused.";
  else if (!checks.liquidityVerified)
    reason = "Trailing 20-session dollar liquidity has not cleared the $300 million floor.";
  else if (!checks.priceFloor)
    reason = "The current price is below the C1 fresh-capital floor.";
  else if (!checks.excludedSymbol)
    reason = "This symbol is outside the active-swing mandate.";
  else if (!checks.openingGapClear)
    reason = `The price is ${entryGapPct.toFixed(1)}% above the source-session close, beyond the 3% opening-gap limit.`;
  return {
    pass,
    checks,
    reason,
    entryGapPct: number(entryGapPct, null),
  };
}


export function classifyC1StockScreen({snapshot,rows=[],current=false}={}){
 const candidates=snapshot?.candidates||[];
 const bySymbol=new Map(rows.map(row=>[symbolOf(row),row]));
 const sectors=new Set(),issuers=new Set();let selected=0;
 return candidates.map(candidate=>{
  const row=bySymbol.get(candidate.symbol)||{};
  const fresh=current&&!row.clientSnapshotFallback&&!row.dataFeedSnapshotStale;
  const gate=operationalGate(row,candidate,{...snapshot,requiredSessionDate:snapshot?.sourceSessionDate});
  let rating='Watch',why,next;
  if(!fresh){why='Current screen verification is unavailable.';next='Reload for verified current prices and entry checks.';}
  else if(!gate.pass){why=gate.reason;next='The blocked entry check must clear on a verified refresh.';}
  else if(selected>=V11_PRODUCTION_TARGET_COUNT){why=`Momentum rank #${candidate.researchRank}; below the three selected opportunities.`;next='Move into the selected three on a verified refresh.';}
  else if(sectors.has(candidate.sector)){why='A higher-ranked stock from this sector is already selected.';next='Become the selected sector representative.';}
  else if(issuers.has(candidate.issuer)){why='Another share class from this issuer is already selected.';next='Become the selected issuer representative.';}
  else {rating=(row.recommendation?.expertDecision||row.expertDecision||{}).strongBuyPass===true?'Strong Buy':'Buy';selected++;sectors.add(candidate.sector);issuers.add(candidate.issuer);why=`Selected C1 opportunity #${selected}; momentum rank #${candidate.researchRank}.`;next='Account action is shown separately.';}
  return {symbol:candidate.symbol,rating,priority:candidate.researchRank-1,screenReview:{why,next},entryEvidence:{sector:candidate.sector,momentumScore:candidate.momentumPercentile,close:candidate.sourcePrice}};
 });
}

import {c1RecentMomentumLiveApplies,c1RecentMomentumScreenGate} from './c1RecentMomentumLivePolicy';
import {c1MarketMomentumIssues,c1MissingMomentumText} from './c1MarketMomentumIssues';
import {c1CurrentEventBlockReason,readC1CurrentEventEvidence} from './c1CurrentEventEvidence';
import {C1_QUALIFIED_SELECTION,C1_QUALIFIED_SELECTION_QUEUE_COUNT,c1QualifiedSelectionApplies,c1MomentumQualifiedPool,c1FullUniverseSelectionApplies} from './c1QualifiedSelection';
import {C1_FROZEN_OPTIONS} from './c1FrozenOptions';
import {readC1RecentMomentumPrice} from './c1RecentMomentumGate';
import {marketSessionDistance} from './marketSession';
// Screen-only classification restored from C1 deployment fb6133e (2026-09-04).
// These constants are historical screen selection rules, NOT account limits.
const V11_PRODUCTION_TARGET_COUNT=3,V11_PRODUCTION_ENTRY_QUEUE_COUNT=9;
const C1_MINIMUM_AVERAGE_DOLLAR_VOLUME=300_000_000;
const V11_PRODUCTION_MAX_ENTRY_GAP_PCT=3;
const C1_BLOCKED_SYMBOLS=['MSTR','SCHW'];
const number = (value, fallback = null) => {
  if (value == null || typeof value === 'boolean' ||
      (typeof value === 'string' && value.trim() === '')) return fallback;
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

// Accepted explicit issuer identities take precedence for the account policy.
// Numeric CIKs normalize leading zeroes across adopted/current observations.
// Earlier screen snapshots retain their exact original issuer projection.
export function c1StockIssuer(signal={}){
  const value=typeof signal.issuer==='string'?signal.issuer.trim():'';
  if(!value)return issuerOf(signal);
  const numeric=value.replace(/^cik:/i,'');
  return /^\d+$/.test(numeric)?`cik:${numeric.replace(/^0+/,'')||'0'}`:`issuer:${value.toUpperCase()}`;
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

// The source filter already enforces symbol, price, liquidity and momentum.
// Apply the remaining frozen account source predicates before spending a
// qualified queue/sector slot. These are accepted-close facts, not live quotes
// or account cash/ownership. Keep excluded leaders in Watch with their reason.
function sourcePurchaseGate(signal) {
  const factors=signal.researchFactors||{},timing=signal.entryTiming||{};
  // Preserve the account predicate's numeric semantics for accepted factors.
  const acceptedNumber=(value,fallback)=>value===null||value===undefined||value===''?fallback:
    Number.isFinite(Number(value))?Number(value):fallback;
  const volatility=acceptedNumber(factors.volatility60Pct,null);
  // All three frozen sleeves share these source requirements. The regression
  // binds this small projection to each actual account eligibility predicate.
  const options=C1_FROZEN_OPTIONS.base,maximum=options.maxVolatility60Pct;
  let reason=null;
  if(timing.available!==true)
    reason='Accepted source timing evidence is unavailable; purchases remain paused.';
  else if(acceptedNumber(factors.factorCoverage,0)<options.minimumResearchFactorCoverage)
    reason='Accepted source factor coverage does not meet the C1 purchase requirement.';
  else if(volatility===null)
    reason='Accepted 60-session volatility is unavailable; purchases remain paused.';
  else if(volatility>maximum)
    reason=`Accepted 60-session volatility is ${volatility.toFixed(2)}%, above the ${maximum.toFixed(2)}% purchase limit; this stock is outside the C1 purchase queue.`;
  return {eligible:reason===null,reason};
}

// Older accepted replay compaction retained verified liquidity and its average,
// but omitted the observation count. Recover that count only from the actual
// matching twenty-session bar window; no receipt or high average invents bars.
function sourceTimingWithAcceptedLiquidity(timing,symbol,date,history){
 if(timing.liquiditySessions!=null||timing.available!==true||timing.liquidityVerified!==true||timing.liquidityPass!==true||
  timing.asOf!=null&&timing.asOf!==date||timing.liquidityLookbackSessions!=null&&timing.liquidityLookbackSessions!==20||
  timing.stale===true||timing.staleFallback===true||timing.staleVerification===true||timing.clientSnapshotFallback===true||
  timing.dataFeedSnapshotStale===true||timing.current===false||timing.freshness?.stale===true)return timing;
 const index=history.findIndex(session=>session.date===date),window=index>=19?history.slice(index-19,index+1):[];
 if(window.length!==20||history.filter(session=>session.date===date).length!==1)return timing;
 const dollarVolumes=[];
 for(let offset=0;offset<window.length;offset++){
  const session=window[offset];
  if(offset&&marketSessionDistance(window[offset-1].date,session.date)!==1)return timing;
  const price=readC1RecentMomentumPrice({session,symbol});
  if(!price.available)return timing;
  const bar=session.prices.find(row=>symbolOf(row)===symbol);
  if(typeof bar.volume!=='number'||!Number.isFinite(bar.volume)||bar.volume<0)return timing;
  if(bar.volume>0)dollarVolumes.push(price.close*bar.volume);
 }
 const average=number(timing.averageDollarVolume20,null),observed=dollarVolumes.reduce((sum,value)=>sum+value,0)/dollarVolumes.length;
 if(dollarVolumes.length<15||!Number.isFinite(observed)||!(average>0)||Math.abs(observed-average)>Math.max(0.000001,average*1e-9))return timing;
 return {...timing,liquiditySessions:dollarVolumes.length,liquidityLookbackSessions:20};
}

export function buildC1StockScreenSnapshot(session = {}, createdAt = new Date(), historySessions = [], accountPolicy = null) {
  const sourceSessionDate = String(session.date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sourceSessionDate))
    throw new Error("V11 production snapshot requires a dated source session");
  const qualifiedSelection=c1QualifiedSelectionApplies(sourceSessionDate);
  const fullUniverse=c1FullUniverseSelectionApplies(sourceSessionDate);
  const acceptedSource=sourcePool(session);
  const universe=Array.isArray(session.universeSymbols)?[...new Set(session.universeSymbols.map(symbolOf))]:acceptedSource.map(symbolOf);
  const universeSymbols=new Set(universe);
  const rankedCandidates = acceptedSource
    .filter(signal=>!fullUniverse||universeSymbols.has(symbolOf(signal)))
    .filter(v11SourceSignalEligible)
    .map((signal) => {
      const factors = signal.researchFactors || {};
      const timing = fullUniverse?sourceTimingWithAcceptedLiquidity(signal.entryTiming||{},symbolOf(signal),sourceSessionDate,historySessions):signal.entryTiming||{};
      const sourcePrice = number(
        signal.price ?? signal.currentPrice ?? signal.lastPrice ?? signal.close,
        null,
      );
      const momentum=c1RecentMomentumLiveApplies(sourceSessionDate)?c1RecentMomentumScreenGate(historySessions,symbolOf(signal),sourceSessionDate):null;
      if(momentum&&!momentum.available)momentum.missingInputs=c1MarketMomentumIssues(momentum,historySessions,signal,sourceSessionDate);
      return {
        symbol: symbolOf(signal),
        companyName: signal.companyName || signal.name || symbolOf(signal),
        sector: String(signal.sector || signal.primaryTheme || "Other"),
        issuer: fullUniverse?c1StockIssuer(signal):issuerOf(signal),
        sourcePrice,
        ...(qualifiedSelection?{sourcePurchaseGate:sourcePurchaseGate(signal)}:{}),
        ...(momentum?{recentMomentumGate:momentum}:{}),
        policyScore: round(v11ProductionRankScore(signal), 4),
        factorCoverage: number(factors.factorCoverage, 0),
        ...(fullUniverse?{volatility60Pct:number(factors.volatility60Pct,null),
          return120Ex20:number(factors.return120Ex20,null),return60Ex5:number(factors.return60Ex5,null)}:{}),
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
          ...(fullUniverse&&Number.isFinite(timing.liquidityLookbackSessions)?{liquidityLookbackSessions:timing.liquidityLookbackSessions}:{}),
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
    .map((candidate, index) => ({ ...candidate, researchRank: index + 1 }));
  const qualified=qualifiedSelection?c1MomentumQualifiedPool(rankedCandidates.filter(candidate=>candidate.sourcePurchaseGate.eligible),candidate=>candidate.recentMomentumGate,sourceSessionDate):[];
  const qualifiedRanks=new Map(qualified.map((candidate,index)=>[candidate.symbol,index+1]));
  // Retain the original leaders in Watch for continuity, and independently
  // include the nine strongest momentum-qualified candidates. At most 18
  // names require current provider checks; never scan live quotes unboundedly.
  const candidates=fullUniverse?rankedCandidates.map(candidate=>({...candidate,qualifiedRank:qualifiedRanks.get(candidate.symbol)??null})):qualifiedSelection?rankedCandidates
    .filter(candidate=>candidate.researchRank<=V11_PRODUCTION_ENTRY_QUEUE_COUNT||qualifiedRanks.get(candidate.symbol)<=C1_QUALIFIED_SELECTION_QUEUE_COUNT)
    .map(candidate=>({...candidate,qualifiedRank:qualifiedRanks.get(candidate.symbol)??null})):
    rankedCandidates.slice(0,V11_PRODUCTION_ENTRY_QUEUE_COUNT);
  if (!fullUniverse && candidates.length < V11_PRODUCTION_TARGET_COUNT)
    throw new Error(
      `C1 production snapshot has insufficient qualified candidates (${candidates.length}/${V11_PRODUCTION_TARGET_COUNT})`,
    );
  const sourceSymbols=new Set(acceptedSource.map(symbolOf));
  const evidence=session.universeEvidence;
  const supported=Array.isArray(evidence?.supportedSymbols)?evidence.supportedSymbols.map(symbolOf):[];
  const exclusions=Array.isArray(evidence?.exclusions)?evidence.exclusions:[];
  const accounted=[...supported,...exclusions.map(row=>symbolOf(row))];
  const explicitCoverage=evidence?.contract==='c1-supported-dated-universe-v2'&&evidence.sourceSessionDate===sourceSessionDate&&evidence.complete===true&&
    evidence.totalUniverse===universe.length&&accounted.length===universe.length&&new Set(accounted).size===universe.length&&accounted.every(symbol=>universeSymbols.has(symbol))&&
    exclusions.every(row=>row.reason==='insufficient-accepted-history'&&Number.isSafeInteger(row.historySessions)&&row.historySessions>0&&row.requiredHistorySessions===253&&row.historySessions<253);
  const missingSourceSymbols=(explicitCoverage?supported:universe).filter(symbol=>!sourceSymbols.has(symbol));
  const scan=fullUniverse?{contract:'c1-dated-universe-scan-v1',sourceSessionDate,totalUniverse:universe.length,
    sourceRows:acceptedSource.length,candidateCount:candidates.length,complete:missingSourceSymbols.length===0&&session.scan?.complete!==false&&(!evidence||explicitCoverage),
    missingSourceSymbols,...(explicitCoverage?{unsupportedSymbols:exclusions.map(row=>row.symbol)}:{}),
    ...((session.scan?.complete===false||evidence&&!explicitCoverage)?{reason:'Accepted source scan is incomplete or its universe coverage is invalid.'}:{})}:null;
  return {contract:'c1-stock-screen-v1',sourceSessionDate,candidates,...(qualifiedSelection?{selectionPolicy:C1_QUALIFIED_SELECTION}:{}),
    ...(fullUniverse?{fullUniverseSelection:true,scan,...(accountPolicy?{accountPolicy,decisionId:accountPolicy.decisionId||accountPolicy.identity,policyVersion:accountPolicy.version}:{})}:{})};
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
    sourcePurchaseEligible:snapshot.selectionPolicy!==C1_QUALIFIED_SELECTION||candidate.sourcePurchaseGate?.eligible===true,
    recentMomentumClear:!c1RecentMomentumLiveApplies(snapshot.sourceSessionDate)||
      candidate.recentMomentumGate?.sourceSessionDate===snapshot.sourceSessionDate&&
      candidate.recentMomentumGate.available===true&&candidate.recentMomentumGate.entryAllowed===true,
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
    reason = c1CurrentEventBlockReason(event);
  else if (!checks.sourcePurchaseEligible)
    reason = candidate.sourcePurchaseGate?.reason||'Accepted source purchase eligibility is unavailable; purchases remain paused.';
  else if (!checks.recentMomentumClear)
    reason = candidate.recentMomentumGate?.available===true&&candidate.recentMomentumGate.sourceSessionDate===snapshot.sourceSessionDate?
      "Recent 1-, 3- and 5-session momentum does not clear the Buy/Add gate; historical rank alone cannot authorize fresh capital.":
      "Verified recent-momentum evidence is unavailable; fresh purchases and additions are paused.";
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

// Compatibility diagnostic for the former execution-qualified Watch selector.
// It reports entry checks only; dated monitoring admission is separate below.
export function c1CurrentWatchEntryChecks({row,candidate,snapshot,now=new Date()}={}){
 return c1CurrentWatchExecutionChecks({row,candidate,snapshot,now}).pass;
}

// Existing entry checks are diagnostic facts for Watch, never its admission
// policy. Purchase classification below continues using the original gate.
export function c1CurrentWatchExecutionChecks({row,candidate,snapshot,now=new Date()}={}){
 const gate=operationalGate(row||{},candidate||{},{...snapshot,requiredSessionDate:snapshot?.sourceSessionDate});
 const event=readC1CurrentEventEvidence(currentEventRisk(row||{}),now);
 return {pass:Boolean(row&&candidate&&snapshot&&gate.pass&&event==='VERIFIED_CLEAR'),checks:gate.checks,event};
}

export function c1DatedWatchChecks(candidate={}){
 const unknown=[],rejected=[],options=C1_FROZEN_OPTIONS.base,timing=candidate.sourceTiming||{};
 const check=(field,known,pass)=>{if(!known)unknown.push(field);else if(!pass)rejected.push(field);};
 check('rank',Number.isSafeInteger(candidate.researchRank),candidate.researchRank>0);
 check('momentum',Number.isFinite(candidate.momentumPercentile)&&Number.isFinite(candidate.policyScore),candidate.momentumPercentile>=0&&candidate.momentumPercentile<=100);
 check('source-price',Number.isFinite(candidate.sourcePrice),candidate.sourcePrice>=5);
 check('liquidity',typeof timing.liquidityPass==='boolean'&&Number.isFinite(timing.averageDollarVolume20),timing.liquidityPass===true&&timing.averageDollarVolume20>=C1_MINIMUM_AVERAGE_DOLLAR_VOLUME);
 check('factor-coverage',Number.isFinite(candidate.factorCoverage),candidate.factorCoverage>=options.minimumResearchFactorCoverage);
 check('volatility',Number.isFinite(candidate.volatility60Pct),candidate.volatility60Pct>=0&&candidate.volatility60Pct<=options.maxVolatility60Pct);
 check('mandate',Boolean(symbolOf(candidate)),!C1_BLOCKED_SYMBOLS.includes(symbolOf(candidate)));
 return {eligible:unknown.length===0&&rejected.length===0,unknown,rejected};
}


export function classifyC1StockScreen({snapshot,rows=[],current=false,accountPolicy=null,accountActions=[],decisionId=null}={}){
 const candidates=snapshot?.candidates||[];
 const fullUniverse=snapshot?.fullUniverseSelection===true;
 const policy=accountPolicy||snapshot?.accountPolicy;
 const blocked=new Set((policy?.blockedSymbols||[]).map(symbolOf));
 const activeExits=new Set([...(policy?.activeExitSymbols||[]),...(snapshot?.activeExitSymbols||[]),
  ...accountActions.filter(action=>action.side==='sell'&&action.conditional!==true).map(action=>action.symbol)].map(symbolOf));
 const bySymbol=new Map(rows.map(row=>[symbolOf(row),row]));
 const sectors=new Set(),issuers=new Set();let selected=0;
 return candidates.map(candidate=>{
  const row=bySymbol.get(candidate.symbol)||{};
  const fresh=current&&!row.clientSnapshotFallback&&!row.dataFeedSnapshotStale;
  const gate=operationalGate(row,candidate,{...snapshot,requiredSessionDate:snapshot?.sourceSessionDate});
  let rating='Watch',why,next;
  if(fullUniverse&&snapshot.scan?.complete===false){why='The full dated-universe scan is incomplete.';next='Continue the same dated scan before publishing new purchases.';}
  else if(fullUniverse&&policy?.active===true&&policy.complete===false){why=policy.unavailableReason||'Account stock cooldown evidence is incomplete.';next='Reconcile the account policy evidence before new purchases.';}
  else if(fullUniverse&&policy?.active===true&&policy.purchaseEligibilityComplete===false){why='Account-wide purchase exposure is unverified.';next='Refresh current brokerage cash, ownership and exposure before selecting purchases.';}
  else if(fullUniverse&&activeExits.has(candidate.symbol)){why='An active account exit prevents a conflicting purchase.';next='Complete and reconcile the account exit before reconsidering this stock.';}
  else if(fullUniverse&&blocked.has(candidate.symbol)){
    const cooldown=(policy?.stockCooldowns||[]).find(item=>item.symbol===candidate.symbol&&item.active);
    why=cooldown?.expiresAfterSession?`Account-wide stock-loss cooldown through ${cooldown.expiresAfterSession}.`:'An account-wide stock-loss cooldown prevents repurchase.';
    next=cooldown?.resumesOn?`Repurchases may resume on ${cooldown.resumesOn}, subject to current qualification.`:'Wait until the account stock cooldown expires.';
  }
  else if(fullUniverse&&policy?.purchaseBlocks?.[candidate.symbol]){
    const reason=policy.purchaseBlocks[candidate.symbol];
    const text={'account-position-limit':'The account already holds four distinct Swing stocks.',
      'account-issuer-limit':'The account already holds the permitted share class from this issuer.',
      'account-sector-position-limit':'The account sector position limit prevents this purchase.',
      'account-concentration-limit':'The account concentration limit leaves no whole-share purchase capacity.',
      'brokerage-cash-insufficient':'Available brokerage cash cannot fund one whole share of this stock.',
      'account-allocation-whole-share-limit':'No internal allocation can fund one whole share under its unchanged target sizing.',
      'account-allocation-trade-size-limit':'No internal allocation meets the unchanged minimum trade size for this stock.',
      'not-in-entry-queue':'No internal allocation currently has a qualified purchase or remaining Add target for this stock.',
      'entry-gap-limit':'The verified opening price exceeds the unchanged entry gap limit.',
      'entry-invalidated-at-open':'The verified opening price invalidates this entry setup.',
      'account-exposure-unverified':'Current account exposure or this stock classification is unverified.'};
    why=text[reason]||'An existing account purchase limit prevents this purchase.';
    next='The account limit must permit a purchase before this stock consumes a selection slot.';
  }
  else if(!fresh){why='Current screen verification is unavailable.';next='Reload for verified current prices and entry checks.';}
  else if(!gate.pass){
    why=gate.reason;
    next=why==='Verified recent-momentum evidence is unavailable; fresh purchases and additions are paused.'?
      c1MissingMomentumText(candidate,snapshot.sourceSessionDate):'The blocked entry check must clear on a verified refresh.';
  }
  else if(selected>=V11_PRODUCTION_TARGET_COUNT){why=`Momentum rank #${candidate.researchRank}; below the three selected opportunities.`;next='Move into the selected three on a verified refresh.';}
  else if(sectors.has(candidate.sector)){why='A higher-ranked stock from this sector is already selected.';next='Become the selected sector representative.';}
  else if(issuers.has(candidate.issuer)){why='Another share class from this issuer is already selected.';next='Become the selected issuer representative.';}
  else {rating=(row.recommendation?.expertDecision||row.expertDecision||{}).strongBuyPass===true?'Strong Buy':'Buy';selected++;sectors.add(candidate.sector);issuers.add(candidate.issuer);why=`Selected C1 opportunity #${selected}; momentum rank #${candidate.researchRank}.`;next='Account action is shown separately.';}
  return {symbol:candidate.symbol,rating,priority:candidate.researchRank-1,screenReview:{why,next},entryEvidence:{sector:candidate.sector,momentumScore:candidate.momentumPercentile,close:candidate.sourcePrice},
   ...(fullUniverse?{decisionId:decisionId||policy?.decisionId||snapshot?.decisionId||null,policyVersion:policy?.version||snapshot?.policyVersion||null,scan:snapshot.scan}:{})};
 });
}

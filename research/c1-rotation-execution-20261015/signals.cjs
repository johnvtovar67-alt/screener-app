'use strict';

// Offline, research-only adapter. No provider requests, account writes, or
// alternative momentum implementation live here. Licensed inputs stay outside Git.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createResearchModuleLoader } = require('../../tools/research-module-loader.cjs');
const ROOT = path.resolve(__dirname, '../..');
const SOURCE_PINS = {
  'lib/historicalSignalEvaluator.js': 'e782d935b1ead9e2634938602961f56fa5191fb4728c16f5ba93aa98d072e7f5',
  'lib/c1LiveInput.js': '0f5aec4a92bac256e863c15d48181b0bd7ca312bce37bd4dbd45347a8a13266b',
};
const GICS = new Set(['Communication Services', 'Consumer Discretionary', 'Consumer Staples', 'Energy', 'Financials', 'Health Care', 'Industrials', 'Information Technology', 'Materials', 'Real Estate', 'Utilities']);
const canonical = value => String(value?.symbol || value?.ticker || value || '').replace('-', '.').trim().toUpperCase();
const dateOf = value => String(value || '').slice(0, 10);
const sidOf = value => value.securityId || value.security_id;
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));

function assertSourcePins() {
  for (const [file, expected] of Object.entries(SOURCE_PINS)) {
    if (sha(fs.readFileSync(path.join(ROOT, file))) !== expected)
      throw new Error('Frozen source differs: ' + file);
  }
  return { ...SOURCE_PINS };
}
function nyClose(date) {
  const [year, month, day] = date.split('-').map(Number);
  const test = Date.UTC(year, month - 1, day, 16);
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(fmt.formatToParts(new Date(test)).map(row => [row.type, row.value]));
  const observed = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return new Date(test - (observed - test)).toISOString();
}
function inInterval(row, date) {
  const from = dateOf(row.validFrom || row.valid_from || row.membership_valid_from || '0000-01-01');
  const inclusiveTo = row.validTo || row.valid_to;
  const exclusiveTo = row.validToExclusive || row.valid_to_exclusive || row.membership_valid_to_exclusive;
  return date >= from && (!inclusiveTo || date <= dateOf(inclusiveTo)) && (!exclusiveTo || date < dateOf(exclusiveTo));
}
function assertKnown(row, at, label) {
  const raw = row.knownAt || row.known_at;
  if (!raw) return; // Explicit approximate intervals may lack an exact publication minute.
  const known = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw + 'T23:59:59.999Z' : raw;
  if (!Number.isFinite(Date.parse(known)) || Date.parse(known) > Date.parse(at))
    throw new Error('Information unavailable at decision: ' + label);
}
function normalizeBars(input, name, adjustedRequired) {
  const result = new Map();
  for (const [rawSymbol, rows] of Object.entries(input || {})) {
    const symbol = canonical(rawSymbol);
    if (!symbol || result.has(symbol) || !Array.isArray(rows)) throw new Error('Duplicate/invalid ' + name + ' symbol');
    const byDate = new Map();
    let prior = '';
    for (const raw of rows) {
      const date = dateOf(raw.date);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date <= prior || byDate.has(date)) throw new Error('Unordered/duplicate ' + name + ' dates for ' + symbol);
      if (adjustedRequired && raw.adjusted !== true) throw new Error('Signal history must be explicitly adjusted: ' + symbol);
      for (const field of ['open', 'high', 'low', 'close'])
        if (typeof raw[field] !== 'number' || !Number.isFinite(raw[field]) || raw[field] <= 0) throw new Error('Invalid ' + name + ' OHLC for ' + symbol);
      if (typeof raw.volume !== 'number' || !Number.isFinite(raw.volume) || raw.volume < 0 || raw.low > Math.min(raw.open, raw.close) || raw.high < Math.max(raw.open, raw.close))
        throw new Error('Invalid ' + name + ' volume/range for ' + symbol);
      byDate.set(date, { ...raw, symbol, date });
      prior = date;
    }
    result.set(symbol, byDate);
  }
  return result;
}
function activeExclusion(exclusions, symbol, date) {
  return exclusions.filter(row => canonical(row.symbol) === symbol && inInterval(row, date));
}
function rowsForDate(metadata, date, at, bars, sectorOverrides = {}) {
  const identities = metadata.identities || [];
  const sectors = metadata.sectors || metadata.sectorIntervals || [];
  const securityProfiles = metadata.securities || [];
  const memberships = metadata.membership || [];
  const active = memberships.filter(row => inInterval(row, date));
  const seenIds = new Set(), seenSymbols = new Set();
  return active.map(member => {
    const sid = sidOf(member);
    if (!sid || seenIds.has(sid)) throw new Error('Missing/duplicate member identity on ' + date);
    seenIds.add(sid); assertKnown(member, at, sid);
    const identityMatches = identities.filter(row => sidOf(row) === sid && inInterval(row, date));
    const profileMatches = securityProfiles.filter(row => sidOf(row) === sid || (member.symbol && canonical(row) === canonical(member)));
    if (identityMatches.length > 1 || (identityMatches.length === 0 && profileMatches.length !== 1)) throw new Error('Identity interval missing/ambiguous for ' + sid + ' on ' + date);
    const identity = identityMatches[0] || profileMatches[0];
    assertKnown(identity, at, sid);
    const symbol = canonical(identity.symbol || identity.ticker || member.symbol);
    if (!symbol || seenSymbols.has(symbol)) throw new Error('Duplicate canonical security line on ' + date);
    seenSymbols.add(symbol);
    const sectorMatches = sectors.filter(row => sidOf(row) === sid && inInterval(row, date));
    if (sectorMatches.length > 1 || (sectorMatches.length === 0 && !identity.sector)) throw new Error('Sector interval missing/ambiguous for ' + sid + ' on ' + date);
    const sectorRow = sectorMatches[0] || identity;
    assertKnown(sectorRow, at, sid);
    const sector = sectorOverrides[symbol] || sectorRow.gics_sector || sectorRow.gicsSector || sectorRow.sector;
    // Stress scenarios can deliberately use a separate taxonomy. They must be
    // named explicitly; the primary accepts only the eleven frozen GICS labels.
    if (!GICS.has(sector) && !metadata.allowNonGicsStressLabels) throw new Error('Invalid GICS sector for ' + symbol);
    const cik = String(identity.cik || identity.issuerCik || identity.issuer_cik || identity.issuer_id || '').replace(/\D/g, '');
    if (!cik || /^0+$/.test(cik)) throw new Error('Issuer CIK missing for ' + symbol);
    const profile = profileMatches[0] || {};
    const firstBar = bars.get(symbol)?.keys().next().value;
    const listedAt = dateOf(identity.listedAt || profile.listedAt || firstBar);
    if (!listedAt) throw new Error('Available-life history missing for ' + symbol);
    return { ...profile, ...identity, symbol, ticker: symbol, securityId: sid, cik, name: profile.name || identity.name || symbol, companyName: profile.companyName || identity.name || symbol, sector, primaryTheme: sector, listedAt, isEtf: false, isFund: false };
  });
}


function normalizeAccountingManifest(manifest, dates) {
  if (!manifest) return new Map();
  if (!manifest.source || !Array.isArray(manifest.actions)) throw new Error('Separate sourced accounting manifest required');
  const byDate = new Map(), seen = new Set(), calendar = new Set(dates.map(row => row.date));
  for (const raw of manifest.actions) {
    const action = clone(raw);
    action.symbol = canonical(action.symbol);
    if (!action.id || !action.source || action.verified !== true || seen.has(action.id) || !action.symbol || !/^\d{4}-\d{2}-\d{2}$/.test(action.effectiveDate || '')) throw new Error('Verified unique accounting action/source required');
    seen.add(action.id);
    if (action.type === 'split') {
      if (!Number.isFinite(action.ratio) || action.ratio <= 0) throw new Error('Verified positive split ratio required');
    } else if (action.type === 'cash-dividend') {
      if (!Number.isFinite(action.amountPerShare) || action.amountPerShare < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(action.paymentDate || '') || action.paymentDate < action.effectiveDate || action.shareBasis !== 'ex-date-post-split') throw new Error('Verified nominal dividend/payment/share basis required');
    } else throw new Error('Unsupported accounting action type');
    if (action.effectiveDate >= dates[0].date && action.effectiveDate <= dates.at(-1).date && !calendar.has(action.effectiveDate)) throw new Error('Accounting action effective date is not a session');
    if (!byDate.has(action.effectiveDate)) byDate.set(action.effectiveDate, []);
    byDate.get(action.effectiveDate).push(action);
  }
  return byDate;
}
function normalizeMembershipActions(manifest, dates) {
  if (!manifest) return new Map();
  if (!manifest.source || !Array.isArray(manifest.actions)) throw new Error('Separate sourced membership-action manifest required');
  const byDate = new Map(), seen = new Set(), calendar = new Map(dates.map(row => [row.date, row]));
  for (const raw of manifest.actions) {
    const action = clone(raw); action.symbol = canonical(action.symbol);
    if (action.type !== 'universe-removal' || action.verified !== true || !action.id || !action.source || !action.symbol || seen.has(action.id) || !calendar.has(action.effectiveDate)) throw new Error('Verified unique effective-dated index-removal action required');
    if (!(action.knownAt || action.known_at)) throw new Error('Index-removal announcement availability required');
    assertKnown(action, new Date(Date.parse(calendar.get(action.effectiveDate).decisionAt) - 6.5 * 3600000).toISOString(), action.id);
    seen.add(action.id);
    if (!byDate.has(action.effectiveDate)) byDate.set(action.effectiveDate, []);
    byDate.get(action.effectiveDate).push(action);
  }
  return byDate;
}

function buildSignalDataset({ barsBySymbol, executionBarsBySymbol, splitOnlyBarsBySymbol, metadata, sessions, sessionDates, baselineDate = '2024-12-31', exclusions = [{ symbol: 'LEN', reason: 'unresolved-distribution-primary-full-window' }, { symbol: 'WDC', reason: 'unresolved-distribution-primary-full-window' }], includeExcludedInFactors = false, sectorOverrides = {}, rebaseToNominal = false, volumeContract = null, unitContract = {}, economicContract = {}, accountingManifest = null, membershipActionManifest = null, allowApproximateMetadata = false, onSession = null } = {}) {
  if (!allowApproximateMetadata) throw new Error('The approved approximate research contract must be explicit');
  if (!metadata || !Array.isArray(metadata.membership)) throw new Error('Dated membership metadata is required');
  const sourceHashes = assertSourcePins();
  const bars = normalizeBars(barsBySymbol, 'signal', true);
  const execution = executionBarsBySymbol ? normalizeBars(executionBarsBySymbol, 'execution', false) : null;
  const splitOnly = splitOnlyBarsBySymbol ? normalizeBars(splitOnlyBarsBySymbol, 'split-only', false) : null;
  const volumeRebased = rebaseToNominal && !!execution && !!splitOnly;
  volumeContract = volumeContract || (volumeRebased ? 'split-only-future-factor-volume-rebasing' : 'provider-volume-unchanged-unverified');
  if (rebaseToNominal && !execution) throw new Error('Nominal rebasing requires a verified execution view');
  if (!bars.has('SPY') || !bars.has('QQQ')) throw new Error('Both benchmark histories are required');
  const dates = (sessions || sessionDates || [...bars.get('SPY').keys()]).map(row => typeof row === 'string' ? { date: row, decisionAt: nyClose(row) } : { ...row, date: dateOf(row.date), decisionAt: row.decisionAt || row.at || nyClose(dateOf(row.date)) });
  let prior = '';
  for (const row of dates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || row.date <= prior || !Number.isFinite(Date.parse(row.decisionAt))) throw new Error('Invalid/unsorted calendar');
    if (!bars.get('SPY').has(row.date) || !bars.get('QQQ').has(row.date)) throw new Error('Missing benchmark session ' + row.date);
    prior = row.date;
  }
  const accountingByDate = normalizeAccountingManifest(accountingManifest, dates);
  const membershipActionsByDate = normalizeMembershipActions(membershipActionManifest, dates);
  const first = dates.findIndex(row => row.date === baselineDate);
  if (first < 252) throw new Error('At least 253 benchmark observations through baseline are required');
  const { compilePointInTimeSignals } = createResearchModuleLoader(ROOT).load('lib/historicalSignalEvaluator.js');
  const outputs = [], audit = { specification: 'C1-GICS-ROTATION-H1-2025Q1-v1', baselineDate, historyRows: dates.length, warmupRows: first, minimumHistoryRows: 253, compilerMemory: 'daily-reset-matches-compileC1LiveInput', rebaseToNominal, volumeRebased, volumeAdjustmentMethod: volumeRebased ? 'divide-prefix-volume-by-decision-date-future-split-factor' : 'unverified-provider-volume-unchanged', volumeContract, unitContract: clone(unitContract), economicContract: clone(economicContract), accountingManifestSource: accountingManifest?.source || null, membershipActionManifestSource: membershipActionManifest?.source || null, missingMembershipRemovalActions: [], sourceHashes, exclusions: clone(exclusions), includeExcludedInFactors, daily: [], approximateGicsContinuity: true, exactHistoricalReplication: false };
  let previousProfiles = null;
  for (let index = first; index < dates.length; index++) {
    const current = dates[index];
    const profiles = rowsForDate(metadata, current.date, current.decisionAt, bars, sectorOverrides);
    const excluded = profiles.filter(profile => activeExclusion(exclusions, profile.symbol, current.date).length);
    const rankProfiles = includeExcludedInFactors ? profiles : profiles.filter(profile => !excluded.includes(profile));
    const scales = new Map(), volumeDivisors = new Map();
    for (const [symbol, byDate] of bars) {
      const signal = byDate.get(current.date);
      const nominal = execution?.get(symbol)?.get(current.date);
      if (signal && rebaseToNominal) {
        if (!nominal) throw new Error('Nominal decision bar missing for ' + symbol + ' on ' + current.date);
        scales.set(symbol, nominal.close / signal.close);
        if (splitOnly) {
          const split = splitOnly.get(symbol)?.get(current.date);
          if (!split) throw new Error('Split-only decision bar missing for ' + symbol + ' on ' + current.date);
          const futureSplitFactor = nominal.close / split.close;
          if (!(futureSplitFactor > 0) || !Number.isFinite(futureSplitFactor)) throw new Error('Invalid future-split volume divisor');
          if (Math.abs(signal.volume - split.volume) > 1e-5) throw new Error('Signal/split-only provider volume mismatch: ' + symbol);
          const restored = signal.volume / futureSplitFactor;
          if (Math.abs(restored - nominal.volume) > Math.max(1e-5, nominal.volume * 1e-10)) throw new Error('Rebased decision volume does not match nominal volume: ' + symbol);
          volumeDivisors.set(symbol, futureSplitFactor);
        }
      } else scales.set(symbol, 1);
    }
    for (const profile of rankProfiles) {
      const available = bars.get(profile.symbol);
      if (!available?.has(current.date)) throw new Error('Eligible member has no decision bar: ' + profile.symbol + ' on ' + current.date);
      const firstAvailable = available.keys().next().value;
      const missingDate = dates.slice(0, index + 1).find(session => session.date >= firstAvailable && !available.has(session.date));
      if (missingDate) throw new Error('Available-life history contains a session gap: ' + profile.symbol + ' on ' + missingDate.date);
      if ([...available.values()].some(bar => bar.date <= current.date && sidOf(bar) && sidOf(bar) !== profile.securityId)) throw new Error('Price history mixes research security lines: ' + profile.symbol);
    }
    const rawSessions = dates.map((session, prefixIndex) => ({
      ...session,
      universeSymbols: prefixIndex === index ? rankProfiles.map(row => row.symbol).sort() : [],
      prices: prefixIndex <= index ? [...bars].flatMap(([symbol, byDate]) => {
        const bar = byDate.get(session.date);
        if (!bar) return [];
        const scale = scales.get(symbol) || 1;
        const divisor = volumeDivisors.get(symbol) || 1;
        if (volumeRebased) {
          const splitBar = splitOnly.get(symbol)?.get(session.date);
          if (!splitBar) throw new Error('Split-only prefix bar missing for ' + symbol + ' on ' + session.date);
          if (Math.abs(bar.volume - splitBar.volume) > 1e-5) throw new Error('Signal/split-only prefix volume mismatch: ' + symbol);
        }
        return [{ ...bar, open: bar.open * scale, high: bar.high * scale, low: bar.low * scale, close: bar.close * scale, volume: bar.volume / divisor, adjusted: true }];
      }) : [],
    }));
    const compiled = compilePointInTimeSignals({ metadata: { source: 'private FMP current-vintage history / approved approximate GICS reconstruction', pointInTime: false, universeMembershipPointInTime: false, survivorshipBiasFree: false, corporateActionsAdjusted: true, benchmarkSymbol: 'SPY', comparisonSymbols: ['SPY', 'QQQ'] }, securities: rankProfiles, fundamentals: [], events: [], sessions: rawSessions }, { minimumHistoryRows: 253, liquidity: { maxCandidates: 500 }, maxSessions: 1, resume: { sessions: [], completedSessions: index, decisionMemory: [] } });
    if (compiled.sessions.length !== 1 || compiled.sessions[0].date !== current.date) throw new Error('Source compiler failed one-date alignment');
    const session = compiled.sessions[0];
    if (execution) {
      session.prices = [...execution].flatMap(([symbol, byDate]) => byDate.has(current.date) ? [{ ...byDate.get(current.date), symbol, adjusted: true, executionBasis: 'separate-nominal-view' }] : []);
      if (rebaseToNominal) {
        for (const signal of [...session.positionSignals, ...session.signals]) {
          const nominal = execution.get(signal.symbol)?.get(current.date);
          if (!nominal || Math.abs(signal.price - nominal.close) > Math.max(1e-8, nominal.close * 1e-10)) throw new Error('Nominal signal/execution price mismatch');
        }
      }
    }
    session.corporateActions = clone(current.corporateActions || []);
    for (const action of membershipActionsByDate.get(current.date) || []) {
      const existing = session.corporateActions.find(row => row.id === action.id);
      if (existing && JSON.stringify(existing) !== JSON.stringify(action)) throw new Error('Conflicting native membership action');
      if (!existing) session.corporateActions.push(clone(action));
    }
    const accounted = clone(accountingByDate.get(current.date) || []);
    // Session-local rows cannot create accounting authority. They must exactly
    // match the separately reviewed manifest, or fail instead of being inferred.
    for (const action of current.researchAccountingActions || []) {
      if (!accounted.some(verified => JSON.stringify(verified) === JSON.stringify(action))) throw new Error('Session accounting action absent from separate verified manifest');
    }
    if (accounted.length) session.researchAccountingActions = accounted;
    if (previousProfiles) {
      const ids = new Set(profiles.map(row => row.securityId));
      for (const removed of previousProfiles.filter(row => !ids.has(row.securityId))) {
        const action = session.corporateActions.find(row => row.type === 'universe-removal' && canonical(row.symbol) === removed.symbol);
        if (!action) {
          audit.missingMembershipRemovalActions.push({ date: current.date, symbol: removed.symbol, securityId: removed.securityId });
          if (economicContract.fullOpportunityUniverseVerified === true) throw new Error('Complete economic coverage requires explicit native index-removal action: ' + removed.symbol);
        } else if (economicContract.fullOpportunityUniverseVerified === true) {
          if (action.verified !== true || !action.id || !action.source || !(action.knownAt || action.known_at)) throw new Error('Full-coverage index removal requires verified source and availability');
          assertKnown(action, new Date(Date.parse(current.decisionAt) - 6.5 * 3600000).toISOString(), action.id);
        }
      }
    }
    previousProfiles = profiles;
    // The six factor closes for H must be consecutive calendar observations on
    // the same explicitly mapped research security line, not six sparse rows.
    const lastSix = dates.slice(index - 5, index + 1).map(row => row.date);
    session.researchHConsecutiveSymbols = session.positionSignals.filter(signal => {
      const profile = rankProfiles.find(row => row.symbol === signal.symbol);
      return lastSix.length === 6 && lastSix.every(date => {
        const bar = bars.get(signal.symbol)?.get(date);
        return bar && (!sidOf(bar) || sidOf(bar) === profile.securityId);
      });
    }).map(row => row.symbol).sort();
    const shortHistory = rankProfiles.filter(profile => [...(bars.get(profile.symbol)?.keys() || [])].filter(date => date <= current.date).length < 253).map(row => row.symbol).sort();
    const rowAudit = { date: current.date, indexMemberCount: profiles.length, inputFactorMemberCount: rankProfiles.length, sourcePositionSignalCount: session.positionSignals.length, sourceFreshSignalCount: session.signals.length, excludedSymbols: excluded.map(row => row.symbol).sort(), insufficientHistorySymbols: shortHistory, decisionMemoryReset: true, nominalVolumeRebased: volumeRebased, nominalVolumeDecisionChecks: volumeDivisors.size };
    audit.daily.push(rowAudit); outputs.push(session);
    if (onSession) onSession({ session, audit: rowAudit, completed: outputs.length, total: dates.length - first });
  }
  const allocationExcluded = [...new Set(exclusions.map(row => canonical(row.symbol)))].sort();
  return { dataset: { metadata: { source: 'source-compatible C1 compiler / approximate historical GICS inputs', schema: 'c1-gics-rotation-research-signals-v1', pointInTime: false, survivorshipBiasFree: false, universeMembershipPointInTime: false, exactHistoricalReplication: false, independentValidation: false, approximateGicsContinuity: true, benchmarkSymbol: 'SPY', comparisonSymbols: ['SPY', 'QQQ'], minimumSignalHistoryRows: 253, researchAllocationExcludedSymbols: allocationExcluded, compilerMemory: audit.compilerMemory, signalPriceBasis: rebaseToNominal ? 'adjusted-causal-prefix-rebased-to-decision-nominal-close' : 'provider-adjusted', executionPriceBasis: execution ? 'separate-execution-view' : 'signal-view-only-not-economic', volumeContract, unitContract: clone(unitContract), executionPricesVerified: !!execution && rebaseToNominal && (unitContract.nominalPricesVerified === true || economicContract.executionPricesVerified === true), volumeUnitsVerified: volumeRebased && (unitContract.volumeUnitsVerified === true || economicContract.volumeUnitsVerified === true), volumeAdjustmentMethod: audit.volumeAdjustmentMethod, fullOpportunityUniverseVerified: economicContract.fullOpportunityUniverseVerified === true && audit.missingMembershipRemovalActions.length === 0, researchAccountingCoverageComplete: economicContract.researchAccountingCoverageComplete === true && !!accountingManifest, researchMembershipActionsComplete: economicContract.researchMembershipActionsComplete === true && !!membershipActionManifest && audit.missingMembershipRemovalActions.length === 0, researchMembershipActions: [...membershipActionsByDate.values()].flat().map(clone), researchInputCoverageHash: /^[a-f0-9]{64}$/.test(economicContract.researchInputCoverageHash || '') ? economicContract.researchInputCoverageHash : '', researchCoverageFrom: economicContract.researchCoverageFrom || null, researchCoverageThrough: economicContract.researchCoverageThrough || null, researchDataContract: economicContract.researchDataContract === 'manufactured-fixture-v1' ? 'manufactured-fixture-v1' : null, sourceHashes }, sessions: outputs }, audit };
}

// This projection deliberately omits narrative labels and includes every field
// used by the frozen price-only/momentum-only rank and entry checks.
function economicSignalProjection(session) {
  const rows = new Map();
  for (const row of [...session.positionSignals, ...session.signals]) rows.set(row.symbol, row);
  return [...rows.values()].sort((a, b) => a.symbol.localeCompare(b.symbol)).map(row => ({ symbol: row.symbol, cik: row.cik, sector: row.sector, price: row.price, avgVolume: row.avgVolume, priceAvg50: row.priceAvg50, priceAvg200: row.priceAvg200, researchFactors: row.researchFactors, entryTiming: row.entryTiming, riskPlan: row.riskPlan }));
}

module.exports = { buildSignalDataset, economicSignalProjection, canonical, nyClose, assertSourcePins, SOURCE_PINS };

if (require.main === module) {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath) throw new Error('Usage: node signals.cjs PRIVATE_INPUT.json PRIVATE_OUTPUT.json');
  const result = buildSignalDataset(JSON.parse(fs.readFileSync(inputPath, 'utf8')));
  fs.writeFileSync(outputPath, JSON.stringify(result), { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ decisionSessions: result.dataset.sessions.length, minimumHistoryRows: result.audit.minimumHistoryRows, exactHistoricalReplication: false }));
}

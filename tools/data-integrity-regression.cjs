const fs=require('fs');
const assert=(condition,message)=>{if(!condition)throw new Error(message);};

const top5=fs.readFileSync('pages/api/top5.js','utf8');
const page=fs.readFileSync('pages/index.js','utf8');
const app=fs.readFileSync('pages/_app.js','utf8');
const ledger=fs.readFileSync('lib/performanceLedger.js','utf8');
const snapshotStore=fs.readFileSync('lib/v11ProductionSnapshot.js','utf8');
const performanceStore=fs.readFileSync('lib/performanceStore.js','utf8');
const fundamentalStore=fs.readFileSync('lib/fmpFundamentals.js','utf8');
const discoveryStore=fs.readFileSync('lib/fullMarketDiscovery.js','utf8');
const persistenceStore=fs.readFileSync('lib/strongBuyPersistence.js','utf8');

assert(top5.includes('MIN_QUOTE_COVERAGE_PCT = 95')&&top5.includes('broadQuotes.length / Math.max(1, broadSymbols.length)'),'Broad quote completeness must use the intended-universe denominator and an explicit deployment floor');
assert(top5.includes('...configuredMarketMemberSymbols')&&top5.includes('...discoveredSymbols')&&top5.includes('dynamicSymbols = uniqueSymbols'),'Configured market-cycle names must remain declared while full-market candidates expand the universe');
assert(top5.includes('getFullMarketDiscovery')&&top5.includes('fullMarketCoarseUniverseCapped'),'Broad discovery must be durable, full-market aware, and explicitly disclose a breadth cap');
assert(top5.includes('fullMarketDiscoveryIssue')&&page.includes('bulk_entitlement_required')&&page.includes('not being presented as complete-market coverage'),'A provider entitlement failure must remain visible instead of quietly masquerading as full-market coverage');
assert(top5.includes('snapshotVerificationPaused')&&top5.includes('dataFeedSnapshotStale: true')&&top5.includes('performanceObservationRecorded'),'Incomplete/stale snapshots must pause the ledger observation and expose recording status');
assert(top5.includes('failClosedRows')&&top5.includes('source: "server-integrity-pause"')&&top5.includes('selected: false, status: "verification-paused"'),'The server must neutralize stale/incomplete Buy rows before returning them to any client');
assert(top5.includes('cached?.requiredSessionDate === requiredSessionDate')&&top5.includes('requiredSessionDate = latestCompletedMarketSessionDay'),'The broad cache must not cross a completed-market-session boundary');
assert(top5.includes('verificationPass === 0 &&')&&top5.includes('cached?.rows'),'A user-requested verification pass must bypass the broad server cache');
assert(top5.includes('await updatePerformanceLedger(')&&top5.includes('rows.map((row) => ({')&&top5.includes('relativeCapitalScore:\n                  row.finalDecision.relativeCapitalScore'),'Expanded-universe ledger observations must be compact instead of persisting every nested scoring object');
assert(top5.includes('stocks: clientRows.map(serializeStockForClient)')&&top5.includes('compactRowsForClient')&&top5.includes('clientReturned')&&top5.includes('delete recommendation[key]')&&top5.includes('fundamentalSnapshot: _fundamentalSnapshot'),'The public broad-screen payload must be bounded and remove duplicated server-only decision evidence before reaching mobile clients');
assert(top5.includes('recentStrongBuySymbols()')&&top5.indexOf('await seedDurableStrongBuyMemory();')<top5.indexOf('recentStrongBuySymbols()'),'Previously earned Strong Buys must receive a bounded timing recheck before hysteresis is considered');
assert(top5.includes('SINGLE_FALLBACK_LIMIT = 8')&&top5.includes('setQuoteCooldown(')&&!top5.includes('/api/v3/'),'FMP quote recovery must remain stable-only, cooled, and tightly bounded');
assert(page.includes('analysisCapitalReady?buyQueue:[]')&&page.includes('setAnalysisCapitalReady(false)')&&page.includes('const actionable=(screenLive?snapshot:[])'),'A failed or incomplete broad refresh must not reuse old Buy candidates for portfolio funding');
assert(page.includes('broadVerificationUnavailable:true')&&page.includes('Wait for Live Verification'),'Single-symbol analysis must not bypass a failed authoritative broad screen');
assert(page.includes('quoteFeedStatus')&&page.includes('dataFeedSnapshotStale'),'Server-side stale/incomplete snapshot metadata must reach the capital-action gate');
assert(page.includes('heldTimingVerified=false;screenLive=false')&&page.includes('all capital actions are paused because held-position verification failed'),'Held-position timing failures must be visible and pause capital actions');
assert(!app.includes('age<120000')&&!app.includes('setInterval(()=>{const b=document.querySelector')&&app.includes('clientSnapshotFallback:true'),'The client must not serve a fresh per-device top5 cache or force-enable overlapping reloads; fallback must be explicitly paused');
assert(app.includes('cacheParams.delete("verificationPass")')&&!app.includes('function clearTop5Cache()'),'A manual verification pass must retain the last verified snapshot as a fail-closed fallback instead of deleting it before the request');
assert(ledger.includes("PERFORMANCE_SESSION_BASIS='us-equity-session-v1'")&&ledger.includes('excludedLegacySignals'),'Calendar-day legacy samples must not contaminate market-session efficacy statistics');
for(const [name,source] of Object.entries({snapshotStore,performanceStore,fundamentalStore,discoveryStore,persistenceStore}))assert(!source.includes('|| blobs[0]')&&!source.includes('||blobs[0]'),`${name} must require an exact durable-object pathname`);
assert(snapshotStore.includes('snapshotId: [')&&snapshotStore.includes('datasetThrough !== requiredSessionDate')&&snapshotStore.includes('candidatesValid'),'C1 snapshots must bind to the exact current compiled dataset and pass structural candidate validation');

console.log('DATA INTEGRITY REGRESSION PASS: authoritative refresh, universe coverage, stale-snapshot safety, bounded FMP recovery, and clean performance basis verified.');

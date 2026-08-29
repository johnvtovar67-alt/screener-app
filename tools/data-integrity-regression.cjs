const fs=require('fs');
const assert=(condition,message)=>{if(!condition)throw new Error(message);};

const top5=fs.readFileSync('pages/api/top5.js','utf8');
const page=fs.readFileSync('pages/index.js','utf8');
const app=fs.readFileSync('pages/_app.js','utf8');
const ledger=fs.readFileSync('lib/performanceLedger.js','utf8');

assert(top5.includes('MIN_QUOTE_COVERAGE_PCT = 95')&&top5.includes('broadQuotes.length / Math.max(1, broadSymbols.length)'),'Broad quote completeness must use the intended-universe denominator and an explicit deployment floor');
assert(top5.includes('...configuredMarketMemberSymbols')&&top5.includes('...discoveredSymbols')&&top5.includes('dynamicSymbols = uniqueSymbols'),'Configured market-cycle names must remain declared while full-market candidates expand the universe');
assert(top5.includes('getFullMarketDiscovery')&&top5.includes('fullMarketCoarseUniverseCapped'),'Broad discovery must be durable, full-market aware, and explicitly disclose a breadth cap');
assert(top5.includes('fullMarketDiscoveryIssue')&&page.includes('bulk_entitlement_required')&&page.includes('not being presented as complete-market coverage'),'A provider entitlement failure must remain visible instead of quietly masquerading as full-market coverage');
assert(top5.includes('snapshotVerificationPaused')&&top5.includes('dataFeedSnapshotStale: true')&&top5.includes('performanceObservationRecorded'),'Incomplete/stale snapshots must pause the ledger observation and expose recording status');
assert(top5.includes('stocks: rows.map((row) => ({')&&top5.includes('relativeCapitalScore:\n                  row.finalDecision.relativeCapitalScore'),'Expanded-universe ledger observations must be compact instead of posting every nested scoring object');
assert(top5.includes('recentStrongBuySymbols()')&&top5.indexOf('await seedDurableStrongBuyMemory();')<top5.indexOf('recentStrongBuySymbols()'),'Previously earned Strong Buys must receive a bounded timing recheck before hysteresis is considered');
assert(top5.includes('SINGLE_FALLBACK_LIMIT = 8')&&top5.includes('setQuoteCooldown(')&&!top5.includes('/api/v3/'),'FMP quote recovery must remain stable-only, cooled, and tightly bounded');
assert(page.includes('analysisCapitalReady?buyQueue:[]')&&page.includes('setAnalysisCapitalReady(false)')&&page.includes('const actionable=(screenLive?snapshot:[])'),'A failed or incomplete broad refresh must not reuse old Buy candidates for portfolio funding');
assert(page.includes('broadVerificationUnavailable:true')&&page.includes('Wait for Live Verification'),'Single-symbol analysis must not bypass a failed authoritative broad screen');
assert(page.includes('quoteFeedStatus')&&page.includes('dataFeedSnapshotStale'),'Server-side stale/incomplete snapshot metadata must reach the capital-action gate');
assert(!app.includes('age<120000')&&!app.includes('setInterval(()=>{const b=document.querySelector')&&app.includes('clientSnapshotFallback:true'),'The client must not serve a fresh per-device top5 cache or force-enable overlapping reloads; fallback must be explicitly paused');
assert(ledger.includes("PERFORMANCE_SESSION_BASIS='us-equity-session-v1'")&&ledger.includes('excludedLegacySignals'),'Calendar-day legacy samples must not contaminate market-session efficacy statistics');

console.log('DATA INTEGRITY REGRESSION PASS: authoritative refresh, universe coverage, stale-snapshot safety, bounded FMP recovery, and clean performance basis verified.');

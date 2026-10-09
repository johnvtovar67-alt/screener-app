# Targeted top5 timeout repair — October 9, 2026

The owner explicitly requested investigation and a performance/robustness repair of `GET /api/top5` on production `ffdd79b5923a14bd4a9c4e701184b609e4351d21`, preserving C1 methodology, ranking, verification, eligibility, cash/account behavior and the PR #254 Brokerage Cash UI.

## Evidence and limits

Production logged a 60-second Vercel timeout at 17:47:01.843 UTC, request `d6ng5-1791567961805-c24fe0ec1a79`. That invocation had no phase logs, so its exact phase distribution cannot be reconstructed. A subsequent real production compact GET succeeded in 25.221 seconds measured through the authenticated fetch connector, confirming intermittent behavior. Neither PR #253 nor #254 changed `pages/api/top5.js`.

An instrumentation-only hosted preview uses the exact production engine and reads the accepted production market book **read-only** for profiling; this diagnostic-only data binding is excluded from the repair. No collection, cron replay, account writes, model reset or invented observation is used. Baseline diagnostic commit `6d93af2bc5de86dbfdcc05ccbb4c7c442d8d71af`, deployment `dpl_CavTNv8515StG3Cgs8AiUJwrvtmW`, request `qln8t-1791570053603-0e008c53f02d` measured:

| Phase | Baseline milliseconds |
| --- | ---: |
| Discovery durable read | 2452.1 |
| Accepted production snapshot read/build (parallel with discovery) | 2404.0 |
| Seed quotes | 112.7 |
| Full intended dynamic-universe quotes | 320.6 |
| Fundamentals (564 verified cached rows; no provider refresh) | 156.7 |
| Initial stock classification | 881.3 |
| Market leadership | 0.8 |
| Durable screen continuity | 347.3 |
| Required event verification | 1479.5 |
| Required historical timing/benchmark verification | 694.9 |
| Whole broad snapshot, including priority sort/final policy | 9537.7 |
| Theme leadership | 1.6 |
| Performance continuity/ledger update | 8907.2 |
| Serialization and response | 19.3 |
| Whole function | 18471.4 |

The ledger contained 5,606 records. Its first, merged and reconciliation observation passes consumed 2363.6, 2446.2 and 2462.0 ms, while three Blob reads together took only 396.0 ms and the write took 238.0 ms. This directly identifies repeated CPU work as the measured dominant cost, rather than a provider hang: 58 FMP calls were completed, including 16 quote batches and 38 timing histories. Fundamentals and discovery were already fresh. Other sorting and accepted-model phases also call the same calendar helpers.

A deterministic 10,000-record/568-row replay derived from the actual public performance tail and compact market rows isolated the calendar work. Repeated formatter construction and holiday rebuilding changed from 82,732/292,384 constructions to 1/1. The same 374,750 session-day checks and 2,438 session-distance calculations still run. The ledger CPU pipeline measured **17.645 → 2.367 seconds**, with deep equality of every stage. Its algorithm is unchanged.

## Repair

- Reuse the same fixed Eastern formatter and immutable private holiday sets in a bounded 16-year cache. Calendar rules, date parsing, session distance, thresholds, exceptions and all returned values remain unchanged.
- Fetch quote batches with five bounded concurrent calls; merge their results in original request order, preserving the complete intended universe and quote coverage denominator. Per-call timeouts, retries, stale flags and bounded emergency fallback remain.
- Share simultaneous broad builds with the same completed session and verification pass. Keep manual fundamental priority rotation and session-aware cache freshness.
- Interactive reads reuse persisted discovery instead of initiating a full exchange refresh. Preserve the existing 20-hour fresh status and seven-day refresh-failure reuse policy; older/missing data is disclosed as unavailable/missing. Daily cron collection remains unchanged. Required symbol-level fundamentals, event, historical timing, benchmark and liquidity verification still run.
- A request-scoped 55-second deadline aborts outstanding provider fetches, stops retries/queues and fences successful cache publication and subsequent persistence. Existing individual provider timeouts remain. A timed-out build retains the original ≤24-hour verified screen only through existing fail-closed rows; otherwise it returns retryable JSON 503 with `TOP5_TIMEOUT`. An already-issued Blob put may settle after timeout; its lock remains held until actual settlement, and subsequent work cannot claim success.
- Read top5 bodies as text before validating JSON and the successful payload shape. Non-JSON/malformed failures use concise operational messaging and cannot overwrite prior valid continuity. Existing error/status handling and fresh-capital pause flags remain.

## Verification and scope

The actual production route fixture is bound to Git blob `468c42d40f544b86da386e92fc4313195f5208d6`; the original calendar fixture is bound to `0ac3b15820a31d8587751859755d2b01eff1802e`. Exact full/compact outputs, ranking and 3 Buy/6 Watch classifications are compared for identical inputs, including event, liquidity and price-gap exclusions. Calendar coverage compares all 12 exports, DST, holidays, open/close/early-close boundaries, invalid inputs and cache eviction. Realistic mocked provider latency reproduces a 70.6-second baseline and verifies a bounded repair, same-pass deduplication, clean timeout, prior continuity and late-publication fencing. Dedicated helper/module tests cover provider isolation, slow/late bodies, discovery age bounds and ledger lock retention. Client tests cover non-JSON/HTML timeouts, malformed success bodies, cache validity, continuity and paused new capital.

No C1 strategy, scoring, ranking, classification, performance-ledger calculation, account/cash/execution file, Brokerage Cash component, CSS or UI markup is changed. `pages/index.js` changes only the top5 response reader; `_app.js` changes only top5 response/cache validation. `brokerageCash`, `strategyCash`, `executableCash`, current-date freshness, dedicated cash update and lower-cash execution cap remain exactly as released. Only affected application hashes in `docs/c1-release-freeze.json` are updated for this explicit repair. Release guards, build hooks, dependencies and cron schedules are unchanged.

Hosted after-repair measurements, full suite/build and release checks are recorded in the PR before merge.

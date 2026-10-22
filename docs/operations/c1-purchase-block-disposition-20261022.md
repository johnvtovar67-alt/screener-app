# Current corporate-event verification repair — October 22, 2026

The owner's FINAL REPAIR request explicitly authorizes extending PR #302 with current FMP event verification, focused regressions, the normal build and CI, then merge and deployment only after all safeguards pass. This supersedes the earlier wording-only/no-deployment scope. Reviewed main/production baseline: `61e0f081be89894fed9d955b9c5a87170cad5759`.

## Defect and correction

The accepted historical signal compiler has no current event coverage and correctly creates fail-closed Manual flags. Opening review previously fetched current prices but reused those historical flags as the present event conclusion. Thus a historical missing-verification state could never become a verified current result through opening review. Existing refresh also lacked explicit complete-feed, source-time and expiration contracts; stale cached responses could look like current evidence.

The existing `fetchEventRiskMap` now returns source-attributed, expiring `VERIFIED_CLEAR`, `VERIFIED_BLOCKED` or `UNVERIFIED` evidence. Earnings, target-company M&A and company news retain their existing policy definitions and 15/60/5-minute freshness limits. Earnings retain the existing −2/+7-day observation and −1/+2-day blocking windows. Existing news severity patterns, known deals, conviction reduction and informational macro/bellwether awareness remain. A split is not an adverse-event predicate.

Required feeds must have valid identities/dates, complete dated coverage and terminal pagination. A capped full earnings calendar uses bounded exact-day partitions of the same window. Missing, stale, malformed, out-of-range, contradictory, repeated-page, provider-failed or exhausted responses cannot prove absence. Cached data retain their original source times; last verified receipts remain bounded in memory with provenance and expiry for context only. They never authorize trading after expiry. Existing request coalescing, fresh caches, retry cooldown and request deadlines bound collection; there is no new store or refresh loop.

The existing refresh automatically uses the repaired verifier. Opening collects it once for the symbols already requested, then revalidates the original quotes and membership without changing quote membership or requesting ineligible names. Only complete current evidence replaces historical Manual in additional-capacity classification. The existing capacity and position/sector rules remain authoritative. Every current ordinary Buy/Add and capacity purchase is also checked against that same evidence, including new remainders of partially filled orders. Already posted duplicate tickets, original fills, stops, exits and historical completed-session replay retain their existing authority. Manual recommendation expiry cannot exceed event-evidence expiry.

Evidence is transient: no event payload is copied into an account, ticket, historical session or activity plan. The existing MRNA/CRWD-only diagnostic exposes bounded current state/source receipts alongside unchanged historical source evidence, without account economics, credentials or provider payloads. PR #302's formatter now reports actual native volatility exclusion or incomplete event verification and preserves genuine adverse-event explanations. No new endpoint or dashboard is added.

## MRNA: preserve restriction

Production accepted 60-session volatility is **373.2866%**, above the unchanged **100%** maximum. The stock is outside the native purchase queue, so its opening quote is intentionally not requested. Newly read FMP adjusted history for the 61 closes July 28–October 21 reproduces `annualizedVolatility`: sample standard deviation of 60 simple returns × `sqrt(252) × 100` = **373.286599754867%**. The August 19 $62.96→$174.38 rally dominates the result; raw prices match and the split feed reports no MRNA split. No calculation, price or historical correction is supported. The explanation is corrected, and this repair cannot admit MRNA.

## CRWD and actual provider limitation

The supplied production diagnostic shows volatility 72.65%, fresh opening quote and `MATERIAL_EVENT_BLOCK` from historical `MANUAL`, `blockNewCapital=true`, `checkComplete=false`, `eventRiskVerified=false`; it does not establish a current adverse event. The July 2 four-for-one split is already adjusted; the October mini-tender does not independently meet the existing acquisition-target predicate.

The repaired verifier was exercised against actual configured FMP responses on October 22, 2026 at **18:46:36 UTC**. It correctly returned **UNVERIFIED**:

- Earnings full-window query returned 4,000 rows and dates beyond the requested end. Exact-day fallback still spilled into the following date for October 20, 21, 27, 28 and 29. Receipt: `DAILY_OUT_OF_RANGE`, fetched `2026-10-22T18:46:36.422Z`, expires `2026-10-22T19:01:36.422Z`.
- M&A page zero contained 1,000 records, including an October 28, 2022 row with both target symbol and target company name null. Name-only targets also fail closed because the existing classifier requires a usable target symbol; no name-to-symbol guess is made. Receipt: `MALFORMED_RESPONSE`, fetched `2026-10-22T18:46:36.003Z`, expires `2026-10-22T19:46:36.003Z`. Unknown target identity cannot establish absence of a target-company event.
- CRWD news coverage completed: `OK`, fetched `2026-10-22T18:46:35.909Z`, expires `2026-10-22T18:51:35.909Z`.

These are newly read public provider observations, not substitutions for accepted history. The software now replaces indefinite historical inference with a dated current result, but cannot manufacture VERIFIED_CLEAR while these external completeness failures persist. Production must retain the restriction if its own current response has the same defects.

`POSITION_LIMIT` is real in the supplied plan but depends on the existing additional-capacity exception, which itself requires event qualification. Valid current verification permits reevaluation of that exception; it does not guarantee capacity or a purchase. Actual current private-account eligibility is not asserted without its authenticated response.

## Scope and freeze protection

Application changes beyond the initial PR #302 presentation bindings are limited to `lib/eventRisk.js`, new `lib/c1CurrentEventEvidence.js`, `lib/c1AccountOpeningProvider.js`, `lib/c1AdditionalSwingCapacity.js`, `lib/c1AccountExecutionView.js`, `lib/c1ManualRecommendations.js`, `lib/c1EntryReview.js`, `lib/c1PurchaseDiagnostics.js` and `lib/c1DecisionCopy.js`. Only these reviewed hashes and the explicit owner authorization are added to the release-freeze manifest. The guard, canonical integrity, build and CI hooks remain unchanged. The brokerage-rule-parity test reverses only the three exact authorized collector seams before verifying its original source hash; full strategy, cash, ledger, account and fill parity comparisons remain, with only current-event expiry shortening manual validity. Existing synthetic opening fixtures now supply explicit current receipts rather than relying on historical event flags. Deadline tests retain their timing and cleanup assertions while accounting for the three concurrent required feeds.

Earlier PR #302 changes to `pages/index.js` and `components/C1AccountOpportunities.js` only bind existing diagnostics to the formatter. Historical presentation source-integrity tests reverse that exact prop while retaining their original hashes. The isolated branch remains disabled in Vercel's existing deployment map; normal main deployment and crons are unchanged.

No changes to ranking, factors, thresholds, position/sector limits, capacity qualification, sizing, stop/exit policy, cash funding, holdings, account storage, accepted prices or historical data. No private-account writes, credentials changes or trades were performed for verification.

## Verification

Focused provider regression passes 75 cases plus receipt-tamper controls. Opening regression covers current clear replacing obsolete Manual, all missing/stale/contradictory/adverse controls, ordinary and capacity partial-fill protection, quote and recommendation expiration, MRNA exclusion and immutable accounting/history. Existing purchase-disposition, diagnostic parity/privacy and opening-performance regressions pass.

Full build/CI and production release evidence are recorded in PR #302. Production verification must bind the actual deployment commit and report actual provider classification; it must not claim private account parity from an unauthenticated market-data read.

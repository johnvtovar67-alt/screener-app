# C1 Priority 3 — change-control and verification report

This records the initial local implementation at `0e11650`. The subsequent owner-authorized PR publication review is documented in `c1-priority3-pr-readiness-20261014.md`; its only configuration addition blocks automatic deployment of the feature branch.

## Status

Local review candidate only, on `feat/c1-intraday-advisory`, based on main/production `f0d46ffceb98ba3fd5fca121beba6d8f23ccbdde`. Production deployment was rechecked after verification and remains `dpl_DDBfxBKupMFdHaH5sATk2VCMcPvC` at that exact commit. No branch push, preview/production deployment, promotion, cron change or account operation was performed.

## Authorized application delta

Four new advisory-only application files: `components/C1IntradayAdvisory.js`, `lib/c1IntradayAdvisory.js`, `lib/c1IntradayAdvisoryProvider.js`, `pages/api/c1-intraday-advisory.js`.

The existing `pages/index.js` has exactly two insertions: component import and rendering with read-only props. Removing those two lines reconstructs the deployed page byte-for-byte. Advisory state is not passed into existing screen, account or execution state setters.

`docs/c1-release-freeze.json` updates only those five affected/new application entries and adds `intradayAdvisoryAuthorization` recording the current explicit owner instruction. All prior unrelated hashes and authorization fields remain identical. The release guard, canonical guard and build/test hooks are unchanged; no check was skipped or weakened.

New tests: `tools/c1-intraday-advisory-regression.cjs` and `tools/c1-intraday-advisory-ui-regression.cjs`, discovered automatically by the existing runner. New research documentation and captured public-market evidence remain separate from all accepted C1 inputs/accounts and the 48-Challenger protocol. `tools/c1-priority3-dell-evidence.cjs` reproduces descriptive arithmetic offline and writes nothing.

## Verified unchanged

Compared directly with the deployed Git objects, byte-for-byte:

- Authoritative scoring and simulation: `historicalSignalEvaluator`, `c1AccountSimulator`, `c1FrozenOptions`, `v11ProductionPolicy`.
- Decisions/account/holding evidence: `c1AccountDecision`, `c1AccountService`, `c1MomentumEvidence`, `c1MomentumEvidenceInput`, `c1AccountOpeningProvider`, `pages/api/c1-account.js`.
- Release/canonical guards, regression runner, package/lockfile and `vercel.json`.

Therefore the score, rankings, Buy/Sell/Hold logic, qualifications, sizing, stops, three sleeves, 30-session framework, early momentum exits, profit protection, confirmation streaks and execution authority are unchanged. No production account or storage records were read or written for this implementation. Local mock fixtures are explicitly synthetic; no fills or account records were invented or submitted.

## Completed checks

| Check | Result and evidence |
|---|---|
| Standard `npm run build` | PASS, exit 0; release guard, canonical integrity, 94 regression scripts plus the existing trade simulation: **95/95**; Next optimized compilation, static generation and tracing completed |
| Core advisory regression | PASS: immutable inputs/authority boundaries, exact stops, basis/sector suppression, aliases, bounded requests, cache/inflight/cooldown, missing/duplicate values, future/session/early-close timestamps, synchronized benchmarks and sanitized API failures |
| UI regression | PASS: zero automatic requests, one manual symbols-only GET, rapid-click deduplication, stock and benchmark aging, delayed/stale suppression, focus/visibility aging, malformed responses, safe failure, revision/context races and unmount cleanup |
| Actual browser, mocked data | PASS at 1280×960 and 390×1000; no overflow, page errors, external requests or unexpected account API requests; old responses discarded after changed context |
| Local HTTP route with existing FMP access | PASS: GET DELL/SPY/QQQ/XLK returned 200, four sanitized quotes, expected contract and receipt `2026-10-14T22:40:36.665Z`; no production/account route involved |
| Offline DELL arithmetic | PASS: captured 1/3/5/10 and existing lagged-return calculations reconciled to the preserved descriptive snapshot; no requests or writes |
| Diff/manifest scope | PASS: clean whitespace, exactly five affected/new protected entries plus one authorization field; original page recovered after removing two additive lines |
| Final production identity | Unchanged at the exact baseline commit/deployment above |

The initial default sandbox invocation blocked the regression runner's child processes with EPERM; the normal build was rerun with supported execution permissions and passed every check. No tests or guard hooks were bypassed. The local FMP smoke used Node's inherited-proxy support; no credentials, network policy or account configuration was changed. All local development/preview servers were stopped.

## Material limits and release recommendation

The observations are advisory, not independently calibrated forecasts. Feed delay is not certified; the live smoke occurred after close. A fresh-session read-only smoke remains the appropriate next release check before an approved deployment. Sector metadata is unavailable for some holdings outside the accepted nine-name screen. Corporate-action/prior-close disagreement conservatively suppresses recorded-stop distances and daily divergence. Manual refresh cannot alert when the owner is absent. No bar-volume, VWAP, acceleration or execution inference is made from these quotes.

The implementation/review package is the only release candidate. No authoritative momentum or trading-rule change should be released. The separate research document makes skip-zero a single proposed primary mechanism test and recent 1/3/5/10 mixtures secondary; all alternative definitions remain on paper. DELL illustrates input lag, not a proven profitable rule. No net return, drawdown or misleading-signal improvement is claimed.

Deployment requires the owner's approval. This package neither initiates deployment nor alters existing trading authority.

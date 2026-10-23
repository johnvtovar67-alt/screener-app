# C1 infrastructure and thesis audit — 2026-10-23

Inspected production baseline: `d638e7787b2cf280f7fa6c0aba0fda746d197c8b`.

This is an engineering and research review. It does not authorize a trade, a
production strategy change, an account mutation, or a rewrite of accepted
history.

## Executive conclusion

C1 remains a completed-close ranking model. Intraday refreshes verify whether
the prior close's selection is currently executable; they do not produce a new
momentum ranking every few minutes. Current quotes, event receipts, the opening
gap, manually entered brokerage cash, and account state can legitimately change
the execution decision during the day while the ranked signal remains fixed.

The recurring incidents are primarily boundary failures, not evidence that the
frozen momentum formula needs another platform. The durable completed-session
account path is comparatively strong. The fragile path is:

1. market-data provider response;
2. broad `/api/top5` screen;
3. current event and quote verification;
4. private account/opening review;
5. browser composition and retained screen evidence;
6. user-facing explanation.

Too many independently refreshed authorities must agree, while provider errors,
account conflicts, and genuine stock-specific blocks often collapse into the
same visible `Watch` state. The recommended architecture is still Vercel Cron +
Blob, but with one durable producer and read-only consumers—not a new database,
queue, microservice fleet, or intraday ranking engine.

## What the screen means

| Item | Frequency | Authority |
| --- | --- | --- |
| C1 rank and candidate queue | Once per completed market session | Accepted daily close dataset |
| Buy/Watch operational status | Can change during the next regular session | Current quotes, events, liquidity, gap and account review |
| Manual share quantity | Current session only; expires | Current opening plan plus verified brokerage cash |
| Holding/exit state | Completed-session account plus recorded fills | Account ledger and accepted daily sessions |

Therefore, “Signals based on 2026-10-23 close” and an intraday refresh are not
contradictory. The refresh is checking execution eligibility for the existing
close-based signal. A valid zero-opportunity day is possible even with cash;
cash is necessary funding, not a reason to manufacture a Buy.

## Scale and structural evidence

- About 87,958 JavaScript lines exist under `lib`, `pages`, `components`, and
  `tools`.
- The application deploys 68 API routes, including 53 research routes.
- `lib/fmpResearchBacktest.js` is 20,799 lines.
- The four simulator variants total roughly 14,900 lines and are generated or
  maintained through exact-string substitutions.
- The automated suite runs 115 regression scripts plus the trade simulation.
  Most tests protect source shape and historical parity; they do not compose the
  real `/api/top5` + `/api/c1-account` + browser path.
- Production C1 modules import `normalizeHistoricalBars` from the 20,799-line
  research module, pulling a large research dependency into live server traces.

## P0 findings

### 1. Provider defects still have portfolio-wide failure radius

`lib/eventRisk.js` treats a feed as incomplete when any row fails the feed
contract. Incomplete coverage correctly fails closed, but a malformed unrelated
global earnings row can still make all requested symbols `UNVERIFIED`. The
October 23 M&A repair narrowed anonymous merger rows; the general global-feed
contract remains all-or-nothing.

Required invariant:

- transport, freshness, pagination, and unknowable coverage failures remain
  system-wide and fail closed;
- a malformed row with a valid issuer identity blocks only that issuer;
- an unattributable row is quarantined and counted, without becoming evidence
  against every issuer unless its presence makes coverage unknowable;
- a provider outage renders “verification incomplete,” never “material event.”

The first local hardening slice preserves the purchase block, centralizes the
typed explanation, and evicts malformed/stale/contradictory HTTP-200 event bodies
so a later verified refresh can recover without a process restart.

### 2. No semantic health check covers the user journey

`pages/api/health.js` checks configuration, Blob access, manifest markers, and
deployment metadata. It can be green while the Opportunities page has no usable
event receipts, stale signal data, an invalid account/screen join, or a globally
paused purchase state. `pages/api/ops/c1-acceptance.js` explicitly leaves private
account parity and Opportunities freshness unverified.

Add a read-only acceptance canary after the completed-session refresh and after
the market opens. It must distinguish:

- legitimate zero qualified opportunities;
- system-level verification failure;
- account-specific opening failure;
- symbol-specific risk block.

### 3. `/api/top5` mixes reading, acquisition, caching, and durable writes

The handler is 1,353 lines. A public `manualVerificationPass` query bypasses
normal snapshot reuse. The route performs broad provider acquisition, keeps
authoritative continuity in per-instance `globalThis`, and records performance
during a GET. The performance store uses a process-local lock around a Blob
read/overwrite sequence, which cannot serialize multiple serverless instances.

Observed production requests screened roughly 586–587 symbols, made about
68–94 provider calls on cold paths, and took roughly 5–11 seconds. Concurrent
cold instances repeated much of that work. Cache-hit requests still processed
thousands of ledger rows.

Target state:

- one scheduled and locked producer writes an immutable dated screen snapshot;
- `/api/top5` is a side-effect-free snapshot read;
- performance observation is written once per completed session;
- warm-memory caches are optional acceleration, never authority;
- any owner-triggered refresh is authenticated, idempotent, and cooled down.

### 4. Authentication accepts arbitrary new namespaces

`pages/api/portfolio-sync.js` and `pages/api/c1-account.js` validate the shape of
a bearer key but do not compare it with an allowlisted account identity. A
random well-formed key can create a persistent namespace. For a private
single-owner app, bind new account creation to an environment-held allowed hash
or an already authorized portfolio namespace. Rate-limit mutation and expensive
routes. This requires a controlled credential/configuration change and is not
silently applied by this audit.

### 5. Public production includes long-running research runners

There are 53 `/api/research` routes; 38 do not reference the research mutation
authorization helper. Some accept run/force query switches and configure long
durations. Historical research should remain as offline tools and frozen
artifacts. Remove superseded runners from the production route graph; any
retained mutation must be POST-only, authenticated with a dedicated secret, and
rate-limited.

### 6. Production depended on a critically vulnerable Next.js version

The inspected app pinned Next.js 15.5.24. The October 2026 Next.js security
release identifies 15.5.28 as the patched Maintenance LTS version for a critical
Image Optimization RCE and related fixes.

Local security slice:

- Next.js 15.5.24 → 15.5.28;
- Sharp 0.35.4 → 0.35.5;
- source-map-js 1.2.1 → 1.2.2;
- explicit `contents: read` CI permission;
- CI rejects future critical production dependency advisories.

The remaining npm high advisory is in the `@vercel/blob` → OIDC → CLI config →
Zod chain. npm proposes downgrading Blob to 2.4.0. That should not be forced
without compatibility testing and an upstream fix review.

### 7. Errors are flattened or silently erased

- `pages/api/c1-account.js` maps every thrown exception to HTTP 409, so provider,
  storage, invariant, and validation failures can appear as concurrent account
  edits.
- `lib/c1AccountOpeningProvider.js` suppresses event collection errors into an
  empty array.
- `lib/c1AccountService.js` can replace a screen-construction failure with an
  empty candidate list.

Introduce stable typed errors and return 409 only for revision conflicts, 422
for bad/domain input, 503 for provider/storage availability, and 500 for broken
invariants. Log a sanitized correlation ID, stage, reason code, source session,
and deployment commit.

### 8. Additional-capacity implementation exceeds its documented boundary

The October 17 authorization and evidence describe one additional new Swing
position and a four-position account. Production instead authorizes every
currently selected unheld Buy/Strong Buy symbol and bypasses `maxPositions` for
each one.

A read-only synthetic reproduction starting with DDD/EEE/FFF authorized
MRNA/BBB/CCC and ended with six Swing positions. The current regression starts
with two selected names already held, so it exercises only the four-position
case.

This is a live-capital policy discrepancy. Do not silently infer the desired
rule. The owner must choose between:

1. maximum four distinct Swing holdings; or
2. at most one newly authorized additional symbol per opening plan.

Then add a multiple-unheld-candidate regression before changing production.

## P1 simplification

### One provider boundary

Create a small FMP transport layer with endpoint-specific adapters, captured
response fixtures, canonical symbols, one API-key rule, typed errors, deadlines,
retry policy, and receipt metadata. Migrate one endpoint family at a time;
preserve external response contracts during each migration.

As a first mechanical extraction, move `normalizeHistoricalBars` into a small
shared production module and have research import the same function. This removes
the production dependency on the research monolith without changing output.

### One server-produced Opportunities view

Return a single view model with:

- `signalStatus`;
- `executionStatus`;
- `blockScope: SYSTEM | ACCOUNT | SYMBOL`;
- stable `reasonCode`;
- `nextEligibleAt`;
- shared source-session and evidence-receipt identity.

The browser should render that response. `localStorage` may improve display
continuity but must not participate in purchase authority.

### One producer, many readers

Keep the existing Vercel Cron and Blob architecture. Move broad market
acquisition, screen construction, and performance observation into one scheduled
producer. Publish an immutable session artifact. Let the account and page read
that artifact and collect only request-local opening evidence.

### Separate runtime from research

Classify every module and route as runtime, immutable oracle, active research,
archived research, or dead. `formatters.js` and `universeBuilder.js` appear unused;
other unreferenced files may be test or compatibility oracles and must not be
deleted without import/build/history checks.

## P2 debt retirement

Do not rewrite the four simulators at once. Preserve the frozen engine as the
oracle, add golden characterization fixtures, and then extract pure phases:

1. ranking;
2. queue construction;
3. fills;
4. accounting;
5. exits.

Replace source-string tests gradually with behavioral contract and property
tests. Keep exact hashes only for policy/oracle files. Add a browser/API smoke
that truly composes `/api/top5`, `/api/c1-account`, retained evidence, and the
rendered Opportunities page.

## Reliability invariants to add

1. One identified event target never blocks an unrelated symbol.
2. An unattributed malformed row never becomes an issuer fact.
3. Provider failure renders verification incomplete, not material event.
4. A malformed HTTP-200 response can recover on the next verified refresh.
5. Page order does not change the event result.
6. No quantity appears unless account, screen, and opening evidence share the
   same source session and candidate.
7. Changed selection remains paused until an independent opening review agrees.
8. Legitimate zero-opportunity output is distinguishable from system failure.
9. Account errors preserve their correct HTTP class and reason code.
10. A four-position ceiling or one-additional-name policy holds with three
    simultaneously unheld selected names.

## Low-infrastructure C1 research

The repository already computes or tested most obvious additions: residual and
industry momentum, 52-week-high proximity, path continuity/FIP, low volatility,
breadth, earnings/fundamentals, and several timing/regime variants. Another broad
factor grid would add selection bias and code without reliable confidence.

### Priority 1: high-to-price momentum challenger

For formation-start price `P0`, formation-period high `H`, and formation-end
price `P1`:

`log(P1/P0) = log(H/P0) + log(P1/H)`

The first component is high-to-price/pre-peak momentum. C1 already stores enough
adjusted daily bars; no new provider or route is required. Pre-register one
challenger that substitutes the pre-peak component for the existing formation
return while leaving universe, selection count, sleeves, sector limits, costs,
holding rules, gap check, sizing, exits, and next-open execution unchanged.

Primary source: Büsing, Mohrschladt & Siedhoff, *Journal of Banking & Finance*
(2024), https://doi.org/10.1016/j.jbankfin.2024.107292.

### Priority 2: momentum-gap diagnostic

Compute the cross-sectional winner-minus-loser formation-return spread as a
read-only session label. Do not make it a production gate. If tested later, use
one predeclared definition and the paper's 80th-percentile threshold only for
fresh entries; do not change exits or existing holdings.

Primary source: Huang, *Review of Financial Studies* (2022),
https://doi.org/10.1093/rfs/hhab093. Independent evidence is mixed, so this is a
diagnostic, not established protection.

### Priority 3: realized execution scorecard

Use fields already present—signal close, next open, modeled fill, opening-gap
decision, and recorded brokerage fill—to report median/P95 slippage, skipped
entry outcomes, turnover, and after-cost results at 12/25/50 bps. Measure first;
do not infer a new entry-timing rule from a small selected live sample.

Relevant evidence: Korajczyk & Sadka, *Journal of Finance* (2004),
https://doi.org/10.1111/j.1540-6261.2004.00656.x; Lou, Polk & Skouras,
*Journal of Financial Economics* (2019),
https://doi.org/10.1016/j.jfineco.2019.03.011.

### Existing exit stack should be measured before adding entry factors

The combined recent-momentum overlay has strong mechanical regression coverage
but no committed, independent investment-performance validation of the full
combined exit stack. First run the existing champion against the existing
recent-momentum challenger on accepted sessions. If material, use one fixed 2×2
ablation: rank only, recent only, both, neither. Do not tune a grid.

### Research acceptance rule

Historical results can reject a challenger but cannot validate it because the
history has already been inspected repeatedly. A survivor must be frozen and
shadow-tracked prospectively for at least 30 closed trades and 90 calendar days,
with no greater than 12% sleeve drawdown, realized costs within 25 bps, and no
intended-versus-executed divergence before any production-policy decision.

## What not to build

- no real-time reranker;
- no news/NLP model;
- no ML ensemble;
- no new earnings provider dependency;
- no new workflow/queue/database platform;
- no repeat of broad residual/industry/volatility/breadth grids;
- no simulator rewrite without golden parity;
- no production thesis change based only on already inspected history.

## Ordered implementation plan

### Phase 0 — security and truthful failure states

1. Upgrade Next.js and enforce a critical advisory CI gate.
2. Merge the typed event-state wording and invalid-cache recovery slice.
3. Decide and test the additional-capacity ceiling.
4. Add account allowlisting and mutation/expensive-route rate limits.

### Phase 1 — observable single-writer path

1. Add semantic acceptance canaries and structured reason counts.
2. Make `/api/top5` a read-only immutable snapshot.
3. Move performance writes to the scheduled producer.
4. Add typed API errors and correlation IDs.

### Phase 2 — boundary cleanup

1. Extract the price-bar normalizer.
2. Introduce the FMP transport/adapters and canonical symbol module.
3. Produce one Opportunities view model.
4. Remove or protect production research runners.

### Phase 3 — characterized debt retirement

1. Add route-level and browser contract tests.
2. Classify and remove proven-dead modules.
3. Extract simulator phases under exact golden parity.
4. Split the UI only after the server contract is stable.

## Verification completed during this audit

- Current production tree matched `origin/main` at the inspected baseline.
- Event hardening branch: release-freeze and canonical-integrity guards passed;
  116/116 regression tasks passed; optimized production build passed.
- Security branch: Next.js 15.5.28, Sharp 0.35.5, and source-map-js 1.2.2 were
  installed; critical advisories fell from one to zero; 116/116 regression tasks
  passed; optimized production build passed.
- Price-boundary extraction branch: the exact normalizer contract is shared by
  production and research; 117/117 regression tasks and the optimized production
  build passed. The `c1-account` server trace fell from 817,491 to 331,550 bytes
  (59.4%) by dropping the 476 KB research chunk from the live dependency graph.
- Additional-capacity multi-name reproduction was read-only and used synthetic
  data; no production account or provider was written.

None of the local change branches is a live deployment. Production verification
is required after an explicitly authorized merge/release.

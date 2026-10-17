# C1 operational Buy / Sell / cash repair

Owner authorization: October 17, 2026, **Fix the Trading Workflow. No Strategy Changes.** This is a separate operational change; draft research PR #277 is untouched. No live account, holding, transaction, deployment, or production branch was written.

Reviewed production/main: `0a65e20964ae080b8718332e5f6f16daa6def452`, deployment `dpl_3PZuSSmiKDZ6hNY3fg67ciVHT9Rg`. Read `AGENTS.md` before implementation. All examples below are deterministic software fixtures, not statements about current Schwab balances, actual transactions, or investment performance.

Publication status: local implementation and all checks complete. Creating the operational PR is blocked by automatic approval review, which rejected source/release-metadata upload to the GitHub repository as potentially sensitive and the destination as unverified. No source tree, commit, PR, merge or deployment was created. Owner approval is needed to publish the exact 41-file bundle to `johnvtovar67-alt/screener-app`, branch `fix/c1-trading-workflow-20261017`.

## Before and after

| Workflow | Production defect | Repaired behavior demonstrated |
| --- | --- | --- |
| Purchase funding | Both the projection and execution cap limited purchases by historical strategy/sleeve cash, even with sufficient manually confirmed brokerage cash. | Current manually entered Schwab cash is the sole funding limit. Existing sizing, original strategy capital basis, selection, whole shares, exposure caps, entry evidence and risk controls remain authoritative. Cash never increases a target. |
| One cash value | Separate strategy, brokerage and deployable cash figures competed on the active-account screen. | Cash summary, Opportunities funding summary and actual-fill receipt use the same Schwab available-to-trade balance. Historical bookkeeping remains internal. |
| Buy rating versus instruction | A Buy rating could be mistaken for executable permission. | MRNA remains a Strong Buy rating but has no purchase instruction when opening verification fails, even with $100,000 cash. Server recording of the attempted purchase is rejected. |
| Recorded Sell | A triggered owned stop could show no checked quantity when Buy opening collection failed; wording suggested a pending sale. | DELL shows its 20 recorded shares, the existing $468.85 stop breached by a verified $460 quote, and the action to sell 20 at Schwab and record the actual fill afterward. No broker order or execution is assumed. |
| Actual fills | Merely removing the outer cash cap would still reject funded fills in the ledger or later replay. | Original sleeve ownership and exact debits are retained; confirmed new broker-funded fills can leave a signed historical accounting residual. Repeated recording, reload and later balance observations do not duplicate cash. |

The purchase fixture starts with original accounting cash $1,000 and existing holdings establishing the original sizing equity. The legacy source produces only 8 MRNA shares, costing $800.96. With verified opening evidence and sufficient confirmed brokerage cash, the unchanged targets permit 265 MRNA shares across the same three independent sleeves (66 / 133 / 66); the other authorized candidate is also bounded by its existing target. This is a funding repair, not a new sizing schedule.

## End-to-end evidence

Machine-readable records: [service workflow](c1-trading-workflow-evidence/service-workflow.json), [real browser workflow](c1-trading-workflow-evidence/browser-workflow.json), [complete regression results](c1-trading-workflow-evidence/regression-results.json), [artifact hashes](c1-trading-workflow-evidence/manifest.json).

| Deterministic case | Result |
| --- | --- |
| Brokerage cash greater than $53,063.60 authorized aggregate purchase cost | Full authorized quantities; unused cash remains unused. |
| Brokerage cash exactly $53,063.60 | Same full quantities, no target increase. |
| Brokerage cash $52,963.60 | Whole-share cost limited to $52,963.48; remainder explicitly cash-blocked. |
| Brokerage cash $0 | No purchase; specific funding action. Existing completed-session positions, ratings and rankings identical across all funding cases. |
| MRNA qualified but cash $50 | Rating remains visible; no whole-share purchase instruction. |
| MRNA qualified, cash $100,000, opening evidence incomplete | No Buy instruction; API/service disallows recording a new purchase. |
| MRNA verified, actual purchase 265 at $100.12, no fee | Cash becomes **$73,468.20**; 265 recorded shares persist after reload and completed-session replay. Repeated ticket ID and cash re-entry do not debit twice. Original adoption is unchanged; no transfers are manufactured. |
| Outstanding unconditional source exit with ample cash | Replacement purchases stay blocked until the required actual sale is recorded. Cash cannot bypass exit sequencing. |
| Next-session partial sale with negative internal residual and unavailable Buy evidence | 20 of 265 MRNA shares recorded sold at $70; 245 remain and brokerage cash becomes $1,400. Subsequent accounting projection remains possible. |
| DELL existing stop, 20 recorded shares, cash $0, Buy verification unavailable | Actionable Sell remains visible and recordable. Actual sale 20 at $460 less $0.25 fee yields **$9,199.75**; no DELL holding remains after reload. |
| Untrusted serialized funding flag | Cannot grant the private replay capability. Only identity-bound fills reconciled against a server-captured plan receive it. |

The browser test uses real Chromium, the actual production React cash/opportunity/trade-entry components, HTTP, and the actual `pages/api/c1-account.js` handler with strong-ETag isolated memory storage. It types into the forms, checks receipts and holdings, reloads, and re-enters the balance. No live Blob, FMP or Schwab access is possible in this fixture. Its host page and provider observations are test-only; screenshots are not a production-site acceptance or a new visual design.

The browser command also generates local screenshots for all stages under `work/operational-evidence/browser/`. They are not published: automatic approval review rejected a screenshot upload as potentially sensitive and the GitHub destination as unverified. The committed browser trace and reproducible test provide reviewable evidence without the blocked image upload.

Reproduce from the PR checkout:

```sh
npm ci
npm run build
node tools/c1-trading-workflow-regression.cjs
C1_BROWSER_BIN=/usr/bin/chromium node tools/c1-trading-workflow-browser.cjs
```

Final local verification: **104/104 regression scripts passed, release-freeze and canonical-integrity checks passed, Next production build exited 0, real Chromium workflow passed, and `git diff --check` passed.**

The normal build retains the original release-freeze check, canonical-integrity check, full regression suite and Next production build. The new service workflow is automatically discovered by the existing regression runner. Browser evidence is a separate explicit command requiring an installed Chromium/Chrome; it does not run a hosted application or access production. Existing synthetic regression tests are software checks, not new historical research or challenger performance comparisons.

## Strategy and accounting boundaries

Only three declared generated-source seams change: remove internal cash from the purchase budget, remove that duplicate cash rejection from the proposed purchase, and accept a reconciled actual broker-funded purchase during replay. Reversing those three seams reproduces the exact production account simulator SHA-256 `02e1edad62c96360a0380142e46e72eacf0a486cc8bb60f43979b7d7e21ce5fb`. The generated recent-momentum dependency inherits the same seams; it is already used by production, and this change does not introduce or execute a strategy challenger. Immutable legacy simulators, options, original generator source fixture and the October policy remain unchanged.

The new server-captured plan policy is `brokerage-cash-only-v1`. Default historical/legacy reconstruction keeps its original behavior. After a new funded record, subsequent account continuation carries that accounting policy rather than rejecting a legitimate negative audit residual. Standing owned-share stops may be recorded through the existing fallback when Buy opening verification fails; this is recording-only conditional authority, not a new Sell signal. A later verified plan must match the original condition and actual fill identity.

Original adoption, original account/model scales, independent sleeve ownership, cost basis, recorded fills, high-water marks and capital/sizing basis are not reset. Every actual new purchase debits its allocated sleeve and every actual sale credits it, including exact fees. The signed residual is **not a Schwab cash balance, margin permission, deposit or invented transfer**. It preserves the original accounting identity while separating real purchase funding from historical model bookkeeping. Original records are never rewritten to make the books positive.

Verification combines exact production-source identity outside those three seams with the existing source-pinned differential checks and current-policy regression coverage. Ranking, top-three selection, three-sleeve targets, issuer/sector restrictions, quote/opening freshness, event blocks, recent momentum/MACD, stops, profit protection, holding periods, rotation, cooldowns, portfolio breakers, actual-fill identity and replay checks remain in force. New targeted tests additionally cover required-exit precedence and broker-funded continuation.

## Exact changed files

| Files | Purpose |
| --- | --- |
| `components/C1BrokerageCash.js`, `components/C1AccountOpportunities.js`, `components/C1IntradayActivity.js` | One cash source, recorded Sell quantity/action, real cash in actual-fill receipt. |
| `lib/c1BrokerageCash.js`, `lib/c1ExecutionCashAuthority.js` | Sole real purchase-funding limit; actual-fill chronology; required-exit priority. |
| `lib/c1AccountExecution.js`, `lib/c1AccountExecutionView.js`, `lib/c1AccountProjection.js` | Carry explicit funding policy through verified current projections and subsequent continuation, preserving historical reconstruction. |
| `lib/c1AccountLedger.js`, `lib/c1ActualFillReplay.js`, `lib/c1IntradayActivity.js` | Exact signed audit debits, private actual-fill replay capability, record existing stops independently of Buy verification. |
| `lib/c1AccountSimulator.js`, `lib/c1RecentMomentumChallengerSimulator.js` | Generated outputs containing only the declared purchase-funding seams. |
| `lib/c1AccountDecision.js`, `lib/c1DecisionCopy.js`, `lib/c1EntryReview.js`, `lib/c1PositionPresentation.js` | Truthful signal/order/fill wording and specific funding/verification next actions; recorded quantity display only. |
| `tools/c1-operational-funding-seams.cjs`, `tools/generate-c1-account-simulator.cjs`, `tools/generate-c1-recent-momentum-challenger.cjs` | Reproducible generation and exact pre-seam source verification. |
| `tools/c1-account-seed-regression.cjs`, `tools/c1-brokerage-cash-service-regression.cjs`, `tools/c1-brokerage-cash-ui-regression.cjs`, `tools/c1-brokerage-rule-parity-regression.cjs`, `tools/c1-compact-opportunities-regression.cjs`, `tools/c1-execution-cash-cap-regression.cjs`, `tools/c1-position-presentation-regression.cjs`, `tools/c1-ui-authority-regression.cjs` | Update only authorized cash/copy expectations and affected compatibility pins; retain strategy/risk assertions and add exit-before-replacement checks. |
| `tools/c1-trading-workflow-regression.cjs`, `tools/c1-trading-workflow-browser.cjs` | New deterministic service/render and real-browser end-to-end verification. |
| `tools/fixtures/c1-trading-workflow.cjs`, `tools/fixtures/c1-trading-workflow-api.cjs`, `tools/fixtures/c1-trading-workflow-browser.jsx`, `tools/fixtures/c1-workflow-babel-loader.cjs` | Isolated synthetic account, actual API handler harness and browser build host. |
| `docs/c1-release-freeze.json` | Only 17 reviewed application hashes and this explicit authorization entry updated. Guard implementation/build hooks unchanged. |
| `vercel.json` | Disable automatic deployment for this operational branch only; existing production configuration and cron schedules unchanged. Commit also carries `[skip vercel]`. |
| This report and `docs/operations/c1-trading-workflow-evidence/*` | Reproducible results, exact test list and hashes; screenshots generated locally by the browser command. |

## Limitations and release boundary

- Cash is the user's manually observed Schwab cash available to trade. There is no live Schwab balance, order submission or independent fill confirmation. The existing same-Eastern-date cash freshness requirement remains. External account activity requires a fresh balance entry.
- A new manual observation includes executions at or before its timestamp. Only later unique recorded fills adjust it. Enter actual execution times accurately; do not re-enter an old pre-trade cash balance as a new post-trade observation.
- The pre-activation form retains its one-time original accounting seed; it is not displayed as spendable cash for an active account and cannot fund purchases. No existing account needs re-adoption.
- More brokerage cash does not enlarge the original strategy capital/sizing basis, bypass a completed entry target or activate an Add that the strategy does not authorize. Existing legacy saved evidence remains auditable; a blocked legacy cash review asks for a fresh verified current plan.
- If historical exit rows lack sleeve quantities, the UI displays recorded ownership and asks to verify the exact exit quantity; it does not invent a full-position sale. The DELL example has complete recorded sleeve quantities and therefore displays 20.
- This demonstrates the workflow against deterministic fixtures and the real handler, not an actual Schwab trade. Owner review of the operational PR and explicit approval are still required before merge/deployment. Reverting after real new funded executions must preserve their saved funding-policy replay support; do not blindly deploy an older ledger that would reject those facts.

No research, optimization, live write, merge or deployment is part of this delivery.

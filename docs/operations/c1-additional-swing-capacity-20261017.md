# Qualified additional C1 Swing capacity

Owner authorization, October 17, 2026: permit an additional **new, qualified** C1 Swing purchase beyond the existing three-position capacity, funded by verified manually entered Schwab cash. Keep all other trading rules, the three independent sleeves and historical records unchanged. Draft PR only; no merge or deployment authorized. Research PR #277 is untouched.

Owner clarification, October 23, 2026: the exception creates a hard ceiling of
four distinct Swing holdings. When several unheld Buy/Strong Buy names qualify
simultaneously, only the highest-ranked unheld name may use the fourth-position
exception. Cash never creates authority for a fifth or sixth holding.

Production baseline: `bb31b12e11c103f9e66a5068ca6fd12f4f78b7ab`, tree `597129d6b35d2f1f15e798af69293973d05cf659`, deployed as `dpl_7oEwYsJRUbhm82CcJCgRVBxGu4yT`. The isolated implementation checkout was verified against all 582 production blobs before editing. `AGENTS.md` was read first.

## Behavior

The current screen still selects at most three Buy/Strong Buy names using its original ranking, sector/issuer selection and operational checks. The nine-name queue is unchanged; a Watch-rated queued name does **not** become eligible because cash or capacity is available.

Only the position-count rejection is bypassed for a qualified new purchase in a newly verified current-session plan. Source event, liquidity, price, recent-momentum/MACD, opening verification, sizing, factor, issuer, sector, cooldown, portfolio breaker and existing-stop checks remain active. The ordinary current-session orders are evaluated and funded first. Required exits still precede replacement purchases; an unexecuted sale supplies neither cash nor released capacity.

Additional orders carry an explicit server-captured `c1-qualified-swing-capacity-v1` eligibility record and an `additionalCapacity` order marker. Recorded fills receive a private, identity-bound replay capability only after reconciliation against that saved evidence. Client-supplied/serialized markers cannot grant historical capacity. Legacy plans and historical reconstruction retain the old default behavior. No old plan, fill, adopted position, capital record or balance is rewritten.

After an actual fill, the new position follows the existing ownership, cost-basis, stop, momentum, holding-age, profit-protection, cooldown, rank-exit and rotation code. There is no separate exit strategy or sleeve for an additional position. Existing Add qualification and purchase targets are unchanged.

## Demonstrated workflows

All numbers below are **synthetic operational fixtures**, not live holdings, broker confirmations, licensed market data or historical performance.

| Case | Observed result |
| --- | --- |
| Three existing Swing holdings; $5,000 verified Schwab cash; qualified MRNA | Production control proposes no new purchase because every sleeve has three positions. The enhancement proposes and records **49 MRNA shares at $100.12**, costing **$4,905.88**, leaving **$94.12**. |
| Independent sleeve ownership | The actual fill is allocated **16 / 32 / 1** shares to base / cooldown15 / sector40. Each book has four positions. Original holdings and adoption remain unchanged; no transfer is manufactured. |
| Stop and replay | Each new lot receives the existing **$86.1032** stop (14% below its actual $100.12 entry). Completed-session replay retains the exact quantities and basis. Original $20,000 sizing equity plus marked P&L yields **$19,998.345**. |
| Actual API and browser | The real account API handler, production React forms, strong-ETag memory storage and actual Chromium demonstrate cash entry → fourth Buy → confirmed fill entry → reload with four holdings. |
| New position stop sale | After entering zero available cash and a verified $75 fixture quote, the same new position displays **Sell 49 shares**. Recording the confirmed $75 sale less $0.25 fee produces **$3,674.75**, reloads with three holdings, and never assumes an unconfirmed order/fill. |
| Negative historical residual | With the same holdings, original accounting cash $1,000 and brokerage cash $5,000, a **41-share** fourth purchase replays through negative internal residuals. Independent equity conservation passes. Its later stop sale remains recordable with zero brokerage cash and unavailable Buy verification. |
| Normal lifecycle | Synthetic consecutive-session continuation moves the new holding below the existing rank range. All sleeves queue the unchanged **early-rank-deterioration** exit; the stop and original holding date are retained. |
| Other restrictions | Event, source-liquidity, missing opening verification, zero/stale cash, issuer, sector, opening-gap and portfolio-breaker cases remain blocked. A source-liquidity failure removes qualification through the unchanged source rule. |
| Minimum trade | Cash rounding cannot create an additional order below the existing scaled sleeve minimum; the plan records `trade-size-limit`. |
| Exception unused | Exact order/quantity and risk-state parity against the production control at $0 / $50 / $5,000 cash. Existing partial-entry Add instructions retain exact quantities and funding priority at $0 / $1,000 cash. |
| Changed current eligibility | A subsequent owner-sale/replacement replan preserves the original 49-share Buy and its captured qualification even after MRNA no longer clears the current opening gap. Historical facts are retained; current unfilled purchases still require current permission. |
| Core MRNA | The existing Core row is preserved byte for byte. Only a newly recorded Swing fill creates Swing ownership; no Core shares are moved or given new historical fills. |

Evidence: [service/API/continuation cases](c1-additional-capacity-evidence/workflow.json), [real-browser trace](c1-additional-capacity-evidence/browser-workflow.json), [full regression results](c1-additional-capacity-evidence/regression-results.json), and [source/evidence manifest](c1-additional-capacity-evidence/manifest.json). Screenshots remain local and are not published.

Reproduce:

```sh
npm ci
npm run build
node tools/c1-additional-capacity-regression.cjs
C1_BROWSER_BIN=/usr/bin/chromium node tools/c1-trading-workflow-browser.cjs
```

**Verification:** local production build passed with original release-freeze and canonical-integrity checks and **105/105 regressions**. The latest focused regression passed all 17 recorded cases, including the original minimum-trade floor after cash rounding, negative-residual continuation and retained executed-fill eligibility. Real Chromium passed the extended fourth-position entry/stop-sale/reload workflow.

The existing regression runner discovers the focused regression automatically. The separate browser command requires Chromium/Chrome. It uses isolated providers and storage; it cannot submit Schwab orders or write a live account.

## Preservation proof and changed files

Reversing the four declared capacity-only substitutions in `tools/c1-additional-capacity-seams.cjs` recovers the exact production account-engine SHA-256 `8a3e1544efd3c612201127ea1e9a1f82e22ca7758ef94c10419d588025b50ec9`. These substitutions defer capacity orders until ordinary orders finish and change only the prospective capacity gate and its associated skip reason. Rankings, targets, rotation thresholds, momentum calculations and all other engine bodies are byte-for-byte production. Frozen options, immutable original sources, legacy simulators, source/classification rules and all pre-existing account records remain unchanged. The existing generated recent-momentum production dependency inherits the same capacity seams; no research study or challenger comparison is run.

| Files | Change |
| --- | --- |
| `lib/c1AdditionalSwingCapacity.js` | Reuse existing classification and accepted opening observations; explicit captured eligibility; ordinary-before-additional funding priority. Incomplete classification disables only the exception. |
| `lib/c1AccountSimulator.js`, `lib/c1RecentMomentumChallengerSimulator.js` | Generated capacity-only seams, with all exit/sizing policy bodies unchanged. |
| `lib/c1ActualFillReplay.js`, `lib/c1AccountLedger.js` | Private reconciled capacity capability and captured-evidence validation for actual fills. |
| `lib/c1AccountProjection.js`, `lib/c1AccountExecution.js`, `lib/c1AccountExecutionView.js` | Prospective opt-in; retain evidence and historical/default behavior; tag actual additional orders. |
| `lib/c1IntradayActivity.js`, `lib/c1ExecutionCashAuthority.js` | Retain all remaining-order limits, require captured current qualification for additional entries, and give ordinary orders funding priority. |
| `lib/c1EntryReview.js` | Show the actual remaining blocker instead of a blanket three-slot message when the exception is enabled. |
| `tools/c1-additional-capacity-seams.cjs`, `tools/generate-c1-account-simulator.cjs`, `tools/generate-c1-recent-momentum-challenger.cjs` | Reproducible generation and exact production source pins. |
| `tools/c1-additional-capacity-regression.cjs`, `tools/c1-brokerage-rule-parity-regression.cjs`, `tools/c1-trading-workflow-regression.cjs`, `tools/c1-trading-workflow-browser.cjs` | Focused acceptance/parity/lifecycle checks, reviewed affected compatibility hashes, and extended browser workflow. Original strategy assertions and fixtures stay pinned. |
| `tools/fixtures/c1-trading-workflow.cjs`, `tools/fixtures/c1-trading-workflow-api.cjs`, `tools/fixtures/c1-trading-workflow-browser.jsx` | Add isolated three-held-position and controllable quote fixtures. |
| `docs/c1-release-freeze.json` | Only 11 explicitly reviewed application entries and this owner's authorization are updated. Guard implementation/build hooks unchanged. |
| `vercel.json` | Disable automatic deployment for `fix/c1-qualified-swing-capacity-20261017` only. Existing production configuration and crons unchanged. Commit also uses `[skip vercel]`. |
| This report and `docs/operations/c1-additional-capacity-evidence/*` | Non-sensitive reproducible test evidence. |

## Accounting and risk boundaries

- Original C1 sizing equity/scales, independent sleeve books, high-water marks and risk thresholds remain intact. Manually entered Schwab cash is a funding limit, not a capital reset or a new sizing schedule. Additional exposure can accelerate genuine gains or losses; this enhancement makes no performance claim.
- The former count cap is removed only for verified additional names. Existing per-name/factor/sector/issuer limits still bind. No new aggregate exposure allowance, borrowing or cash transfer is created. Sufficient real brokerage cash is necessary and does not guarantee another purchase.
- Existing saved executions and targets remain immutable. The exception is available in freshly verified prospective plans; it does not retrospectively enlarge an older saved target or authorize an old unrecorded purchase.
- Existing MRNA Core holdings remain outside C1 Swing management. This change does not solve the deliberate migration of those historical lots. Any new Swing fill is separately recorded and does not combine the Core cost basis.
- Brokerage balances and actual fills remain manual. C1 has no live Schwab execution or balance connection. No automatic deployment is enabled for the draft branch.

There is no need to combine sleeve books or migrate existing holdings to support the acceptance case. No unresolved accounting conflict was found in the demonstrated continuation and stop-sale cases.

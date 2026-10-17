# One-time MRNA in-kind adoption

Owner authorization: implement the smallest append-only, non-cash conversion of an existing saved MRNA Core holding into C1 Swing management. Preserve quantity, original purchase date, basis, historical executions and Schwab cash. Require explicit confirmation; development uses isolated fixtures only. Draft PR only; no merge, deployment or live conversion.

Baseline: production/main `8e29b817197a212cb2c74434a97a3dc6fe3810dc`, tree `b7abc77fb2a781ee260ea2b5c47bfd63d07feb1d`. AGENTS.md was read and all 590 source blobs were verified before creating the isolated checkout. Research PR #277 and the separate HOLD draft #280 are untouched. No HOLD changes are included here.

## Confirmation workflow

Account settings offers **Review MRNA adoption** only for an existing Core MRNA row and an initialized account. Review reads the authenticated, versioned saved portfolio; the client cannot submit replacement shares, basis, dates or prices. The server requires current reconciled account ownership and the latest accepted close, complete original price history, and accepted current MRNA classification/membership.

The review shows original shares, average cost, first purchase date, total basis, each sleeve's whole-share allocation, the verified closing mark and the non-cash contribution. A separate unchecked confirmation box enables **Confirm MRNA adoption**. Cancel/reload does not apply anything. Confirmation recomputes the review and binds the authenticated account identity, both account and portfolio ETags, account revision and source identity. Changed inputs require another review. Repeating an already accepted confirmation returns its receipt without another write or position.

Confirmation is permitted between regular sessions. An unresolved/current intraday session or unavailable completed close blocks adoption. Already-recorded activity that the normal application has derived into completed sessions is finalized with the existing close-replay routine: existing closed records remain an unchanged prefix, original fills retain their identities and economics, and any original completed intraday evidence is archived verbatim in the adoption receipt. No additional execution is inferred.

The account write appends one `c1-mrna-in-kind-adoption-v1` event under `adoption.nonCashHoldings`. Original seeds, unit scales, opening capital records and historical fills are retained. The event stores the original Core snapshot, original accepted price evidence, source identity and confirmation receipt. Server-side SHA-256 verification protects the reviewed payload; ledger validation checks canonical evidence and conservation. This is owner-confirmed account evidence, not a Schwab API confirmation or brokerage order.

The saved C1 receipt drives the classification display. A subsequent portfolio-sync failure cannot undo the account event or create another holding: both reload orders resolve a matching old Core row from the receipt. The exact initial adopted Swing snapshot is also recognized after a failed fill sync, so a later recorded sale cannot resurrect it. Conflicting Core facts or unrecognized Swing edits retain the existing ownership-review gate. Other holdings, including MSTR Core, are not reclassified.

## Accounting and lifecycle

- Whole shares use the existing initial-adoption largest-remainder allocation, with 25% / 50% / 25% weights and the same deterministic tie order. No sleeve is merged, rescaled or rebalanced, and no cash transfer is manufactured. Small quantities may give one sleeve zero shares.
- Ledger cash and manually entered Schwab cash are unchanged. The security enters C1 as an in-kind capital contribution at the accepted close. C1 managed equity and each owning sleeve's high-water mark increase by that sleeve's contribution; existing loss amounts, cooldown counters, unit scales and risk thresholds are retained. The overall brokerage holding quantity is unchanged.
- The original purchase basis remains the cost basis. Contribution value is a separate mark, not a new purchase price. Cash-flow-adjusted curve metrics exclude the contribution from investment returns. This does not reconcile historical strategy cash to Schwab or infer missing outside cash flows.
- Admission occurs after that session's execution phase. No earlier ownership, opening plan or fill is changed. The existing position initializer supplies the original holding age and 14% initial stop. Existing October momentum and verified-peak initialization, profit protection, ranking, rotation, stops and risk code then run normally. C1 confirmation streaks begin prospectively; past C1 decisions for the Core lot are not invented.
- Accepted pre-adoption price observations are archived in the receipt. Later loss of a pre-adoption cache row does not erase the verified original peak or prevent a valid stop sale. Current momentum/entry verification retains its existing requirements and limitations; missing current evidence does not become a fabricated signal.
- Adoption grants no Buy/Add permission or target. The existing owner-confirmed half/full entry-status mechanism can describe the adopted balance; any Add still requires the original qualification, sizing, exposure, verification and cash checks. No existing Add rule changes.
- A sale remains a recommendation until the owner records actual execution details through the existing form. Its quantity comes from the independently reconciled sleeve books. Cash changes only for the actual sale/fee, once.

## Demonstrated evidence

All examples below are **synthetic software fixtures**, not the owner's holdings, real fills, licensed price downloads, backtests or investment performance claims.

| Stage | Observed result |
| --- | --- |
| Before adoption | Three C1 Swing names; 20 separately held MRNA Core shares, original average cost $88, total basis $1,760, first purchase October 1, 2026; brokerage cash $5,000. |
| Review/cancel/unconfirmed request | No account write, position, fill or cash change. |
| Confirm | One event; MRNA becomes 5 / 10 / 5 whole shares across base / cooldown15 / sector40. The original $1,760 basis and October 1 date remain; brokerage cash stays $5,000 and internal cash stays $8,000. |
| Holding lifecycle | Existing $75.68 stops (14% below original $88 basis), original 9-session holding age and complete captured peak evidence. Existing momentum review and profit protection initialize from accepted observations. |
| Add analysis | In a separate partial-entry fixture at $100 basis, the existing qualified Add projects 52 shares at $100.12 with $10,000 freshly confirmed funding. It does not spend all available cash and records no purchase. |
| Rotation analysis | A separate weak-rank fixture queues the unchanged two-close `profit-rank-deterioration` exit in all three owning sleeves. No sale is assumed. |
| Stop sale | A separate, explicit test step sets available cash to zero. With a supplied $75 stop observation, C1 displays Sell 20. Recording the confirmed 20-share sale at $75 less $0.25 fee produces $1,499.75 cash; reload shows no MRNA ownership. |
| Completed replay | The supplied closing bar includes the $75 stop observation. Final replay retains the actual 20-share sale, zero adoption Buys, $1,499.75 broker cash and $9,499.75 internal cash. No double counting. |
| Historical fills | An actual earlier fixture sale remains unchanged through conversion, including legacy-format reconstruction. Earlier ownership is unchanged. Completed intraday evidence is retained verbatim when finalized. |
| Negative internal residuals | An actual prior Schwab-funded fixture purchase creates negative internal cash. Adoption preserves that residual, its real fill, brokerage cash and original seeds while adding only the existing MRNA holding. |
| Risk state | Existing active cooldown counters remain unchanged; adoption does not resume or reset a paused portfolio. |
| Sync/retry | Actual Home handlers and production API prove one durable write, failed portfolio-sync recovery, both reload orders, no duplicate shares and no conversion trade. |

Real Chromium exercises the production confirmation component, production account API, memory storage, current cash forms, actual-fill forms and reloads. Confirmation is disabled until checked; the saved receipt survives reload; the later stop sale records through the existing form. The earlier Buy/verification/DELL/fourth-position workflows remain in the same browser run.

Conservation tolerances: share counts, dates, fill identities, existing records and original seed structures are exact; dollar/basis comparisons allow only floating-point error up to $0.000001 (average cost $0.0000001). Existing model curves retain their original two-decimal model-unit precision. No tolerance permits an extra share, substituted fill or cash transfer.

Evidence: [account/lifecycle checks](c1-mrna-adoption-evidence/workflow.json), [actual Home handlers](c1-mrna-adoption-evidence/client.json), [Chromium workflow](c1-mrna-adoption-evidence/browser-workflow.json), [full regression results](c1-mrna-adoption-evidence/regression-results.json), [source/evidence manifest](c1-mrna-adoption-evidence/manifest.json).

## Source scope and reproduction

| Files | Change |
| --- | --- |
| `lib/c1NonCashAdoption.js`, `lib/c1NonCashAdoptionReview.js`, `lib/c1NonCashPortfolio.js` | Review/receipt, immutable original evidence, private replay registration, independent book admission, capital-flow accounting and receipt-based display reconciliation. Hashing stays server-side. |
| `lib/c1AccountSimulator.js`, `lib/c1RecentMomentumChallengerSimulator.js` | Generated non-trading admission seams; existing policy bodies retained. The latter is already a current production dependency despite its historical name. No research experiment is changed or run. |
| `lib/c1ActualFillReplay.js`, `lib/c1AccountLedger.js`, `lib/c1AccountProjection.js`, `lib/c1AccountExecution.js` | Chronological event replay, actual ownership conservation and correct planning entry points. |
| `lib/c1AccountDecision.js`, `lib/c1AccountPortfolio.js`, `lib/c1PositionContext.js` | Receipt metadata, one holding in Portfolio, and reuse of existing entry-stage confirmation. |
| `pages/api/c1-account.js`, `pages/index.js`, `components/C1NonCashAdoption.js` | Authenticated review/confirmation, ETag writes, explicit owner UI, read-only success receipt and reload recovery. |
| `tools/generate-c1-account-simulator.cjs`, `tools/generate-c1-recent-momentum-challenger.cjs`, `tools/c1-non-cash-adoption-seams.cjs`, `tools/c1-non-cash-ui-seams.cjs` | Reviewed reproducible seams and exact inverse source comparisons. |
| `tools/c1-non-cash-adoption-regression.cjs`, `tools/c1-non-cash-adoption-client-regression.cjs`, `tools/c1-trading-workflow-browser.cjs`, `tools/fixtures/c1-trading-workflow-api.cjs`, `tools/fixtures/c1-trading-workflow-browser.jsx` | Isolated accounting, lifecycle, client and browser cases. Live providers remain forbidden in fixtures. |
| `tools/c1-additional-capacity-regression.cjs`, `tools/c1-trading-workflow-regression.cjs`, `tools/c1-brokerage-rule-parity-regression.cjs`, `tools/c1-historical-ui-restore-regression.cjs`, `tools/portfolio-sync-client-regression.cjs` | Reverse only declared new seams or supply the actual new pure helper. Original trading assertions, source fixtures and historical comparison hashes remain pinned. |
| `docs/c1-release-freeze.json` | Only 15 reviewed application hash entries plus this owner authorization. Guard implementation and build hooks unchanged. |
| `vercel.json` | Disable automatic deployment of this draft branch only; existing crons and production settings retained. Commit also uses `[skip vercel]`. |

Reversing the four declared accounting-admission seams recovers the exact deployed canonical account-engine SHA-256 `f2715db509bfea0ae51b56d0691a6e6666120547b65321178eaa71a4482ffad7`, including the unchanged cash-funding and additional-capacity behavior. Reversing the declared Home bindings recovers the exact deployed page hash. Frozen options, ranking, sizing, exit precedence and legacy source fixtures are unchanged. Ordinary-account differential checks require exact decisions, orders, quantities, books and risk state when no event is present.

```sh
npm ci
npm run build
node tools/c1-non-cash-adoption-regression.cjs
node tools/c1-non-cash-adoption-client-regression.cjs
C1_WORKFLOW_EVIDENCE=work/non-cash-adoption/browser node tools/c1-trading-workflow-browser.cjs
```

## Limits and safe release boundary

The actual account has not been read or converted during development. The future live review must verify its saved facts and data. Missing dates/history, fractional shares, multiple MRNA rows, prior C1 MRNA lots/history, unverified classification, ownership differences, an unresolved session or stale review block conversion with a specific reason. No rounding, synthetic transaction, account reset or inferred original trade is offered as a fallback.

No live Schwab connection is assumed. There is no automatic conversion on deployment and no reverse-conversion feature. Once a real event exists, do not roll back to a reader that ignores it or delete the journal: a safe rollback must retain event replay and management of the adopted position while disabling new adoption writes/UI. Before any live conversion, the prior build remains a straightforward code rollback. No merge, deployment or live conversion is performed by this PR.

Final local verification: **107/107 regression checks passed**, normal production build passed, and real Chromium operational workflow passed. Providers and account storage were isolated fixtures; no live account read/write, merge, deployment or historical performance experiment occurred.

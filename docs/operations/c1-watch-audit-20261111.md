# Watch and account-policy audit — November 11, 2026

This audit is incomplete pending actual dated ranking and saved-account evidence.
Tests below use synthetic inputs; production deployment success is not acceptance.

## Observed production

At approximately 02:57 UTC, canonical `/api/version`, Vercel deployment metadata
and checked-out main agree on `5fbbbd9412e9b01d7f2d2deea2f926c8600f9e4a`.
Production deployment is `dpl_FiLPv6Y7YeDua1aChceykViaSG9K`, canonical project
`prj_9MJJaMsEfOdtQKXj4VFI7TfJcBjQ`, host `screener-app-cq5t.vercel.app`.

Existing production logs, read passively through the Vercel connector:

- 02:40:32.593 UTC: ordinary GET `/api/c1-account`, analysis request
  `dae2a5a7-3a58-4ae6-8f24-c0d3b64ac186`, source session November 10,
  `MARKET_CLOSED`, `screenComposition=NOT_VERIFIED`, `privateAccountParity=NOT_VERIFIED`.
- 02:40:44.531 UTC: ordinary opening review, request
  `6d2f7d36-4149-4ad9-bcc6-11164ae257e7`, same commit/date/status limits.
- Earlier 02:13:40.935 UTC analysis on `f253139…` failed at account analysis;
  later successful responses establish recovery of that path, not account parity.
- Read-only `/api/c1-readiness` returned `DEPLOYMENT_NOT_CHECKED`, no observation
  or source date, and both private parity and browser acceptance `NOT_VERIFIED`.

No private account, financial POST, producer, cron or research route was invoked.
No production storage object was changed. The workspace began without a checkout
or saved exports. The connected repository supplied source but no current account
or November 10 accepted book. Available logs omit stock names, scores and coverage.
There is no offered desktop browser-control tool or existing authenticated
browser/account evidence in this workspace. No sync key was acquired or requested.
The owner was asked for the location of existing non-secret response/export evidence.

## Watch defect and repair

**Failed in inspected production source; locally repaired, release pending.**
`buildC1StockScreenSnapshot` now retains the full dated source-eligible candidate
pool. `projectC1Opportunities` passed every Watch row through `c1WatchPresentation`
and the actual React Watch table. There was no display cap, explaining how 347
Watch-rated rows could reach the UI. The reported count was not independently
captured from an authenticated production browser.

For active account-policy v2, the repair selects only Watch-rated symbols in the
current snapshot, excludes account loss bans and active exits, sorts by current
research rank with symbol tie breaking, deduplicates, then takes at most ten.
Watch eligibility is a display classification, not approval to purchase: failed
entry checks remain visible with their reasons. Buy-rated rows retain their
separate rating/action presentation. Earlier historical-policy presentation stays
unchanged. No prior Watch position or appearance contributes to selection.

Only the projection application file changes. Source snapshots, provider scan
continuation, account queues, opening evaluation, purchase sizing and order
authority receive no display truncation. The browser v2 case still recommends
historical ranks 25–27 while showing ten Watch rows at both widths. A new 350-row
projection/React regression covers 347 Watch names, shuffled/duplicate/prior
symbols, bans/exits, short lists, stale versions and immutable inputs.

Only this authorized projection hash is updated in the freeze manifest. The
guard and build hooks are unchanged. A new exact source inverse is applied before
the existing v2 inverse; all previous source/economic fixture hashes remain intact.
The explicit inverse regression rejects unknown source and repeat inversion.

## Recurring leaders

**Still unverified against actual dated inputs. No formula change proposed.**
The v2 source snapshot ranks every source-eligible candidate by
`clamp(momentumPercentile,0,100)-50`, descending, then symbol ascending.
`historicalSignalEvaluator` computes momentum percentile with weights:

| Accepted factor percentile | Weight |
| --- | ---: |
| Global return120Ex20 | 40% |
| Global return60Ex5 | 25% |
| Sector return120Ex20 | 22% |
| Sector return60Ex5 | 13% |

The trailing-return calls use `(100,20)` and `(55,5)` respectively; these slower
inputs can preserve leaders despite recent weakness. Current recent momentum,
quotes, events and account restrictions decide purchase eligibility separately.
The top-nine continuity union exists only in the pre-v2 branch. In v2,
`resolveC1ScreenEvidence` uses current classifier rows even while pending and does
not substitute retained browser ratings. This rules out explicit old-Watch
preference in the inspected v2 source, not stale accepted data in the real account.

Actual number fully evaluated: **unknown**. 347 displayed Watch rows is not a
coverage count. The November 10 source date in logs does not establish freshness
of every constituent input or completed live checks. Need the accepted book's
universe evidence, supported/excluded/source symbols, dated factor and adjusted
price inputs, current scan/evidence counts and per-candidate rejection reasons,
plus the exact normal screen/account responses. Compare the current ten to prior
dated snapshots and every lower alternative. Until obtained, no name-by-name
scores, evaluation total or claim that alternatives ranked lower is justified.

## Independent account-policy inspection and tests

| Requirement | Software evidence | Observed saved-account status |
| --- | --- | --- |
| Net losing completed investment blocks ticker across allocations for remaining cooldown | `c1AccountStockCooldown` reconciles aggregate ownership to zero, partial proceeds, fees and basis; chooses longest participating 10/15-session duration from original completion, using exchange calendar. Uncertain adopted history remains explicitly uncertain. Focused cooldown and real-handler action regressions pass. | **Unverified:** no current fills/periods/expiry evidence available. |
| Unrelated qualifying stocks remain recommendable | Real-handler action regression completes same-day multi-allocation loss and recommends a different lower-ranked stock; source/selection/cash gates stay active. | **Unverified:** no live checked replacement evidence. |
| Active exit blocks all allocation purchases; consistent actions/cash/exposure | `resolveC1AccountActions` prioritizes unconditional exits without netting them away; conditional standing stops remain distinct. Real-handler regression checks shared decision IDs, conflicting allocation orders, actual cash, four-stock capacity, issuer/sector/position limits and stale-frame rejection. | **Unverified:** logs explicitly do not certify private parity. |
| One operational reset per completed exit episode, preserved history | Ledger derives liquidation receipts from reconciled orders/fills/books. `c1OperationalRiskEpoch` requires flat books, conserved cash, original loss reference and next opening; stores applied digest identities. Actual generated-engine tests pass two cycles, replay/reloads, old-receipt reuse, partial/missing/forged exits and historical peak conservation. | **Unverified:** no saved completed episode or replay evidence. |
| Holdings, fills, basis, cash and stops unchanged | Repair changes presentation only. Focused handler/engine tests conserve synthetic financial facts; new Watch test verifies byte-identical inputs. No production account writes performed. | **Unverified as a before/after saved-account comparison:** authoritative records unavailable. |

## Release evidence

Focused Watch projection/actual React table, inverse-oracle, cooldown, account
actions, operational-risk epoch and actual generated-engine regressions passed.
These are regression results, not observed production-account acceptance.
Required full build/audit and normal, actual-screen and lifecycle-client browser
checks must pass on the final reviewed head before merge. Pending checks and a
successful deployment cannot close the outstanding evidence requirements above.

Local dependency audit passes the required critical-severity gate; it reports
four high-severity transitive findings involving zod through the Blob dependency.
Dependencies were not changed in this scoped repair.

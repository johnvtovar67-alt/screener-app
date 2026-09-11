# C1 continuation acceptance — September 12, 2026 UTC

Base: `dfeafdd701774e5ef262ac83ea31c1dce47f7893` (PR #159).
Disposition: diagnostic-only. No C1 trading release or alpha certification.

## Verified continuation

The canonical production alias resolves to deployment
`dpl_GByZff9wSvc3jZnkHLMjr3BCqC1h`, READY on the base commit.
The production browser shows the September 11 completed diagnostic model and
the matching commit. The September 11 22:15 UTC normal collection success and
both-page agreement are retained from the completed handoff; no manual
collection is needed.

The available browser shows no connected portfolio sync session. Its visible
local rows do not establish John's current private account. No adoption,
account-session submission, actual-fill confirmation, holdings edit or sync-key
request was performed.

The existing FMP reply watch is enabled. The inquiry is
"Historical sector classification coverage and taxonomy — Ultimate plan".
The current targeted mail search returned the sent inquiry and no support
reply. The watch and collection schedules were left unchanged.

## Supported client repairs

1. Saving account activity filtered out all Core cash rows before saving and
   syncing the resulting portfolio. Retain every Core row, including cash,
   and reuse an existing Swing cash label so a Core CASH row is not duplicated.
   This is a reproducible code defect; no claim is made that it affected
   John's actual account.
2. Network and JSON failures during account refresh left the previous account
   decision and opening plan in memory. Clear that result on a current failed
   request or absent credential. Disconnecting or switching the sync session
   invalidates outstanding account responses. Superseded failures cannot erase
   a newer successful response.

The new client regression executes the actual refresh, disconnect and save
handlers with synthetic inputs, including Core MSTR, Core cash, response races,
invalid JSON and network failures. It checks local saving, syncing and analysis.
It never contacts the provider, reads a private account or runs a historical
performance test. Required CI also runs the existing regression/build gates.
Hosted acceptance must be recorded from the resulting CI and deployment, not
inferred from this source change.

## Release acceptance ledger

| Requirement | Evidence / remaining blocker | Closure required |
|---|---|---|
| Canonical source and diagnostic collection | Base commit/deployment verified; PR #159 repair preserves original source records | Preserve the normal successful collection evidence; check any newly published repair's CI and deployed commit |
| Actual account initialization | Implementation exists; user's private account is not available in the current browser | Confirm current holdings, cash, roles, first-purchase dates, preserved capital peak/breaker and adoption receipt from the user's existing account; manual records are sufficient |
| Account-to-order path | Controlled-input tests exist; no user-specific end-to-end acceptance receipt | Match private account revision and dated input to the opening plan; verify provider timestamps, adjusted-price anchors, cash, quantities, concentration and stop conditions; confirm both views agree |
| Actual execution reconciliation | Partial-fill/session handling exists; actual activity has not been verified here | Use only real transaction records, including fees and partial fills; confirm complete intervals, post-fill shares/cash and duplicate/stale rejection without submitting invented activity |
| Historical sector provenance | Both historical compilers used profile classifications without a decision-date lookup; saved dependency audit shows sector labels can change fills | FMP-supported effective/availability dates, taxonomy semantics and coverage for the tested member-dates, reconciled to the saved inputs; an endpoint description alone is insufficient |
| Strategy selection and original folds | Original report is marked superseded; fixed-candidate 1,000-seed results remain post-selection diagnostics | Complete evidence covering the actual candidate/parameter search and original evaluation boundaries, with valid selection-adjusted interpretation; there is no completed selection-adjusted acceptance in the reviewed records |
| Runtime trading authority | Shared snapshot unconditionally retains RELEASE_ACCEPTANCE and historical provenance issues; account decisions remain non-executable | A supported release implementation and recorded acceptance only after all evidence and account-path gates pass; do not flip flags to certify missing evidence |

Historical Nasdaq/S&P tests cover overlapping dates. Repeated controls on the
chosen candidate do not reconstruct the selection process, and previously
inspected periods do not become independent holdouts. The saved numerical
results remain unchanged. Sector uncertainty has no quantified return effect
in the reviewed dependency audit.

No mandatory elapsed-time gate is added. The 60-session wait remains waived.
No model/options, stored holdings, original model records, cron schedule,
blocked research endpoint, historical test or live-authority flag is changed
by these repairs.

## Evidence

- [PR #159 baseline repair](c1-unexposed-baseline-reconciliation-20260911.md).
- [Superseded historical C1 report and correction notice](v12-active-swing-ensemble-c1.md).
- [Saved sector dependency audit](c1-source-dependency-audit-20260911.json).
- [Original readiness decision](https://github.com/johnvtovar67-alt/screener-app/blob/research/c1-historical-release-audit/docs/research/c1-readiness-decision-20260911.md).
- Runtime contracts: `lib/c1DecisionSnapshot.js`, `lib/c1AccountService.js`,
  `lib/c1AccountDecision.js`, `pages/api/c1-account.js`.

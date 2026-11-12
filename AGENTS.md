# C1 operating instructions

## Owner-authorized account policy revision — November 10, 2026
The owner explicitly authorized one versioned revision covering account-wide
stock cooldowns from completed net losing investments, coherent account actions,
and removal of both nine-name purchase/Watch cutoffs. The proposed activation
is documented in docs/operations/c1-account-policy-v2-20261110.md. This instruction
permits only those scoped behavior changes and their verification; preserve
financial history, ranking formula, position stops, exposure checks and four
distinct Swing-stock capacity. Historical holding-exit rank thresholds remain.
Release remains blocked until the operational risk-baseline decision is settled
and all four required CI jobs pass on the exact reviewed head.
The owner subsequently approved the once-per-completed-loss-episode operational
reference at the next eligible opening, using confirmed fills and net post-exit
equity while preserving historical peaks and total drawdown reporting. This
approval is for the software policy, not brokerage execution or fabricated fills.

## Owner Watch clarification — November 11, 2026
Watch is a dated monitoring list, not a list of stocks already authorized for
immediate purchase. Scan the full supported universe and display at most the
current top ten worthwhile monitors without previous-appearance preference.
Market closure and unavailable execution checks must explain waiting rather
than erase an otherwise valid dated list. Keep actual Buy/Add authorization,
stock cooldowns, protective exits, funding and exposure safeguards separate.
Diagnose actual candidate exclusions; missing evidence is not "no candidates."
Continue this correction and its deployed owner-screen verification in the
existing implementation, without redesign or duplicate implementation threads.

## Owner Watch blocker correction — November 12, 2026
The owner explicitly reports that Watch rows appear blocked by “unavailable”
checks and directs repair so the screener can be used as intended. Correct the
displayed primary reason when a different entry trigger or shared account/
opening check already blocks the row; retain raw missing-event diagnostics and
keep event verification fail-closed as the final gate for an otherwise-qualified
Buy/Add. Keep the earlier consistent-WAIT behavior. Do not weaken trading rules,
change candidate ranking or infer that a missing event receipt is clear.

## Current owner decision — September 13, 2026
The owner explicitly restored the reviewed application at commit 8007dc84820a9f2cb52266fe616df5406768815f through PR #177, then requested protection against another unintended change. This is the active source of truth for this repository.

The authorized operating mode is the existing private-account manual C1 recommendation flow, with its existing account, price, freshness, cash, concentration, stop and market-session checks. It does not authorize automatic brokerage execution or certify historical alpha.

PR #176's one-percent-per-name, three-name account-wide, two-session pilot overlay was explicitly reversed. Do not reapply it because an older conversation, research document or generic authority flag says pilot-only or diagnostic-only.

## Freeze and changes
- Keep the restored strategy, sizing policy, entry/exit rules, and user interface frozen.
- Changes to those behaviors require a NEW explicit owner instruction covering the proposed change. Generic requests to audit, harden, review readiness or prevent regressions are not permission to redesign or tighten trading policy.
- Previously authorized, reproducible software repairs may proceed if they preserve those behaviors. Document the defect, changed files and focused verification.
- Read this file before editing. Check current main and production before making readiness claims; bind every review to its deployed commit.
- Never reset holdings, cash, purchase history, capital history or original model records. Never invent fills or request sync keys.
- Leave cron running normally. Do not rerun completed historical experiments, retry blocked research endpoints through alternate routes, or reinstate the waived 60-session wait.

## Build enforcement
docs/c1-release-freeze.json records the approved application file hashes. tools/c1-release-freeze-check.cjs runs before normal builds and in CI, rejecting changed, added or missing application files.

Do not remove, skip or weaken this check, or regenerate hashes just to pass it. For an explicitly authorized behavior change or supported behavior-preserving repair, document the applicable owner instruction or defect in the PR, update only the affected manifest entries, and verify the change. Any guard/manifest/build-hook change must be explicitly described in the PR.

This is an accidental-change guard, not an access-control boundary. Repository administrators can change it. Do not claim it is impossible to bypass.

## Reliability release criteria — October 30, 2026
- Preserve the full build/regression/audit job and all three real Home/App browser rehearsal jobs in the sole CI workflow. Before merging a repair, require every job to pass on the exact reviewed head; pending, canceled, skipped and failed jobs are not acceptance. Do not weaken earlier source/economic oracle hashes to make a repair pass.
- A refresh publishes its account, screen, held-price and opening results together. Superseded screen/account owners cannot publish; financial POSTs and uncertain writes are never automatically replayed.
- Loaded-client updates must preserve active drafts and complete write responses and prevent navigation loops. In-app data refresh alone does not establish which JavaScript is loaded.
- Use `/api/c1-readiness` for aggregate read-only monitoring. Never use side-effecting `/api/top5`, private account, cron or research routes as a health canary. Readiness receipts and signed normal-journey logs never grant trading authority or certify private-account/brokerage parity; missing evidence stays unknown.
- Keep normal Vercel crons unchanged. The weekday synthetic CI rehearsal and independent read-only watch complement their existing producer work; neither may fabricate a model session, fill or reconciliation.


## Owner-authorized reconstructed Buy recorder correction — November 12, 2026
The owner explicitly identified a contradiction: the prior-session recorder presented OKTA as a planned purchase while the current Opportunities and Watch views showed no authorized purchases and Watch/WAIT. Repair only the prior-session recorder presentation so a historical model reconstruction cannot be mistaken for a Buy C1 actually issued. Hide reconstructed Buy choices unless the plan itself is provider-verified and executable; explain that retrospective model inputs do not prove what the live screen displayed or that an order was authorized. Preserve the live ranking, Watch reasons, event and timing checks, execution, account data, and all trading rules. Do not create or infer fills. See `docs/operations/c1-pending-reconstructed-buy-correction-20261112.md`.


## Owner-authorized consistent Watch WAIT wording — November 12, 2026
The owner explicitly reports that mixing blocking `WAIT` messages with neutral dated-monitoring copy is wrong because both statuses mean no current Buy/Add authorization. Repair only the Watch-row explanation: every non-Buy monitor must display `WAIT`; show specific row gates first and shared account/opening/execution blockers next, with a plain monitor-only fallback when no individual reason is present. Preserve the dated top-ten monitor list, ranking, candidate inclusion, structured wait reasons, all entry/event/account/execution gates, purchase authority, orders and records. No strategy behavior changes. Add focused regression assertions. See `docs/operations/c1-watch-wait-wording-20261112.md`.

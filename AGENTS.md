# C1 operating instructions

## Owner-reported Watch verification warning — November 23, 2026
The owner asks why Watch names all say “Current account exposure unverified,”
whether it prevents recommendations, and follows up “What about the watchlist?”
The owner subsequently explicitly approves “Restore the download button.” This
supersedes only the earlier removal of that control; keep universe figures off
the normal Watch display.
Correct the reproduced display conflation: a per-candidate opening-price or
exposure block must not claim the whole account is unverified. Preserve the
actual account-wide warning when its explicit shared flag is false. Restore
the existing allowlisted read-only Watch-details download so the owner can
provide current verification evidence. Do not change ranking, eligibility,
quantities, account records or any purchase/sale safeguard. The separate holding-exit question does not authorize an exit-policy
revision.
See `docs/operations/c1-watch-exposure-copy-20261123.md`.

## Owner-authorized sector-label repair — November 20, 2026
The owner reports missing MSTR and MTD sector labels and directs “Make a small
repair, please.” Repair only the portfolio display's metadata fallback. Core
holdings must not depend on a Swing decision; unknown source labels must not
hide known metadata. Keep MSTR's Bitcoin/Digital Assets theme distinct from its
formal sector. These display profiles must never enter C1 selection, exposure,
orders or financial records. Preserve all account facts and trading safeguards.
See `docs/operations/c1-sector-label-repair-20261120.md`.

## Owner-requested Sell-summary clarification — November 19, 2026
After the stock-level momentum release, the owner requested “Also make the other
fix you noted.” The remaining noted display issue is that Sell summaries omit
whether the recommendation is partial or full and how many shares would remain.
Clarify those quantities from the existing recorded Sell instruction only.
Missing quantities stay unknown. Describe remaining shares as conditional on
actual execution, and preserve every signal, authorized quantity, stop, record
and trading safeguard. See `docs/operations/c1-sell-quantity-summary-20261119.md`.

## Owner-authorized stock-level momentum exit — November 19, 2026
The owner explicitly directed: “Make the fix now” because a later purchase must
not keep a weakening stock while an older allocation has a confirmed momentum
exit. Use one ordinary recent-momentum confirmation clock per continuous
account-level stock holding. A confirmed recent-momentum exit covers every
recorded Swing share across allocations and remains pending until actual full
liquidation. Adds and partial sales do not reset it. Preserve existing verified
profit-protection criteria, individual stops, historical decisions/fills, basis,
cash, cooldowns and operational-risk references. Activate prospectively at the
November 19 opening using accepted November 18 source evidence. No brokerage
execution or fabricated fills are authorized. See
`docs/operations/c1-stock-momentum-exit-20261119.md`.

## Owner-reported recovery-form usability defect — November 16, 2026
The owner’s deployed phone screen shows blank allocation boxes interleaved with
their labels, a visually blank submit control, and an unexplained allocation
validation error after otherwise complete fill entry. Repair the recorder’s
field order, scoped mobile layout, button contrast and explanatory copy only.
Preserve the existing explicit proposal, owner confirmation, allocation math,
ticket payloads, financial validation and recording safeguards. See
`docs/operations/c1-recovery-form-mobile-20261116.md`.

## Owner-authorized issued-trade retention repair — November 16, 2026
The owner reports that an actually completed C1 Add disappeared from trade entry
after refresh, leaving the saved holding short of the broker holding. The owner
explicitly requires an issued recommendation to remain in the trade log for
recording and directs repair now. Retain final verified, account-capped Buy/Add
offers before returning them to the screen; keep this recording evidence
separate from current purchase authorization. Append only owner-confirmed real
fills. A legacy missing offer cannot be reconstructed as a verified issuance:
any recovery attribution must be disclosed and explicitly confirmed by the
owner. Preserve prior holdings, fills, basis, dates, stops, cash observations,
historical peaks, loss history and all future trading safeguards. See
`docs/operations/c1-issued-trade-retention-20261116.md`.

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

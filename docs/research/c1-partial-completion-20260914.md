# C1 actual partial-purchase completion — September 14, 2026

## Authorization and defect
The owner said C1 should issue the full Buy recommendation; buying half and the remainder later is his execution choice, not a mandatory strategy rule. He explicitly requested implementation and testing. The prior actual-account engine excluded every held symbol from fresh entry consideration, so recording a partial purchase made its remaining recommendation unreachable.

## Behavior
Only the actual-account runtime can complete a partial purchase. It reuses the frozen eligible entry pool, ranking, entry queue and opening gates. It subtracts existing exposure from the full target and position limit, preserves cash/sector/factor/stop/cooldown checks, and permits an addition without consuming another position slot. This adds no two-session confirmation or forced half-entry rule.

New full Buy orders retain their whole-share target when actual partial fills are recorded. Further additions cannot exceed the remaining target and require continued entry qualification. Filling that target ends additions; an actual sale closes completion eligibility for the remaining position. Original entry dates, initial stops, position identity, capital history and cooldowns are retained.

For pre-adoption holdings, only stored owner-confirmed half-position context permits completion. An original recommendation target cannot be reconstructed from a half-position label: the current C1 target is calculated afresh and is not claimed to be the original historical recommendation. Missing context never invents a target or purchase; full adopted positions are not automatically topped up. NTRA outside entry coverage remains ineligible for additions even if a held-stock momentum review exists.

Each newly recorded activity session carries a versioned completion-policy snapshot. Old records with no snapshot regenerate their legacy plans and order IDs. Normalized actual fills carry the planned target into replay; projected quantities never change actual balances. No stored account is migrated or changed by this code deployment.

## UI
Existing checked purchase tiles say Add when the account already holds the symbol. Portfolio retains its orange box only for checked actions; watches remain separate. The Add explanation describes a qualified remainder, removing the previous assumption that every addition must be in another sleeve.

## Verification
Focused synthetic account tests cover qualified partials, full holdings, occupied slots, loss of eligibility/rank, opening gap, stop breach, cash/cooldown rejection, whole shares, actual partial fills with fees, next-session completion, full-fill termination, retained dates/stops, unchanged legacy balances, and no inferred fills. Existing account seed/replay, client, manual-authority, freshness and view tests pass locally. The new suite is included in the existing CI manual-recommendations command. These are software execution tests, not reruns of historical strategy experiments or evidence of live alpha.

Production deployment and CI verification are recorded in the PR. Private account state is not available to this unauthenticated test session; no private sync credential is requested. Whether an existing adopted holding has stored half-position context must not be inferred from synthetic tests.

## Freeze
Only the eight affected application hashes are updated, under this explicit owner instruction. The generator contains exact checked seams for the account-only change. The frozen historical simulator/options, cron, original model records and all other application hashes remain unchanged.

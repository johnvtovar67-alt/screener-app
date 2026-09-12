# C1 final manual-release review — 2026-09-12

## Decision
No new reproducible blocking defect was found in the reviewed, owner-authorized manual C1 workflow. The completed review supports proceeding to the ordinary live opening checks on Monday, September 14. This is bounded software acceptance, not confirmation that any particular order will qualify.

Strategy, UI, production configuration, holdings, original model records and cron were left unchanged. No historical performance experiments were rerun.

## Frozen production and prior acceptance
- Production commit: 8007dc84820a9f2cb52266fe616df5406768815f (PR #175).
- Vercel deployment: dpl_BKyr4vsLXKFB1D51GtrzeZHP87qV, READY, canonical production alias verified.
- Full successful CI reused: GitHub Actions run 34704323969, PR head 38755478793038bcc86726c4db2a88da6f0ab206.
- Existing local implementation/test/config files were compared with the production Git tree. Code matched. One older local research document differed and was not used as current release authority.

## Fresh verification
All five existing focused suites exited successfully:

| Suite | Evidence covered |
| --- | --- |
| blob-consistent-read-regression | Actual Blob SDK 2.8.0 with mocked transport; origin reads and identity encoding; strong ETag saves; weak/stale write rejection |
| c1-account-client-regression | Conflicts, failed refreshes, superseded responses, disconnects, preserved Core holdings/cash, invalidation of stale decisions |
| c1-manual-recommendations-regression | Session/freshness/revision/provider gates, account matching, restricted purchases, Portfolio showing only eligible checked buys |
| c1-account-seed-regression | Account conservation, funded whole shares, no-fill/partial-fill behavior, duplicate/conflicting activity, date correction, rank verification, original records preserved |
| c1-index-lifecycle-regression | Authenticated collection, session handling, idempotency, failure preservation, unchanged authority using synthetic dependencies |

These are software simulations, including Monday-session scenarios. They did not place brokerage orders, create actual fills, invoke the production cron, or mutate the private account.

## Production observations
- Production save logs recorded successful C1_ACCOUNT_SAVE events at 16:14:28 and 16:41:33 UTC on September 12.
- The earlier event also included successful held-rank verification.
- No production 5xx responses were recorded for the reviewed deployment/window beginning 16:13 UTC through the review around 20:56 UTC. This is an observation of available logs, not a guarantee about all requests.
- The public browser loaded commit 8007dc8, switched pages, and opened Account settings. Administrative controls were confined to settings in the observed normal Portfolio view.
- No application-origin browser error was observed; two observed errors came from a browser extension.
- The browser was unsynced. Its fallback Opportunities content was not treated as evidence of private-account orders.

## Account evidence and limits
Existing user-provided account evidence was reused, including the two-purchase holding history, the full/half-position distinction, intentional cash rounding, and the screenshot confirming the corrected first-purchase date and restored momentum rank.

The latest screenshot confirms the displayed date/rank correction. It does not independently expose every stored lot metadata field. The review did not obtain a sync key, independently audit the full Schwab transaction ledger, or claim a real brokerage fill had been tested. Successful server saves and synthetic account-path tests supplement, rather than replace, the user's account evidence.

## Strategy interpretation retained
The frozen engine has three internal allocations, each targeting up to three positions. It uses a 30-trading-session minimum before rank-based exit eligibility, a 14% initial position stop, and 12% drawdown controls from the relevant capital peak. Existing stops and portfolio limits can apply during the minimum holding period. This is not a new change to the strategy.

The user's authorization for manual C1 use with the existing research limitations remains the release basis. Historical sector provenance and strategy-selection uncertainty remain documented research limitations; fixed-candidate controls do not certify selection-adjusted alpha. No new research wait or release requirement was introduced.

## Monday operating check
1. Refresh after the regular market opens.
2. Confirm displayed holdings and available cash reflect the actual account.
3. Use only quantities that pass the existing fresh-price, account, cash and risk checks. Watch entries are not buy orders.
4. Confirm executable price and funds at the broker; execution remains manual.
5. Record only actual activity, including any partial fills, before relying on a refreshed account plan.

A stale quote, changed account, expired review or failed check should withhold usable quantities until resolved. That is expected runtime behavior, not an additional historical validation cycle.

## Stop condition
The agreed review is complete. No application repair or deployment was needed. Production remains at the reviewed commit. Further changes should respond to a reproducible defect or an explicit new request.

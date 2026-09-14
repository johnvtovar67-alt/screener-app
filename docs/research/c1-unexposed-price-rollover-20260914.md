# September 14 market-data rollover repair

Owner instruction: “fix it”, following confirmed production cron failures after the close on September 14. Base production/main b61888ae10182c1dd9f2bd6ab9d04dc468d6374a.

## Defect
The provider revised September 11 adjusted closes for CVX, DOC, FDX, LLY and WFC. The global book rejects every revised anchor, even when the symbol has no economic exposure. Account refresh cannot collect or accept index data, so repeating Analyze cannot repair the failure. The generic message incorrectly asks for outstanding account activity while no next session is available.

## Repair
Extend the existing baseline reconciliation module for multi-session books. Every changed symbol must be absent from historical model fills, current positions and pending orders; benchmarks never qualify. Require matching adjusted OHLCV evidence for both dates, positive complete anchors and a current provider-checked input. Replay the original and revised prior-session bars, comparing the complete ledger, pending orders, paper execution, execution status and summary exactly. Only an identical result may advance. Preserve all original sessions and capture identities and append a hashed reconciliation receipt. No price tolerances are enlarged and no split/dividend transformation is inferred.

Model non-exposure does not establish private-account non-exposure. The account service independently rejects adoption holdings or actual fills intersecting any such revision before replaying or planning across it. No accounts or fills are written by collection.

The account response distinguishes pending market data from available data awaiting activity confirmation. The UI says ratings are awaiting update, rather than claiming there are no Buys when analysis is unavailable.

## Verification
The new regression runs through the existing dated-book CI test. It covers an exposed model with five unrelated revisions, immutable history/capture/input, retry idempotency, economic parity, rejection of historical/current/queued exposure, benchmarks, missing or inconsistent evidence and private account exposure. Account-service tests distinguish the two stale states. Existing original-screen oracle, account continuation and manual-order regression suites remain required.

## Release guard
Only hashes for the five affected application files are updated in docs/c1-release-freeze.json: c1BaselineReconciliation, c1AccountInput, c1AccountService, c1ManualRecommendations and C1AccountOpportunities. The freeze checker, build hooks, strategy options, simulators, sizing, stops, holding rules and cron schedule are unchanged.

Production acceptance additionally requires the normal scheduled collector to advance the September 14 book. A successful build alone does not establish that. Private-account activity still requires an accurate user confirmation; no zero-trade session is invented.

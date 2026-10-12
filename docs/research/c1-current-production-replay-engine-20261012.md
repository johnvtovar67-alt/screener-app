# C1 core account-policy replay, October 12, 2026

This recreates only the missing continuation tooling requested by the owner on October 12. The audit branch remains separate from production. The application source baseline is `9097e894a487a91eeace7a8f76fb3b42f54a991d`; the production account source includes the separately authorized SCHW allocation repair, current-evidence strength repair, and January 9, 2025 exceptional market closure. No strategy parameter search or exploratory experiment is part of this tool.

## Source-exact core account policy

`tools/c1-production-policy-replay.cjs` calls the actual application exports in chronological order:

1. `createC1ProspectiveSeeds` adopts an entirely synthetic, all-cash $100,000 evaluation account at the January 4, 2023 completed close. It assigns actual sleeve capital as production does: base 25%, cooldown15 50%, sector40 25%. No private-account holdings, capital movements, purchase history, or discretionary decisions are read.
2. `projectC1AccountSession` produces the next regular-session opening plan from the previous completed close. It performs the entire hypothetical model allocation first, including cash and sector/issuer room, then maps planned model integer shares into actual integer sleeve shares by flooring. The first potential fill is January 5, 2023.
3. `reconcileC1ActualAccountFills` records modeled whole-share opening fills and range-triggered stop fills. Slippage is charged exactly once through production fill prices. There are no commissions. Opening times use the source Eastern-market clock at 09:30; a stop observed only through a daily low has an explicitly unobserved intraday execution time, represented by a one-minute-after-open placeholder. This timestamp is synthetic, not broker evidence.
4. `continueC1ActualAccount` applies recorded fills in the model's original units and rebuilds the actual books, stops, momentum streaks, holding ages, high-water levels, breakers and cooldowns.

Every core account entry, eligibility check, sort, exit, cash check and risk limit is application source. This does not reconstruct the operational Buy gate, its selected-sector representative and maximum-three screen, verified live quote/event checks, manual-release authority, or actual brokerage snapshots. Historical event history is unavailable. Modeled account-plan fills assume those unobserved operational blocks do not intervene; they are not literal completed production fills. In particular, the engine does not directly round allocation budget into actual shares: that differs from the production two-stage rounding and changes later same-opening sector room. A regression fixes the exact production boundary quantities for prices $300.30, $10 and $110.

The source account overlay checks sessions 5–29 for three closes outside Top9, or two closes outside Top6 after a peak profit of at least 12% while currently profitable. Session 30 onward uses the source Top6/1 rule. The 14% entry-price stop, three positions per sleeve, liquidity/exclusions, issuer limits, sector budgets, 12% sleeve drawdown breaker and 10/15/10 cooldowns remain the source rules. There is no end-window liquidation in the production account. Terminal positions are marked at September 1, 2026 close.

The production seed validator requires all original option values. For the requested 25/50 bps scenarios, an isolated module loader changes only `C1_FROZEN_OPTIONS[*].slippageBps` before invoking that validator. The 12 bps case uses the unchanged source value. This modifies no repository module, strategy parameter, service, or deployed account.

## Source and input identity

Each result records SHA-256 hashes for every transitive application module loaded, including the current live compiler and historical factor source graph. The original archive is hash-verified unchanged first. Current production uses a 253-row historical-price requirement **before** the global/sector factor cross-section, so its final input is a separate causally derived artifact compiled with the pinned current source. The original compiler convention alone is not current production input parity. The engine consumes the accepted current-derived factors without changing them and never recomputes them from later prices or a reduced liquidity shortlist.

Literal live-input checks reject all 918 evaluation dates: 28 historical symbols have missing or disallowed sector metadata, FRC has price-history gaps, and 124 early dates lack the full required 550-calendar-day benchmark provider prefix. The original archive remains unchanged. The separate conditional artifact preserves these rejection details and sets `actualLiveInputAccepted:false` and `eligibleForAlphaClaim:false`. A successful reconstruction receipt proves conditional artifact integrity, not acceptance by the current live-input guard. The whole-share arithmetic uses the archived split-adjusted price units and does not independently reconstruct historical nominal broker lot sizes across splits.

The original recovery first requires authoritative compressed-byte and decompressed-content hashes from the export. The strict default replay loader requires `c1-source-pinned-current253-historical-input-v1`. The actual recovered-input counterfactual uses `c1-source-pinned-current253-conditional-historical-input-v1` and requires the explicit `--conditional-inputs` flag, a hash-pinned successful reconstruction receipt, and preserved literal rejection evidence. Conditional output is labeled `runClass:conditional-current-account-policy-counterfactual`, with no alpha claim eligibility. The strict contract name alone does not imply live-input acceptance: both its manifest and checksum-verified receipt must explicitly record `actualLiveInputAccepted:true`. It verifies each supplied chunk before parsing it, then calls the pinned application `compactReplaySession` one chunk at a time. This preserves the production replay fields while discarding narrative and duplicate holding rows that the original source itself overrides. Cohort, price-row and current-factor identity validation are separate acceptance prerequisites. Recovery receipts and the original manifest must be preserved alongside the enriched manifest.

The recovered compiler timestamps also precede the winter regular-session close in affected sessions. The separate derived artifact uses explicitly **modeled** completed-close decision timestamps after the source market-session close, retaining original timestamps and counts in its receipt. This supports a causal completed-close-to-next-open counterfactual; it does not recover historical observation time or contemporaneous verification. The original archive timestamps are unchanged.

The input immutability checksum is streamed: metadata JSON followed by newline, then each ordered session JSON followed by newline. The checksum is verified before and after replay. It is separate from original chunk hashes and is not claimed to be a checksum of the original export bytes.

## Caches and independent checks

`tools/c1-production-replay-loader.cjs` adapts source only at computation/state seams. It memoizes the original price maps, input pools, eligibility checks and cross-sectional context. It can restore a deep clone of all mutable simulator closure state to the last accepted completed session and advance the original loop to the next session. Restored state includes actual-fill consumption, benchmark curves, cash, positions, pending orders, persistence, stops, counters, removal state, high water and cooldown. A source exception invalidates state caches and is rethrown; failed executions cannot become accepted cached history.

Checkpoint acceptance requires identical session-object prefixes and identical recorded-fill prefixes. The complete input checksum guards against in-place mutation. The adapter records the original and transformed module hashes and its own hash. It never changes a sizing or decision expression. Saved audit JSON explicitly tags undefined, NaN, signed zero and positive/negative Infinity; the verifier restores those values before deep equality. Plain JSON could otherwise erase undefined keys or turn nonfinite states into null and conceal a state discrepancy.

`tools/c1-production-policy-replay-regression.cjs` compares cached and uncached daily account replay at all three costs, and compares those results against the unmodified application loaded by the existing research module loader. It checks complete plans, fills, raw cash and positions, counters/stops/risk, every close trace, and final application outputs. Synthetic cases exercise ordinary and protected momentum exits, same-day stops, excluded symbols, issuer and sector limits, two-stage rounding, mapped-zero buys and minimum-trade boundaries. Independent breaker/stop/failed-cache checks are retained as receipts.

`tools/c1-verify-recorded-production-replay.cjs` performs a cache-disabled, single chronological application-source pass over every modeled execution from the full accepted run. It compares the entire source output and every completed-session trace. This verifies full-history economic and policy-state equivalence; it does not substitute for the separately performed uncached daily-plan comparison on synthetic and selected real input sessions. Repeating the entire account history from adoption for every one of 918 opening plans is unnecessary once the source state continuation is verified.

## Statistics and comparison

Results combine actual sleeve books by summing their daily equity and cash before calculating portfolio statistics. Sleeve Sharpe, drawdown, win rate and profit factor are not weighted averages.

- Return: final marked equity divided by the original synthetic $100,000 capital, minus one.
- Sharpe: mean daily return divided by sample daily-return standard deviation, annualized by the square root of 252; zero risk-free rate.
- Sortino: mean daily return divided by zero-target downside RMS over **all** daily returns, annualized by the square root of 252. `legacySourceSortino` separately preserves the application's sample standard deviation of negative-return observations.
- Maximum drawdown: worst equity decline from the running high-water mark, including initial capital.
- Trade count: completed **sleeve** round trips. Fill count is separately reported; concurrent holdings in multiple sleeves remain independent sleeve trades.
- Win rate and profit factor: completed sleeve round trips only, using source round-trip profit inclusive of modeled costs. Terminal open positions are excluded.
- Holding period: trading-session count from source entry to closing sale; average and median are reported; an even-count median averages the two central observations.
- Turnover: two-way sum of all buy and sell executed notionals divided by mean daily portfolio equity. Annualized turnover multiplies this by 252 divided by observation count.
- Capital utilization: average across marked dates of one minus cash divided by equity.
- Benchmarks: the source convention of baseline-session **close** to final close is retained. Its initial benchmark-share scale cancels in the source final/first value ratio. An explicitly named open-to-close value is separately available. “Alpha” in the preserved frozen report is simple excess total return against both SPY and QQQ, not factor-regression alpha.

The preserved frozen policy artificially liquidated final holdings and weighted original $100,000 model sleeve books. Current production has actual whole-share mapping, the confirmed 5–29 exits, the SCHW repair, and no artificial terminal liquidation. Results must describe these comparison differences rather than presenting a change as a single isolated exit-policy effect.

## Commands

Before any long historical run, persist the repaired audit branch or a complete archive containing code, source pins, original chunks, separate current-derived inputs, manifests, acceptance and parity receipts. Do not merge or deploy.

```sh
C1_REPLAY_REGRESSION_OUTPUT=/workspace/work/c1-validation/production-replay-regression.json node tools/c1-production-policy-replay-regression.cjs
node tools/c1-production-policy-replay.cjs CONDITIONAL_DATA_ROOT OUTPUT.json.gz --cost 12 --conditional-inputs
node tools/c1-production-policy-replay.cjs CONDITIONAL_DATA_ROOT OUTPUT.json.gz --cost 25 --conditional-inputs
node tools/c1-production-policy-replay.cjs CONDITIONAL_DATA_ROOT OUTPUT.json.gz --cost 50 --conditional-inputs
node tools/c1-verify-recorded-production-replay.cjs CONDITIONAL_DATA_ROOT OUTPUT.json.gz VERIFY.json --conditional-inputs
```

A selected real-input daily-plan comparison calls exported `replayPolicy` with matching start/end dates and `cached: true` versus `false`, then `compareRuns`. The historical evaluation window remains January 4, 2023–September 1, 2026. Changing a window for this software comparison is not a strategy search or a new return claim.

Conditional core-policy results can be numerically compared with preserved frozen results, but cannot establish that the full current production flow achieves those returns or validate current C1 alpha. The final report must retain this boundary together with sector provenance and strategy-selection uncertainty.

# Point-in-time walk-forward research

The V10 research runner is intentionally separate from the live recommendation
engine and fail-closed. It evaluates one frozen cross-sectional stock-ranking
thesis. It will not print a performance result when the input cannot prove what
was knowable at each historical decision timestamp or when the holdout was not
sealed independently before evaluation.

## Run sequence

1. Check the FMP subscription without exposing the API key:

   `FMP_API_KEY=... npm run research:preflight`

2. Supply a `screener-pit-v1` dataset, or a raw dataset accepted by
   `compilePointInTimeSignals` in `lib/historicalSignalEvaluator.js`.

3. Run:

   `npm run research:backtest -- --input data.json --output report.json --placebo-seeds 1000`

The default design uses 504 market sessions for context, 126 for validation and
126 sealed sessions for each audit fold. V10 does not select parameters: every
fold runs the same frozen thesis. Orders generated at a close fill at the next
session's open with whole shares and fixed slippage. Cash remains cash. The same
universe, sizing, rebalance clock, exits and costs are also run with simple
momentum ranks, simple quality ranks and at least 1,000 declared random seeds.

## Required evidence contract

Every accepted dataset must certify and structurally support:

- point-in-time historical exchange membership, including delisted securities;
- explicit delisting cash/recovery outcomes so vanished holdings are liquidated;
- adjusted OHLCV and next-session opens;
- SEC `acceptedDate` availability for fundamentals;
- original-as-known, revision-safe fundamental values;
- as-known earnings and material-news/event history;
- complete inputs for replaying the production portfolio exit/review policy;
- a benchmark on every session; and
- at least 1,008 ordered market sessions, producing at least three complete
  walk-forward audit folds;
- SPY and QQQ prices on every session; and
- `v10HoldoutAttestation` certifying `sealedBeforeEvaluation`,
  `excludedFromV7ThroughV10Development` and `thesisFrozenBeforeReveal`.

An accepted timestamp is not proof that a vendor's numeric values were never
restated. A retrospective earnings calendar is also not proof of when a future
earnings date was known. Those two certifications must be independently verified
in the source dataset. Missing evidence produces `rejected-before-simulation` or
`mechanics-only`, never an alpha claim.

## Interpretation

`eligible-for-independent-review` requires positive simple total-return alpha
against both SPY and QQQ, positive expectancy, profit factor above one, alpha in
most folds, at least 30 closed round trips, at least 80% average active-stock
exposure, better return than the simple momentum and quality controls, and
better return than the transparent non-repainting bull-cycle/pullback technical
control, and return above the 95th percentile of at least 1,000 random
portfolios. It still does not authorize capital. Independent review and an
immutable forward paper record remain required before the live recommendation
engine can adopt V10.

Exposure-matched attribution remains available as a diagnostic, but it is not a
passing gate and cannot hide the opportunity cost of cash.

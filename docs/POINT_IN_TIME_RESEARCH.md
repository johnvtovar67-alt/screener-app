# Point-in-time walk-forward research

The live screener and the research runner share the production scoring, expert,
entry-timing, event-risk, relative-capital and portfolio-decision modules. The
runner is intentionally fail-closed: it will not print a return when the input
cannot prove what was knowable at each historical decision timestamp.

## Run sequence

1. Check the FMP subscription without exposing the API key:

   `FMP_API_KEY=... npm run research:preflight`

2. Supply a `screener-pit-v1` dataset, or a raw dataset accepted by
   `compilePointInTimeSignals` in `lib/historicalSignalEvaluator.js`.

3. Run:

   `npm run research:backtest -- --input data.json --output report.json`

The default walk-forward design uses 504 market sessions for training, 126 for
validation and 126 untouched sessions for testing. Parameter selection uses the
weaker of train and validation risk-adjusted scores; it never reads the test
window. Orders generated at a close fill at the next session's open with whole
shares and fixed slippage. Position/factor capacity is replayed through the
production portfolio governor rather than a research-only duplicate. Ordinary Buy requires two distinct
market-session observations; Strong Buy remains immediate after all hard gates.

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
- at least 756 ordered market sessions for the default research claim.

An accepted timestamp is not proof that a vendor's numeric values were never
restated. A retrospective earnings calendar is also not proof of when a future
earnings date was known. Those two certifications must be independently verified
in the source dataset. Missing evidence produces `rejected-before-simulation` or
`mechanics-only`, never an alpha claim.

## Interpretation

`eligible-for-independent-review` means the data contract and mechanical checks
passed and the production portfolio policy was replayed. It does not mean the
strategy is profitable, hedge-fund quality, statistically significant, or ready
for more capital. Those conclusions require review of the untouched folds,
transaction-cost sensitivity, regime stability, exposure, turnover and the
underlying vendor evidence.

Even with a valid data contract, fewer than 30 closed trades across untouched
test folds is labeled `insufficient-out-of-sample-trades`, not research-eligible.

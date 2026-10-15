# Offline source-compatible signal adapter

`signals.cjs` calls the pinned original `compilePointInTimeSignals`. It performs
no network requests and writes no production/account data. Its synthetic tests
are implementation checks, not a partial-universe C1 historical comparison.

```js
const { buildSignalDataset } = require('./signals.cjs');
const { dataset, audit } = buildSignalDataset({
  barsBySymbol,                 // canonical or provider class symbols -> ascending daily bars
  executionBarsBySymbol,        // separately verified nominal daily bars; optional for signal diagnostics
  splitOnlyBarsBySymbol,        // FMP full split-only view; required for verified economic volume
  metadata,                     // existing dated qualification packet
  sessionDates,                 // full warmup + baseline + 63 run dates
  baselineDate: '2024-12-31',
  allowApproximateMetadata: true,
  rebaseToNominal: true,         // only after external price-unit qualification
  volumeContract: 'split-only-future-factor-volume-rebasing',
  unitContract: { nominalPricesVerified: true, volumeUnitsVerified: true },
});
```

Each bar has `date, open, high, low, close, volume`; signal bars additionally
require `adjusted:true`. Fields retain their meaning. This module neither
infers split ratios from jumps nor fabricates volume adjustments, dividends or
corporate distributions. Unit-contract assertions must come from a separate
qualification receipt; their presence is not independent verification.

Metadata accepts the existing packet's `membership`, `sectors`, `identities`
interval arrays. Each interval uses `security_id`, inclusive `valid_from` and
`valid_to` (or explicit exclusive `valid_to_exclusive`), and `known_at` where
available. Identity intervals supply `ticker`, `issuer_id` and the research
security-line identity. Sector intervals supply `gics_sector`. Optional
`securities` profiles can supply dated names/listing facts. Existing records
marked unverified remain approximate; the explicit owner-approved assumption
is required and the output does not certify exact point-in-time replication.

Baseline and all evaluation dates need exactly one member/identity/sector join.
Missing/ambiguous intervals, future-dated information, duplicate canonical
classes, missing issuer CIKs, invalid GICS labels, missing decision bars and
available-life session gaps fail. Distinct classes preserve their security-line
keys and can share an issuer CIK. `listedAt` defaults to the first actual
available-life bar, not a fabricated prelisting observation.

All warmup sessions have an empty ranking universe. Each decision invokes the
original compiler with `minimumHistoryRows:253`, `maxCandidates:500` and empty
broad-recommendation memory, matching `compileC1LiveInput`'s daily configuration.
The output includes only baseline/run sessions and retains complete
`positionSignals` and `signals`; no display-shortlist substitution is made.
Portfolio persistence belongs to the uninterrupted account engine.

For nominal rebasing, each symbol's causal adjusted OHLC prefix is multiplied
by `nominalClose(t)/adjustedClose(t)`. Adjusted return ratios remain unchanged;
absolute quote fields use the decision-date nominal-close basis. See the separate
price and share-volume factors in [DATA-UNIT-CONTRACT.md](DATA-UNIT-CONTRACT.md).
For share volume, the same date's separate split-only/full close supplies
`futureSplitFactor(t)=nominalClose(t)/splitOnlyClose(t)`. Each adjusted prefix
volume is divided by that factor, independently of the dividend-adjusted price
scale. Latest adjusted/full volumes must agree, and rebased latest volume must
match nominal volume. A split already effective by t remains in the prefix.
Without the split-only view, volume remains diagnostic provider units and
`volumeUnitsVerified` stays false regardless of caller assertions. The separate
nominal execution view replaces output session prices. The frozen engine must
still validate corporate actions, receivables,
nominal share/volume units, affordability and cash conservation. The adapter
alone does not qualify economic replay.

`researchHConsecutiveSymbols` identifies output signal lines with all six H
factor closes present on consecutive calendar sessions; explicit bar-level
security IDs must agree with the mapped line when provided. No sparse-observation
substitution is permitted.

Primary exclusions default to LEN/WDC across the full period. The metadata
roster and exclusion counts are retained in the audit. With
`includeExcludedInFactors:true`, both remain in factor/rank inputs, while
`dataset.metadata.researchAllocationExcludedSymbols` tells the isolated account
adapter to prohibit their allocation without deleting them from the ranked
pool. This is the prespecified denominator sensitivity. An economic event-local
exclusion scenario requires separate validated action accounting.

`sectorOverrides` applies an explicitly frozen sensitivity map to both arms.
Primary labels must belong to the eleven GICS sectors. A separately declared
`metadata.allowNonGicsStressLabels:true` permits a named cross-vintage taxonomy
stress; this is never evidence of contemporaneous FMP classifications.

Run implementation checks with:

```sh
node research/c1-rotation-execution-20261015/test-signals.cjs
```

Checks cover exact serialized daily source parity, future-bar mutation
invariance, dated sector transitions, share-class/issuer identity, full pool
retention, primary/denominator exclusions, the 253-row gate, causal nominal
rebasing and uniform future-action scale cancellation, publication timing,
interior gaps, invalid joins and New York close timestamps across DST.

Private JSON CLI: `node signals.cjs PRIVATE_INPUT.json PRIVATE_OUTPUT.json`.
The output uses exclusive creation and mode 0600. Keep both paths in an existing
subscriber-private directory and preserve the separate recoverability receipt.
No licensed observations, ranks or reconstructable outputs belong in Git.

The final economic interface is fail-closed. Parsing a stage sample does not
assert a complete opportunity universe. Optional `economicContract` forwards
only explicit reviewed receipt assertions:

```js
{
  executionPricesVerified: true,
  volumeUnitsVerified: true,
  fullOpportunityUniverseVerified: true,
  researchAccountingCoverageComplete: true,
  researchMembershipActionsComplete: true,
  researchInputCoverageHash: '64 lower-case hexadecimal characters',
  researchCoverageFrom: '2024-12-31',
  researchCoverageThrough: '2025-04-03'
}
```

All booleans default false. Execution-price validity additionally requires a
separate execution view and causal nominal rebasing. Volume validity additionally
requires the split-only view and passing per-date/prefix unit checks; a price-only
rebase cannot verify historical share-volume units. Accounting/membership
completion additionally requires the corresponding separate manifest. The
coverage hash references the private accepted input manifest; it does not infer
certainty from price rows. Accepted approximate GICS continuity remains labeled
approximate even when full-scope operational coverage passes. No full-scope
claim is made for the bounded stage sample. The engine checks these fields,
period/session count and complete ranking-universe size before economic replay.
A `manufactured-fixture-v1` contract is reserved for explicitly manufactured
implementation fixtures; it is never assigned by default or to licensed samples.

Accounting authority is supplied separately as
`accountingManifest:{source, actions:[...]}`. Supported verified rows are:

```js
{ id, source, verified:true, type:'split', symbol, effectiveDate, ratio }
{ id, source, verified:true, type:'cash-dividend', symbol, effectiveDate,
  amountPerShare, paymentDate, shareBasis:'ex-date-post-split' }
```

The adapter validates types, nominal share basis, dates and uniqueness, and
forwards the unchanged facts in `session.researchAccountingActions` on their
effective date. Session-local rows must exactly match this separate manifest.
Native `corporateActions` remain separate; they do not silently authorize a
split, dividend or inferred distribution.

Documented index removals use
`membershipActionManifest:{source, actions:[...]}` with rows
`{id,source,verified:true,type:'universe-removal',symbol,effectiveDate,knownAt}`.
They are mapped explicitly into native `session.corporateActions` at effective
open, with announcement availability checked before that open. A complete
opportunity-coverage assertion fails if a true dated member disappearance lacks
its native removal action. Merely ending a membership interval does not trigger
the source engine's required sale. Quarantine and insufficient-history
exclusions never generate removal actions. Removed symbols retain their
available execution bars for held-position sales and valuation. The normalized
manifest is also emitted in `metadata.researchMembershipActions`, with completion
false unless explicitly supported by the accepted conditional reconstruction.

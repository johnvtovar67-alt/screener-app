# Canonical simulator phase completion

Baseline: PR334/main `a8951f7058c33347bd82fa9fd745aca14048e47d`.
The owner's renewed architecture/maintenance instruction authorizes this
behavior-preserving extraction. This document records local proof; the release
PR owns CI, preview and production acceptance.

The actual canonical account engine now consumes two referenced pure modules:

- `c1SimulatorRanking`: exact original rank functions, cross-sectional context,
  evidence pool and entry eligibility; original numeric/symbol/sector helpers
  remain supplied by the engine.
- `c1SimulatorPhases`: complete close-generated entry-queue construction, sale
  economics, purchase economics, slippage prices and relative/trend/time exit
  eligibility. The queue reads the existing pending orders, copies only its
  local queue, and returns the appended orders with the original source-evidence
  object identities. The engine appends them in the same order.

The engine falls from3457 to2184 lines. The1286 removed lines are original
phase bodies, now independently hashed and mechanically reversible. This is
referenced application code, not an unused alternate simulator. Existing runtime
held-rank/evidence consumers still call its exported eligibility function, and
the recent-momentum account adapter retains its canonical-history branch.

Existing result accounting remains extracted. Actual fill lookup/commit,
uncertain-write behavior, cash/position mutations, replay exceptions, account
hooks, bounded review counters, rank-exit streaks, stop ratchets and exit-order
precedence stay at their original state-transition sites. Those portions are
retained because they own ordered account state; moving mutable commits into a
purported pure helper would obscure rather than simplify that ownership. No
trading policy, four-position capacity, sizing, fill, stop or history changed.

The four frozen/legacy/recent-momentum source oracles and all generated
Challenger output remain unchanged. Both generator source files remain
byte-identical. They already call the prior accounting extraction/inversion
seam; that seam now composes the additional declared extraction and exact
restoration. Thus their existing initialization/policy seams, canonical SHA
checks and output checks remain effective. No generator assertion, historical
pin, guard, build hook or CI implementation changes. The generated recent
engine retains its inline phase bodies to preserve its frozen source/output;
this release does not claim all four engines were rewritten or deduplicated.

Local evidence:

- `node tools/c1-simulator-phases-regression.cjs`:2592 exact ranks across27
  modes;100 complete queues;300 sale objects,300 purchase objects,300 exit
  eligibility objects and600 fill prices. Full input/map/queue purity and source
  evidence reference identity checked; zero network.
- Every extracted original phase body has an independent SHA256. Exact
  PR334 engine reconstruction is
  `25efcc4661b39bfe86fa1fa4dca62735a8268caec4ae9e2ddb99dac64482bf4c`;
  the prior canonical reconstruction still matches
  `63b1909359361e35ae7d0c2e833fecbb043013f7b337f9f2c96dc0a3adb2f31e`.
- Existing accounting regression remains unchanged and passes162 complete
  accounting objects,21 complete simulator golden outputs and63 chronological
  slices across all3 sleeves, actual partial sale/unfilled paths, cash, positions,
  orders, costs, stops, rank diagnostics and benchmarks.
- Both unchanged generator `--check` commands pass. Existing account-seed,
  validation repairs, brokerage-rule parity, non-cash adoption,
  additional-capacity, recent-momentum Challenger and recorded-fill regressions
  pass with their previous assertions/pins intact.

Only deterministic software fixtures ran. No accepted-history study, thesis
comparison, research runner, live provider/storage/account call or brokerage
execution occurred. The synthetic replay fixtures are tests, not invented live
fills. Private brokerage/account acceptance remains unverified.

# Causal new-entry scaling mechanics

This implements the six preregistered drawdown/volatility scaling specifications as an isolated research overlay. It changes no source snapshot, production rule, rank expression, held-position stop, sleeve breaker, or live account. No historical comparison has run.

`buildRegimeOverlay(experiment)` supplies the central source loader with strict single-match transforms and no option-export changes. The projection's synthetic opening session carries the derived prior-close scalar. The simulator consumes it immediately before its original integer share floor. Original source adverse-price costs, affordability, minimum trade, cash accounting, sector/issuer/risk limits and actual-sleeve share mapping continue to apply.

`applyRegimeInputs(dataset, experiment, { calendar, policyStartDate, benchmarkWarmupSessions })` returns `{ dataset, researchInputs }`. Pass the chosen pinned source's market-session calendar and the exact adoption date. Earlier rows already present in the original archive supply warmup; optional `benchmarkWarmupSessions` may supply additional **original, verified** rows strictly before the archive. This routine preserves all original price/signal/event rows and source metadata. It creates a separate session sidecar only from adoption onward. Do not save historical sidecars or their observed values publicly when prices are proprietary.

Drawdown requires 252 completed SPY closes before each entry session and measures `(window high − prior close) / window high × 100`, with the prior close included in the rolling window. Volatility requires 21 closes and uses 20 simple close returns, their sample standard deviation with denominator 19, annualized with `sqrt(252)`. Input dates must be consecutive market sessions; gaps, duplicate dates, nonpositive or unadjusted SPY prices and missing warmup fail closed. No prices are reconstructed.

State starts normal immediately before policy adoption. At or above the trigger it becomes active; it restores after five consecutive prior-session observations strictly below the restoration threshold. A failed restoration observation resets the counter. Warmup supplies observables and does not imply a pre-adoption portfolio or policy-state history. All scalars and state transitions are predetermined from original prior closes, so source cache snapshots need no extra runtime state.

In an active regime, new model budget is the minimum of:

- The budget approved by every original source gate.
- Equity × original name target × 0.5, less existing value of that name.
- Equity × original total target capacity × 0.5, less the open value of all held positions.

For the preserved three-slot policy, original total target capacity is 99%. It is computed as the sum of explicit source target weights when present, otherwise maximum source Buy/Strong Buy target times source ranked target count, capped at 100%. Existing exposure above scaled capacity pauses additions. Held positions are never forcibly reduced. The normal multiplier follows the original source budget exactly. Reduced holdings and residual cash can affect later affordability and the resulting path; this is intended and must be reported in eventual comparisons.

Run the artificial software checks with:

```sh
node research/c1-challenger-20261012/harness/regime-mechanics.cjs
```

`regime-mechanics-results.json` records no-op economics and full source-trace parity at 12/25/50 bps, all six scaling specifications under cached/uncached execution, original-input preservation, causal chronology and future perturbations, existing archive-prefix equivalence, strict five-session restoration, whole-share/cash accounting, unchanged held positions and gap stops, unchanged source breaker/cooldown state, and rejection of missing warmup, missing sessions, combined triggers and changed source seams. These checks support software mechanics only. Complete licensed input recovery and independent source-specific baseline verification remain prerequisites for historical performance findings.

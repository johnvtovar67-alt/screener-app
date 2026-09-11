# C1 historical release assessment — September 11, 2026

The user explicitly requested backtesting instead of waiting 60 new forward sessions. That duration is no longer a release prerequisite for this evaluation. This changes no other evidence or implementation requirement and does not grant trading authority.

## Completed accounting audit

Run `node tools/c1-historical-ledger-audit.cjs` from the repository root. The adjacent JSON receipt audits immutable stored historical fixtures, not a new simulation or holdout. Terminal weighted realized P&L reconciles to final equity. Costs are embedded in the stored fill prices.

| Universe | Cumulative return | Maximum drawdown | Weighted realized profit factor | Mean book realization return |
|---|---:|---:|---:|---:|
| Nasdaq | 268.65% | -20.17% | 2.53 | 6.57% |
| S&P | 380.72% | -20.70% | 2.61 | 6.56% |

Period: January 4, 2023 through September 1, 2026. Book realizations overlap between the three sleeves and are not independent portfolio trades. Profit factor uses weighted realized dollars; mean realization return is an unweighted descriptive average. Calendar results are not new evaluation folds.

The earlier frozen cost receipt on research/c1-frozen-cost-audit reports benchmark cumulative returns of 107.59% for SPY and 171.74% for QQQ. At 50 basis points of modeled slippage per side, candidate returns were 232.88% (Nasdaq) and 260.63% (S&P). These are previously inspected results, not fresh confirmation.

The completed fixed-candidate controls on research/c1-1000-seed-control had 27/1000 Nasdaq exceedances and 3/1000 S&P exceedances: p=28/1001 and 4/1001. They do not correct the selection of C1 from prior research or constitute family-wise evidence.

## Remaining release blockers

1. Historical data provenance: establish actual historical membership, delisted outcomes, corporate-action handling and information availability at decision dates. The current provisional source explicitly disclaims survivorship-free, point-in-time membership and revision-safe values. Attractive arithmetic does not repair that limitation.
2. Compare with both benchmarks across original evaluation folds, and account for model selection. Descriptive calendar returns cannot silently replace the frozen fold-stability contract.
3. Complete live recommendation equivalence: synthetic frozen-service and model-event paper tests pass, but do not establish that both interactive pages produce the tested three-book strategy and executable brokerage quantities for every supported scenario.
4. Reconcile user holdings and cash through actual execution records before producing position-specific orders. A paper model event is not a brokerage fill.

C1 remains ineligible for live capital under this assessment. Removing the elapsed-time gate must not be implemented as setting independentlyValidated or activationAuthorized to true. No runtime policy was changed by this artifact audit.

# Independent arithmetic review

Author: independent_control_review, separately owner-authorized reviewer. Scope: completed frozen exploratory outputs only; no strategy simulations or production/account edits.

**PASS — all36 primary runs.** Independent fill replay reconciles2304 daily cash/equity marks and final per-sleeve shares, average basis and cash. Maximum differences: cash$1.4552e-11; equity$4.3656e-11, against$1e-6 tolerance. Realized plus open unrealized PnL reconciles ending equity less starting capital. External holding-session/PnL bins are measured from fills rather than the empty legacy field.

**PASS — common opportunity denominator.** All36 reports use233 Q9-cap3 eligible screen name-days at the same cost. Exact partition into prior-held/new-purchased/uncovered; arm-only eligibility and purchases separately reported. This is screen-only coverage, not attainable foregone alpha or proof of sleeve/risk/funding permission.

**PASS — position counts.** Per-book3/9 capacity respected after every fill. Observed maximum9 positions in one sleeve and10 distinct names across the account. A per-sleeve capacity is not an account-wide unique-name limit.

**PASS — reporting arithmetic.** All36 scalar-metric calculations independently checked. All33 paired bootstrap comparisons reproduce stationary shared-index sampling,10,000 replicates/20-session expected blocks/seed20261016. Mean/CAGR/Sharpe/drawdown intervals match within1.7764e-15; p-values, Holm adjustments and finite-replicate counts are exact (tolerance1e-10). Sample-index SHA2560fe036adec7a1a4eb7eccfc6ed03a559626160535120ccc7beb5c0fc7915e348.

Cost sensitivity:50bps first changes control order identities on2025-02-26 by crossing base sleeve's unchanged12% opening-equity drawdown breaker (-12.0761%;12bps -11.7387%,25bps -11.7442%). Resulting LULU/DXCM sales and cooldown alter the future path. Higher modeled cost is not a beneficial trading rule.

Classification cautions: momentum arms remove components; ablation success is evidence against the removed component in this pilot. Compare informative sensitivities against their own same-scenario control. All-entry-blocked cash-only results are uninformative robustness bounds. Final KEEP/REJECT/INVESTIGATE classification requires completed sensitivities; primary arithmetic alone does not authorize a label or production change.

Evidence: final-arithmetic-review.json; matrix-final-primary/matrix-postprocess.json; independent-primary-metrics.json; source-primary-metrics.json; bootstrap-all-final/bootstrap-independent.json; bootstrap-all-source/source-bootstrap.json; control-output-check.json. Portable arithmetic scripts in portable-v2/: matrix-postprocess.py, bootstrap-check.py, control-output-check.py. No new historical strategy execution by reviewer. Strict dataset qualification remains unapproved; proxy-cohort, event/classification, short-sample and development-hindsight limits remain outside bootstrap intervals.

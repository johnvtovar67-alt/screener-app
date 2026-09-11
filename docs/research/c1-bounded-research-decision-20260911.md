# C1 bounded research decision — September 11, 2026

Assessment base: `7296d40a2ffeccc1d889a052f09b0cb4096343e7`.
Scope: historical-sector reliability and strategy-selection robustness only.
Disposition: **research assessment complete; evidence inconclusive for trading release**.
This is not a finding that C1 is unprofitable, and it is not a guarantee-of-alpha standard.
Neither question is marked passed. No trading authority is granted.

## Evidence supporting C1

The saved January 4, 2023–September 1, 2026 assessment reports:

| Historical universe | Cumulative return | Maximum drawdown | Return with 50 bps per-side slippage |
|---|---:|---:|---:|
| Nasdaq | 268.65% | -20.17% | 232.88% |
| S&P | 380.72% | -20.70% | 260.63% |

The same saved assessment reports SPY 107.59% and QQQ 171.74%.
These are previously inspected historical results. They are substantial descriptive
evidence; neither overlapping universes nor cost scenarios are independent replications.
The completed chosen-candidate controls had 27/1000 Nasdaq and 3/1000 S&P exceedances,
with corrected empirical fractions 28/1001 and 4/1001 respectively. Those results
remain useful chosen-candidate diagnostics, not selection-adjusted alpha.

Source: [saved historical assessment](https://github.com/johnvtovar67-alt/screener-app/blob/research/c1-historical-release-audit/docs/research/c1-historical-release-assessment-20260911.md).

## 1. Historical-sector reliability: impact unresolved

Established:
- The compilers copy profile classifications without a decision-date lookup.
- C1 uses sector limits; the saved synthetic dependency audit changes fills in all
  three sleeves when sector labels are perturbed.
- That audit does not identify a wrong historical company classification, measure
  return bias, or establish that C1 would lose its benchmark advantage.
- Public classification announcements provide partial dated evidence. They do not
  establish complete company-date coverage or equivalence to FMP's taxonomy.

Conclusion: neither “sectors invalidate C1” nor “sector uncertainty is immaterial”
is supported. The historical performance effect remains unquantified.

A bounded materiality assessment could close this question without reconstructing
every unused company-date: verify classifications used at consequential decisions,
including held positions and rejected candidates whose eligibility would change.
An unchanged decision-path proof must cover all feasible alternatives under the
documented classification uncertainty, not just perturbations chosen to leave the
result unchanged. If a decision can change, its downstream effect must be evaluated;
it cannot be dismissed from aggregate returns alone. This proof is not present in
the reviewed summaries. No historical replay was run for this assessment.

Sources: [saved dependency audit](c1-source-dependency-audit-20260911.json);
[MSCI/S&P dated classification announcement](https://www.msci.com/downloads/documents/indexes/gics/GICS_Press_Release_31_March_2022.pdf).
The announcement establishes the existence and timing of classification changes,
not a replacement company-classification dataset or measured C1 impact.

## 2. Strategy-selection robustness: acceptance not established

Established:
- Multiple strategies and parameter variants were inspected before C1 was chosen.
- Earlier R40–R44 documentation explicitly specifies a five-variant family-maxima
  control. That contract concerns that earlier family, not C1's entire search.
- C1's 1,000 controls evaluate the selected candidate, not the selection process.
- Existing folds and repeated analyses of already inspected dates cannot be
  relabeled independent confirmation.

The recent exploratory calculation reconstructed the three weighted equity curves
from 917 saved daily returns and reproduced 268.65228% and 380.72049%. It then used
a one-sided normal approximation to a positive-mean test, Bartlett HAC lags 5, 20,
and 60, and hypothetical Bonferroni counts of 100 and 1,000. The 100-trial results
varied substantially with lag choice (Nasdaq about 0.177–0.331; S&P about
0.00177–0.0632).

**Correction and limitation:** that calculation tested positive raw mean returns,
not excess returns over SPY/QQQ. Trial counts were assumptions, not an audited
search bound. It is neither a Deflated Sharpe Ratio nor a reconstruction of C1's
selection criterion. It cannot serve as an acceptance test or establish that C1
failed a valid alpha test. Selecting the favorable lag after seeing the results
would add selection bias. Do not reuse this calculation as a release gate.

Conclusion: historical selection-adjusted acceptance remains unestablished, not
disproved. An appropriate adjustment requires sufficient saved search information
or a justified conservative bound matched to a valid test. An independently
unexamined historical sample is another potential approach only after its
independence, data suitability and evaluation rule are established before viewing
outcomes. No suitable independent sample has been established here. No future
waiting period is imposed.

Sources: [earlier family contract](../V40_ADAPTIVE_REPLACEMENT_R40_R44.md);
[research chronology](../POINT_IN_TIME_RESEARCH.md);
[Bailey and López de Prado, Deflated Sharpe Ratio](https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf).

## Decision and fixed remaining scope

The existing C1 trading-release requirements are not satisfied by this evidence.
The saved historical results justify continued investigation, but this assessment
cannot certify the two research requirements as passed. Public documentation alone
does not close either calculation.

Reopen this assessment when there is a concrete new evidence item: a dated
classification match/materiality result, sufficient selection records or justified
search bound, or a demonstrably independent validation sample. Re-reading the
same reports, a generic provider reply, another chosen-candidate control, or a
software deployment is not new evidence.

The already-listed private account-to-order verification remains separate; it is
not a newly discovered research requirement. User-supplied brokerage screenshots
have been recovered and compared. Intentional whole-dollar cash entry is a known
user convention, not an unexplained brokerage discrepancy. No private account
values or credentials are included here.

No model, holdings, original records, release flags, cron schedule, blocked endpoint,
completed historical test, or waived 60-session requirement was changed.

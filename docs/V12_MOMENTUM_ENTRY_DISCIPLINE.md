# Version 12 momentum-first entry discipline

V11 returned 49.55% after modeled costs versus 29.05% for SPY and 38.12% for
QQQ, but its simple-momentum control returned 68.52% and the random-placebo
95th percentile returned 66.63%. Momentum remained the strongest factor. V11
also exposed an entry defect: its 3/5/10-session chase flag could accept a brief
pullback after a stock had already advanced more than 100% over the larger
60/120-session horizon.

V12 freezes one momentum-first blend before replay:

| Evidence                         | V12 weight |
| -------------------------------- | ---------: |
| Medium-term momentum rank        |        70% |
| Relative strength versus SPY/QQQ |        15% |
| Fundamental quality rank         |         5% |
| Stability rank                   |         5% |
| Controlled pullback              |         5% |

Momentum and relative strength therefore contribute 85%. Quality and stability
remain minority robustness inputs rather than overriding demonstrated price
leadership. The exit, rebalance, sizing, concentration and stop lifecycle stays
the same as V11 so the development comparison isolates ranking and entry.

## Multi-horizon entry governor

A fresh V12 entry must pass the existing point-in-time timing check and aligned
50/200-session trend. It is rejected when any of these predeclared conditions
is observed:

- price is more than 16% above its 50-session average;
- the latest 20-session return exceeds 30%;
- the 60-session return excluding the latest five exceeds 100%;
- the 120-session return excluding the latest 20 exceeds 125%;
- the larger 60/120-session log return exceeds three volatility-scaled standard
  moves using the observed 60-session annualized volatility;
- the existing 3/5/10-session chase flag is active; or
- the next-open gap exceeds 3%.

These rules do not reject momentum. They require a very extended leader to
consolidate long enough for the excessive return and distance measures to reset
before it becomes eligible for new capital. The thresholds are frozen as one
economic rule set; V12 does not search a grid for the best historical cutoff.

## Controls and evidence

V12 is compared with simple momentum under the same entry discipline, V11's
weights under the same V12 lifecycle, the identical V12 rank without the new
multi-horizon entry governor, quality-only, the transparent non-repainting
bull-cycle/pullback control, SPY, QQQ and 25 deterministic random portfolios.

The development gates require V12 to beat both indices in most folds, beat the
named factor controls and random 95th percentile, preserve at least 80% active
stock exposure, complete at least 30 round trips, and produce positive
expectancy and a profit factor above one. The entry governor must also improve
Sharpe ratio, maximum drawdown and return-to-drawdown versus the identical
ungoverned V12 rank. Cash stays cash and exposure-matched attribution remains a
secondary diagnostic.

V12 was created after reviewing V11. The repeated dates are contaminated
development evidence even if every numerical gate passes. The provisional
dataset also uses today's cohort, omits delisted securities and historical
membership, cannot certify fundamentals as revision-safe, lacks complete
point-in-time material news, and uses only 25 rather than at least 1,000 random
placebos. V12 cannot automatically change the live recommendation engine.

# C1 confirmed momentum exits — production authorization

## Owner authorization

On 2026-09-26 the owner directed that the completed momentum-exit backtest be
put into production.

## Production policy

- Retain the 14% catastrophic position stop.
- Retain the existing portfolio drawdown controls.
- From session five through session 29, queue an exit after three consecutive
  completed sessions outside the top nine momentum ranks.
- Once a position has reached a 12% peak gain, queue an exit after two
  consecutive completed sessions outside the top six while the position is
  still profitable.
- Schedule a queued exit for the next regular-session open. Holdings and cash
  change only after the owner records the broker fill. One weak session is not
  an exit.
- At session 30 and later, retain the existing outside-top-six rank exit.
- Re-entry requires a fresh C1 qualification and the normal cash,
  concentration, opening-gap, and portfolio-risk checks.

## Evidence

The preview-only grid used 918 completed sessions from 2023-01-04 through
2026-09-01 in both the point-in-time Nasdaq and S&P 500 evidence sets. The
selected profit-protection rule improved aggregate return, maximum drawdown,
and Sharpe in both universes and beat the current policy in 10 of 16 subperiod
return comparisons. Fixed 4% and 6% trailing-price exits were rejected because
they created substantially more turnover and were less robust.

## Implementation boundaries

The change applies only to C1 Swing holdings in the private-account
continuation. It does not apply to Core holdings, does not create brokerage
orders, does not infer fills, and does not rewrite account history. The frozen
historical simulator remains unchanged; a generated, regression-checked seam
adds the authorized rules to actual-account continuation only.

## Verification

- Exact production parameters are asserted in a dedicated regression.
- Two- and three-session confirmation are verified separately.
- Next-session-open timing is verified without look-ahead.
- A one-session momentum wobble is verified not to sell.
- Profit protection is verified to take priority over the slower general rule.
- Existing actual-account replay, reconciliation, stop, cash, and ownership
  regressions remain required before build and deployment.

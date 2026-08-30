# Version 9 alpha thesis contract

> **Rejected design:** V9's SPY completion sleeve is not a valid test of the
> screener's stock-selection portfolio. It is retained only as an audit trail and
> must not be used for live promotion or described as screener-generated alpha.

Version 9 is a structural benchmark-completion test, not a promise of future
outperformance. Version 8 found positive exposure-matched stock-selection alpha
but left 86.64% of average capital in cash. It returned 5.51% while SPY returned
29.05%. The higher-exposure persistent-quality candidate returned 11.15%, but
the V8 selector preferred the sparser quality-reacceleration policy because its
objective emphasized downside-adjusted active results rather than simple excess
return versus a fully invested benchmark.

V8 also mixed mark-to-market portfolio returns with closed-trade statistics:
five of sixteen selected-policy positions remained open at audit boundaries.
Their gains or losses affected total return but not profit factor, expectancy or
the closed-round-trip count. V9 resolves that measurement mismatch.

## Economic hypothesis

1. **SPY is the opportunity-cost asset.** Capital not allocated to an active
   stock position is held in a frictionless SPY completion sleeve inside this
   research diagnostic. Passive SPY return is never called alpha. V9 alpha is
   the strategy's simple excess return over SPY.
2. **Active positions are quality and momentum tilts.** The three predeclared
   active candidates retain V8's independent, point-in-time factor definitions:
   profitability, cash-flow margin, return on equity, growth, leverage,
   dilution, medium-term relative strength, valuation, stability and controlled
   entry timing. V9 does not mine new entry thresholds from V8 audit winners.
3. **Sparse conviction need not imply market timing.** A selective stock sleeve
   can stay small without forcing the total portfolio into cash. This separates
   two questions that V8 conflated: whether the stock selections add value and
   whether the portfolio should abandon passive equity exposure.
4. **A winner that earns 1.5 initial risk units cannot become a discretionary
   loser through stop ratcheting.** Once that threshold is reached, a later
   structural ratchet cannot sit below the entry price. The original 8-14%
   initial invalidation remains in force before the threshold.
5. **Execution uses only information available at the trade.** Orders generated
   at a close execute at the next open. Existing positions are valued at that
   open for sizing and concentration checks; the same session's close is never
   used for next-open sizing.
6. **Each research window is self-contained.** Remaining holdings are sold at
   the final close with the configured sell slippage. Total return, profit
   factor, expectancy and round-trip counts therefore cover the same positions.

## Predeclared active candidates

| Candidate | Active-stock question |
|---|---|
| SPY-completed persistent quality leadership | Does persistent above-average quality plus medium-term leadership add return over SPY? |
| SPY-completed controlled acceleration leadership | Can strongly confirmed acceleration add return without unacceptable drawdown and turnover? |
| SPY-completed quality re-acceleration, value aware | Can selective quality re-acceleration add return while avoiding the weakest valuation and stability cohorts? |

All three candidates use the same SPY completion, execution, liquidation and
risk-lifecycle rules. Candidate selection therefore compares active tilts, not
different amounts of passive market exposure.

## Selection and evidence standard

- Each fold keeps 378 training sessions, 126 validation sessions and 126 audit
  sessions. Candidate selection uses only its training and validation windows.
- The primary score rewards simple excess return versus SPY, total return,
  Sharpe ratio, profit factor and expectancy, while penalizing drawdown,
  excessive turnover, insufficient round trips and incomplete total exposure.
- Promising provisional evidence requires positive aggregate SPY excess return,
  positive aggregate return, positive expectancy, profit factor above one,
  positive SPY excess return in most folds, at least 30 closed round trips and
  at least 95% average total equity exposure.
- SPY and QQQ simple returns remain separately reported. Because V9 is fully
  equity-exposed through SPY plus active stocks, exposure-matched and simple
  benchmark comparisons should converge; neither can hide cash drag.
- The current-cohort replay can never authorize capital. It lacks historical
  universe membership, delisting returns, revision-safe fundamentals and
  point-in-time material-news history.

## Evidence contamination disclosure

V9 was designed after inspecting V8, and it reuses the same historical windows.
The V9 run is therefore a development comparison and falsification check, not a
new untouched test. Even a favorable V9 result must be confirmed on genuinely
untouched future or sequestered data before an alpha claim is credible. This
constraint follows the documented multiple-testing and backtest-overfitting
risk in financial strategy research.

## Research basis

- Quality Minus Junk: https://www.aqr.com/Insights/Research/Working-Paper/Quality-Minus-Junk
- Gross profitability premium: https://www.nber.org/papers/w15940
- Backtesting multiple signals: https://www.nber.org/papers/w21329
- Probability of backtest overfitting: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2326253

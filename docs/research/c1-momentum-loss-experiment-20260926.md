# C1 early momentum-loss experiment — 2026-09-26

## Owner instruction

The owner asked to test whether C1's 14% position stop is too wide and whether
the strategy should act on a sustained loss of momentum before the existing
30-session rank-retention rule becomes active.

## Isolation

This work adds a disabled-by-default simulator option and a preview-only
research endpoint. It does not alter `C1_FROZEN_OPTIONS`, the C1 account, saved
positions, production recommendations, production execution, or production
deployment.

## Predeclared comparison

- Current C1: 14% catastrophic stop; rank exit outside the top six after 30
  sessions.
- Stop-only candidate: 12% catastrophic stop; otherwise unchanged.
- Primary candidate: 12% catastrophic stop plus an early exit after session
  five when the holding ranks outside the top nine for three consecutive
  completed sessions; the existing post-session-30 top-six rule remains.
- Attribution candidate: retain the 14% stop and add only the early top-nine
  rule.

Every candidate uses next-session-open execution and the unchanged C1 ranking,
sizing, sector limits, portfolio drawdown breaker, slippage, and whole-share
accounting. The comparison runs separately on the frozen point-in-time S&P 500
and Nasdaq evidence sets and combines the three existing C1 sleeves.

## Decision standard

The candidate must improve drawdown without materially degrading total return
or QQQ excess return. Window consistency, turnover, early-exit count, and
ten-session same-symbol re-entry are reported to identify churn and whipsaw.
No candidate is authorized for production by this experiment alone.

## Results

The frozen evidence covered 918 completed sessions from 2023-01-04 through
2026-09-01 in each universe.

| Universe | Policy | Return | Max drawdown | Sharpe | Turnover | Early exits | 10-session re-entry |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Nasdaq | Current 14% | 92.19% | -38.01% | 0.723 | 1291% | 0 | 0% |
| Nasdaq | 12% stop only | 55.93% | -45.37% | 0.537 | 1345% | 0 | 0% |
| Nasdaq | 12% + top-9 x3 | 135.63% | -44.68% | 0.891 | 1714% | 103 | 3.88% |
| Nasdaq | 14% + top-9 x3 | 124.79% | -35.55% | 0.859 | 1575% | 108 | 2.78% |
| S&P 500 | Current 14% | 337.46% | -33.18% | 1.288 | 1354% | 0 | 0% |
| S&P 500 | 12% stop only | 568.99% | -33.53% | 1.566 | 1374% | 0 | 0% |
| S&P 500 | 12% + top-9 x3 | 558.40% | -31.99% | 1.585 | 1928% | 138 | 5.80% |
| S&P 500 | 14% + top-9 x3 | 424.22% | -32.04% | 1.466 | 1751% | 151 | 3.31% |

The 12% stop is not robust: it improved S&P 500 return but materially reduced
Nasdaq return and worsened Nasdaq drawdown. The 14% stop plus the early rank
rule improved aggregate return, drawdown and Sharpe in both universes, but it
beat the current policy in only eight of the sixteen subperiods and increased
turnover materially. The aggregate gain is therefore directionally supportive
of an early momentum-loss rule, not sufficient evidence that top-nine for three
sessions is the stable production parameter.

## Decision

- Retain the 14% catastrophic stop pending stronger evidence.
- Do not promote the 12% stop.
- Continue research on early rank deterioration across nearby thresholds and
  confirmation periods before changing production.
- Production remains unchanged.

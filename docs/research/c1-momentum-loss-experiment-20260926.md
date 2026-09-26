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

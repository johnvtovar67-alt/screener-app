# V17 / Research R7 slow residual-momentum contract

## Frozen thesis

R7 was specified after R6 failed. Every session through 2026-09-01 is therefore
contaminated research history: it may falsify R7, but cannot independently
prove future alpha.

The primary portfolio ranks point-in-time S&P 500 members using 85% 120-session
excess return versus both SPY and QQQ and 15% drawdown resilience. It holds up
to eight approximately 12% positions, rebalances every 40 sessions, requires a
60-session minimum hold, uses a 252-session time limit and a fixed 22%
catastrophic stop. It uses no sector trend overlay, volatility scaling,
fundamental data, event data, or benchmark completion sleeve. Cash remains
cash; fills occur at the next open with 12 basis points of slippage.

The predeclared controls are absolute momentum, 60-session residual momentum,
and matched random ranks under the identical lifecycle. The historical screen
requires positive alpha versus SPY and QQQ in every phase, superiority to all
controls in development and audit, Newey-West t-statistics above 3.0 versus
both benchmarks, and a Bonferroni-adjusted 100-placebo p-value below 5%.

A historical survivor is not production-ready. It must additionally pass 1,000
matched placebos, accumulate 60 genuinely new sessions, and replicate in an
independent universe. V11 remains live unless all gates pass.

Research basis: Blitz, Huij and Martens, “Residual Momentum,”
https://doi.org/10.1016/j.jempfin.2011.01.003; Harvey, Liu and Zhu,
“… and the Cross-Section of Expected Returns,”
https://www.nber.org/papers/w20592.

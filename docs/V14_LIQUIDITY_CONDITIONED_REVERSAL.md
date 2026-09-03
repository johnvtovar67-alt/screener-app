# V14 / R4 liquidity-conditioned reversal

Frozen 2026-09-03 after V13/R3 failed. This is an economically distinct,
price-only causal thesis and cannot change production recommendations.

## Thesis

Temporary five-session selling pressure may reverse as compensation for
liquidity provision, but only where 120-session returns remain positive versus
both SPY and QQQ. Eligible stocks must have a five-session return from -10% to
-1%, at least $50 million trailing average dollar volume, price of at least $5,
and 60-session volatility no greater than 50%.

The frozen rank is 55% proximity to a -4% five-session move, 25% dual-benchmark
120-session trend, 12% low volatility, and 8% liquidity. It rebalances every
five sessions into 15 equal-weight positions, uses ten-session time exits and
10% initial stops, retains residual cash as cash, and executes at next-session
open with 12 bps slippage.

## Falsification contract

- one primary candidate; no parameter search;
- controls: matched random rank, unconditioned reversal, and trend-only;
- 100 matched placebos for the bounded screen;
- family-wise placebo probability below 5%, counting R1 through R4;
- Newey-West five-lag t-statistic above 3 versus both SPY and QQQ across
  validation plus historical audit;
- every existing return, drawdown, trade-count, and window-stability gate;
- a survivor still requires 1,000 placebos, 60 genuinely new sessions, and
  independent cross-universe replication before promotion.

## Research basis

- Stefan Nagel, [Evaporating Liquidity](https://www.nber.org/papers/w17653)
- Blitz, Huij, Lansdorp and Verbeek,
  [Short-term residual reversal](https://doi.org/10.1016/j.jempfin.2012.12.002)
- Harvey, Liu and Zhu,
  [... and the Cross-Section of Expected Returns](https://www.nber.org/papers/w20592)

All dates through 2026-09-01 were observable before freeze. Historical passage
would advance the thesis to prospective paper tracking; it would not itself
prove deployable alpha.

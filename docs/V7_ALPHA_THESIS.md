# Version 7 alpha thesis contract

Version 7 does not assume that a higher screener score creates alpha. It tests
whether a small set of economically distinct, predeclared policies improves
capital efficiency after realistic next-open execution, slippage, stops,
position limits and periods in cash.

## Investment premises

1. **Cash is an active allocation.** If no tested policy earns a positive
   selection score, the cash-preservation control must remain eligible to win.
2. **Quality must be economically comparable.** Profitability, free-cash-flow
   margin, growth, balance-sheet quality and dilution are ranked globally and
   within sector. Negative book equity cannot create a false ROE or leverage
   advantage.
3. **Momentum must persist without becoming a chase.** The research layer uses
   60-session and 120-session momentum with the most recent 5/20 sessions
   excluded, benchmark-relative confirmation, a short-term extension penalty
   and a maximum next-open gap.
4. **Price paid still matters.** A quality-at-reasonable-price policy gives
   explicit weight to free-cash-flow yield and valuation while requiring
   positive quality and momentum evidence.
5. **Regime matters.** The pure momentum policy does not open positions in a
   defensive benchmark regime. The diversified policy may still invest when
   name-specific evidence clears its stricter gates.
6. **Risk is sized, not narrated.** The risk-balanced policy scales exposure by
   volatility and stop distance, limits issuers and sectors, and rechecks
   portfolio contribution after all sizing constraints at the actual fill.
7. **Winners and losers have asymmetric lifecycles.** Stops and relative-
   strength breaks remove failed trades; time stops recycle flat capital; wider
   profit trails avoid mechanically cutting healthy winners too early.

## Predeclared candidates

| Candidate | Question tested |
|---|---|
| Cash preservation | Is every active policy worse than doing nothing? |
| Live policy | Does the existing production thesis work as implemented? |
| Anti-chase control | Does entry discipline and a static lifecycle improve it? |
| Balanced quality-momentum | Do durable quality and medium-term leadership combine into better selections? |
| Quality at reasonable price | Does valuation improve the quality signal without buying weak momentum? |
| Regime-aware momentum | Does concentrated leadership work only outside defensive regimes? |
| Risk-balanced quality-momentum | Does volatility, stop-risk and sector scaling improve risk-adjusted results? |

## Selection and evidence standard

- Each candidate is evaluated in rolling 378-session training, 126-session
  validation and 126-session chronologically unseen audit windows.
- Candidate selection uses training and validation only. Audit results never
  choose the candidate tested in that same fold.
- The primary comparison is exposure-matched alpha versus SPY, supported by
  total return, Sharpe, drawdown, profit factor, expectancy, winner/loser
  payoff, holding period, stop-out rate and turnover.
- A policy is not treated as promising unless aggregate unseen alpha,
  expectancy and profit factor are positive, a majority of unseen folds have
  positive alpha, and the sample contains at least 30 closed round trips.
- These thresholds cannot convert the provisional current-universe FMP replay
  into an investable alpha claim. Historical membership, delistings,
  revision-safe fundamentals and point-in-time event history are still required
  for that higher standard.

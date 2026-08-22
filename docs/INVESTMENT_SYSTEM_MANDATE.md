# Investment System Mandate

## Objective
Maximize risk-adjusted return of the Swing book by deploying capital only into high-quality, asymmetric opportunities while preserving cash when qualified opportunities do not justify portfolio risk. Core holdings are governed separately.

## Non-negotiable decision hierarchy
1. Data integrity: incomplete/contradictory critical data cannot authorize fresh capital.
2. Standalone security quality: fundamentals, technicals, momentum, leadership, catalyst/event risk and asymmetry.
3. Signal stability: marginal threshold movement cannot create churn; ordinary Buy requires persistence.
4. Payoff: evaluate percentage upside/downside and reward/risk before nominal dollars.
5. Portfolio fit: factor overlap, concentration, current holdings and Core/Swing separation.
6. Sizing: size from Swing capital and risk; whole-share implementation follows sizing, never the reverse.
7. Contribution: approved position must be meaningful to the Swing book without penalizing high nominal share prices.
8. Rotation: sell-to-buy requires a materially superior replacement after turnover, correlation and contribution hurdles.
9. Lifecycle: winners, losers and aging positions are managed differently. Prior trims persist.
10. Opportunity cost: a 4–6 week flat/losing Swing must re-earn capital versus cash and qualified alternatives.
11. Execution: every final action must resolve to a simple whole-share instruction or explicit Hold/Cash.
12. Auditability: recommendations are recorded and measured at 1/5/10/20/40/60-day horizons.

## Invariants
- Strong Buy is a security/setup judgment, not automatic portfolio permission.
- Core capital cannot inflate or dilute Swing sizing.
- Correlated names count toward common economic-factor exposure.
- Repeated trims cannot mechanically liquidate a winner.
- A good company is not automatically a good Swing position.
- A loser cannot remain Hold indefinitely by inertia.
- Reduce proceeds remain cash unless a separate replacement clears the rotation hurdle.
- High share price is not a negative signal.
- Tiny allocations cannot masquerade as full conviction.
- No novelty bonus: repeated names are acceptable only if they re-earn rank from the actual scanned universe.

## Validation standard
A change is not complete because one example looks correct. It must preserve these invariants, pass adversarial regression scenarios, build cleanly, and produce internally consistent row-level and portfolio-summary actions.

## Known architectural limitation requiring continued work
The current broad opportunity endpoint is a curated thematic universe, not a whole-market discovery engine. It must label itself accordingly. Expanding discovery requires a reliable live symbol universe plus liquidity/data-quality prefilters before expensive scoring. Until that exists, recurring names must not be represented as proof that the entire investable U.S. equity market was searched.

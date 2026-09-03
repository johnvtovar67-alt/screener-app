# V18 / R8 batched nested alpha discovery

R8 replaces the expensive one-thesis-per-deployment loop. It freezes 21
price-only candidates spanning seven factor families and three concentration /
rebalance lifecycles, then uses a nested funnel:

1. All 21 share the same three development-window restores.
2. The four best development scores reach validation.
3. A candidate must pass every development and validation gate to reach audit.
4. Exactly one nested-score winner is frozen before historical audit.
5. The 1,000-placebo stage runs only if that candidate also beats SPY and QQQ,
   stays inside the drawdown/exposure gates, and produces audit-only Newey-West
   t-statistics above 3.0 versus both benchmarks.

This reduces the normal run from hundreds of redundant storage reads and
placebo simulations to roughly 71 portfolio simulations when no candidate
survives. Audit never selects or retunes a candidate. Cash remains cash,
membership is point-in-time, fills occur at the next open, and modeled
slippage remains 12 basis points.

R8 is research infrastructure, not a live strategy. Every available date was
already observable, so even a survivor must pass the separate 1,000-placebo
stage, 60 genuinely new sessions, and independent cross-universe replication.
V11 remains the live policy until every gate passes.

# C1 reported-thesis tournament — 2026-10-24

Owner instruction: after the isolated high-to-price candidate failed, research
and test several other reported ways to improve C1 simultaneously, without a
large infrastructure build and without changing production.

## Scope

This is one preview-only, non-executable tournament. Its three fixed arms run
as separate requests (`champion`, `ols-residual-120-ex-20`, and
`downside-resilience-120-ex-20`) so a completed arm's replay cannot consume the
next arm's memory. Every request independently restores the same accepted data
and runs only its selected arm through the identical three sleeves, dates,
universe, costs, sizing, entries, exits, stops and holding rules. The route
rejects missing, repeated, or unknown arm values; it offers no arbitrary
parameter or grid. It returns 404 in production, reads only the existing
accepted private manifest/chunks, performs no provider request or storage
write, and cannot authorize a recommendation or trade.

The repository audit found that 52-week-high anchoring, path continuity,
volume confirmation, sector leadership, volatility controls, pullbacks,
quality blends, lottery-return restraints and multiple exit variants were
already tested. They are not rerun.

## Fixed candidates

### A. SPY/QQQ OLS-residual momentum

For the same causal 120-to-20-session window used by the current formation
factor, compute daily adjusted log returns. Regress each stock's returns on
contemporaneous SPY and QQQ returns through the origin. Score the sum of the
100 residual returns divided by their sample standard deviation, then rank the
score cross-sectionally among the same accepted peers.

This tests whether stock-specific leadership is more useful than market-driven
momentum. It is a constrained adaptation of Blitz, Huij and Martens (2011),
not a faithful reproduction: the accepted replay has SPY/QQQ but not the
paper's Fama-French factors or 36-month estimation window.

### B. Down-market-resilient momentum

Over that same fixed window, calculate (1) total stock formation return and
(2) the stock's mean log-return excess over SPY only on sessions when SPY is
negative. Rank both cross-sectionally and set the candidate score to 70%
formation leadership plus 30% down-market resilience. At least ten negative
SPY sessions are required; missing evidence fails closed.

This is a downside-aware/partial-moment momentum adaptation, not a faithful
replication of a published portfolio and not an asserted alpha premium. The
fixed 70/30 blend is pre-registered and will not be tuned after results.

## Guardrails and decision rule

- Evaluation: 2023-01-04 through 2026-09-01.
- Accepted causal retention begins at index 130, 2022-07-12: the 120-session
  formation plus the simulator's two pre-start persistence sessions.
- No parameter grid, hybrid, new data, provider, database, queue or worker.
- Late entrants retain the Champion's observed/unobserved formation
  eligibility. No shortened or imputed history.
- The absolute-trend idea is excluded because adding a new eligibility gate
  would alter policy and could also change held-position exit ranks.
- A candidate is rejected unless combined return and Sharpe improve, drawdown
  is not materially worse, at least two sleeves beat the Champion, no sleeve
  suffers a large regression, and turnover remains controlled.
- Historical evidence can reject a candidate but cannot validate one. Any
  survivor still requires the established prospective evidence gate before a
  production policy review.

Primary research context:

- Blitz, Huij and Martens, “Residual Momentum,” *Journal of Empirical Finance*
  18 (2011), 506–521, DOI 10.1016/j.jempfin.2011.01.003.
- Gao, Leung and Satchell, “Partial Moment Momentum,” *Journal of Banking &
  Finance* (2022), DOI 10.1016/j.jbankfin.2021.106361.

Status: pre-registered implementation only. **DO NOT MERGE OR DEPLOY.** No
historical endpoint invocation is authorized until focused/full verification
and an independent source review pass.

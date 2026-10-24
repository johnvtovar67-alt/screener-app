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

## Completed historical results

The three fixed arms completed over the preregistered 2023-01-04 through
2026-09-01 evaluation. Values below are the exact bounded arm summaries.

| Arm | Deployment | Request | Ending equity | Return % | Max drawdown % | Sharpe | Transactions |
|---|---|---|---:|---:|---:|---:|---:|
| Champion | `dpl_3fd8P4uLPdyg3n6a1HG6TxNJbd9z` | `5ltgx-1792811079452-27712986b653` | 481234.11 | 381.23411000000004 | -20.701051498725377 | 1.5854968702366408 | 499 |
| OLS residual | `dpl_6rAeZmgMjcggCfSb8BY34xWvhyfu` | `gkkfk-1792811885790-3f01736411ab` | 204961.7075 | 104.9617075 | -20.69977522798204 | 1.0666060192520144 | 473 |
| Downside resilience | `dpl_3fd8P4uLPdyg3n6a1HG6TxNJbd9z` | `9jgm7-1792811208580-d80c91ec694c` | 174136.1025 | 74.1361025 | -21.64015102783846 | 0.8385779821751554 | 515 |

| Arm | Sleeve | Return % | Sharpe | Max drawdown % | Closed trades | Win rate % | Annualized turnover % |
|---|---|---:|---:|---:|---:|---:|---:|
| Champion | base | 272.37 | 1.287 | -29.18 | 85 | 47.06 | 1407.75 |
| Champion | cooldown15 | 517.5 | 1.681 | -21.16 | 74 | 52.7 | 1115.41 |
| Champion | sector40 | 217.57 | 1.136 | -25.57 | 86 | 48.84 | 1319.04 |
| OLS residual | base | 157.3 | 1.199 | -22.77 | 78 | 53.85 | 1229.22 |
| OLS residual | cooldown15 | 73.53 | 0.818 | -18.37 | 74 | 56.76 | 1213.91 |
| OLS residual | sector40 | 115.49 | 1.092 | -24.83 | 80 | 52.5 | 1206.81 |
| Downside resilience | base | 96.83 | 0.958 | -20.48 | 86 | 56.98 | 1410.85 |
| Downside resilience | cooldown15 | 58.91 | 0.701 | -27.47 | 81 | 54.32 | 1311.18 |
| Downside resilience | sector40 | 81.9 | 0.879 | -20.51 | 86 | 56.98 | 1340.82 |

**Decision: reject both challengers.** OLS residual momentum preserved combined
drawdown but materially reduced return and Sharpe, and every sleeve returned
less than its Champion counterpart. Downside resilience reduced combined
return and Sharpe further, slightly worsened combined drawdown, and also lost
in every sleeve. Neither candidate satisfies the preregistered decision rule.
Production C1 is unchanged; these preview results authorize no recommendation,
trade, merge, or policy change.

## Preflight lesson

Heavy historical arms must run from a fresh, single-purpose preview deployment,
one arm per request. Warm workers and concurrent or sequential multi-arm workers
exhausted memory before the residual transform could complete. A preflight must
therefore confirm the fixed arm, a fresh deployment, no other heavy request on
that worker, and bounded arm-summary logging before invocation. Retrying a heavy
arm on a warm or concurrently loaded deployment is prohibited.

Primary research context:

- Blitz, Huij and Martens, “Residual Momentum,” *Journal of Empirical Finance*
  18 (2011), 506–521, DOI 10.1016/j.jempfin.2011.01.003.
- Gao, Leung and Satchell, “Partial Moment Momentum,” *Journal of Banking &
  Finance* (2022), DOI 10.1016/j.jbankfin.2021.106361.

Status: historical review complete; both challengers rejected. **DO NOT MERGE
OR DEPLOY.** Production remains unchanged.

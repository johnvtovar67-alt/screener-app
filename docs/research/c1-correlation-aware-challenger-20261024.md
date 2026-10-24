# C1 correlation-aware entry challenger — 2026-10-24

Owner instruction: complete the fourth isolated thesis-enhancement test and, if
it also fails, retain C1 without adding another factor.

## Pre-registered design

This challenger does not alter C1's signal, eligibility, ranks, exits, holding
rules, stops, costs, sizing, sleeve weights, sector limits or dates. It changes
only the priority used to fill an available position from C1's existing
nine-name unheld entry queue.

- Use 60 accepted daily log returns ending at the signal close.
- If a sleeve is empty, retain C1's first-ranked eligible name.
- Otherwise, choose the queue member with the lowest average Pearson return
  correlation to current holdings and names already selected in this queue.
- Break exact ties by original C1 rank, then symbol.
- A candidate without 61 consecutive accepted closes remains in its original
  C1 queue slot. A held name without complete evidence is not treated as a
  measured correlation anchor.
- Use no correlation threshold and run no parameter grid.
- Keep C1's original rank pool for every exit decision.

The comparison uses the same accepted point-in-time S&P 500 data and fixed
2023-01-04 through 2026-09-01 window as the prior tournament. Champion and
challenger run as separate requests on fresh preview deployments. The route
returns 404 in production, makes no provider request or storage write, exposes
only aggregate metrics, and cannot authorize a recommendation or trade.

## Acceptance rule

Reject unless combined return and Sharpe improve, drawdown is not materially
worse, at least two sleeves beat C1, no sleeve suffers a large regression, and
turnover remains controlled. Historical evidence can reject but cannot by
itself authorize a production change.

## Preflight

- The generated simulator is pinned to the frozen canonical simulator hash and
  adds one entry-order seam only.
- A no-hook run must reproduce the canonical simulator exactly.
- The working set is bounded to 61 scalar-close maps per sleeve and is released
  after each sleeve.
- Run only one heavy arm on a fresh preview worker; reject partial output.

## Completed historical results

Both fixed arms completed on separate fresh preview workers over the same
accepted dataset fingerprint
`2c923363c6ae3eb21b914cdac61cf7b1cf42292488ef86fe5db85d7795c427c1`.

| Arm | Deployment | Request | Ending equity | Return % | Max drawdown % | Sharpe | Transactions |
|---|---|---|---:|---:|---:|---:|---:|
| C1 Champion | `dpl_F7is9b8tnhug9zt2H9AsUWoB3n6J` | `77h9f-1792854664887-ff84a2ffea2c` | 481234.11 | 381.23411000000004 | -20.701051498725377 | 1.5854968702366408 | 499 |
| Correlation-aware entry | `dpl_H1QRHUsL32xQkh9aTwiff6HEBfiy` | `hjv9m-1792854796937-b41366eae75f` | 259280.335 | 159.280335 | -17.919767253433694 | 1.1625078817772838 | 529 |

| Arm | Sleeve | Return % | Sharpe | Max drawdown % | Closed trades | Win rate % | Annualized turnover % |
|---|---|---:|---:|---:|---:|---:|---:|
| C1 Champion | base | 272.37 | 1.287 | -29.18 | 85 | 47.06 | 1407.75 |
| C1 Champion | cooldown15 | 517.5 | 1.681 | -21.16 | 74 | 52.7 | 1115.41 |
| C1 Champion | sector40 | 217.57 | 1.136 | -25.57 | 86 | 48.84 | 1319.04 |
| Correlation-aware entry | base | 122.33 | 0.906 | -23.53 | 88 | 47.73 | 1449.4 |
| Correlation-aware entry | cooldown15 | 194.72 | 1.172 | -24.51 | 84 | 46.43 | 1344.24 |
| Correlation-aware entry | sector40 | 125.35 | 0.933 | -23.1 | 88 | 47.73 | 1390.64 |

The challenger reduced combined maximum drawdown by 2.78 percentage points,
but lost 221.95 percentage points of return, reduced Sharpe from 1.5855 to
1.1625, increased transactions, and underperformed C1 in every sleeve. It
therefore fails the pre-registered acceptance rule.

The protected fetch client timed out before reading the challenger response,
but the same server request completed all three sleeves and emitted both its
bounded `arm-summary` and `response-ready` records at 120.714 seconds. No retry
was used as a substitute result.

Decision: **reject the correlation-aware challenger and retain C1 unchanged.**
Together with the rejected high-to-price, residual-momentum and
downside-resilience challengers, this closes the authorized low-infrastructure
enhancement review. No tested challenger is eligible for prospective promotion.
Do not merge or deploy any challenger to production.

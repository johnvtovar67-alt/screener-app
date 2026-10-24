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

Status: pre-registered; results pending. **DO NOT MERGE OR DEPLOY TO
PRODUCTION.**

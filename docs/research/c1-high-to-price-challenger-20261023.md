# C1 high-to-price single challenger — 2026-10-23

Owner authorization: start one isolated, non-live C1 thesis challenger without
new infrastructure. It must not change production recommendations, accounts,
provider collection, the frozen Champion, or execution authority.

## Pre-registered hypothesis

For the existing 120-to-20-session formation window, let `P0` be the adjusted
close at the beginning, `H` the highest adjusted high inside the window, and
`P1` the adjusted close at the end:

`log(P1/P0) = log(H/P0) + log(P1/H)`

The challenger substitutes the first, pre-peak component for the conventional
formation return and its cross-sectional momentum percentile. This is one fixed
definition: no parameter grid, alternative window, threshold search, or new
data source.

Source: Büsing, Mohrschladt & Siedhoff, *Journal of Banking & Finance* (2024),
https://doi.org/10.1016/j.jbankfin.2024.107292.

## Isolation and unchanged rules

- existing accepted adjusted daily sessions only;
- existing three sleeves and 25/50/25 accounting weights;
- existing universe, costs, sizing, sector/issuer limits, gap rule, stops,
  holding rules, rank exits, recent-momentum exits, and next-open execution;
- no API route, UI component, account service, provider collector, Blob writer,
  cron, or production option imports the challenger;
- output is explicitly non-executable and cannot authorize a trade.

Historical results may reject the challenger but cannot validate it because the
history has already been inspected. A historical survivor must be frozen and
shadow-tracked for at least 30 prospectively closed trades and 90 calendar days,
with realized costs within 25 bps, no intended-versus-executed divergence, and
no more than 12% sleeve drawdown before any production-policy review.

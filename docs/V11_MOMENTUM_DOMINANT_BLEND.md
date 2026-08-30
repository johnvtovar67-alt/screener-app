# Version 11 momentum-dominant blend

V10 returned 43.44% after modeled costs versus 29.05% for SPY and 38.12% for
QQQ, but only one of three folds produced positive simple alpha. Its matched
simple-momentum control returned 98.73%, while quality-only returned 7.67% and
the transparent bull-cycle/pullback control returned 28.77%. The evidence says
momentum created the return and the balanced quality blend diluted it.

V11 does not discard fundamentals. It freezes one economically motivated
rebalancing of the V10 score before replay:

| Evidence | V11 weight |
|---|---:|
| Medium-term momentum rank | 55% |
| Relative strength versus SPY/QQQ | 15% |
| Fundamental quality rank | 10% |
| Sector-relative quality | 5% |
| Stability rank | 5% |
| Short-term technical condition | 5% |
| Controlled pullback | 5% |

Momentum and relative strength therefore contribute 70%, quality and stability
20%, and entry condition 10%. This is one predeclared thesis, not a parameter
grid. V11 must be reported even if another weighting would have looked better.

The momentum inputs deliberately skip the most recent price burst: the rank
uses 120-session return excluding the latest 20 sessions and 60-session return
excluding the latest five, both globally and within sector. A separate hard
anti-chase gate refuses a new entry when the point-in-time timing record flags
the recent 3/5/10-session path as extended. Next-open gaps above 3% are also
rejected. These rules address late entry without adding a repainting chart
signal or waiting for the entire trend to end.

The remaining lifecycle stays fixed: twelve approximately equal-weight stocks,
five-session rank refreshes, a ten-session minimum hold before rank replacement,
issuer and sector caps, an 18% catastrophic stop, next-open whole-share fills,
12 bps slippage, and cash kept as cash.

V11 is compared with simple momentum, the prior V10 quality-momentum blend,
quality-only, the transparent non-repainting bull-cycle/pullback control, SPY,
QQQ, and 25 deterministic random portfolios. It must beat both indices in most
folds, beat every named control and the random 95th percentile, maintain at
least 80% active-stock exposure, complete at least 30 round trips, produce
positive expectancy and a profit factor above one, and use no benchmark sleeve.

## Evidence status

V11 was created after observing V10 and its controls. Replaying the same dates
can measure the mechanics and development performance of the frozen blend, but
it cannot validate alpha. Even if all numerical development gates pass, V11
remains post-selection evidence until it succeeds on genuinely untouched or
forward data.

The provisional dataset also retains the known current-cohort and survivorship
bias, lacks delisted securities and historical membership, does not certify
fundamental values as revision-safe, lacks complete point-in-time material news,
and uses only 25 rather than at least 1,000 random placebos. No V11 result from
this dataset can automatically change the live recommendation engine.

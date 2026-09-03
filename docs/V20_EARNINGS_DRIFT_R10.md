# V20 / R10 point-in-time earnings-drift batch

R9 established that concentration and replacement stops do not repair the
price-only model's deficit to QQQ in the 2023 growth regime. R10 therefore
adds an economically distinct signal: post-earnings-announcement drift after
a positive reported earnings surprise.

The batch freezes 18 candidates: three surprise/relative-strength blends,
three minimum surprise thresholds and two event windows. A reported event is
not available to the strategy until the first market session strictly after
its vendor date. Portfolios fill at the next open, pay 12 basis points of
slippage, hold residual cash as cash and never use a benchmark sleeve.

All 18 candidates share development restores. Four reach validation and only
one candidate that clears every development and validation gate may reach
audit. Audit cannot select or retune. The separate 1,000-placebo stage remains
deferred unless the audit candidate beats SPY and QQQ, remains inside exposure
and drawdown limits, and produces audit-only Newey-West t-statistics above 3.0
against both indices.

The vendor's historical consensus estimate is not certified as an unrevised
real-time snapshot. R10 can falsify this implementation but cannot by itself
prove future alpha. V11 remains live unless all placebo, prospective and
independent-replication gates pass.

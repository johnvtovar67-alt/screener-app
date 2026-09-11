# Reviewed September 10 baseline transition

The original accepted S&P 500 book is intact (record SHA256
`b47f5e298ed2d985f4a47e5112d117033b229df40f0e7921fed918436b7cf774`).
It has one session, no virtual positions, no fills and a frozen nine-candidate
queue per sleeve. This is a model book, not John's brokerage account.

User-supplied, integrity-checked observation archives:

- `25cf545b17bc9c5e28a700980dd4f67a61dddd25f42d7a45d83b4d1687e2209a`,
  observed September 11 at 21:18:20.157 UTC.
- `f24b487c37b01dbe58e02ec701bb20ac133029b5ce666fe9ed62d9b745885c5c`,
  observed September 11 at 21:33:19.965 UTC.

Both contain all 505 anchors and the same membership receipt. All prior-day
provider fields agree between observations. Relative to the original book,
18 closes, 12 opens, 14 highs, 16 lows and 467 volumes changed. The 18 symbols
are enumerated in `lib/c1BaselineRevisionReview.js`. None is in the original
queue. Eight queued symbols have prior-volume revisions. Current-day BLDR and
XOM volumes changed between observations; candidate signals did not change
after observation timestamps were excluded.

## Accounting basis

This repair does not claim that every change is a dividend, does not infer a
split, and does not retroactively recompute signals with later information.
There were no model positions entitled to an adjustment at this baseline.
Original price bars, signal decisions, observation times and captures remain
unchanged in the accepted history.

For the exact reviewed book and revised prior-day data only, the transition
performs two two-session operational replays with the frozen strategy: one
using original bars and one using revised prior-day OHLCV, retaining original
signals in both. The complete ledgers (including each fill), pending decisions
(including stops), paper-event accounts, paper status and model summaries must
be exactly equivalent. An audit receipt records the prior hash, evidence
hashes, all close differences and an economic-comparison hash. No share or
cash adjustments are applied. Actual uploaded fixtures passed, with comparison
hash `79669946f2458abf9d6c77f8fc0f35fe49c4de8c7c7cc4a1f2157459d50b314e`.
Nine simulated sleeve fills were produced by the existing engine in this
offline check; these are not brokerage fills or executed orders.

Other records, missing anchors, further prior-bar revisions, prior exposure,
affected queued symbols and any economic difference retain the reconciliation
failure. This is a reviewed initial transition, not general corporate-action
support. Future exposed-book adjustments still require separate evidence and
accounting. Normal idempotency, current-session checks, storage concurrency,
archive-before-connect and trading/alpha release gates remain in place.

## Verification

`tools/c1-baseline-reconciliation-regression.cjs` tests rejection boundaries,
immutability, idempotency and parity. Optional paths accept the uploaded book
and observation for the actual fixture check. The ordinary CI step also runs
this regression. No completed historical alpha tests are rerun.

Production collection after deployment remains an operational verification
step. The cron schedule is unchanged and no manual collection is invoked.
Successful model advancement does not certify alpha or verify a private account.

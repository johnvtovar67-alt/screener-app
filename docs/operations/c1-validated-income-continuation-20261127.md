# Validated income and post-exit continuation — November 27, 2026

The owner requests the identified repairs and a reliable normal screener. This
repair preserves the approved C1 policy and all original financial records. It
does not establish an investment edge or authorize a broker transaction.

## Reproduction before coding

Current main and production were both `13025b236606772368da0cfa5c5ad11ad38b8321`.
The canonical read-only readiness endpoint returned HTTP200 with current
November27 evidence and `WAITING_REGULAR_SESSION`; private-account parity and
browser acceptance remained `NOT_VERIFIED`.

Two defects reproduced with fictional facts through real application helpers:

1. The statement parser rejected an ordinary `Cash Dividend` row as unsupported.
2. After a recorded complete allocation-loss exit and approved cash journal,
   separately validated current-opening income changed opening cash. The risk
   helper compared that cash directly with the conserved liquidation receipt,
   returned `post-exit-equity-changed` and withheld that allocation's purchases.
   A signed fee produced the same boundary failure. The historical completed
   journal path already reset once at the next opening before posting that day's
   cash at the close; it did not reproduce the research adapter's prolonged
   stall. Production incidence of either defect is unknown.

The independent reproduction used real adoption, original recorded orders and
fills, statement review and confirmation, approved journal, financial replay,
current opening projection, payment-date close and following opening. No live
account was changed and no provider or broker was called.

## Scoped change

`c1BrokerStatementReview` accepts only the normalized `Cash Dividend` action as
positive P&L. A valid stock symbol, blank/zero quantity and price, zero fee and
positive cents-precision net amount are required. Reinvestment, return of capital,
negative dividend amounts and unknown actions remain rejected. Posting dates and
the original statement evidence are retained; no ex-date, entitlement or fill is
inferred.

Both generated engine risk calls pass their original actual-execution replay
identity. `operationalRiskForSession` uses the existing WeakMap capability only
when its allocation and original cash-unit scale match. Only exact-session
current-opening P&L can explain the difference from the genuine exit receipt.
The once-only reset retains conserved post-exit equity as its reference, then
ordinary current-equity/high-water and12% protection handle income or fees.
Unknown differences, serialized copies, wrong dates/allocations/units, inherited
holdings, missing liquidation proof and unapproved resets still fail closed.
Historical closing events and capital movements do not gain this permission.

No holdings, fills, basis, dates, cash observations, captured stops, historical
losses/peaks, allocation-loss policy, ticker cooldowns, market/event/exposure
checks, source acceptance, normal crons or financial save behavior are changed.
There is no automatic financial POST retry, new recovery form or account
migration. Previously confirmed journal capsules retain their original meaning.

## Release integrity and verification

Only the three affected application hashes change in the release-freeze manifest;
its guard and build hooks are unchanged. The recent-momentum generator and
generated engine change together. A new strict test-only inverse returns all four
changed source files to13025b2 before older source-oracle inverses. All97 existing
fixture bytes and the canonical account engine/generator stay pinned unchanged.

New focused verification covers strict import, real authenticated HTTP
review/confirm/reload, full account continuation for dividends/interest/fees/net
zero postings, conserved original financial facts, next-close continuity and one
reset. A fictional retained offer also exercises real completed-purchase recording,
current projection and close with exactly one fill and one reset; it does not
claim that the fixture's current entry gates authorized that purchase. Separate
capability tests cover copied/missing/wrong-date/allocation/unit
proof, unexplained cash, signed fees,12% loss behavior, duplicate identities,
partial ownership, next-opening timing and capital rejection.

Release requires full build/regression/dependency audit, all four existing CI
jobs on the exact reviewed head, independent review, merged-main checks and
production alias/commit/readiness readback. Browser rehearsal is synthetic;
readiness is not private-account parity, actual broker execution or proof of
alpha. An authenticated owner-account market-open journey cannot be claimed
without that exact evidence.

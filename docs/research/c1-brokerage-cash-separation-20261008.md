# Separate C1 strategy cash from brokerage execution cash

The owner explicitly requested this narrowly scoped enhancement on October 8,
2026, on top of PR #252 / production commit
`5a1a682956add9bdf30e65d77dfe8c3b3a23f0c3`. The motivating balance is
$3,037.90 of C1 strategy cash and $363.36 of actual Schwab cash after Core and
other non-C1 activity. That difference is not a C1 loss or withdrawal.

## Account contract

`continued.actualCash` remains the authoritative ledger calculation. Completed
Account Decision exposes it as `strategyCash`; `actualCash` remains a temporary
compatibility alias with identical economics. The new private account metadata is
`brokerageCash: {balance, observedAt, source: 'manual-broker-balance'}`.

`update-brokerage-cash` accepts a finite, nonnegative balance in cents and an
exact `expectedRevision`. It updates only that metadata and increments the
revision, using the existing strong ETag conditional storage write. It does not
advance saved sessions, refresh context, reconcile the C1 ledger, or change
adoption, records, source hashes, fills, holdings, basis, capital or performance.
The response derives completed analysis without persisting that derivation.

The existing `reconcile-cash` operation is retained for small, factual C1 ledger
discrepancies, including its $5 bound. It is not the Portfolio broker-balance
editor and must never account for Core or other external cash use.

## Cash freshness and execution

A manual balance is current only on its observed Eastern calendar date, with
no future timestamp. This requires the owner to reconfirm the spendable balance
each day and after external activity. Missing, invalid or stale metadata gives
zero new-purchase authority without changing completed C1 signals or exits.

The execution boundary caps aggregate new-buy cost at
`Math.min(strategyCash, brokerageCash)`. The raw strategy planner, historical
sleeve books and strategy sizing remain unchanged. Unrecorded sale projections
do not create spendable brokerage cash. Recorded C1 fills after the observation
adjust the effective brokerage balance exactly once, including actual fees.
A newer manual observation already includes earlier fills, so those proceeds
are not added again. Current decision fields include the effective numeric
`brokerageCash`, `executableCash`, and freshness/reason fields.

Actual buy recording separately validates quantities and cash at execution time,
including price and fees. Historical session recording cannot bypass the check.
Intraday price/fee corrections use captured original cash authorization for new
buys; they cannot introduce unverified proceeds or exceed the cash cap. Existing
historical fills remain immutable accounting facts and replay normally even when
an old account has no brokerage metadata.

## Portfolio behavior

The Portfolio page has a dedicated Update Brokerage Cash action and displays all
three cash values. Cash differences do not create an entered-holdings mismatch.
Security shares, average costs and purchase dates retain their existing exact
matching rules and tolerances. Legacy CASH representations are isolated behind
a helper and excluded from normal holding displays. Core MSTR/MRNA holdings
remain outside C1 sleeve ownership. Account adoption retains its explicit initial
strategy cash input, separate from later brokerage cash observations.

Qualified Buy signals remain visible when execution cannot fund a new purchase.
The UI explains insufficient broker cash as an execution restriction, preserving
Opportunities, Watch and Portfolio analysis.

## Verification and release guard

The brokerage-specific regressions cover metadata-only writes and concurrency,
the production balance example, safe missing/stale migration, Core isolation,
visible completed signals and exits, aggregate buy caps, actual fees, recording
paths, and proceeds counted once. The production-baseline parity regression
pins the unchanged C1 rule/planner source and compares synthetic account analysis,
raw planning and execution against `5a1a682`. It runs offline as part of the
complete suite, without rerunning completed historical experiments.

Only application manifest entries affected by this explicit owner authorization
are updated. The release-freeze checker, build hooks and canonical integrity
checker remain enforced. Release requires the complete regression suite, trade
simulation, production build, GitHub CI and Vercel preview to pass. Signed-in
production verification requires an existing authorized app session; the owner's
sync key must not be requested or retrieved for testing.

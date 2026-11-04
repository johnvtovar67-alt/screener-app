# C1 stop verification and prospective 10% initial Swing stop

## Owner authorization and release boundary

The owner explicitly authorized November 3, 2026 implementation, focused PR,
full existing build/regression and three browser gates, merge and deployment
of two changes: repair stop verification/presentation and set initial loss
stops to 10% for new Swing ownership after release. This is the owner's risk
policy choice, not evidence of superior investment returns. The owner retained
momentum, profit protection (including 12% peak-gain activation), selection,
sizing and four-position capacity. No existing open stop may be changed until
the owner approves a concrete read-only proposal. No historical fills,
accepted sessions, stop levels or completed performance may be rewritten.

Baseline main, canonical deployment and canonical /api/version agree on
`7770a9b08fe9d974ebbdeec05a47a1fd9c354389`; deployment
`dpl_3P83U9mHBaK4ahnBT9UZ3VHRm8k5`. AGENTS.md was read. No account data,
credential or secret retrieval, live financial request, backtest, optimization,
completed experiment, monitoring restart or schedule change is included.

## Stop verification

The existing held-quote acquisition and strict FMP observation verification
remain authoritative for a new current stop signal. Missing evidence must say
STOP STATUS UNVERIFIED. A displayed apparent breach discloses the specific
verification limitation and observation timestamp. An explicit Verify stop now
action obtains held-price evidence without waiting on unrelated purchase
screening, with ownership, revision and stale-response fencing. The complete
account/screen refresh continues to publish atomically. Current verified
regular-session prices at or below a sleeve stop display SELL and its affected
quantity without holding-age or momentum-confirmation waits.

Expiry, newer verified recovery and already accepted pending exits retain their
existing behavior. No continuous polling or permanent intraday trigger latch
is introduced. The app provides manual instructions; it submits and maintains
no brokerage stop order. Actual shares, fees, cash and fills remain subject to
the existing manual confirmation and reconciliation controls.

## Prospective policy and immutable history

New prospective execution plans capture the initial Swing stop policy. Old
plans without that policy retain their existing stop semantics. Original
historical options, seeds, frozen benchmark, accepted captures and performance
records remain unchanged. A new ownership period uses its captured 10% policy;
replay uses reconciled saved evidence, not today's global configuration. Later
additions retain an older holding's stop. Partial opening fills retain the
initial ownership's weighted-price semantics. Core is unchanged. Gaps,
slippage and manual execution can produce a loss greater than 10%.

## Existing holdings: incomplete read-only proposal, no approval requested

Current private account stop books and current verified quotes are unavailable
through the authorized evidence used here. No actual brokerage quantities,
bases or transactions are included in this repository report. Prior chat trade
arithmetic is insufficient to establish current reconciled sleeve stop levels.
No existing holding is migrated or activated by this release.

An approval-ready proposal must show each currently reconciled sleeve's actual
stop and owned quantity, proposed `max(existingStop, applicableBasis * 0.90)`,
and a dated verified regular-session quote with breach status. A later Add may
not share the original stop basis, so aggregate CSV basis cannot substitute for
those saved books. No activation, account record or migration is implemented.

## Release verification

Focused tests, complete unchanged regression/build requirements and all three
real Home/App browser rehearsal jobs are required on the exact release head.
Only the authorized application freeze entries and this instruction are updated.
The release checker and build hooks remain enabled. Canonical integrity and the
release-version assertion are updated explicitly for this release identifier;
the checks are retained. Original economic/source oracles remain pinned, with
exact inverse seams where authorized application behavior changes affect a
historical-source comparison. Synthetic tests do not establish return advantage
or private-account/brokerage parity. Final exact-head results belong in the PR.

## Rollback constraint

Before any new-policy fill exists, source rollback is uncomplicated. After a
10%-policy fill is recorded, any rollback reader must retain captured-policy
replay and management of that ownership. Returning to a reader that ignores
that policy could reconstruct a looser 14% stop. Disable new issuance if needed
while preserving policy-aware replay; never delete or rewrite original plans,
fills or account records to accommodate a rollback.

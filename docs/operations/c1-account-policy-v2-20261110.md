# C1 account policy v2

The owner explicitly requested this versioned behavior revision on November 10,
2026. It starts from main/production commit
095da15d8d02cdecff5725f1c206047b48e5def4. The request authorizes the three changes
below and a release after all required checks pass and the operational risk
decision is settled. It does not authorize trades, fabricated activity, account
balance edits, credential acquisition, production job invocations or monitoring.

## Activation and unchanged economics

Activation is the November 11, 2026 exchange session; its preceding completed
source session is November 10. Earlier recorded decisions and fills replay under
their original rules. The new policy derives facts from immutable reconciled
records rather than rewriting holdings, cash, cost basis, stops or performance.
Ranking formulas and the separate holding-exit rank thresholds remain unchanged.
Four distinct Swing stocks remains the account capacity; an allocation is not a
distinct investment account or an additional stock slot.

This is the proposed cutover. If release is
deferred beyond it, choose a future exchange-session cutover and rerun the exact
head checks before release. Existing accepted observations are never rewritten
to add support metadata. A legacy capture missing required universe evidence
stays explicitly incomplete until a normal, newly accepted complete capture
provides that evidence; activation cannot manufacture a complete market book.

## Completed investment losses

The holding period runs until aggregate ownership reaches zero across all three
allocations. Realized proceeds, remaining cost basis, prior partial sales and
all buy/sell fees determine the combined result. A verified net losing completed
period restricts that name everywhere for the longest existing 10/15-session
duration among participating allocations. The original completed-loss date
determines expiry, including exchange holidays. Re-reading or activating v2 does
not restart it. A loss in just one allocation does not override a combined profit.
Owner-recorded actual exits count independently of the order's reason label.

Adopted remaining basis alone does not prove pre-adoption partial-sale proceeds.
Such uncertainty is labelled for that name rather than asserted as a verified
full-period loss, and does not prohibit unrelated stocks. Existing positions are
not sold merely because a newly applicable restriction blocks further purchases.

## One stock action and exposure authority

Reconcile allocation recommendations before publication and execution authority.
An unconditional exit blocks same-name purchases throughout the account. Keep
conditional standing protective stops distinct and never net away required exits.
Permitted quantities aggregate into one instruction with an allocation breakdown.
Publication surfaces carry the same authoritative version. Actual brokerage cash
is funding authority; hypothetical sale proceeds cannot fund a purchase.

Retain each allocation's existing sizing/exposure checks, and apply account-wide
distinct-stock, issuer and sector checks to aggregate ownership. The aggregate
sector dollar ceiling sums existing allocation equity budgets at their original
50%/50%/40% sector limits. Classification/mark evidence is required; missing data
cannot manufacture room. The account position ceiling remains one third.

## Complete supported-universe scan

Remove old-ranking top-nine continuity priority and first-nine qualified purchase
truncation. Apply known account bans and operational disqualifications before
selection, issuer and sector slots. Continue lower in the same ranking when a
leader fails. Provider acquisition uses bounded batches and cached continuation.
An interrupted or incomplete scan is explicitly incomplete; it is not evidence
of no opportunities. Do not publish mixed frames or stale scan owners.

## Operational risk decision: approved November 10, 2026

The earlier allocation cooldown also gates the portfolio-loss circuit. Removing
only the buy veto suspends portfolio protection while replacements enter;
clearing the old circuit timer against an already breached peak causes repeated
liquidations. Neither outcome is an acceptable hidden implementation choice.

The owner explicitly approved `next-open-after-verified-liquidation`: preserve
the historical peak, complete and reconcile the existing full liquidation, then
establish a separate operational reference at the next exchange opening (no
earlier than activation). Ratchet it with the existing opening-equity logic and
retain the 12% liquidation threshold. Missing/partial liquidation evidence does
not authorize a reset. Open holdings at activation keep continuity. New loss
episodes need new completed evidence; an old receipt cannot repeatedly rearm it.

This resets the operational reference earlier than the old broad 10/15-session
wait and permits loss cycles closer together. The owner approved that consequence
and required one reset per completed episode, no repeat reset on retries/reloads
or later openings, no reset for incomplete exits, and no simultaneous Buy/Sell
instruction for the same name. Approval covers the software policy and does not
authorize brokerage execution or fabricated fills. Tests establish software
behavior and no investment-return benefit.

## Integrity and verification

Focused coverage runs the real application modules and isolated API/DOM paths:

- `c1-account-stock-cooldown-regression.cjs`: whole-account completed periods,
  partials, fees, combined profits, adopted-history uncertainty, original clocks
  and exact exchange-session expiry.
- `c1-account-actions-regression.cjs` and `c1-account-policy-auth-regression.cjs`:
  actual handler loss/replacement flow, one action version, conflicting exits,
  sequential actual tickets, global limits and forged/stale authority rejection.
- `c1-operational-risk-epoch-regression.cjs` and
  `c1-operational-risk-engine-regression.cjs`: pending decision continuity,
  trusted completed liquidations, multiple risk epochs, chronological same-day
  buy/sell/reentry periods and unchanged financial facts.
- `c1-account-universe-regression.cjs`,
  `c1-account-universe-source-regression.cjs`,
  `c1-account-purchase-selection-regression.cjs` and
  `c1-account-budget-continuation-regression.cjs`: ranks 10/25 and below, source
  coverage, rejected leaders releasing slots, whole shares, minimum trades,
  global issuer/sector limits and the fourth distinct account position.
- `c1-universe-provider-scan-regression.cjs` and
  `c1-scan-continuation-regression.cjs`: bounded full-universe collection,
  missing current evidence, incomplete/expired/stalled scans, competing owners,
  all-candidate continuation and no replay of financial POSTs.
- The normal browser job includes an additional v2 Home/App case using the real
  handlers at desktop/mobile widths, shared account action versions and missing
  current-event evidence. All earlier browser cases and all three jobs remain.

Browser/API fixtures exercise the actual approved server policy. Explicit
pending/forgery tests use isolated test modules, never a production environment
switch or a browser approval flag. The owner-approved decision remains explicit in
`lib/c1OperationalRiskDecision.js`. The exact v2 source-inverse fixture adds
prospective changes to the existing oracle chain; earlier fixture hashes and
economic assertions are unchanged. Synthetic results establish behavior only.

Update only release-freeze entries affected by this authorized revision, including
new application modules. The guard remains active. Canonical integrity is updated
to require this release identifier and all four new policy feature markers while
retaining previous required markers. This guard expectation change is explicit,
not a bypass. New exact source inverses preserve earlier source/economic oracle
hashes and their assertions; the new behavior has separate integration coverage.

Required before merging: the full build/audit/regression job and normal,
actual-screen and lifecycle-client browser jobs must all pass on the exact head.
After release, main, deployment Git SHA and canonical /api/version must agree.
Available passive evidence may confirm operation; no owner activity is fabricated.

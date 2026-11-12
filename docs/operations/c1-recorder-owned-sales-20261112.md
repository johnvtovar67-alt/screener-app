# Completed-session recorder: actual ownership only — November 12, 2026

The owner supplied the refreshed production screen after the C1 data repairs
and explicitly states that OKTA was never an issued C1 Buy candidate and was
never purchased. The completed-session dropdown nevertheless offered OKTA stop
candidates. This continues the same request to make current C1 decisions and
blockers truthful without manufacturing trades or weakening policy.

## Reproduced cause

`projectC1AccountSession` computes hypothetical proposed purchases, applies them
to a separate projected book and appends possible stops for those projected
positions. That projection is not a broker fill or actual ownership.
`C1AccountActivity` correctly hid unverified reconstructed Buy rows, but retained
all non-Buy rows. Their dependent stop/sale proposals therefore leaked into the
actual-activity recorder and misleadingly implied that unpurchased shares existed.

## Repair boundary

The recorder's presentation selector must derive supported sell/stop quantities
only from the same allocation's actual opening holdings plus explicitly entered
actual purchase fills from a verified recordable plan, minus entered sales.
Never derive ownership from proposed purchases or projectedBooks. Hide sell
candidates with no supported actual shares and cap displayed remaining quantity
to the supported ownership. Reject locally entered sale quantities beyond that
cap. Preserve real held-stock sale/stop recording and partial-fill behavior.

The session itself still needs the owner's truthful activity confirmation.
An OKTA non-purchase does not establish that no other orders filled. Do not
confirm a session, record a fill, create an OKTA holding, or alter any account,
cash, purchase, ownership, model, stop or historical record on the owner's behalf.
The actual ledger and execution validators remain independent authority.

Only components/C1AccountActivity.js and its affected release-freeze entry change,
with this explicit defect authorization. Trading policy, current selection,
entry/event/account/timing/execution rules, plans, checked trade quantities, records, cron,
guard implementation, CI workflow and build hooks remain unchanged. Add an exact
inverse against fa4acd5 and preserve all earlier source/economic fixtures/pins.
Require focused real-form/pure tests, complete build/audit and all four CI jobs
on the exact reviewed head before merge. Verify the canonical deployment and
actual owner recorder; do not mistake hypothetical suggestions for verified fills.

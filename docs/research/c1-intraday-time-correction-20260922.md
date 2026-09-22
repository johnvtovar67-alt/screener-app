# C1 intraday execution-time correction — 2026-09-22

## Reported failure

The owner saved the completed MPC purchase with an incorrect execution time. The account had no supported way to correct a saved ticket without attempting a duplicate trade.

## Repair boundary

Account settings now lists each saved same-day trade and permits correction of its execution timestamp only. The correction updates the immutable broker ticket and every sleeve allocation derived from that ticket together, then reruns normal reconciliation against the original saved opening plan. Symbol, side, shares, price, fee, cash, cost basis, opening evidence and order identities cannot be changed by this operation.

The replacement time must be a real timestamp from the same C1 session, no later than the current time, and within the NYSE regular session including early-close handling. Revision and conditional-storage checks prevent stale devices from overwriting newer activity.

## Verification

Regression coverage proves direct and API corrections, rejection of stale and after-hours corrections, preservation of the prior immutable revision, exact account-economics parity, and visibility of the correction control for saved trades.

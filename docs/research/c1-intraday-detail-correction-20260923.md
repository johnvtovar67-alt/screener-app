# C1 intraday trade-detail correction — 2026-09-23

## Owner evidence

The saved completed-trades receipt showed one transaction: a sale of 75 FCX shares recorded at $83.72 on September 22. The owner reported the actual broker execution price as $73.72. The receipt did not contain an MPC purchase, despite earlier attempts to enter it.

The existing correction control changed only the execution timestamp. It could not repair a mistyped broker price or fee, so the C1 cash ledger and entered portfolio remained different.

## Authorized repair

An existing same-day completed-trade ticket may now correct its broker-reported execution price, fee, and regular-session timestamp. The correction replays the original saved opening plan and updates the account revision atomically.

The following fields remain immutable:

- ticket identity;
- symbol and side;
- completed share quantity;
- sleeve allocation and original plan evidence.

No new trade, recommendation, ranking, sizing rule, stop rule, or provider input is created. Correcting price or fee changes cash only by the exact economic difference from the previously saved broker facts. A stale revision, missing ticket, invalid price or fee, or non-regular-session timestamp is rejected.

## User-visible behavior

Saved completed trades expose **Correct details**. The form preloads price, fee, and time, states that shares are locked, and saves the correction through the authoritative C1 account endpoint. After confirmation, the local portfolio is rebuilt from the corrected C1 decision and synchronized. The legacy timestamp-only API operation remains supported.

## Regression coverage

The intraday regression verifies:

- price, fee, and time update on both the saved ticket and its allocated fills;
- transaction identity, symbol, side, and shares remain unchanged;
- corrected fees remain conserved across allocations;
- corrected sale cash changes by the exact price-and-fee difference;
- invalid values, after-hours times, and stale revisions fail;
- timestamp-only correction remains backward compatible;
- the rendered control is labeled **Correct details** and discloses locked shares.

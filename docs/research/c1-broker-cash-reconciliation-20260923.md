# C1 broker cash reconciliation — 2026-09-23

## Owner evidence

The broker showed $341.86 in cash after two completed trades:

- sold 75 FCX at $73.72, with a $0.12 industry fee (net proceeds $5,528.88);
- bought 27 MPC at $403.38, with no commission (net debit $10,891.26).

The saved C1 account correctly retained both trades but reported $341.34. The ledger therefore began $0.52 below the broker balance:

`$5,703.72 + $5,528.88 - $10,891.26 = $341.34`

The broker-confirmed balance implies opening cash of $5,704.24. The $0.52 difference is not a securities transaction and must not be represented by changing either trade.

## Repair contract

Add an append-only `c1-broker-cash-reconciliation-v1` event that records the prior computed balance, broker-confirmed balance, exact adjustment, source session, account revision, and timestamp. Replay applies the cumulative cash adjustment only after reconstructing and validating all immutable fills.

The operation:

- requires the current account revision;
- accepts cent-denominated balances only;
- limits balance-only reconciliation to $5, requiring transaction-level evidence above that amount;
- cannot change holdings, shares, average costs, opening dates, stops, peaks, fills, or the adopted opening record;
- remains part of future account replay and opening plans.

This fixes the cash-only gate without resetting the account or fabricating a deposit, withdrawal, purchase, or sale.

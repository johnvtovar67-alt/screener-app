# C1 high-to-price historical comparison run — 2026-10-23

Owner authorization: test the already pre-registered high-to-price challenger
immediately rather than waiting for the prospective 30-trade/90-day promotion
gate.

This branch adds one temporary preview-only read endpoint. It restores the
existing accepted point-in-time S&P 500 dataset from its exact private manifest
and compressed chunks, verifies their ordering and dates, and runs the frozen
Champion and single Challenger through the same simulator for 2023-01-04
through 2026-09-01.

The historical comparison starts each sleeve from the simulator's standard
normalized $100,000 cash book. It does not synthesize a current-account
adoption record; those records require separate dated opening evidence and are
not needed for a paired strategy replay.

Before execution, the transformation was hardened so fresh-entry and
holding-only signal rows receive one consistent dated Challenger rank. This
prevents a held stock from retaining a Champion rank while candidates use the
Challenger definition.

The endpoint:

- returns 404 in production;
- runs the paired simulation in a memory-bounded sequence (Champion first,
  then Challenger on the same disposable private restore) rather than making
  six full copies of the accepted replay;
- performs no provider acquisition and no storage write;
- exposes no holdings, account records, orders, credentials, or raw dataset;
- returns only aggregate offline research metrics;
- cannot authorize or change a recommendation or trade.

After the bounded historical result is captured, the temporary endpoint must
not be merged into production. A weak result rejects the challenger. A survivor
still requires the previously fixed prospective evidence gate before any C1
policy review.

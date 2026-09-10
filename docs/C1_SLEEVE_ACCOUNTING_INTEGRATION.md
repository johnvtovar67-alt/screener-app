# C1 accounting integration checkpoint — September 10, 2026

The historical model combines three independent portfolios at initial weights
25% base, 50% cooldown15, and 25% sector40. The live portfolio stores aggregate
share counts, average cost, open date and last-trade date. These fields cannot
establish how each historical sleeve acquired its interests or used its cash.

`lib/c1SleeveAccounting.js` is a model-only foundation. Each sleeve owns its own
cash and virtual shares. Explicit fill events include identity, session, sleeve,
symbol, side, quantity, execution price and fee. Duplicate identical events are
idempotent; changed duplicates, oversells and borrowing another sleeve's cash
are rejected. Restore replays events instead of trusting cached balances or
imported authority flags.

The whole-share proposal aggregates virtual interests before rounding. It nets
each symbol once, estimates sell and buy costs, and reports insufficient funding
without resizing or authorizing any order. Its output is always non-executable.
Execution prices in fills already include their execution slippage; the separate
proposal estimates slippage for hypothetical orders only.

This module is not connected to production portfolio recommendations. It does
not establish the suitability of the user's NTRA, FCX or STX purchases. It does
not restore C1 authority or create prospective performance evidence. It accepts
no external deposits, withdrawals or automatic rebalance between sleeves.

Historical accounting reconciliation completed:

- Reconstructed the three frozen runs in each universe using the original
  simulator and configuration source, both checked by SHA-256 identity.
- All 976 trades and 5,508 daily cash, marked-equity and position-count checks
  passed. Maximum absolute difference was $0.002499, within the original
  simulator's cent-rounded export tolerance.
- Nasdaq input checksums passed for all six chunks. The older S&P archive has
  no chunk hashes; compressed size, decompression and session ranges were
  checked for all 24 chunks. This remains a source-integrity limitation.
- Compressed trade/mark fixtures are retained in `tools/fixtures`. Required
  build/verify checks replay those fixtures through the current accounting
  implementation. Receipts are in `docs/research/c1-*-ledger-parity.json`.
- This is reconstruction from previously inspected frozen data, not an
  untouched holdout, new performance evidence or broker-fill verification.

Remaining integration work:

- Keep model sleeve history separate from the user's brokerage transaction
  history. Existing aggregate holdings must never be assigned invented fills.
- Add validated persistence and concurrency control for model events before
  exposing the ledger to live services.
- Integrate signal retention, sleeve cooldowns and actual fill reconciliation
  before enabling any recommendation path; unchanged promotion gates still apply.

Run `node tools/c1-sleeve-accounting-regression.cjs` for accounting regressions
and `node tools/c1-historical-ledger-regression.cjs` for full fixture parity.
Archived replay receipts are retained on the `docs/c1-replay-evidence` branch;
those earlier receipts prove historical reproducibility, not independent
prospective validation. The new receipts establish accounting parity only.

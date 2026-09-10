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

Remaining integration work:

- Feed the frozen simulator's actual fill stream through the same accounting
  module and compare every cash/position checkpoint to the archived simulation.
- Keep model sleeve history separate from the user's brokerage transaction
  history. Existing aggregate holdings must never be assigned invented fills.
- Add validated persistence and concurrency control for model events before
  exposing the ledger to live services.
- Integrate signal retention, sleeve cooldowns and actual fill reconciliation
  before enabling any recommendation path; unchanged promotion gates still apply.

Run `node tools/c1-sleeve-accounting-regression.cjs` for accounting regressions.
Archived replay receipts are retained on the `docs/c1-replay-evidence` branch;
those earlier receipts prove historical reproducibility, not this module's
full historical parity or independent prospective validation.

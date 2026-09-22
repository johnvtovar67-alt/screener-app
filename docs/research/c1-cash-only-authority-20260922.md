# C1 cash-only authority repair — 2026-09-22

## Reported defect

After a completed FCX sale and same-day MPC replacement purchase were recorded,
the entered brokerage holdings contained NTRA, DELL and MPC, but the remaining
cash balance differed from the saved C1 account. The portfolio page replaced the
decision on every Swing holding with the same generic account-mismatch warning.

## Cause

The client used a single whole-account equality check as the authority gate for
each individual holding. A cash-only difference therefore erased otherwise
valid holding decisions even though the saved C1 share counts, costs and dates
could still match. The same strict gate is appropriate for new purchases because
their checked quantity depends on available cash; it is not appropriate for
displaying existing-position hold and exit guidance.

## Repair

- Classify the account differences already produced by the read-only comparison
  as holding differences versus a cash-only difference.
- Continue to suppress all new-purchase plans until the entire account matches.
- Preserve the saved C1 decision for existing holdings when cash is the only
  mismatch.
- State both cash balances and explain that holdings remain active while new
  purchases are paused.
- Tell the owner not to overwrite the brokerage balance merely to match C1; the
  missing trade, fee, deposit or withdrawal must be reconciled factually.

No holding, cash value, fill, account record, strategy rule, sizing rule or
provider input is changed by this repair.

## Verification

`tools/c1-ui-authority-regression.cjs` now includes a cash-only mismatch and
requires the existing holding to retain its C1 decision while a share mismatch
continues to produce Review.

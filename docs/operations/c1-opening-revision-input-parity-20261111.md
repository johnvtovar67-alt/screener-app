# Account-opening revision input parity — November 11, 2026

## Observed failure

The owner screenshot shows a changed selection awaiting current account/opening verification, with purchases paused after the opening review timed out. The normal production log at 2026-11-11 14:58 UTC records a sanitized opening-price revision difference in the order symbol. It does not expose account values or symbols.

These are separate conditions: a long-running opening review can reach its 90-second client deadline, and a completed review can reject a price-basis replay when the replay omits current execution inputs.

## Reproduced defect and repair

After the November 11 account-policy activation, the original plan can include the current account policy and executable brokerage cash. The repeat-verified prior-close comparison rebuilt its plan with ranking/account history and funding/capacity flags but omitted those two inputs. That could change the order queue and make a valid unchanged-account comparison fail closed.

Pass the same account policy and available brokerage cash used by the original plan into both revised-price replays. Preserve the source inputs, account records, existing ranking, purchase authority, stops, quantities, safeguards, current quote validation, and no-write behavior. Legacy plans continue to use their existing defaults.

## Verification

The focused regression exercises the November 11 activation with an observed current brokerage-cash balance and a repeat-verified correction to a held name. It requires the revised comparison to preserve account policy, orders, books, funding/capacity contracts, and zero writes. A separate exact inverse checks both changed application sources against their prior frozen blob identities. Existing authority and diagnostic source inverses are applied after this inverse so earlier oracle pins remain intact.

This repair does not address the independent 90-second opening-review timeout and does not establish live account verification. Release requires the full build/regression and all three browser jobs on the exact reviewed head, followed by ordinary deployed owner-screen verification. No private account route is used as a health canary; no account or market history is written.

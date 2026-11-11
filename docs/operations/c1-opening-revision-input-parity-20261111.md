# Account-opening revision input parity — November 11, 2026

## Observed failure

The owner screenshot shows a changed selection awaiting current account/opening verification, with purchases paused after the opening review timed out. The normal production log at 2026-11-11 14:58 UTC records a sanitized opening-price revision difference in the order symbol. The same morning's timing log shows 241 symbols in the opening scan; the code processes only 32 dated anchors per continuation. It does not expose account values or ticker symbols.

The two failure paths are distinct. The 241-symbol opening-anchor scan needed eight 32-name continuations, putting completion close to or beyond the 90-second client deadline. Separately, a completed review could reject a valid price-basis replay when it omitted current execution inputs.

## Reproduced defect and repair

After the November 11 account-policy activation, the original plan can include the current account policy and executable brokerage cash. The repeat-verified prior-close comparison rebuilt its plan with ranking/account history and funding/capacity flags but omitted those two inputs. That could change the order queue and make a valid unchanged-account comparison fail closed.

Pass the same account policy and available brokerage cash used by the original plan into both revised-price replays. Increase only the opening-anchor continuation batch from 32 to 64; retain the 32-name event-verification batch, eight workers, quote batching, request deadlines, and complete-universe requirement. This reduces a 241-name anchor scan from eight continuations to four without truncating candidates. Preserve source inputs, account records, ranking, purchase authority, stops, quantities, safeguards, current quote validation, and no-write behavior. Legacy plans continue to use their existing defaults.

## Verification

The focused regression exercises the November 11 activation with an observed current brokerage-cash balance and a repeat-verified correction to a held name. It requires the revised comparison to preserve account policy, orders, books, funding/capacity contracts, and zero writes. The real opening provider regression now verifies 205 symbols in four bounded anchor continuations, retains complete evidence, and confirms the event-verification batch remains 32. Exact inverses check all three changed application sources against their prior frozen blob identities; existing authority and diagnostic source inverses remain intact.

The timeout fix reduces the number of account reload/replay cycles but does not claim a measured production completion time or establish live account verification. Release requires the full build/regression and all three browser jobs on the exact reviewed head, followed by ordinary deployed owner-screen verification. No private account route is used as a health canary; no account or market history is written.

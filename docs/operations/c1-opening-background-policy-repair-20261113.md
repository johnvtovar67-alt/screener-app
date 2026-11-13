# Preserve opening authority when backup explanations change

The November 13 owner request authorizes a behavior-preserving repair of the
failed live C1 opening review. The diagnostic release confirmed the reproduced
failure class in production before this acceptance repair was implemented.

The opening verifier replans against repeat-confirmed adjusted closing prices
and compares both opening-price and current-price trading authority. Its policy
object also contains rejection explanations for the full supported universe.
A changed explanation for an unused backup caused the entire review to fail,
even when actual orders, selected candidates, holdings and limits were identical.
The concise purchase cards then hid that failure behind generic verification
copy. This was a failed review, not evidence of a valid no-Buy session.

`lib/c1OpeningPlanComparison.js` retains the existing comparison first. Only a
previously rejected comparison may use the new narrow path: both plans require
complete dated source, quote, event and account evidence; each changed symbol
must be an unselected Watch backup in both plans; only known negative purchase
block reasons may differ. Held, ordered, blocked-order, selected, eligible,
account-action and prior intraday-order symbols remain protected. Removing only
those changed background keys from comparison copies must recover the exact
existing authority comparison. Every other policy field and unknown future
field, account identity, action version, order, quantity, book and limit remains
in the comparison. The returned plan retains its real revised explanations.

`lib/c1OpeningPriceReview.js` records the exception honestly in an explicit v4
receipt, with separate opening/current-price authority and background-policy
comparison proofs. Existing accepted v2/v3 paths and validators remain intact.
Malformed or inconsistent proofs fail closed. Original financial records and
historical inputs are preserved; the repair never creates fills or orders.

`lib/c1DecisionCopy.js` maps known opening failures to fixed, specific plain
language. `components/C1AccountOpportunitiesView.js` uses that same explanation
in the shared Watch banner. Individual Watch reasons remain intact. No provider
error values, account identifiers or stock names are interpolated by the new
concise failure copy. Failed verification remains distinct from a checked
zero-order result, missing evidence, stale cash or market closure.

The full-universe account-execution reproduction covers unchanged successful
outputs, recovered background-only differences, genuine order-change rejection,
protected/unknown/incomplete evidence negatives, receipt tampering and unchanged
account bytes with zero writes. The actual screen producer and owner-view
regression covers checked Buys, genuine no-Buy gates, missing events, stale cash,
specific failures and every Watch row. Browser coverage exercises the real
comparison through the normal Home/App journey at desktop and mobile widths.

Only these four application freeze hashes and repair authorization metadata are
updated. Exact source inverses preserve all published historical oracle pins.
Guard, build hooks, CI jobs, ranking, position capacity, execution, timing, events,
funding rules, account history and normal crons remain unchanged. Full local
build/regression and all four CI jobs on the exact reviewed head precede merge.
Production identity and the signed-in normal opening journey must then be
verified; a successful deployment alone does not certify purchase eligibility.

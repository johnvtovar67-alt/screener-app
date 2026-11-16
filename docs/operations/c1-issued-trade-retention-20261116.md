# Issued Buy/Add retention and completed-fill recovery

The owner reported an executed Add disappearing from today's completed-trade
selector after refresh. Current production derived that selector from remaining
current purchase authority, and opening reviews did not persist an issued offer.
A changed event, price, account or opening review could remove the offer before
the owner recorded the real fill. This is a software/accounting defect, not
evidence that the original trade was filled, correctly sized or profitable.

The November 16 owner instruction authorizes retaining issued recommendations
and repairing completed-trade entry. Final provider-verified, account-capped
Buy/Add offers now receive a private saved-account log entry before the ready
response is returned, prospectively from November 16. Repeated identical offers are deduplicated. Retention
appends recommendation metadata only: it does not advance account revision,
persist derived carry records, infer a fill or change existing financial data.
Conditional storage remains mandatory; a failed retention write cannot publish
a new checked Buy response. Normal analysis GET remains read-only. An explicit
opening review may now save issued recommendation metadata.

The real recorder presents a retained issued offer independently of current
execution authority. Only owner-confirmed filled shares, price, fee and time
create a receipt and update holdings/cash. Remaining quantities subtract actual
recorded buys; alternative historical allocation offers cannot be combined into
a larger order. The recorder uses one coherent retained issuance and the original
allocation quantities, and rejects an offer that postdates the actual fill.
Retained entries are accounting evidence, not current permission to buy. Older
unrecorded offers remain visible in a dated disclosure in Account settings.
Prior-session recording retains the actual execution date when no later
financial record has been finalized. If a later record already exists, the entry
shows the exact historical-reconciliation blocker and cannot replace it. Stored
issuance history is retained; session responses omit unused repeated raw history.

Legacy additions that predate retention have no verified original issuance.
Recovery is limited to a continuously held stock in an existing allocation.
The owner must confirm the actual fill and its recovery attribution. For holdings
spanning allocations, an optional explicit button proposes an attribution using
existing holding proportions, followed by owner review and confirmation. This
proposal is not represented as the missing original order. The old shares,
purchase dates and stops are preserved; only the new confirmed fill changes
quantity, weighted cost and cash. No original completion target is invented.
Pre-trade authorization and broker cash are not retroactively certified for a
legacy fill; a later cash observation is not debited twice or fabricated as an
earlier observation. Future entry, event, stop, cooldown, funding, exposure and
capacity checks remain unchanged.

Release changes are limited to the recorder, account API, two retention/recovery
modules, explicit accounting-evidence validation and rebasing, safe validation
messages, and preservation of an absent target for accounting-only Adds. The
freeze manifest updates only those application files. The historical source and
economic oracle pins remain unchanged, with an exact new source inverse for the
scoped actual-fill replay addition. The mechanical generator reproduces that
exact target-preservation seam. No build hooks, CI jobs or cron are relaxed.

Verification must cover the real form, handler and completed/next-session ledger
replay using fictional fixtures; storage failure; duplicate/conflicting receipts;
withdrawn/expired reviews; unchanged prior financial records, dates, stops and
targets; and post-close recording after the close was published. All four
required CI jobs must pass on the exact release head. Synthetic checks establish
software behavior only. A deployment is not private-account recovery: the owner
must confirm the saved actual receipt and resulting holding on the deployed app.
No private account or brokerage details belong in this repository.

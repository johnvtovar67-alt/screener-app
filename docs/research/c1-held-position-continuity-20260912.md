# Existing holding continuity repair

The private account adapter previously imported outside-index holdings with
price and stop coverage only, and imported balances without the original
purchase-stage context. Consequently a previously recommended holding could
show a price-only review while its two-step entry was lost from the explanation.

The repair adds a private, dated held-stock momentum review against the accepted
index reference inputs using the existing momentum formula, eligibility rules
and tie break. It uses one bounded adjusted-history request per outside holding
on account refresh, validates 253 consecutive bars and exact agreement with the
accepted latest OHLCV, and retains source identity, features, rank and history
hash. Verified reviews participate in the existing minimum-age rank-exit rule.
Failure leaves price/stop review explicit. Neither index membership, index entry
signals, original index records nor frozen strategy options change.

An authenticated purchase-context import records owner-confirmed purchase dates,
shares, costs and half/full entry status separately from actual execution fills.
It validates against adopted balances, uses the existing audited date correction
where necessary, retains prior context, and is idempotent. The import never
infers fees, transaction sequence, a future target quantity or completed orders.
A same-origin fragment handoff lets the owner apply already supplied evidence
using their existing browser authentication. The fragment is removed from the
address immediately; account credentials and private purchase evidence are not
stored in repository fixtures. Client synchronization changes only the evidenced
first date and purchase metadata, preserving entered shares, cost and cash.

Regression coverage includes all three account sleeves, unchanged no-account
engine parity, low-ranked held-stock exits after the existing age gate, no
outside-index new buys, source and price mismatch rejection, provider failure,
private persistence and read-only GET, idempotent imports, stale revisions,
full/half context, and preservation of holdings, cash, peak and actual fills.
These are synthetic operational tests; no completed historical experiment or
control run is repeated. The collection cron is unchanged.

Deployment verifies software behavior. The owner's purchase-context handoff and
current provider review must finish in the authenticated account before claiming
that the private account display itself has been verified.

# Opportunities verified-refresh recovery — October 20, 2026

Owner request: “I need opportunities to update.” Baseline main and production
are `d2bd7c7ff435c012a866bc2045526f45a0bc6f63`; production deployment
`dpl_6Jyt4QsLRBmGM5EHTBLB9DtWMWCZ` was READY when inspected.

## Reproduced defect

`resolveC1ScreenEvidence` retains a same-source browser selection when newly
verified operational gates change the selected symbols. It then always returns
pending for that difference, even after Reload obtains complete quotes and a
new independent account/opening review. Pending results cannot overwrite the
cache, so the difference never resolves for that source. This is a reproducible
software defect; the owner's browser cache and private account were not read.
It is not a claim that this is the only possible live purchase blocker.

The public production screen returned a live, healthy snapshot at
2026-10-20T17:39:50.338Z. A compact request including HPE, ILMN, CRWD, TWLO,
VLO, VEEV, IQV, NTAP and P returned all nine with positive prices and
quoteFreshnessPass=true. These are public screen observations, not account facts.

## Repair and scope

The component supplies the result of the existing current manual-account review
to the evidence resolver. A retained-composition difference can resolve only
when that independent review is current AND complete current screen evidence
passes all existing presence, identity, staleness, quote and price checks.
The unchanged classifier computes current ratings. An order still must appear
in the checked server order list and pass existing holding/Add checks before
it can become an actionable tile. A blocked name cannot reuse its earlier Buy;
a newly classified replacement cannot manufacture an order or quantity.

Without current server review, changed evidence still pauses capital. Missing,
stale or unverified screen evidence always pauses purchases. Expired manual
reviews, holding actions and checked exits retain their existing behavior.

Application changes are limited to `lib/c1ScreenEvidence.js` and
`components/C1AccountOpportunities.js`. The release manifest updates only those
two application hashes and records this repair authorization; the release guard,
canonical guard, build hooks and historical comparison hashes are unchanged.
No account writes, transaction records, adoption conversions, strategy changes,
research runs or provider credential changes are part of this repair.

## Verification

The added regression fails on the baseline with “Complete evidence plus a
current server review releases the old browser selection” (true !== false),
then passes after the repair. It exercises the actual resolver, cache and React
component: recovery, unchanged classifier parity, blocked-old-Buy suppression,
checked Add recovery, no fabricated replacement order, incomplete/stale evidence
rejection, cache remount and checked-exit continuity.

Full guarded build results are recorded in the PR after completion. Live
account eligibility remains conditional on the authenticated application's
existing checks; no qualifying trade or purchase authorization is assumed.

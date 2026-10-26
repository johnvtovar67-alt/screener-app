# Holding wording — October26,2026

Owner reported new ILMN/CRWD holdings labeled Evidence unavailable and repeated
armed/not-triggered wording for VEEV. Owner explicitly approved these three
proposed wording corrections with "Do it now". Base main/productiona483b02,
PR336 verified live; no other active hardening PR was found.

## Display-only changes

- Opportunities: "Your position" for held rows; "Purchase check" for unheld
  candidates. Existing HOLD/Add/Buy quantities and authority remain intact.
- New holding: "New holding — review pending" with "Awaiting first completed-
  session holding review." Only current prior-session account views with a
  positive holding opened this market session and no saved momentum assessment,
  completed reviews or queued exits receive pending wording. Classification
  remains null, tone unknown. Older/malformed/stale/changed-risk evidence is not
  relabeled or made available. This is not a new momentum classification.
- Armed protection: the existing reason says "No sell signal is confirmed."
  while the existing timing field retains "Profit protection: armed, not
  triggered" once. Existing thresholds and counters, including0/2, are unchanged.

Only three application files and their specifically authorized manifest hashes
change. No API/service/planner/account store, trading rule, calculation, stop,
quantity, cash, history/fill, cron, auth/config, dependency, guard or build hook
changes. Owner screenshots are observations, not independently reconciled fills.

## Verification checkpoint

Actual synthetic fill through the real execution service plus actual desktop/
mobile Portfolio renderers proves pending copy and HOLD with unchanged account
bytes and zero writes. Negative old/future/zero-share/exit/review/malformed/stale
cases retain unavailable/stale evidence. Rendered armed status occurs exactly
once. Opportunities held/unheld/Add/blocked/cash/render/expiry/effect tests retain
original quantities and outputs except the exact authorized heading. Original
source hash oracle remains unchanged; only an exact one-occurrence heading seam
is reversed in historical extraction checks. Focused451 presentation assertions,
momentum evidence, source-extraction, HOLD and copy suites pass.

Full local suite/build, CI/preview and production gates are pending at this
source checkpoint. Final release evidence is recorded in the PR, not a later
documentation-only deployment. This display cleanup does not establish private
brokerage reconciliation or close unresolved upstream/design limitations.

# Required event-feed lifetime and pre-open rehearsal repair

Owner instruction November 2: “Fix this now!!” after the reliability watch
reported intermittent event verification and an absent scheduled CI rehearsal.
Baseline main/production: `2de217e4456ec04592001c9049db230b4a855067`, complete
source tree `0186611e52c14bf8bf7298052a961d8235af9a73`.

## Reproduced event-cache defect

A required feed can be within its original TTL when reused, then expire while
the other required feeds or optional macro observation finish. The final strict
validator correctly rejects the result. A scheduled interval near the earnings
TTL makes this particularly plausible; the prior aggregate production receipts
do not contain feed-level reasons, so the exact historical feed failure is not
asserted. Normal production samples also show successful full merger partition
proofs; a pagination overlap alone is not evidence of incomplete coverage.

`lib/eventRisk.js` now reuses required feed cache entries only if their original
expiration covers the existing acquisition deadline. Other cache consumers keep
their original behavior. Near-expiry entries use the existing provider request,
inflight sharing, timeout, cooldown and validation paths. No new retry, receipt
retimestamping, freshness extension, stale clearance or event-policy change.

The actual-provider regression reproduces failure on the immutable old source
and passes current acquisition for NEWS, EARNINGS and MERGERS. It advances the
clock during optional work, verifies exactly one required reacquisition, rejects
genuine provider failures, and retains expiration at the original TTL. Earlier
provider/cache/pagination/economic assertions remain. An exact inverse restores
the complete October 30 source before the existing older-source inversions;
all historical hashes stay unchanged.

`lib/c1ReadinessProbe.js` emits an additional diagnostic only when current event
coverage is incomplete. It contains bounded feed names, counts and allowlisted
reason codes, never symbols, keys, provider bodies, URLs or account data. Unknown
reasons are UNCLASSIFIED_FAILURE. Logging failure cannot affect readiness.
Existing readiness storage/public-response and trading authority are unchanged.

## Missing scheduled rehearsal

GitHub returned no scheduled CI runs more than an hour after the declared time.
The workflow is on the default branch, main; the repository is active and not
archived. Its latest release build and all three browser jobs passed. The
connector does not expose GitHub's internal scheduler/actor or workflow enabled
state, so a particular upstream cause is not asserted.

The single read-only CI workflow keeps every existing job, assertion and merge
gate, and changes its ordinary weekday cron registration to two off-hour
opportunities: 12:37 and 13:07 UTC. Both allow the full 15-minute job timeout
before the regular opening in standard and daylight time. This also follows
GitHub's documented cron-edit remediation for a stopped schedule:
https://docs.github.com/en/actions/how-tos/troubleshoot-workflows
Delivery is not guaranteed by the cron text; the watch must continue requiring
an actual ordinary scheduled run. No workflow is manually dispatched and no
historical or research run is restarted. Normal Vercel crons are unchanged.

## Release verification

Only the two named application hashes and the existing CI configuration hash
change in the release manifest, with explicit defect/owner authorization. No
guard implementation, earlier source/economic hash, dependency, strategy,
account, cash, holding, history, fill or model record changes.

Focused real-provider, complete older-provider parity, merger recovery,
operational redaction and summer/winter schedule checks pass. The full suite,
all four exact-head CI jobs, matching preview, merged production identity and
next ordinary readiness receipt remain required. Local dependency installation
is unavailable because the offline cache lacks a pinned dependency; no local
optimized-build acceptance is claimed. Final release evidence belongs in the PR
body and supersedes this source-time checkpoint. Future cron delivery remains
unverified until an ordinary scheduled event is actually observed.

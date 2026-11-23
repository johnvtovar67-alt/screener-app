# Watch verification wording and read-only details

The owner reports every Watch row saying Current account exposure is unverified
and asks whether that prevents recommendations. Baseline main and canonical
production is 42e6917d19d3d7a2aa4c6a4d56491e3c3f141c4b.

The earlier Watch cleanup explicitly removed the download button. After that
instruction was identified, the owner explicitly approved “Restore the download
button” for this diagnosis. Only that control returns; universe figures remain
off the screen. Existing UI assertions are updated only for this approved
presence; ranking, counts, economic assertions and other clean-display checks
remain intact.

The actual selection helper reuses account-exposure-unverified for a candidate
without an opening quote, even when account-wide purchaseEligibilityComplete is
true. Watch mapped both that per-name code and an explicit false shared account
flag to the same whole-account warning. The screenshot establishes the ambiguous
display; available production logs do not contain the private flag needed to
bind its particular branch. Do not claim the account is verified from synthetic
fixtures, shared readiness or a successful empty opening review.

Only lib/c1CurrentWatchSelection.js, lib/c1WatchDetails.js and
components/C1AccountOpportunitiesView.js change in the application. Presentation retains the shared whole-account warning
when the same reason is in commonWaitReasons (explicit purchase eligibility
false). Otherwise that per-name reason says its opening price or purchase limit
checks are incomplete. It does not guess which input is absent, assert a quote
was requested, clear a gate, or treat missing verification as qualification.
Every structured reason, flag, rating, rank, candidate, quantity and order remains
unchanged; primary recent-momentum and opening-gap blockers remain visible.

The already implemented lib/c1WatchDetails.js download had no UI consumer in the
deployed view because of that earlier cleanup. Restore its approved button with
the existing allowlisted export. It reads
only loaded Watch diagnostics, source dates, public candidate facts and readiness
booleans. It exports no sync key, balances, fills, account identities or unrelated
browser storage. Its reason definition explains the same account/candidate
scope distinction. It performs no server request and grants no authority.

The separate holding-exit question was checked against owner-supplied evidence.
It does not require an exit-policy change. Private holding evidence is retained
only in local audit notes.

Preserve financial history, cash, holdings, basis, stops, cooldowns, risk
references, all selection/size/execution gates, jobs, infrastructure and
dependencies. Update only the three affected application hashes and authorization
metadata. A new exact three-file test inverse must preserve all published source
fixtures and hash pins; do not weaken guards, CI or build hooks.

Require focused actual selector/render/export checks, complete local build,
all four required exact-head CI jobs, matching preview and canonical deployed
identity/assets. Final owner verification must identify the visible row wording
and the downloaded commonWaitReasons, purchaseEligibilityComplete and candidate
purchaseBlock. The actual private account cause remains unverified until that
evidence is supplied.

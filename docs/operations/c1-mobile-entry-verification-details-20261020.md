# Mobile entry-verification details — October 20, 2026

The owner reported the same Opportunities purchase pause after PR 291 and
requested completion (“Do it”) of tracing the remaining check and exposing its
specific failure reason. Production/main baseline is
`83e1339aeabeddf1847a30212cfffd3c6a6a3b09`.

The supplied mobile screenshot shows fresh holding quotes and a completed
application refresh, but no actionable explanation of the entry pause. Holding
quotes are separate from required screen-candidate evidence and from the
independent authenticated opening review. The screenshot does not prove which
entry check failed, or which JavaScript build that mobile tab loaded.

The public compact screen, including the nine current public source candidates,
returned healthy/live evidence at 2026-10-20T18:53:35.660Z, with all nine present
and quoteFreshnessPass=true. That does not establish the owner's browser response,
its local cache contents, private account candidates or opening-review result.
The available cloud browser does not have the owner's signed-in C1 account;
no sync keys, live account data or credentials were requested or read.

## Confirmed presentation defect and change

The existing pending message collapses every screen-evidence failure into one
generic sentence. When a composition change awaits independent account review,
that sentence also hides the manual-review reason. These are reproduced using
the actual resolver and component with isolated fixtures.

`lib/c1ScreenEvidence.js` now returns a read-only list of the failed existing
checks: account currency, empty candidates, source-date mismatch, incomplete/
unhealthy screen refresh, missing rows, stale/fallback quotes, unverified quote
freshness, unavailable prices, and changed selection awaiting account review.
`components/C1AccountOpportunities.js` displays those details directly in the
existing Opportunities panel, alongside the unabridged opening error or manual
review reason. Candidate symbols are drawn only from the current supplied
account screen; none are inferred from the screenshot or public observation.

No Boolean gate, rating, candidate selection, request, order, quantity, server
authority, cash, holding, fill, adoption, stop or strategy rule changes. This is
an observability repair, not a claim that the unresolved live pause is fixed.
No mobile-only trading path is introduced.

## Validation and release guard

Focused regressions verify specific missing/stale/unverified symbols, simultaneous
screen and opening failures, no purchase quantity under incomplete evidence,
unchanged checked exits, and the existing refresh-recovery behavior. The HOLD
exact-source regression reverses only the new diagnostic JSX before checking
its unchanged historical hash. Only two application hashes and this owner
authorization are updated in the release manifest; guard code, original hashes,
build hooks and dependencies are unchanged. Full build/CI results are recorded
in the PR.

Acceptance limitation: the signed-in mobile result must be observed after this
release. Do not equate successful fixture/build checks or a healthy public feed
with live account eligibility. Do not bypass a check to force an opportunity.

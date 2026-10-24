# Passive broad-screen diagnostics — October 24, 2026

## Bounded defect and scope

Normal `/api/top5` request diagnostics reported timing/call counts but did not
summarize feed-state outcomes. A zero Buy count could be mistaken for a valid
strategy decision while provider verification was unavailable. The catch also
logged an entire exception object, potentially including raw upstream details.

Starting main/production: `cb2d2dfdb0ad6f97053417c70bbeb03ed8fc7c53`.
No active hardening PR was found. Extend the existing
`lib/top5Diagnostics.js`; connect two observers in `pages/api/top5.js` only.
No new framework/module/dependency, endpoint, timer, persistence, provider call
or private-account lookup. Existing normal acquisition/performance writes remain
unchanged; the route is still NOT a read-only canary endpoint.

## Semantics and privacy

The response observer inspects already-computed metadata and returns the exact
same object reference. A single `C1_SCREEN_OPERATIONAL` info line shares the
existing request timing identity. Whitelisted feed states, fixed status codes,
sanitized source date/commit and aggregate row/Buy counts are the only fields.
No symbols, quotes, theme/query, URLs/keys, account facts, provider bodies or raw
exception/stack enter these new records. Failure uses one warning with a fixed
timeout/general-failure code instead of the old raw exception-object log.

Codes distinguish malformed response, stale retained snapshot, incomplete quote
verification, unavailable/degraded/unknown fundamental coverage, empty response
with healthy feeds, healthy feeds, request timeout and general request failure.
Metadata feed health is not proof every row is verified. Broad Buy counts are
not C1 private-account selections or actionable quantities. Even an empty
healthy response does not certify that C1 chose cash.

All records retain `executable:false`, `c1Selection:NOT_VERIFIED`,
`accountOpening:NOT_VERIFIED` and `browserRendering:NOT_VERIFIED`. Observer or
new diagnostic logger failures are isolated; they cannot alter HTTP status,
body, rankings, policies, cache ownership or retry/write behavior. Existing
request-budget/timing code and its behavior are otherwise byte-identical.

This slice deliberately preserves existing HTTP error response details as well
as success bodies. It removes the raw server exception log, not every legacy
provider-error exposure. Typed provider-error response consolidation is a
separate pending boundary repair; do not call error hardening complete.

## Focused verification

- Pure observer cases pass for healthy, empty, stale, degraded, unavailable,
  unknown/malformed state and timeout/general failure; input remains immutable
  and returned response reference identical, including throwing loggers/getters.
- Actual production-route harness preserves full/compact decisions, metadata,
  C1 classifications and provider/storage call sequence against the unchanged
  oracle. It proves one request-correlated summary and unchanged success when
  the new observer logger throws. Deadline failure retains HTTP503/TOP5_TIMEOUT
  and emits the safe code; raw exception logging is absent.
- Existing real AsyncLocalStorage/deadline/provider/ledger tests pass unchanged.
- Reversing only the observer imports/wrapper/catch-log replacement recovers
  exact route blob `6c0b454ff6594d6bc5a53c4413a7455b1f422871`. Removing only
  appended diagnostic helpers recovers module blob
  `8c9aff62a852ac7204ee8538eb2a4f323bdab51d`.
- Only those two application manifest entries/authorization change. Freeze and
  canonical guards, CI, build hooks, trading rules, UI, crons and account facts
  remain unchanged. No completed thesis experiment is restarted.

Released through PR #321: local121/121, freeze/canonical and build PASS; CI #974
(40143080374) SUCCESS on exact reviewed head
`6c200dc89abae01b57b0d19a32463c24f98fa93a`; preview
`dpl_8XKf9gVjacr1upxnyvtpYetMLJsQ` READY with version/health200. Production
`32500001899d59b78107c071fc21f4bd3b1162e0`, deployment
`dpl_46c6nn8g7xfcoiinDFfyvr8btTxQ` READY with canonical alias/version/health,
all configuration checks true and scheduler configured. Initial scoped error
scan was clear. Exact reviewed/merged tree:
`a3f455bd50ec4647dd05cdabbaa40e053f2d6b1b`.

Actual emission observed: two normal production GET records at 23:39:36–37 UTC
reported SCREEN_FEEDS_HEALTHY on the exact deployment. No explicit screen
request was initiated as a diagnostic canary. This verifies runtime observation,
not private C1 selection, account opening, browser or brokerage acceptance.

Next: provider/error/symbol boundary consolidation and obsolete research-runtime
isolation. Cross-boundary/browser acceptance and immutable screen reads under
golden parity remain unfinished. No more offline diagnostic scaffolding.

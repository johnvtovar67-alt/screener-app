# Passive account-response diagnostics — October 24, 2026

## Scope and defect

Owner says Go after PR #319. Starting production/main:
`3b6341c2bef960d72616053284b08d7fc6588a47`. A successful HTTP200 response can
still represent an unavailable opening review or stale account, while a normal
GET intentionally returns analysis only. These states were not distinguished
in normal-request telemetry. No active hardening PR was found at takeover.

Observe only the existing authenticated `refresh-analysis` GET and
`prepare-execution` POST responses after their original work completes. The
new pure `lib/c1AccountOperationalStatus.js` computes a bounded summary;
`pages/api/c1-account.js` logs it once and returns the original view unchanged.
No response wrapping, status rewriting, retries or mutation interception.
Recording/adoption/cash/history operations are not instrumented by this slice.

No new provider calls, Blob reads/writes, diagnostic endpoint, timer, service,
credential, configuration or UI. Original source acquisition, guards, request
budgets, calculations, success payloads, ETags and canonical saves are unchanged.
The only frozen application changes are the handler and new helper entries;
freeze/canonical guards, CI and build hooks are untouched.

## Diagnostic semantics

One info-level `C1_ACCOUNT_OPERATIONAL` JSON line per successful observed
normal request includes a fixed contract/boundary/operation/code, existing
random request ID, sanitized commit and source date. Ready-review summaries
also count checked unconditional buy/sell orders. No symbols, shares, prices,
cash, positions, fills, account/revision/source identifiers, bearer key/path,
raw error, stack or request body enter the log. Client operation values are
mapped to a fixed vocabulary. Failed/unauthorized requests retain existing
handling and error telemetry; no new storage or identity lookup occurs.

Codes distinguish incomplete response, stale account, holding verification,
market closed, analysis only, pending account activity, failed opening review,
expired/inconsistent review, checked buys and zero checked unconditional buys.
A normal GET without an opening plan is ANALYSIS_ONLY, not an outage. A closed
market is expected. A conditional replacement is not counted as a current buy.

Existing `buildC1ManualRecommendations` validates the supplied opening orders;
it does not project quantities. Existing `c1ManualReviewCurrent` checks identity,
session and expiry. The diagnostic additionally checks that completed and
execution response identities agree and order lists match. These checks only
label telemetry; they do not become a new recommendation/recording gate.

Every record has `executable:false`, `screenComposition:NOT_VERIFIED` and
`privateAccountParity:NOT_VERIFIED`. Zero checked account orders is not a claim
that the broad screen has zero qualified ratings, that the browser rendered
them, or that a broker order executed. This is passive instrumentation, not a
proactive end-to-end acceptance canary. No private credentials are requested or
authorization walls bypassed to manufacture a live acceptance claim.

Logging and diagnostic exceptions are contained outside decision/account
processing. Logger failure cannot turn HTTP200 into500, change a response,
trigger reload/retry or cause another account write.

## Verification checkpoint

Focused helper tests pass on real synthetic prepared execution views: checked
buys, zero/conditional orders, stale account, missing/expired provider/membership
and review evidence, source/order mismatch, pending activity, analysis-only,
premarket and redaction. Real HTTP-handler tests prove exactly one log line,
request-ID correlation, original payload identity, no additional writes/input
mutation, and unchanged success under a throwing logger or observer. Existing
409/422/503/500 error-classification assertions remain intact.

Removing only the diagnostic import/calls and restoring the original direct
GET return exactly recovers approved handler blob
`717c7ec9332de1928b1ad6a6036bb77a67b8bb7c`; no business-processing drift was
found. The helper shares existing pure dependencies already used by the handler.

Released through PR #320: full local120/120, freeze/canonical and optimized
build PASS; CI #972 (40140265361) SUCCESS on reviewed head
`40e0e14fca8368fbb55b9255e44db4201dd4cb87`; exact preview
`dpl_H6oVe1r6Hs1g4x8cfjoTE6oWAyA7` READY with version/health200.
Production `cb2d2dfdb0ad6f97053417c70bbeb03ed8fc7c53`, deployment
`dpl_DbukF8ZrRJXarMAKVyrMFCQGcPpQ` READY with canonical alias/version/health,
all configuration checks true and scheduler configured. Initial scoped
error/fatal scan was clear. Reviewed/merged tree:
`29ec8eb59341b1ff80932d7f40d5ee1d8c26ceed`. Initial operational-tag query
found no records; actual private-account emission and browser/account parity
remain NOT_VERIFIED. A public health GET does not prove those paths.

Remaining work: screen-side provider diagnostics, cross-boundary/browser
acceptance, provider/error/symbol consolidation, research-runtime isolation,
and immutable screen reads under golden characterization. No thesis reruns.

# Redact public screen error details — October 24, 2026

## Reproduced software/privacy defect

Starting main/production `32500001899d59b78107c071fc21f4bd3b1162e0` (PR #321).
The actual `/api/top5` catch serializes `err.message` into its public HTTP503
`detail` field. A synthetic, isolated execution of that exact response seam
copied a provider-URL/API-key marker into the body with zero network calls,
storage writes or actual credential access. This demonstrates a possible
exception-text exposure, not evidence that real credentials were disclosed.

The owner says Keep going on authorized hardening. Repair this error boundary
without touching C1 economics, success outputs, UI components or storage.

## Small shared boundary, not a new platform

Add `buildTop5UnavailableResponse` to existing `lib/top5Response.js` and call it
from the existing screen catch. It accepts only a literal timeout boolean;
no raw error, message, URL, body or stack is accepted. It reuses the controlled
fallback wording already used by the client parser instead of duplicating
another provider-error string policy. No new module, dependency or endpoint.

Keep the original public `error` label, HTTP503, `retryable:true`, and existing
timeout code/wording. Canonical TOP5_TIMEOUT responses are identical. Generic
error detail intentionally becomes the controlled existing unavailable message.
Successful payloads, classifications, quantities, price/history guards, cache
ownership, cancellation, request budgets, normal crons, actual holdings/cash/
fills/history and automatic retry behavior remain unchanged. No trading-policy
or UI redesign. Existing server diagnostics remain fixed-code/redacted.

Only the two affected application manifest hashes and explicit authorization
change. Freeze/canonical guards, CI and build hooks are not modified.

## Focused verification

- Shared-builder tests reject Error objects, strings, null/undefined, numbers
  and objects with throwing message getters as timeout authority. Only literal
  true selects the controlled timeout response. No exception text is inspected.
- Real handler test injects a synthetic upstream-URL/API-key marker through
  its catch boundary before any I/O. It still returns503/retryable with the
  existing error label, but neither the body nor logs contains the marker;
  provider/storage calls remain zero.
- Existing full/compact success/metadata/classification parity, current timeout,
  caching, feed recovery and provider/storage call assertions pass. The original
  response-parser tests continue to accept legitimate detailed API responses;
  only this server endpoint's arbitrary exception reflection is removed.

PR #322 release verified October 24 at 23:53 UTC: main/production
`cddfe3e70a3276f81b4bf1c2b4245f5c8105df59`, deployment
`dpl_J2wTt8pXQNnHbn9n8x1H7ie2Mm4S` READY with canonical version/health200,
all configuration checks true, scheduler configured and initial scoped error
scan clear. Local121/121/build/freeze/canonical passed. Exact head
`af84e9fb313e224d54cd561694f13c381d4e5644` passed CI #976 (40144012838);
matching preview `dpl_8XxWMvQvHCNRu4tGumAumdaydBqf` READY/version/health200.
Local/reviewed/merged tree `13544b0d639d35cabec23d3e90edebf4511acab8` matched.
No live failing-provider request is needed or authorized just to test this.

Remaining work is broader provider/error/symbol consolidation, research-runtime
isolation, private-account/browser/cross-boundary acceptance and immutable
screen reads under golden parity. No historical thesis testing is reopened.

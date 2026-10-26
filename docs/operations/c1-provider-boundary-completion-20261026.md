# Provider boundary completion

Baseline: PR334 main/production
`a8951f7058c33347bd82fa9fd745aca14048e47d`. The owner explicitly reopened
behavior-preserving provider consolidation and malformed-data isolation. Root
verified current main, production, AGENTS.md and ownership before editing. This
document records synthetic source proof; exact release acceptance belongs to the
release PR. No live provider/account/Blob/cron/research request was made for these tests.

## Referenced shared boundary

`lib/fmpTransport.js` is used by every active source file that directly constructs
an FMP request: single quotes, broad producer quotes, fundamentals/bulk, event
feeds, entry timing, opening review, live-input acquisition, held-rank review,
holding valuations/profile classification, market discovery and lookup. The
only direct-FMP source excluded from migration is the frozen research engine
`lib/fmpResearchBacktest.js`; its generators, research oracles and historical
comparison pins remain unchanged.

The shared functions are synchronous. `fetchFmpResponse` returns the **exact**
fetch/fetcher promise; `readFmpJsonResponse` returns the **exact** JSON-body
promise. Each adapter awaits them at the original await sites. One-argument
lookup fetch preserves its original one-argument dispatch. Adding an async
transport wrapper would insert promise jobs and could change concurrent cache
publication and evidence timestamps; this implementation does not do that.

`fmpApiKey` centralizes the existing lookup expression. Each caller explicitly
retains whether the legacy `FMP_KEY` fallback was previously allowed; primary
only callers do not silently acquire that fallback. No live credential is retrieved, printed, stored, normalized or changed by this
work. Test credentials are synthetic. `fmpSymbols.fromFmpSymbol`
shares the identical first-dash replacement/uppercase/trim expression formerly
duplicated by events, fundamentals and timing. Explicit account BF.B/BRK.B
aliases and lookup's different no-trim spelling remain unchanged.

Endpoint adapters retain their status/error interpretation, JSON acceptance,
deadlines, AbortSignal/controller lifecycle, attempt counts/backoff, caches,
inflight sharing, cooldowns, observation timestamps and receipt fields. This is
one I/O boundary with distinct adapter policies, not a universal retry policy.

## Demonstrated malformed-issuer defect

Ordinary valid NEWS rows already accept `crwd` as CRWD and `BRK-B` as BRK.B
through the existing canonicalizer. The previous missing-content quarantine
required raw exact equality instead. Thus the same trusted issuer spelling with
empty content invalidated every issuer's required NEWS receipt.

Quarantine now uses that same existing canonicalizer after the unchanged raw
symbol-shape check, canonical requested-set membership and independently valid
in-window date. The malformed-issuer set records the canonical identity. The
affected issuer remains UNVERIFIED and blocked; missing content never becomes a
material-event fact. Other issuers can verify only after the entire raw feed
passes pagination, freshness, date, contradiction, overlap and complete-coverage
checks. Raw rows still count toward caps and fingerprints. The body is evicted
so the next explicit verified collection can recover immediately.

Proof includes request-order reversal, raw/canonical duplicate deduplication,
ordinary valid-alias complete old/current equality, invalid/double-dash identities,
unknown/invalid/out-of-window dates, terminal/repeated/overlapping/failed/full-tail
pagination, contradictory alias/canonical articles in both orders, simultaneous
stale required feeds, expiry and explicit recovery. No new alias or issuer
inference was introduced.

Global malformed earnings dates remain fail-closed: a symbol alone cannot prove
that the provider honored the requested date window. Existing observed optional
report-time fixtures change dates while retaining the economic issuer set, and
the real daily/range guard rejects that inconsistency. Removing that guard would
assert coverage without evidence. Unknown NEWS identities/dates and transport,
freshness, pagination and unknowable coverage failures likewise remain global.
Existing M&A target quarantine/counting and identified-target blocking are retained.

## Demonstrated lookup disclosure

The actual immutable lookup handler, given a synthetic HTTP503 response containing
`PRIVATE_PROVIDER_SENTINEL`, returns that raw detail in its HTTP500 body and logs
the complete exception. This reproduction is retained in the permanent test.

The catch now uses the existing `sendPublicApiFailure` boundary: HTTP500,
`LOOKUP_UNAVAILABLE`, stage `lookup`, public fallback `Lookup failed.`. Only the
bounded request ID/status/code/stage are logged. No raw error, URL, credential,
symbol, provider body or account payload is passed to that boundary. Successful
200 output and missing-symbol400 remain identical. Provider fetch options,
response-text read, one-attempt policy, key lookup and internal failure parsing
remain unchanged. A throwing logger cannot prevent the fixed failure response.

## Focused evidence

- `tools/c1-provider-boundary-regression.cjs`: 67 complete original/current
  scenarios, strict native-promise/thenable/throw identity, concurrent microtask
  traces at zero/one/three hops with advancing Date construction/Date.now,
  complete outputs and provider calls/options/order, timer lifecycle, cache,
  cooldown/inflight state, receipts and synthetic storage writes. Executes real
  opening, holding coverage, held-rank compiler, 90-member live collector,
  discovery/timing adapters and lookup handler. Nine lookup HTTP/network/JSON
  failure cases plus logger failure verify redaction; healthy/400 lookup parity
  remains separately exact.
- `tools/c1-current-event-provider-regression.cjs`: 227 cases; prior assertions
  remain, including immutable original alias/global-failure reproductions.
- Existing 66 quote-verification cases, fundamentals/client-error retry,
  opening-performance, purchase-block evidence, request diagnostics, live-input,
  entry-timing, historical-price boundary and top5 deadline suites remain required.
- `tools/c1-provider-transport-seams.cjs` uniquely reverses only these authorized
  changes and asserts the complete original blob hash for every migrated adapter
  and the symbol module. Earlier production hashes and historical assertions are
  retained. Raw VM fixtures receive actual shared bindings rather than bypassing
  the new transport.

These tests use isolated synthetic HTTP and storage, not owner-session or
brokerage acceptance. Full guarded build, exact-head CI, matching preview,
reviewed/merged tree equality and production identity/health/scheduler/error
verification are recorded by root in the release PR before any live-complete claim.

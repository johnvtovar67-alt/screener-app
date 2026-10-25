# Refresh reliability after PR #333

The owner reopened only reproducible Opportunities/Portfolio refresh failures.
Baseline main and canonical production were
`2a6a1af89d5a4764cdc289eb9f9be0c4ea5d4827`, production deployment
`dpl_2xn27HSZ4UVkx2DGSQubsXv2TRaP`. Version/health returned200 at
22:50UTC on October25, with all checks and the scheduler configured.
The release PR is the current checklist for exact CI/preview/production evidence.

No owner session, sync key, enrollment, brokerage record, research runner, cron
invocation or live failure injection is used. `/api/top5` is side-effecting and
was not called as a canary. Owner access stays observe-only; firewall changes
stay unapplied. Broad cleanup, architectural centralization and thesis research
remain outside this investigation. Private-account and brokerage acceptance are
unverified; the upstream advisory is not changed or marked fixed.

## What normal traffic establishes

Existing diagnostics were used before adding anything. The24h route-error query
and later7d grouped runtime-error query found no matching clusters. A24h
deployment warning/error query timed out; the narrower10minute query completed
with no matches. These are bounded query results, not proof that no user failed.
Project-wide24h fixed-code queries for `C1_ACCOUNT_API_FAILURE`,
`SCREEN_REQUEST_FAILED` and `SCREEN_REQUEST_TIMEOUT` also found no matching logs.
The current deployment's30minute normal-traffic sample contained two
`SCREEN_FEEDS_HEALTHY` responses and no matching account-response diagnostics.
The233 `/api/top5` log records are not233 requests or user sessions.

| Stage | Existing evidence and result | Remaining limit |
| --- | --- | --- |
| Screen acquisition | Existing `TOP5_TIMING` request IDs `9044421c74` and `080c5d5977`: broad-snapshot6579.3ms and7572.9ms; verification completed | Healthy observed requests do not explain an earlier failed refresh |
| Account read / storage | Existing account UUID header and `C1_ACCOUNT_API_FAILURE` stage/code boundary | No matching normal account failure was captured in the queried windows |
| Opening review | Existing `C1_ACCOUNT_OPERATIONAL` opening outcomes and account request identity | No owner opening-response/browser capture is available |
| Performance recording | Same two screen requests: performance update2951.5ms and1921.0ms, both successful | No live failure/record corruption is inferred; producer/store logic is unchanged |
| Serialization / parsing | Server serialize-response26.2ms and16.5ms, healthy screen codes | Server success cannot prove browser JSON parsing or rendering |
| Browser rendering | No permitted existing owner browser-control session is exposed | Real Chromium fixtures below are synthetic acceptance only |

Nested timings are inclusive and must not be summed as independent costs.
The evidence does **not** establish which defect caused the owner's past daily
errors. It also does not justify a strategy, provider-budget or cron change.

## Reproduced failures and bounded repairs

| Exact original failure | Repair | Recovery evidence |
| --- | --- | --- |
| Start an Opportunities refresh, then a newer Portfolio analysis; release an older screen/quote failure last. The old completion overwrites the newer result/freshness/status. An older cloud preflight can also resume and start a late refresh after the newer intent completed. | Shared request-generation ownership covers load/analyze, quote callbacks, post-await publication and finalizers. Reload captures intent before its cloud read. Stale client results are ignored; already-started server work is not aborted or replayed. | Immutable PR333 functions reproduce the stale final state. Current functions preserve the complete newer state and busy owner, including late quote/account/timing/error and preflight cases. Real browser reproduces late quote clobbering and three unwanted downstream requests from an obsolete cloud intent; current browser rejects both. |
| Successful account HTTP200 with `decision.positions=null` replaces the valid view. Actual Home/App then throws `TypeError` reading `map` and unmounts the page. Malformed nested position collections can likewise crash the existing position consumers. | Validate core decision/position collections before publication. Reject malformed responses; retain the complete previous account view. No data normalization, economic recalculation or new order authority. | Actual API-derived response corruption reproduces the original crashes. Current browser retains the prior analysis, pauses quantities and recovers through a normal explicit Reload. Required nested stops/exits/reviewRules and optional present review collections are checked; this is not a complete response/business schema. |
| A Portfolio account-input response is pending or fails503 while the next screen is healthy. The retained old opening review can still display Buy quantities, including after refresh settlement. | A validated-account-response flag withholds the passed opening plan during pending/failed current account verification. The complete prior view, holdings, cash and history remain intact. A valid current response or the existing conflict-recovery GET can restore the flag. | Original actual browser shows quantities while pending and after503. Current browser withholds them; explicit validated Reload restores them. A409 still performs at most its existing recovery GET and never repeats the POST. |
| Portfolio settles its busy state before its already-started opening-review POST finishes. | Await that existing review in the owning finalizer, preserving request start order and concurrency. | Original browser shows Reload while opening review is held pending. Current browser stays busy, suppresses quantities, then settles/recover normally. |
| Account headers arrive but JSON body never finishes. The old client has no body deadline; waiting can persist indefinitely. | A90second body-read limit stops waiting, reports a fixed stage/code and retains the prior view. It does not abort or retry a possibly committed POST. | Real browser holds an already-generated opening response body: timeout at approximately90.17s, no retry/abort, late body cannot revive authority, and a subsequent normal Reload recovers. The limit starts after headers; this does not claim a90second total HTTP round trip or solve every stalled connection. |
| Malformed HTTP200 benchmark prices replace valid quote-cache entries, become fresh for60seconds and suppress provider reacquisition after provider recovery. Portfolio pass0 additionally reuses an incomplete broad snapshot for five minutes. | Admit only prices accepted by the existing positive-price normalizer to the two quote-cache write sites. Reuse the completed broad cache only when quote coverage was verified adequate. Preserve the failed response and existing cooldowns/budgets; the next explicit request can reacquire data. | Full real route, synthetic provider/storage: original remains paused with zero recovery calls; current next explicit Opportunities or normal Portfolio pass0 recovers with one normal batch. Healthy full responses, provider calls, cache TTLs and timestamps remain identical. This is not full quote freshness/schema validation. |
| Portfolio broad-screen failure without a usable App cache replaces prior React screen rows with an empty array. Malformed screen rows can also be promoted into the App's valid-response cache. | Retain prior rows only as paused display evidence, while analysis still uses empty failed-acquisition inputs. Reject non-object screen rows before cache promotion. | Original source clears verified rows; current retains marked-stale rows without reusing them for allocations, and the next valid analysis replaces them. Warm-cache malformed-row regression retains the original verified body. Null screen rows did not crash the original browser; they were spread into empty objects. |

The ordinary Analyze Portfolio button already pulled the cloud portfolio and
used forceQuotes=true in PR333; reusing handleReload preserves that exact branch
contract while adding intent ownership. UI text/layout and all trading/selection,
sizing, four-Swing, stop, session, retention and account-record rules are unchanged.
No automatic mutation retries, new observation sampling, historical rewrite or
extra producer invocation is introduced. Failure-only recovery intentionally
allows the next owner-triggered request to obtain new verified evidence instead
of reusing poisoned/unverified cache data.

## Minimum additional diagnostics

The screen response now exposes its **existing** internal10hex timing ID as
`X-C1-Request-Id`; account responses already expose their UUID. No new identity,
credential or account namespace is introduced.

`C1_REFRESH_FAILURE` contains only a whitelisted stage, fixed error code, bounded
HTTP status and validated existing response request ID (or null). Stages separate
account-read, account-refresh, conflict-recovery, opening-review and screen-response.
Codes distinguish invalid JSON, interrupted body, structural rejection, body
timeout and failed screen HTTP. No body, URL, headers, holdings, credential,
exception object or raw provider message is logged. Logging failure cannot change
the response/failure outcome. These browser diagnostics add no HTTP request,
endpoint, persistence, monitoring service or setup requirement.

The existing opening-unavailable log previously copied arbitrary exception text;
an isolated sentinel reproduces that exposure. Only this diagnostic line is
replaced with fixed opening-review code/stage and a protected logger call.
The full returned openingError, decision, orders, provider calls and account bytes
remain identical. Existing server account diagnostics supply request correlation.

## Executable verification

- `tools/c1-refresh-generation-regression.cjs`: exact complete PR333 page source
  reversal;12 uncontended state/request/clock/timer comparisons and21 overlap,
  intent, retention and recovery cases, plus original/current opening completion.
- `tools/top5-quote-cache-recovery-regression.cjs`: actual full route, immutable
  original route/diagnostic pins, malformed-price and pass0 recovery, healthy
  complete-output/call/cache parity and bounded emergency paths.
- `tools/c1-refresh-response-regression.cjs`: object identity and full HTTP error
  dispatch, invalid/nested collections, JSON interruption, body deadline, delayed
  settlement, privacy allowlists, header failure and logger failure.
- `tools/c1-opening-refresh-privacy-regression.cjs`: exact original execution
  source reversal; real opening success/failure full-output/call/account parity,
  sentinel redaction and logger-failure tolerance.
- `tools/c1-normal-refresh-browser.cjs`: actual production Home/App through
  localhost HTTP to the real account handler and isolated memory account; provider
  responses are synthetic. Covers interrupted/invalid/malformed bodies, outages,
  pending/failed account verification,409, slow opening, a real90second stalled
  body, overlapping refreshes and explicit recovery. All originally reproduced
  failures are retained with pinned PR333 Home overrides. No live write or actual
  owner/brokerage acceptance is implied.

Earlier client/HOLD/historical source pins and assertions remain intact through
exact reversible seams. Existing full screen/deadline/concurrency/performance
tests remain required. The release changes only six approved application hashes
plus explicit authorization metadata; guards, canonical check, build hooks, CI,
dependencies, access policy and normal cron configuration remain unchanged.
Full guarded build, exact-head CI/preview, reviewed/merged tree equality and exact
production version/health/scheduler/error scan are recorded in the release PR.

## If a future normal failure occurs

The minimum useful evidence is its time and timezone, Opportunities or Portfolio,
the visible error/status and footer production commit, plus whether the next
ordinary explicit Reload recovered. Existing server request IDs/stage logs and
privacy-safe browser codes can then be correlated when actually available.
No console script, key, secret, enrollment, browser installation, HAR/account
payload or brokerage export is requested. These repairs do not establish that
daily errors are eliminated.

# Authorized acquisition stage 1

The owner replaces upfront dashboard/headroom verification with a measured
stage: **at most 25 FMP requests and 8 MiB (8,388,608 decompressed response bytes)**.
No dashboard/support visit, credential change, infrastructure work or account-
wide quota inference is required. The earlier pending-headroom condition in
`PREFLIGHT.json`/`PROTOCOL.md` is superseded for this stage only. The frozen H
exit design and historical approximation remain unchanged.

Starts are at least **2 seconds apart** (at most 30 starts/minute), one request
in flight, no retries. Stop immediately on provider-limit/authentication/error
responses or transport/storage failure. Record request count, bytes, status,
per-window limit headers if supplied, source time and immutable private hashes.
Successful requests never establish account-wide remaining quota. Unused stage
allowance is not permission for new securities or a full-universe acquisition.

Prespecified unit sentinels: NVDA (warmup split), ORLY/FAST (post-window splits),
PG (dividends), WSM (new member and warmup split), BRK-B (share-class alias).
For each, acquire 2023-12-29..2025-04-03 through dividend-adjusted, full and
non-split-adjusted daily endpoints (18 requests). Add SPY/QQQ adjusted histories
(2), a short NVDA overlap comparison (1), a bounded dividend-calendar sample
March 10–21 (1), a split-calendar sample January 1–March 31 (1), PG dividends
(1) and ORLY split history (1). Calendars are explicit partial action coverage;
April 1–3 split events and unsampled dividend dates are not silently certified.

Each successful response is saved privately at a new immutable path and uploaded
to the existing verified private store before the next FMP request. The private
journal and exact-retrieval checks preserve the vintage without publishing
licensed rows or reconstructable prices. A separate process retrieves the
licensed inputs and checks their bytes/hashes. No original archive is accessed.

This stage validates units, dates, response consistency, corporate-action schema
and recoverability. Eight price-history symbols are not a complete C1 ranking
universe. **No partial-universe portfolio return or Champion/Challenger result
will be claimed.** Source-compatible offline implementation and synthetic parity
tests may proceed; historical economic runs wait for a complete approved input.

Before any expansion request, report actual consumption, coverage, validation,
provider errors/limits, exact residual symbol/endpoint/action requirements and
their estimated request/byte demand. The overall previously proposed 1,750/
192-MiB ceiling is not permission to exceed this newly limited stage.

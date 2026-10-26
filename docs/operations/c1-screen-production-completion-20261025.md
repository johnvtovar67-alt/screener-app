# C1 request-driven producer and immutable reader

Owner authorization: the October25 continuation explicitly reopens the previously
deferred behavior-preserving producer/consumer architecture, preserving every
request-driven observation, timestamp, ordering, cache/hysteresis effect and
conditional-write lineage. Baseline main/production is PR334,
`a8951f7058c33347bd82fa9fd745aca14048e47d`. Root owns the normal full release
gates and exact final CI/preview/main/production evidence; this is the source-time
implementation and proof record, not a private-account acceptance certificate.

## Actual consumed migration

`pages/api/top5.js` is now an HTTP compatibility adapter. It retains the existing
headers, request profiler/deadline, maxDuration60, query access, response classes,
operational observations and fail-closed response. Existing GET callers still
trigger exactly their original acquisition and observation; the route remains
side-effecting and must never be used as a read-only canary.

`lib/c1ScreenProducer.js` owns the existing request-driven broad acquisition,
worker cache and inflight coordination, pass-specific fundamental rotation,
continuity seeding, event/timing decisions, theme selection and conditional
performance observation. Existing distinct producer generations remain distinct;
existing same-key joins, stale fallback, verified-cache eligibility, recording
promise ownership and30s/5s cooldowns remain unchanged. No acquisition, quote,
fundamental, timing, event, ledger or observation-policy code was redesigned.
Broad quote I/O now crosses the same synchronous FMP transport boundary as the
other adapters, using `top5Fetch` as its supplied fetcher; exact original await
sites, status handling, retries, timers, cache writes and API-key policy remain.

After its existing awaited performance operation, the producer invokes its
read consumer **in that same continuation**. The HTTP adapter supplies the
existing serialize-response/response-observer callback. This avoids introducing
an extra await before snapshot clock reads or response serialization. Its final
return-await catches rejected producer work; that await settles only after the
read/response callback has already run.

`lib/c1ScreenSnapshotView.js` is the actual read-only consumer used by this route.
It owns compact selection and final public response shaping. It has no provider,
account, Blob, producer-cache or global-state access. Its read result is a deep
JSON-wire copy followed by recursive freezing, so no consumer object aliases or
freezes producer-owned rows, production snapshots or cache references. Dates,
toJSON, omitted undefined, nonfinite values, sparse arrays and own `__proto__`
keys preserve the original HTTP JSON representation. The public response fields,
clock evaluation points, source-session evidence, expiry and classifications
are unchanged. No unused endpoint/view model, new scheduled work or platform is
introduced.

## Exact proof

`tools/c1-screen-production-extraction.cjs` reverses only this declared split and
the synchronous broad-quote transport delegation. The reconstructed **complete**
route must match immutable PR334 Git blob
`a882b44c0e009828068ada3efb3af97fdf45e3d4`. Existing source assertions run on this
reconstruction without being weakened or replaced; actual route behavioral
tests additionally load the new adapter and both modules directly.

`node tools/c1-screen-production-regression.cjs` passes with:

- the complete actual current HTTP route, all actual pure decision functions,
  actual `performanceStore` and isolated versioned synthetic Blob storage;
- fixed and advancing Date clocks, five-request intraday sequences, compact and
  theme views, pass rotation, cache hits/expiry and explicit repeated observations;
- same-worker coalescing plus two independent worker globals and overlapping
  pass1/pass2 generations. Complete response/provider-call order, cache and
  hysteresis objects, compact observation rows and timestamps, first/latest/verify
  reads, conditional-write options, committed bodies and final ledger are exactly
  equal to the full pre-extraction route;
- provider outage, storage-read outage and a write that commits before its
  response fails. Full failure/cooldown/recovery traces remain equal; uncertain
  writes are not retried automatically, and an explicit later refresh recovers;
- hostile but supported HTTP JSON values (`__proto__`, constructor, prototype,
  Date, toJSON, undefined, nonfinite numbers and sparse arrays): complete wire
  bytes equal, deeply frozen output, no producer-cache aliases, mutation
  rejection and read-only repeated consumption with zero external effects.

The existing full actual-route performance suite also passes, including original
production response/ranking parity,55s deadline, late bodies, quote budget,
concurrency, stale fallback and recording behavior. Existing record-generation,
quote-cache-recovery, screen-evidence, signal-stability, policy/decision,
data-integrity, market-cycle and UI assertions remain required. No live route,
provider, account, storage, research runner or cron was invoked for these tests.
No actual brokerage account is certified.

## Exact remaining invariant conflicts — unmet, not completed

The internal consumed producer/read separation and immutable returned snapshots
above are implemented. They do **not** complete these original audit targets:

1. **Side-effect-free public `/api/top5` while preserving its write triggers.**
   Existing public GETs are the source of arbitrary request-driven observations,
   including cached reads after30s. An immutable read cannot also create that
   observation. Compatibility intentionally retains the original GET producer.
   Scheduling once per day or once per15minutes removes observations. The real
   ledger fixture in `c1-producer-observation-parity-regression.cjs` demonstrates
   entry100→105, MFE10%→0%, return5%→0%, three transitions→one and changed
   Strong Buy expiry when request observations are replaced by scheduled samples.
   Existing normal crons remain byte-identical.
2. **One distributed acquisition owner while preserving worker-local authority.**
   The full-route golden records one acquisition for two same-worker same-pass
   callers and distinct acquisitions for a second worker's pass1/pass2. Current
   cache/hysteresis beforeimages and pass priority are worker-specific. Replacing
   them with one distributed cache/lock changes the provider call/interleaving
   trace and acquisition/observation timing. Serializing only the ledger retains
   these acquisitions and is already performed through conditional writes; it
   must not be called a distributed acquisition lock. This release retains the
   proven observation and lineage semantics instead of silently changing them.
3. **Complete durable immutable screen/history archive.** A mandatory additional
   Blob publication creates an availability/deadline dependency absent from the
   old successful path. Publication before the existing CAS can fail when the
   original CAS could succeed; publication after CAS can be lost on process
   death; fail-open preserves current availability but cannot promise completeness.
   Embedding every full immutable screen generation in the existing mutable
   ledger head avoids an extra request but changes payload/retention costs and
   still needs version retention when a read targets an overwritten generation.
   No such retention or failure policy is silently chosen. The exact two-read
   reduction/CAS lineage experiment in `c1-request-recording-continuity-20261025.md`
   also proves that replaying only complete timestamped rows in chronological or
   commit order does not reproduce legacy records: first/latest-read basis and
   successful conditional predecessors/afterimages are necessary.

The remaining dependency is a compatible trigger/distributed-state/publication
contract that explicitly resolves those conflicts while retaining the required
semantics, or an explicit policy change for the conflicting invariant. No daily
sampling, lockout, extra mandatory write, archive-completeness claim or new setup
request is part of this implementation. These unmet targets stay on the finite
original-audit checklist; they are not relabeled optional or marked complete.

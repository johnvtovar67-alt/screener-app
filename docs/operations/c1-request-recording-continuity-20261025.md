# Request-driven producer/persistence reassessment — 2026-10-25

Inspected local PR331 head `87446a9`; root independently verifies merged production `7876a16`/tree. No live route, provider, account, Blob, research or cron request was made.

## Necessary versus optional

Necessary safety properties are preservation of every intended request-driven observation, exact original observation rows/timestamps, no acknowledged stale overwrite, correct same-snapshot coalescing, fail-closed stale inputs, no invented replay, and no automatic mutation retries. PR326 already protects conditional head writes. This investigation finds and implements one independent in-process recording-cache defect below.

A strictly side-effect-free *public* `/api/top5` GET is an optional architectural target. It cannot also retain that same public GET's existing write-trigger semantics. However, this does **not** mean complete request-driven persistence, immutable historical artifacts or internal read/producer separation is inherently impossible or needs a new public endpoint policy. The legacy GET can remain a compatibility acquisition/recording adapter while internal consumers read immutable artifacts. Prior blanket timestamp-based blocker language was too broad.

## New actual defect; smallest safe repair implemented

`recordPerformance` starts A, then B (different snapshots). A settles and unconditionally replaces the recording cache with settled A while B is still pending. A third ordinary request C reuses B's same snapshot and starts another ledger update, defeating the existing `prior.key === key && prior.promise` coalescing contract. After B succeeds, the same stale completion can also erase B's success cooldown.

The change guards only the final cache assignment with `globalThis[PERFORMANCE_RECORD_KEY]?.promise === promise`. A completion may settle its own caller result but cannot publish cache state over a newer generation. Initial acquisition, broad snapshot construction, verification pass rotation, provider calls/caches, scoring, worker-local hysteresis, ledger mapper, original A/B timestamps, ledger CAS, deadlines, cooldown durations and normal crons remain unchanged. No log/archive/platform is added.

The intentional race-only behavioral difference is explicit: the third B caller joins B instead of adding a duplicate third observation. The synthetic real-reducer example retains both original observations at14:00:00.000 and14:00:00.001; baseline incorrectly adds a second B mark at14:00:00.002. Repaired lastMarkAt therefore stays.001, not.002. This is an authorized concurrency repair of the preexisting same-snapshot dedup contract, not an unannounced sampling or timing policy. A distinct C snapshot still records at its original time, and B after the normal30s window still records normally. All full intraday state/price/extrema observations A/B are retained. Conversely, an explicit A/B/A return now records its intended third A observation; the buggy older A settlement previously suppressed it under an obsolete A cooldown. The fixture asserts that race-only final-mark correction separately. An ABA case (A1/B/A2) also proves promise identity protects A2 from an older same-key A1 completion, which a key-only guard would not prevent.

Files owned by this workstream:

- `pages/api/top5.js`: final recording-cache settlement predicate only.
- `tools/top5-performance-record-regression.cjs`: actual isolated function plus actual pure ledger reducer, exact old-function SHA after reversing the one predicate;8 success/failure/uncertain-outcome race combinations, original row/time equality, full uncontended state/history equivalence, distinct snapshot writes,30s success/5s failure boundaries, and explicit read/refresh recovery without automatic mutation retries.

Focused verification PASS: new record regression; existing actual store concurrency regression; signal-stability regression. Full actual-route performance regression is tracked separately by root/release evidence. No production verification is claimed here.

## Complete event capture/replay experiment: positive result and exact failure

Run `node work/continue-producer/experiments.cjs` (PASS). The experiment invokes real `lib/performanceStore.js` in two isolated processes' VM globals against controlled in-memory Blob semantics, and real `performanceLedger` reductions. It captures **all** request observations; there is no daily/15-minute sampling.

B takes its first read at version0 for Buy100 at14:01:00.123 and pauses. A (Buy110 at14:03:00.456) reads version0 and commits version1 successfully. B resumes, takes latest read version1 and commits version2 successfully. Both original calls return `ok:true`.

- Replaying every timestamped row in chronological order gives entry100, unlike actual entry110.
- Replaying those same complete rows in commit order gets entry110 but only one Buy state. Actual legacy two-read reduction retains B's speculative state from version0 plus A's state: two timestamped Buy rows.
- Replaying envelopes containing original row/time, **first-read version, latest-read version and successful CAS predecessor/commit version** reproduces the entire actual ledger at every committed version, full-object equal.

Therefore, the failed invariant is **legacy reduction depends on read lineage/speculative beforeimages and commit outcomes, not merely the complete timestamped observation list**. Capturing all events removes the sampling problem but a simple fold still changes history. A faithful event log can solve this by carrying version references (with original checkpoint bodies as needed), or exact committed afterimages.

The synthetic immutable publish model also succeeds: write immutable intent/operation first, then use an atomic conditional head publication that links its ID/parent. Unpublished intents are excluded as orphans; a committed head followed by a transport error is recovered by ordinary read without retrying mutation. This is feasible within Blob conditional-write semantics; a separate transaction platform is not inherently required. The model is not a deployed complete archive or complete acquisition golden.

## Remaining full architecture boundary and compatibility

A faithful full producer implementation must preserve:

1. Original GET acquisition trigger and every verification pass's rotated priority.
2. Current per-worker broad cache, quote/fundamental caches/cooldowns, inflight grouping and stale fallback, including when multiple generations complete out of order.
3. Worker-local hysteresis before/after state and durable memory seeding read identities; centralizing that state without characterization changes which symbols receive timing checks and which signals retain strength.
4. Exact observation request time and compact rows, existing local lock/reduction operation trace, CAS success/failure and post-write reconciliation (including a possible second conditional write).
5. Existing10000-row materialized-ledger retention and original records/history. A new raw-event archive must not be confused with current visible ledger retention.
6. The55s request deadline and uncertain-write behavior, without new automatic mutation retries or claiming preview/public health proves private-account parity.

A mandatory extra immutable-log write creates a new availability/failure point: if logging fails while the existing conditional ledger PUT could succeed, failing closed changes prior recording availability; falling through preserves availability but cannot promise a complete log. Logging after a successful conditional write can lose an acknowledged event if the process dies before logging. Event-before-head publication solves crash ordering but still adds the log availability dependency. This tradeoff must be explicitly specified and tested; it is not evidence that the current safer CAS path is broken or permission to silently change failure policy. Full afterimage logging is simplest to verify but duplicates the retained ledger on every request; compact version-reference envelopes avoid that duplication while needing a retained checkpoint/lineage contract.

No external access blocker prevents further offline design/engineering. The full immutable archive/shared producer is **not implemented or production verified** by this slice; the precise outstanding work is the complete acquisition/cache/hysteresis lineage golden and chosen fail-open/fail-closed publication availability contract. It must not be marked completed by the minimal settlement fix, or falsely described as impossible solely because requests carry timestamps.

Smallest safe solution now: retain legacy GET acquisition and conditional persistence; ship the verified recording-generation fence for the reproduced lost-inflight/double-observation defect. Treat broader public-route immutability and immutable-log materialization as separate architectural choices with the concrete parity/publication constraints above. Do not introduce an unused event-log scaffold merely to relabel the obligation done.

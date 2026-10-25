# Prevent stale performance-ledger overwrites — October 24, 2026

Starting GitHub main/canonical production:
`21d5380ad14c5520ed8df1cc7db12b92e79788e8` (PR #325). Current AGENTS, audit
and ledger read. No active hardening PR/branch edits found. All reproduction
uses synthetic storage; no live performance/account/provider access or thesis
experiment is involved.

## Reproduced two-instance loss

The original `performanceStore` uses a process-local lock, two reads and a
post-write reconciliation. These do not serialize separate Vercel instances.
Using the actual immutable production store fixture and real performance-ledger
functions in separate VM globals:

1. B reads the old ledger twice and pauses before its first write.
2. A writes its observation, verifies it and reports success.
3. B blindly overwrites the object from its stale body, verifies that body and
   also reports success. A's acknowledged observation is absent.

This proves a latent software defect, not that live history has already been
lost. Do not reconstruct or modify existing history based on this test.

## Bounded existing-stack repair

Keep body/version association in a private WeakMap. A successful full origin
GET must provide an identity-representation strong ETag and a records array.
The exact pathname lookup remains; listing metadata does not authorize a write.
Use the installed Blob SDK's existing `ifMatch` on both first/reconciliation
writes. Creation after an absent listing uses `allowOverwrite:false`, so stale
absence cannot erase a concurrent creator. Missing/weak versions, partial
responses, malformed bodies or read failures cannot authorize blind overwrite.

The installed `@vercel/blob`2.8.0 source/types document `get().blob.etag`,
`ifMatch` -> `x-if-match`, and `BlobPreconditionFailedError`. Identity reads are
already used by the C1 account store. No SDK upgrade, credentials, environment,
account scope, authentication/config policy or new storage platform is needed.

No automatic retry is added for a conflict or uncertain write. Return the
existing failed persistence shape/status503; a later normal verified refresh
can merge the winner with the new observation. Never roll back an uncertain
commit. The existing local lock remains held until an issued write settles,
including after an outer deadline. Version metadata is not exposed in read or
update payloads. Uncontended I/O call counts and outputs remain identical.

Only `lib/performanceStore.js` application hash and explicit authorization
change. The pure performance observation/merge/normalization functions and
10,000-record retention, recommendation rules, C1 sizing/four-Swing cap/stops,
UI, actual account/cash/capital/fills/history, normal crons, dependencies and
guard/CI/build hooks are unchanged. Two deadline fixture mock values now supply
the real SDK metadata/class shape; every existing deadline/lock assertion stays.

## Focused verification

`node tools/performance-store-concurrency-regression.cjs` preserves the exact
old store blob `9e9b4f7cfbd1ab76bde65a935960f4dfe30f78f5` as an immutable
fixture. It runs the actual store/ledger implementation with memory-only I/O:

- old two-success/one-observation loss reproduced;
- existing-object and first-creation races preserve the successful winner,
  reject the stale writer once and recover both observations on a new request;
- exact old/current uncontended results, durable records and call counts match,
  including legacy/custom/forward fields;
- origin identity header and exact version precondition are checked;
- malformed/unversioned/weak/non200/read failures perform zero puts;
- unknown writes and commit-then-transport-failure perform one put, no retries;
- a stale second/reconciliation put cannot overwrite a newer intervening update;
- public reads contain records only, no ETag or private version metadata.

Existing real AsyncLocalStorage/deadline/issued-write locking regression and
signal-stability checks pass. Full123-task/build and exact CI/preview/production
release gates are pending at this source checkpoint. Record verification and
safe handoff in the PR; update source-time pending states in the next legitimate
implementation, not a docs-only release.

## Limits and remaining work

The fix protects cooperating current writers; it cannot make an old deployment,
external/manual unconditional writer or already-lost history safe retroactively.
It may report a persistence conflict instead of pretending a concurrent refresh
saved successfully. This is not a claim that both racing requests always save,
nor full single-producer immutable screen reads. `/api/top5` still has acquisition
and performance-write side effects: do not invoke it as a read-only canary.
Private-account/browser/cross-boundary acceptance is still NOT_VERIFIED.

## Verified release and handoff

PR326 verified October24 at10:30PM CDT. Main/production
`8b7b1c54e3cc3ce5ef195422bd287445c65e4f5e`; deployment
`dpl_BdkGjWh2hcMk3YLoyLat34e1ukwr` READY with canonical version/health200,
all checks true and scheduler configured. Initial scoped error scan clear.
Local123/123/build PASS; exact head `9f362b43edcf846e81e5824ae84fe7a18d88d7ba`
passed CI985 (40157858911); preview `dpl_2fNNAuRrf5cYi6i5MASG7AbaqFdQ`
READY/version/health200. Reviewed/merged tree
`e2382dd257e951c54f62ff26fcd2193b86614c6f` matched. No active edits; safe
handoff complete. These facts supersede the earlier source-time pending status.
Live conditional-write persistence/account/browser acceptance NOT_VERIFIED.
No live data mutation or private account parity claim is authorized by a build.

# Approved performance HTTP POST authorization

On October 25, 2026, the owner explicitly approved implementation, testing and
normal deployment of PR #332's existing server-secret authorization proposal,
with GET, normal internal writers and crons preserved. The application now contains
the two-line change in `c1-performance-post-auth-proposal.patch`; that retained
patch is the historical approval artifact, not another change to apply. Production
completion must be established by the current release's exact-commit checks.

## Policy and unchanged contracts

HTTP POST `/api/performance` requires the existing `CRON_SECRET` bearer
authorization when `VERCEL_ENV` is `production` or `preview`. The gate uses the
actual existing `rejectUnauthorizedResearchMutation` helper and its existing
constant-time comparison. Missing configured server secret returns503; missing or
invalid bearer returns401. The handler checks after the unchanged GET/405 branches
and before reading the POST body or invoking storage. No secret is requested,
read, rotated, copied to preview or added to browser code.

Public GET, unsupported-method405, development/unset local HTTP behavior and all
direct/offline/in-process ledger writers remain unchanged. Trusted HTTP POST keeps
its original body interpretation, response/status, summaries, failure outcomes,
strong ETags and creation/conditional-overwrite semantics. No mutation retry,
new observation, price, timestamp, signal or ledger validation is introduced.
Next's existing8mb body parser still runs before the handler; this is a handler
authorization/integrity repair, not a body-parsing resource-abuse mitigation.

Existing production-only CRON_SECRET configuration has been confirmed by the
release coordinator using environment metadata without decrypting its value.
Preview intentionally returns503 if no server secret is configured there; no
production secret is copied into preview to make an unauthorized writer work.

## Legitimate-caller investigation and remaining migration risk

Tracked source at the PR #332 baseline `105919ef37edf0dbbf0428ccc55e8637d0128516`
shows:

- `pages/index.js:311` calls `fetch('/api/performance',{cache:'no-store'})`, an
  ordinary GET. It sends no performance POST.
- `pages/api/top5.js` imports `updatePerformanceLedger` directly and awaits its
  call inside `recordPerformance`. It does not invoke the performance HTTP route.
- Git commit `15e32d9174d86c1f9fac8614b27fd8088d593f8f` on August29 explicitly
  replaced the old unauthenticated top5 HTTP self-POST with that direct store call.
- A current tracked-source search for `/api/performance`, `recordPerformance`,
  `readPerformanceLedger` and `updatePerformanceLedger` found no other application
  HTTP POST caller. Test harness references are synthetic and memory-only.
- `vercel.json` schedules only `/api/cron/c1-index` and
  `/api/cron/full-market-discovery`; neither calls this HTTP performance writer.
  Their files and the entire cron configuration are unchanged by this repair.

These findings establish that the tracked normal browser, direct screen writer
and scheduled workers need no migration. They do not prove absence of untracked
owner/partner automation. Such an external HTTP POST caller will receive401
without the existing server bearer, or503 in an environment missing the configured
server secret. This unresolved external-writer migration risk was reported to the
owner before the approved restriction's release. No actual caller has been
identified, and no lack of logged traffic is treated as proof of external non-use.

If a legitimate external writer is identified, its owner must add the existing
server-secret bearer in its own private server configuration; never send that
secret to chat or embed it in the browser. Retry only after checking the saved
ledger when a previous write outcome is uncertain. Do not weaken authorization
or add a bypass to accommodate an unidentified caller. No external service is
contacted or migrated by this source-only caller investigation.

## Permanent executable evidence

Run `node tools/performance-post-auth-regression.cjs` from the repository root.
The regression executes the actual approved handler, shared authorization helper,
performance store and ledger against a memory-only Blob adapter. Removing only the
new import and guard must exactly restore the immutable prior handler blob
`47f3b8f120c574ef62e7784ab64d850d7d17d404`; no baseline generator is used.

- 61 complete before/after comparisons cover HTTP bodies/headers/statuses, durable
 records, storage calls/options/read budgets/logs, creation, conditional overwrite,
 read failure, weak ETag, conflict, unknown write, committed transport failure and
 verification-read failure.
- 42 deployed missing-config/invalid-header cases, including same-length wrong
 bearers and whitespace/case errors, return503/401 before a hostile body getter
 or any storage call. They make zero writes and retain records/version.
- 20 unsupported-method checks perform zero storage work. GET remains public,
 including when no server secret is configured.
- Development/unset environments retain the exact prior unauthenticated POST
 contract. The fixture does not substitute defaults for explicitly absent env vars.
- Ambiguous writes are attempted once. No automatic mutation retry is introduced.
- The application file remains unchanged by the test. No live endpoint, credential,
 provider, private account or Blob is accessed.

The companion focused checks remain `signal-stability-regression.cjs`,
`performance-store-concurrency-regression.cjs`,
`top5-performance-record-regression.cjs` and `top5-performance-regression.cjs`.
The release additionally requires the full existing suite/canonical/freeze,
optimized build, exact-head CI/preview, reviewed/merged-tree equality and exact
production identity/health/error checks. Preview denial may be checked with an
unsigned empty body; do not issue any production performance POST or invoke a cron
for release evidence. Public health is not account reconciliation.

Approved handler blob: `3b09540074b6d5de7187561c9f0af3f99c80ee05`.
Historical proposal patch SHA256:
`085bbc6a573de9b25d3864328a8949fa4582f7f9f9565275fae1404071275b9b`.
The earlier work-only ingress proof established caller-controlled synthetic
history mutation entirely offline. No actual production corruption is alleged.

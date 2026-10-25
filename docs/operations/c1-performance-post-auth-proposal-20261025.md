# Unapplied performance HTTP POST authorization proposal

This is a concrete approval artifact, not an application or configuration change.
`performance-post-auth.patch` adds only an import and one pre-body authorization
gate to `pages/api/performance.js`. It has not been applied, staged, committed or
deployed. `git apply --check c1-performance-post-auth-proposal.patch`
passes against the unchanged handler blob
`47f3b8f120c574ef62e7784ab64d850d7d17d404`.

## Exact policy being requested

Require the existing `CRON_SECRET` bearer authorization for HTTP POST
`/api/performance` when `VERCEL_ENV` is `production` or `preview`. Use the actual
existing `rejectUnauthorizedResearchMutation` helper, which performs the existing
constant-time comparison. Missing configured server secret returns503; wrong or
missing bearer returns401. Check after the unchanged GET/405 branches and before
reading the POST body or invoking storage. Do not ask for, inspect or rotate the
secret. No browser sync key or new credential is involved.

Public GET, unsupported-method405, development/unset local HTTP behavior and
all direct/offline/in-process ledger writers stay unchanged. The normal browser
only uses GET, and normal top5 persistence calls the store directly, so no normal
client/cron credential wiring changes. Preview POST without an existing configured
server secret deliberately becomes503 rather than an alternate unverified writer.
Any actual external HTTP POST caller must be confirmed/migrated to existing server
authorization by its owner; missing tracked callers does not prove external non-use.

Authorization does not add new observation, price, timestamp, signal or ledger
validation for trusted callers. Strong ETags, creation semantics, response/status,
error behavior, performance history and no-mutation-retry handling stay identical.
Next's existing8mb body parser still runs before the handler; the proposal is an
authorization/integrity repair, not a claim to stop body-parsing resource abuse.

## Executable evidence

Run `node work/continue-access/performance-post-auth-proof.cjs` from repo root.
The proof parses/applies the actual unified patch entirely in memory. It then
runs proposed and baseline real handlers, the actual shared auth helper, actual
performance store/ledger and a memory-only Blob adapter.

-61 complete comparisons match HTTP bodies/headers/statuses, durable records,
 storage calls/options/read budgets/logs, creation/conditional overwrite and
503/conflict/unknown-write/committed-transport/verification-read outcomes.
-24 deployed missing-config/invalid-header cases return expected503/401 before
 a hostile body getter or any storage call; zero writes and records unchanged.
-20 unsupported-method checks perform zero storage work; GET remains public.
- Development/unset environments retain the exact previous unauthenticated HTTP
 contract; the default local comparison is explicit and does not mask undefined
 environment/configuration with a test-fixture default.
- Ambiguous writes are attempted once; no mutation retry is added.
- The application file is reread at completion and remains byte-identical.

Results: `performance-post-auth-proof.json` and `.log`.
Proposed handler blob: `3b09540074b6d5de7187561c9f0af3f99c80ee05`.
Patch SHA256: `085bbc6a573de9b25d3864328a8949fa4582f7f9f9565275fae1404071275b9b`.
The separate `performance-ingress-proof` reproduces the current handler's
history/continuity mutation authority entirely offline. No live unauthenticated
Vercel reachability, actual corruption or production remediation claim is made.

## After explicit policy approval

Apply this bounded patch through the ordinary reviewed release process. Add a
permanent regression from the proof, document this exact authorization, update
only the affected freeze manifest entry, then require full suite/canonical/freeze,
optimized build, exact-head CI/preview/tree equality and exact production checks.
Verify denial in preview without invoking a production performance write; observe
normal production client reads and direct producer behavior. Preserve crons.
Do not deploy this proposal as part of an unrelated release or mark it complete
before approval and its own normal release gates.

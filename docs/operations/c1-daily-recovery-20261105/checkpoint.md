# Daily recovery: current service and historical incident checkpoint

**Current production recovery: one-time read-only check scheduled for November 5 at 6:20 a.m. America/Chicago (12:20 UTC). Historical November 4 economic cause: UNRESOLVED / blocked on actual incident evidence.** These are independent workstreams. Historical artifact completion is not a prerequisite for checking or reporting current service recovery. Scheduling confirmed November 4 at 9:44 p.m. America/Chicago (November 5 at 03:44 UTC); last production evidence remains the 03:32 UTC check below. Previous checkpoints remain in Git history.

Owner specification: [specification.md](specification.md). Existing dedicated branch: `repair/c1-daily-recovery-20261105`. Release and final CI: [PR #352](https://github.com/johnvtovar67-alt/screener-app/pull/352). This continuation changes documentation only; no application, inspector, investment rule, binding or cron change.

## One current status

| Work or acceptance boundary | Current status and evidence |
| --- | --- |
| IMPLEMENTED — independently supported repairs | Complete: bounded archive-first recovery through existing acceptance/CAS, browser completion/ownership, accurate publication state, parity diagnostics and existing local inspector. Synthetic tests do not resolve November 4. |
| RELEASED | Verified: main, canonical deployment `dpl_9jbmZFR6LvC6PrasJ3K6wpR6JwAe` and canonical `/api/version` agree on `7a0d19d1759efe424517503c2d33d892f1e833dd`. Reviewed head `4b809f16169e47ab8a0e2c3add800a97d1b2d03d` and main share tree `c54c4a756858d08fb123e5d791340080dbe9457b`. |
| Incident deployment's storage binding | **NOT VERIFIED.** Deployment identity is confirmed, but available non-secret metadata exposes no deployment environment snapshot or resolved runtime Blob authorization/store binding. Current project settings are not that proof. |
| Actual incident artifacts | **0 of 3 retrieved from a verified incident store.** Earlier null reads were against the workspace store; they do not establish missing production objects. |
| Original November 4 exact economic difference | **UNKNOWN.** The existing inspector has not run on actual incident evidence. Original cause remains unresolved even if ordinary processing later accepts November 4. Current diagnostics can support a new repair without waiting for historical files; bind any causal conclusion to the evidence actually observed. |
| CURRENT PRODUCTION RECOVERY / PRODUCTION VERIFIED | **PENDING / NOT OBSERVED; independent check scheduled.** At 12:20 UTC inspect the actual current deployment's ordinary scheduled logs and read-only readiness regardless of historical access. Last sample: no normal `[c1-index]` logs from 03:20:03 to 03:32:03 UTC, outside collection hours; readiness `DEPLOYMENT_NOT_CHECKED`/unknown. That is not a processing failure. |
| STABILITY WINDOW COMPLETE | **PENDING, 0/5 trading sessions observed.** A single premarket sample is not a completed stability session. One read-only check is scheduled; no recurring stability monitor is configured. |

The deployment was READY at 03:20:03 UTC; its initial observation budget was still open at the last production sample. The unchanged index cron is `*/15 12-23 * * 1-5`. The November 5 6:00 a.m. America/Chicago (12:00 UTC) attempt receives its full 20-minute budget before the one-time check at 6:20 a.m. (12:20 UTC). A 12:15 attempt has its own budget and must not be called failed early. The new read-only task is enabled with a single DTSTART and no recurrence; creation and private lookup confirmed its saved schedule, not execution. Next-run timestamp was not exposed. The prior C1 reliability watch remains paused. No application job was manually dispatched, no cron changed and no stopped automation restarted.

## Current service check — independent of historical files

The owner explicitly authorized the one-off **C1 production recovery check**, saved for `DTSTART;TZID=America/Chicago:20261105T062000`, exact schedule, enabled. See [current-service-check-plan.json](current-service-check-plan.json). It will:

1. Resolve the actual current canonical production deployment and `/api/version` identity, then inspect its ordinary index requests from just before 12:00 UTC through the check time and GET canonical `/api/c1-readiness` through the Vercel connector. If production changed during the window, account for the relevant predecessor's normal logs. Do not require workspace startup or historical file access to use available connectors.
2. If ordinary processing reports accepted source date `2026-11-04`, corroborate the date with fresh matching-deployment readiness and report current recovery. An archive receipt with `acceptedModelInput:false` is not acceptance. A premarket `WAITING_REGULAR_SESSION` can be valid; HTTP 200 is not purchase authority or account parity. Keep original cause unresolved unless incident-bound evidence establishes it.
3. On failure, report outer stage/reason, `providerRevision.stage`, recovery state/session/acquisition/recovered dates, and all five `modelParity.comparedFields`: `ledger`, `pendingBySleeve`, `paperExecution`, `paperExecutionStatus`, `summary`, each with hashes/counts. Report available sample paths, kinds, before/after values or hashes, total counts, difference hash and `truncated`. Samples are bounded and exclude complete simulator-stop/private-account state. Determine the next narrow evidence-supported repair; do not weaken acceptance or implement a change during this diagnostic.
4. If no run is visible, distinguish absent/rejected/unfinished invocation, deployment activation/configuration and missing log coverage. Investigate scheduling evidence separately; never infer an economic failure or manufacture a run.
5. Save the actual result and update this checkpoint. Keep RELEASED, CURRENT PRODUCTION RECOVERY, ORIGINAL ECONOMIC CAUSE and STABILITY WINDOW COMPLETE separate. Do not increment 0/5 from a single premarket sample.

No present result is claimed for that future opportunity. The task does not invoke cron, private account, top5 or research endpoints, change records/bindings/schedules, send external messages, run a broad review, or resume the old watch.

## Historical investigation — separate remaining action

Follow [owner-artifact-handoff.md](owner-artifact-handoff.md), which contains a copyable non-secret Vercel support request and the concrete owner download/upload steps.

1. Establish supported metadata tying **incident deployment** `dpl_CKpneR7jSr8NPi9QxcHbinBd5AfN`, commit `200263dfae6f0ad49d6e160a1e5b70c95dc1e53d`, production target, project `prj_9MJJaMsEfOdtQKXj4VFI7TfJcBjQ` and team `team_vBLhac1QJ54zPEiWFFK7XmGN` to its actual runtime Blob authorization/store binding. If the owner's normal dashboard does not expose that historical metadata, obtain only this non-secret confirmation through the existing Vercel support channel. No message to support has been sent by this agent.
2. From that verified store, use existing owner-authorized exact-file lookup/download and attach only these original gzip files here:

```text
research/c1-dated-index-production-v1/sp500.json.gz
research/c1-dated-index-production-v1/sp500/observations/2026-11-04/7080aa5b3e56463b81199264f9427e0f97713a6de9779f6b22572af988f5b10b.json.gz
research/c1-dated-index-production-v1/sp500/observations/2026-11-04/995e86b9c5032ff61f306d7b512337d6964d185f8ac816fa7f539e0b8d4d0422.json.gz
```

3. Preserve the pathname mapping, non-secret binding record and available object size/time/ETag/version metadata. The accepted book must be the intact incident predecessor ending **2026-11-03**; preserve its original recordHash and full capture/model history. The book path is a mutable CAS head. A later book cannot reproduce the rejected transition; never truncate/rebuild it or recompute an earlier hash. Record any remaining historical identity gap explicitly.
4. Once actual artifacts and predecessor identity are available, run the **existing** offline inspector using the command in the handoff. Inspect complete fills, cash, positions, pending orders, stops, summaries and metadata. Record the exact difference and whether the deployed strict acceptance path accepts it unchanged. A local result alone does not prove ordinary production recovery.
5. Historical reproduction can identify an old economic blocker; it is not a gate on the current production check above. Current accepted-source recovery can be reported while original cause remains unknown. Do not relax investment rules, rewrite accepted history, fabricate sessions, replay uncertain financial writes or manually dispatch processing.

The historical connection cannot satisfy step 1, so historical download/reproduction remain blocked. This does not block the scheduled current-service check through Vercel logs/readiness. No credentials, sync keys, binding changes, unrelated object namespaces, new endpoint or export system are requested.

## Storage verification evidence and its limits

See [storage-access-metadata.json](storage-access-metadata.json).

- Incident `get_deployment(..., withGitRepoInfo=true)` confirms deployment/commit/project/team/production identity. Its returned schema contains deployment/build/Git/alias metadata but no deployment environment snapshot or runtime Blob store binding.
- Scoped incident logs contain no `BLOB_STORE_ID` entry. The inspected opening build metadata confirms `main`/`200263d` but supplies no store binding. Archive receipts confirm observations were archived by those requests; they do not replace file contents or identify the store.
- Non-secret workspace `BLOB_STORE_ID` is `store_qqfA6z8gVpu1EKB0`. Earlier current-project metadata showed plain `BLOB_STORE_ID=store_lC22UIsWjB8e7yXZ`, production+preview targets, unchanged since August 25. This establishes a workspace/current-project discrepancy only. **Neither ID is treated as a verified incident deployment binding.**
- Exact case-sensitive store-detail requests under the specified team returned 404 in this connector scope. They do not establish production data loss or prove store ownership. No available tool exposes the required historical binding or a verified-store exact-object download path. No guessed-store read or alternate access-control route was attempted in this continuation.
- The original exact-path workspace reads returned null. They are not evidence that the production book or observations are absent. The owner has not identified an alternate verified store/dataset; none is being requested or searched for.

## Established incident facts

Normal production logs on November 4 at 21:18–23:48 UTC repeatedly rejected November 3→4 at `providerRevision.stage=model-parity`, with 275 changed prior closing anchors. The logs did not identify the full economic difference. Their two selected immutable observation hashes are the exact filenames above. Repeated attempts did not demonstrate recovery.

Earlier normal account traffic at 19:06, 19:29, 20:28 and 20:34 UTC reported `CHECKED_ZERO_UNCONDITIONAL_BUY_ORDERS`. The later update failure does not establish the cause of the entire day's cash position.

The data path remains provider validation → immutable market observation archive → revision/economic reconciliation → accepted dated book → account/opening analysis → owned browser publication. An archive is evidence, not accepted session or execution authority. Accepted history and private account records remain protected.

## Released proof and compatibility

Independent review on `4b809f1` found no remaining substantive implementation findings. [CI run 41959285888](https://github.com/johnvtovar67-alt/screener-app/actions/runs/41959285888) passed full audit/build/regression (171/171) and all three real Home/App browser jobs: normal, actual-screen and lifecycle-client. Matching preview `dpl_DXqHSxwPpq61NS2RvaYDKS38Gpqb` was READY with matching version before merge. Canonical release identity was verified after production became READY.

Synthetic actual-module evidence covers successive repeat-confirmed benign revisions → material held-position rejection after partial durable recovery → later corrected-evidence recovery; duplicate/unacknowledged/partial writes; conflicting/stale workers; missing/corrupt archives; bounded backlog; weekend/holiday/early-close/DST/grace transitions; desktop 90-second header/body and mobile 15-second quote failures; request ownership and late-write client release. Full persisted accounting/session/capture/fill identities are preserved. Persisted model fields omit complete simulator stop state; the inspector separately replays it. These results do not substitute for November 4's actual artifacts.

No price tolerance, economic acceptance exemption, strategy, sizing, concentration, stop, account, brokerage execution or accepted-history change was introduced. Recovery appends only through unchanged acceptance/CAS and retains the previous accepted checkpoint on rejection. Rollback restores previous code only; it never resets model/account/cash/trades or deletes observations. Existing historical compatibility paths and source/economic oracle hashes remain intact.

## Five-session checklist — all pending; no recurring monitor

For each of five consecutive exchange trading sessions, record actual session date/close/grace, canonical commit/release, ordinary job request/time/result, source date and accepted record hash, revision evidence and exact difference classification, preserved accounting/stops/quantities, normal account/browser result if observed (otherwise unknown), recovery/retry state and final outcome. Missing evidence stays unknown. A failure resets the consecutive-success count after diagnosis/recovery. Holidays/weekends do not count. Readiness HTTP 200/CHECK_PASSED is not purchase authority or private-account parity.

| Session | Ordinary update/recovery | Normal account/browser | Acceptance |
| --- | --- | --- | --- |
| 1 | pending | unknown | pending |
| 2 | pending | unknown | pending |
| 3 | pending | unknown | pending |
| 4 | pending | unknown | pending |
| 5 | pending | unknown | pending |

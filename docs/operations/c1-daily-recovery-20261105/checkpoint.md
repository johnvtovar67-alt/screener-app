# Daily recovery: current incident checkpoint

**November 4 incident: UNRESOLVED / BLOCKED ON ACTUAL EVIDENCE.** Last checked November 4 at 9:32 p.m. America/Chicago (November 5, 2026 at 03:32 UTC). This is the authoritative current status; it replaces the earlier working-status statements. Previous checkpoints remain in Git history.

Owner specification: [specification.md](specification.md). Existing dedicated branch: `repair/c1-daily-recovery-20261105`. Release and final CI: [PR #352](https://github.com/johnvtovar67-alt/screener-app/pull/352). This continuation changes documentation only; no application, inspector, investment rule, binding or cron change.

## One current status

| Work or acceptance boundary | Current status and evidence |
| --- | --- |
| IMPLEMENTED — independently supported repairs | Complete: bounded archive-first recovery through existing acceptance/CAS, browser completion/ownership, accurate publication state, parity diagnostics and existing local inspector. Synthetic tests do not resolve November 4. |
| RELEASED | Verified: main, canonical deployment `dpl_9jbmZFR6LvC6PrasJ3K6wpR6JwAe` and canonical `/api/version` agree on `7a0d19d1759efe424517503c2d33d892f1e833dd`. Reviewed head `4b809f16169e47ab8a0e2c3add800a97d1b2d03d` and main share tree `c54c4a756858d08fb123e5d791340080dbe9457b`. |
| Incident deployment's storage binding | **NOT VERIFIED.** Deployment identity is confirmed, but available non-secret metadata exposes no deployment environment snapshot or resolved runtime Blob authorization/store binding. Current project settings are not that proof. |
| Actual incident artifacts | **0 of 3 retrieved from a verified incident store.** Earlier null reads were against the workspace store; they do not establish missing production objects. |
| Exact economic difference / deployed repair's incident recoverability | **UNKNOWN.** The existing inspector has not run on actual incident evidence. No conclusion that a revision is harmless, representational, recoverable, or policy-changing is justified. |
| PRODUCTION VERIFIED — November 4 recovery | **PENDING / NOT OBSERVED.** No normal `[c1-index]` log was returned for the released deployment from 03:20:03 to 03:32:03 UTC. This is outside scheduled collection hours and is not a processing failure. Readiness at 03:32 UTC is `DEPLOYMENT_NOT_CHECKED`, severity unknown, executable false, account/browser parity NOT_VERIFIED. |
| STABILITY WINDOW COMPLETE | **PENDING, 0/5 trading sessions observed.** No unattended monitor configured. No future session counts as evidence. |

The new deployment was READY at 03:20:03 UTC; its initial 20-minute observation/job budget was still open at this check. The unchanged index cron is `*/15 12-23 * * 1-5`. The next ordinary attempt is November 5 at 6:00 a.m. America/Chicago (12:00 UTC); allow its normal 20-minute job/observation budget. That future outcome cannot be verified in this checkpoint. No job was manually dispatched and no stopped automation restarted.

## Precise remaining action

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
5. Verify the next applicable ordinary scheduled transition from normal logs and accepted source identity, then check the five-session criteria separately. Do not relax investment rules, rewrite accepted history, fabricate sessions, replay uncertain financial writes or manually dispatch processing.

The available connection cannot satisfy step 1. Consequently step 2 has no verified store target, step 4 has no actual input files and step 5 has no observed incident recovery. No credentials, sync keys, bindings, unrelated object namespaces, new endpoint or export system are requested.

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

## Five-session checklist — all pending

For each of five consecutive exchange trading sessions, record actual session date/close/grace, canonical commit/release, ordinary job request/time/result, source date and accepted record hash, revision evidence and exact difference classification, preserved accounting/stops/quantities, normal account/browser result if observed (otherwise unknown), recovery/retry state and final outcome. Missing evidence stays unknown. A failure resets the consecutive-success count after diagnosis/recovery. Holidays/weekends do not count. Readiness HTTP 200/CHECK_PASSED is not purchase authority or private-account parity.

| Session | Ordinary update/recovery | Normal account/browser | Acceptance |
| --- | --- | --- | --- |
| 1 | pending | unknown | pending |
| 2 | pending | unknown | pending |
| 3 | pending | unknown | pending |
| 4 | pending | unknown | pending |
| 5 | pending | unknown | pending |

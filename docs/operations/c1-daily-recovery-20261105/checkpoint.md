# Daily data, reconciliation and recovery stabilization

Owner specification: [specification.md](specification.md). One branch: `repair/c1-daily-recovery-20261105`. Root owns integration and release. Current checkpoint: investigation and implementation; no release.

## Established baseline

- GitHub main latest commit, local base, actual canonical production deployment and canonical `/api/version` agree on `200263dfae6f0ad49d6e160a1e5b70c95dc1e53d` / release `2026-11-04-c1-automatic-held-stops`.
- Canonical deployment `dpl_CKpneR7jSr8NPi9QxcHbinBd5AfN`, READY. Checked November 4 evening America/Chicago (November 5 02:43 UTC).
- Current AGENTS.md read locally and via GitHub. Strategy/financial history protected. All four exact-head CI jobs and independent review required before merge. No cron changes or manual dispatch.
- Normal scheduled logs November 4 21:18–23:48 UTC repeatedly reject November 3→4 at `model-parity`, 275 changed prior closing anchors. Latest observation hash `995e86b9c5032ff61f306d7b512337d6964d185f8ac816fa7f539e0b8d4d0422`. No complete economic diff logged.
- Normal account traffic at 19:06,19:29,20:28,20:34 UTC reports `CHECKED_ZERO_UNCONDITIONAL_BUY_ORDERS`. Later update failure does not explain the entire trading day's cash position.
- Read-only readiness at 02:44 UTC: CHECK_EXPIRED, source unknown, expected November 4, after-hours; no private account/browser certification.

## Architecture and limits

Provider checked membership/history → immutable market-only observation archive → dated book CAS connection → repeat-confirmed revisions and model economic comparison → immutable accepted session → derived private account analysis/opening checks → owned refresh frame → browser publication. Archive evidence never itself supplies accepted session or execution authority. Model and private records are separate.

Complete model parity compares ledger (fills/cash/positions), pending sleeve orders, paper execution/status and summary. Recorded-sale correction path requires no new original model fills and unchanged queue; it is not proof that November 4 is harmless. Stored model ledger does not persist simulator stop/high-water detail. No price tolerance or financial acceptance rule will change without exact evidence.

## Milestones

1. Baseline/specification and normal-log evidence: complete.
2. Exact incident economic reproduction: BLOCKED. Need exact accepted production market book `research/c1-dated-index-production-v1/sp500.json.gz` and at least two November 4 repeat-confirming observations from the fixed `/observations/2026-11-04/<hash>.json.gz` paths. No private holdings/key/namespace enumeration needed. Initial sandboxed reads failed connecting to the configured proxy. Authorized subprocess/network execution with the inherited proxy resolved that transport issue. Exact SDK pathname and fixed configured-store URL reads now return no object (SDK null) for the accepted book and both known November4 observations995e86b9… and7080aa5b…. This establishes missing artifacts in the configured store, not their absence from actual production or harmless revisions. Diagnostic capture metadata unavailable. Do not infer revision cause from ticker A or magnitude.
3. Archive-first bounded recovery: source and focused regression implemented. Defective200263d requires fresh collection before recovery; repaired real acceptance/store chain resumes archived work under provider failure.
4. Bounded browser completion: implemented with failure-before and real Home/App90s header/body + mobile15s quote evidence, including late-write ownership.
5. Accurate publication display: implemented; grace/overdue/unknown/source dates and mixed-version behavior independently tested without quantity/policy changes.
6. Full parity mismatch diagnostics and offline artifact inspector: implemented. Proven serialized-array representation differences are classified diagnostically only; even these still reject under the unchanged strict gate.
7. Focused/full build/audit/three actual Home/App browser jobs, independent review, exact-head CI and release: pending.

## Release and rollback

No production writes, collection, cron dispatch, research rerun or financial canary authorized by this checkpoint. Permitted production diagnostics used Vercel connector version/readiness and normal traffic logs only. Dedicated branch may be published for CI/review. Do not merge until all four GitHub jobs PASS on reviewed head. No freeze/CI/oracle weakening; only documented affected application manifest entries may change.

Changes must remain backward compatible with original accepted books/accounts and existing audits. Archive recovery only appends through unchanged validation/CAS, never rewrites accepted history. A rollback restores prior code deployment, never resets model/account/cash/trades or deletes evidence. Prior code can read existing accepted session schema. Operational diagnostics remain non-authoritative. Document any additional schema before release.

## Acceptance status

- IMPLEMENTED: pending integrated source/regression/review completion.
- RELEASED: no; production remains200263d.
- PRODUCTION VERIFIED: pending next ordinary scheduled processing after release, with20-minute normal observation/job budget.
- STABILITY WINDOW COMPLETE: no; zero of five postrelease sessions observed.

## Five-session checklist (all pending; no unattended monitor configured)

For each of five consecutive exchange trading sessions, record actual session date, expected close/early close and35-minute grace, canonical commit/release, scheduled job request/time/result, source date/record hash, revision evidence and exact economic diff classification, unchanged accepted history/accounting/stops/quantities, normal account/browser result if observed (otherwise UNKNOWN), recovery stage/retries, and final outcome. Check readiness semantically at scheduled observation hours; HTTP200/CHECK_PASSED is not purchase or private-account parity authority. A failure resets consecutive-success count after diagnosis/recovery. Holidays/weekends do not count. Never mark future rows complete.

| Session | Scheduled update/recovery | Normal account/browser | Acceptance |
| --- | --- | --- | --- |
| 1 | pending | unknown | pending |
| 2 | pending | unknown | pending |
| 3 | pending | unknown | pending |
| 4 | pending | unknown | pending |
| 5 | pending | unknown | pending |

## Implemented transition rules and structural changes

- Observation archive remains immutable, content-addressed and market-only. Duplicate create succeeds only when the complete saved envelope equals the expected record; bad hash/envelope/path/time/membership evidence fails closed. Archive presence is not acceptance.
- Accepted model sessions and original captures remain immutable. Confirmed provider revisions still require existing exact evidence/replay/sale proofs. No price tolerance, ignored field, new exception or economic acceptance policy was added. A rejection is logical quarantine: evidence stays archived, book stays at last accepted checkpoint. This repair does not label an unknown economic revision harmless.
- Recovery first consumes consecutive valid contemporaneous archives, deterministically selecting the latest observation by original observation timestamp (legacy reviewed captures retain their exact compatibility path). It never searches for a favorable economic result. At most five missing prior sessions plus current are attempted. Missing historical evidence prevents that transition; present-day history cannot fabricate it.
- Each successful session crosses the original acceptance and conditional-write boundary once. Restart reads the accepted checkpoint. Duplicate observations are no-ops. Lost acknowledgements resolve only through validated rereads. A conflicting worker's winner is revalidated; no uncertain financial request is automatically replayed. Today’s independently acquired observation is preserved even when an older gap blocks acceptance.
- A rejected current archive may receive one fresh bounded acquisition for independent confirmation. If acquisition fails, the existing rejection/diagnostic and recovered dates survive. Strict economic rejection remains blocked across retries.
- Model-parity diagnostics compare all five existing economic fields, retain full field hashes/difference counts/digest, and log a sanitized bounded sample. They never authorize acceptance. Full local inspection can output original/revised virtual model, complete changes and separate simulator open-position/stop state. Actual private-account replay is outside these diagnostics. Missing exact incident artifacts remain a blocker.
- API GET deadlines now include bodies and `/api` quote requests. Financial POST header/body waits end with an explicit unconfirmed outcome, never an automatic abort/retry. The original write retains release ownership through its actual full response; an earlier read cannot clear it. Late completion still needs a subsequent saved-account check before code navigation.
- Publication diagnostics distinguish current analysis, normal35-minute closing publication, overdue source, unknown evidence and account activity pending. Accepted market date, account analysis date and expected completed date are explicit. These labels do not modify decision.current, buy checks, cash/concentration/event restrictions or quantity authority. No per-account producer failure cause is invented when unavailable.

## Focused sequence evidence (synthetic, actual application modules)

- Defective200263d lifecycle plus valid multi-day archives and provider timeout: no recovery attempted. Repaired lifecycle recovers archives without provider acquisition.
- Real accept/store integration: consecutive sessions, duplicate no-op, unacknowledged commit, partial write then restart, concurrent/stale workers, missing/corrupt evidence, economically changed revision rejection and retained diagnostic after provider outage. Complete persisted accounting/session/capture identities equal uninterrupted processing. Persisted model lacks simulator stops; do not infer stop parity solely from this assertion.
- Calendar: weekend, holiday, early close, DST, five-session bound, close/grace boundary and late publication. No invented sessions.
- Browser focused reproduction: old financial POST header never completes; repaired90s result is visible and no duplicate POST occurs. Held quote body ends within existing15s deadline. Native mutation ownership remains through late headers/body, including timeout→earlier read→new deployment→late completion.
- Publication fail-before: at close+35 old account copy stayed pending/reload; repaired state is overdue with explicit dates and recovery unconfirmed. Subsequent valid session recovers state without changing account revision/cash/shares/cost.
- Full regression/audit/build, final immutable-head browser/CI results and independent final review remain pending until logged below.

## Resume instructions and missing artifacts

The owner confirms no alternate store or complete dataset is verified; previous evidence came from normal production logs. Verify the production binding using supported non-secret metadata before any alternate search. Do not list namespaces, retrieve keys, change bindings or bypass access controls. Obtain only the accepted market book and the two specified observation files through verified existing authorized production-store access. Null reads in the workspace store are not evidence that production lost the data.

Then run the offline command with explicit local paths:

```
node tools/inspect-c1-index-transition.cjs --book work/incident-market-book.json.gz --observation work/incident-7080aa5b.json.gz --observation work/incident-995e86b9.json.gz --target 995e86b9c5032ff61f306d7b512337d6964d185f8ac816fa7f539e0b8d4d0422 --output work/incident-inspection
```

Inspect full fills, cash, positions, queue, stops, summaries and metadata; classify each difference from evidence. If meaningful ratings/orders/quantities/risk would change, present that exact decision separately to owner. Continue supported repairs; do not waive economic checks. No unattended watch is configured by this work.

## Review/CI checkpoint (superseded heads do not authorize release)

Draft PR352: https://github.com/johnvtovar67-alt/screener-app/pull/352. Initial head579220f independent source review found no remaining substantive issue. CI41958144111 actual-screen and lifecycle-client jobs passed; normal job failed an old-label assertion in the existing portfolio retained-source test. That assertion now checks the renamed exact analysis-source date, independently checks expected date/CURRENT, and retains withheld-quantity checks. Build exposed the existing cron source oracle: added exact diagnostic-only inverse with original SHA untouched; focused production-access regression passes. Final revised head and all four checks remain required.

Independent review requested two additional improvements: a consecutive multi-session repeat-confirmed revision→material rejection→valid recovery chain through real archive/accept/store boundaries, and typed recovered date/hash success logs for the next ordinary scheduled outcome. Both added without widening acceptance. Full initial build output is exploratory/superseded; only final-head checks count.

## Final application review and second CI checkpoint

Independent agent reviewed immutable application headbe3bb655629066e911727b5b5e702c71310348bb with no remaining substantive findings. All requested ownership, mixed-version, diagnostic, recovery-log and consecutive-revision findings were addressed. Local full normal real Home/App journey passed22 cases (including both90s account waits and mobile15s quote body); browser errors empty, account record identical. Focused diagnostics, archive sequence, source compatibility and freeze/canonical checks pass.

CI41958553806 on that head: lifecycle-client passed; actual-screen failed before any journey because Chrome had not created DevToolsActivePort within the harness10-second startup wait (process still running, no exit/signal/log output). This is not application acceptance. A bounded startup readiness wait with early process-exit failure and unchanged journey assertions is being added; normal push, not manual job dispatch, will run the full unchanged four-job workflow. Full final CI/preview remain release gates. No production release at this checkpoint.

Acceptance evidence after this committed checkpoint is recorded in PR352 and its linked exact-head CI/deployment checks. Read those actual records before updating implementation/release/production/five-session statuses. Future processing remains pending until observed.

## Storage-access discrepancy: metadata findings

See [storage-access-metadata.json](storage-access-metadata.json). Exact production deployment/project/team/commit were verified at baseline. Runtime non-secret workspace BLOB_STORE_ID is store_qqfA6z8gVpu1EKB0. Current production project metadata (decrypt=false) identifies BLOB_STORE_ID as store_lC22UIsWjB8e7yXZ, targeting preview+production, created/updated August25 before the incident deployment. These IDs differ. No credential variable value was retrieved or decrypted. Store-detail reads using the exact case-sensitive IDs under the specified team return404, so this connector cannot establish store ownership/connection or the deployment's snapshotted runtime binding. Existing production archive receipts remain evidence of successful archive creation, not substitutes for contents.

Minimum concrete action: make an existing authorized read-only connection to the production-bound store_lC22UIsWjB8e7yXZ available to this workspace, with non-secret project/team/deployment binding verified, scoped to the fixed market book and the two known November4 observation paths. No production binding change, credential retrieval or unspecified backup search is requested. Then rerun exact-path reads and the offline inspector. November4 cause and recovery remain UNRESOLVED; PR352 must not be described as resolving that incident merely because unrelated/focused tests pass.

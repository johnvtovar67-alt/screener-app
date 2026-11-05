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
2. Exact incident economic reproduction: BLOCKED. Need exact accepted production market book `research/c1-dated-index-production-v1/sp500.json.gz` and at least two November 4 repeat-confirming observations from the fixed `/observations/2026-11-04/<hash>.json.gz` paths. No private holdings/key/namespace enumeration needed. Exact-path SDK read failed `fetch failed`; git/curl fail connecting to configured proxy port8080. Environment reports policy enforced and bindings ready, but actual connectivity fails; diagnostic capture metadata unavailable. Do not infer revision cause from ticker A or magnitude.
3. Archive-first bounded recovery: implementation assigned; valid archives currently cannot recover when fresh provider acquisition fails (reproduced before change).
4. Bounded browser header/body completion: implementation assigned; POST headers and non-account GET bodies can hang beyond existing body/GET-header deadlines.
5. Accurate source/publication window display: implementation assigned. Existing account copy remains pending/reload indefinitely beyond35-minute closing grace and freshness label calls retained source latest.
6. Full parity mismatch diagnostics: implementation assigned; evidence only, strict acceptance unchanged.
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

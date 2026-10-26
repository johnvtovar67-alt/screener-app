# After-hours capacity explanation — October 26, 2026

Owner explicitly requested “Fix it” after the MPC card showed all C1 slots
occupied with three Swing holdings after the regular session. Current baseline
is verified PR337/main41d4062. No purchase, sizing or capacity-policy change is
authorized by this display repair.

## Defect and bounded repair

The presentation inferred a legacy three-slot allocation from holding count even
when no current opening review existed. That inference masked the server's
closed-session reason. Require a ready review for that fallback. Translate the
existing exact closed-session reason to: “Market closed—purchase eligibility
will be checked during the next regular session.”

Only lib/c1EntryReview.js and lib/c1DecisionCopy.js application files change,
with their two explicitly authorized manifest hashes. No order/action/quantity,
four-Swing ceiling, ranking, sizing, sector, stop, event, freshness, account,
cash/history/fill, authentication, configuration, dependency or cron changes.
Guard implementations, CI/build hooks and historical comparison oracles stay.

## Verification and release checklist

- Source: actual manual-review closed-session result feeds actual presentation
  and rendered Opportunities card; three holdings do not imply full capacity.
- Source: incomplete non-closed review keeps its own reason; a current checked
  legacy allocation block remains unchanged. No Buy/Add quantity appears.
- Source: original fixture/account bytes remain unchanged.
- Local full147/freeze/canonical/optimized build: pending.
- Exact-head CI and matching preview: pending.
- Exact merged main/production version/health/scheduler/scoped errors: pending.
- Live private account/browser/economic acceptance: not established by fixtures
  or public health. No live account/storage/provider/top5 test writes.

## Earlier checkpoints reconciled without another deployment loop

PR337 final release record verifies41d4062/tree35e92f7,147 checks/build,
CI1008/run40339502221, matching preview and productiondpl_BV48ZXxwAcGebDVSqZWSsujT7VFx
READY/canonical version/health/scheduler and initial clear scoped-error scan.
Its final PR record supersedes the older pending source-time wording ledger.
October26 normal index job succeeded at20:18:15UTC with sourceSessionDate2026-10-26
after the first observation awaited repeat confirmation. No bypass, manual job
invocation, new release or account mutation was used to obtain that recovery.
Upstream bundled-Zod, deferred design and private brokerage limits remain open.

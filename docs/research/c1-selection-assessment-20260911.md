# C1 selection assessment and production checkpoint — 2026-09-11

## Completed assessment

Source reviewed: tools/run-local-risk-family.mjs in production source ancestry and the completed control workflow 34528408162. No backtests rerun, parameters selected or trading permissions changed.

The original research script simulates each candidate over 2023-01-04 through 2026-09-01. It slices that continuous run into eight windows, counts windows beating both benchmarks, uses those counts in eligibility, and sorts candidates by eligibility, positive-window count and excess return versus QQQ. Thus the eight windows participate in development and ranking. They cannot simultaneously be described as untouched validation for the selected result. Continuous next-session execution and avoidance of within-run look-ahead are separate from this across-candidate selection issue.

The subsequent fixed-C1 controls freeze weights 25/50/25 and compare cumulative blended return. Successful merge job 103061624946 reports Nasdaq 27/1000 exceedances (p=28/1001) and S&P 500 3/1000 (p=4/1001). Its contract explicitly excludes family-wise significance and live-capital eligibility. Same-date universes are not independent chronological holdouts.

Decision: close the interpretation question as **inspected historical development with fixed-candidate diagnostics**. Do not keep rerunning those controls to seek certification. This assessment does not prove no trading edge exists, and does not provide a search-adjusted p-value. A statistically stronger claim requires a fully specified valid selection-aware evaluation or genuinely uninspected evidence; merely labeling slices as holdout after inspection is insufficient. No arbitrary new 60-session wait is imposed.

## Production checkpoint

Vercel deployment dpl_2zav3DqUTpM3BUzcEPUb3sAvThQ6 reports READY and commit 0f54f6e5b6fdcd56335db5f73ad59154f89624c3.
Stable site: https://screener-app-cq5t.vercel.app/

The committed cron schedule is */15 20-23 * * 1-5 (UTC). On September 11 its first configured opportunity is 20:00 UTC. Absence of a run earlier that day is expected and must not be presented as a failed invocation.

Reviewed handler authenticates against CRON_SECRET using constant-time comparison, rejects other methods, and refreshes the dated index through the existing lifecycle. Refresh prepares the accepted seed, compares with latest completed market session, and collects only if advancement is needed. This source review establishes intended behavior, not proof of deployed credentials, an executed cron, available provider data, or an initialized production account.

Existing successful build, account regression, preview acceptance and native date-entry checks are recorded in prior work and are not rerun by this checkpoint.

## Remaining evidence

1. Production: successful authenticated collection with current completed session, source identity and shared model output, followed by actual-account flow verification. Do not use a scheduled run as evidence before it executes.
2. Historical data: FMP historical-classification request sent with user authorization. Await dated classification availability and taxonomy explanation; current profile classifications cannot establish historical validity by assumption.
3. A stronger alpha claim remains unestablished by the selection assessment above.

This document is a research/operations checkpoint, not trading certification. No user transactions or account state were changed.

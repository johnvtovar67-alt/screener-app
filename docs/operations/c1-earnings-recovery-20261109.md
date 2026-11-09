# November 9 earnings-calendar recovery

Owner instruction: repair the repeated production event-verification failure.

Observed on canonical production 334a2a4 at 14:00, 14:15, 14:30 and 14:45 UTC: accepted/expected session November 6, 11 quotes, zero complete event receipts. C1_EVENT_VERIFICATION identifies EARNINGS MALFORMED_RESPONSE for all 11 names; mergers and news complete. This establishes the failed feed, not the malformed row or its upstream cause.

The aggregate-calendar recovery dispatcher handled truncation and out-of-range responses but skipped malformed responses. Extend the existing ten-day, three-worker acquisition to that failure. Each daily response must independently pass the unchanged shape, date, completeness, contradiction, freshness and deadline checks. No filtered or fabricated feed can establish coverage. An initial valid requested-issuer event cannot disappear from replacement coverage. Preserve valid positive observations even when replacement fails. No trading policy, historical inputs, account records, credentials, schedules or provider configuration changes.

Add bounded C1_EARNINGS_SHAPE diagnostics for rejected response type and at most three public symbol/date field shapes, excluding raw provider errors, arbitrary object fields and URLs. C1_EARNINGS_RECOVERY records the complete-day count and recovery result. These distinguish an aggregate-response problem from a recurring daily-row defect during ordinary processing.

Regression cases cover successful complete daily recovery after malformed objects, null and mixed arrays; persistent malformed daily responses; missing/out-of-range days; disappeared adverse observations; deadline exhaustion; unchanged healthy outputs and existing event restrictions. Existing provider parity assertions remain, with only the explicitly added daily requests separated for the malformed fixture. The exact source inverse preserves every prior source hash. Only lib/eventRisk.js changes in the application freeze manifest; guard implementation, CI and build hooks remain unchanged.

Local provider regression: 252 cases passed. Existing merger recovery regression passed. Full exact-head build/audit/regressions and all three browser jobs are required before merge. Production recovery remains unverified until ordinary scheduled evidence confirms it.

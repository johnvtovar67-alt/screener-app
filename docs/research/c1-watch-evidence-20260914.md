# Watch evidence and calendar-date display — September 14, 2026

The updated owner screenshot confirms entry-status restoration succeeded: the two partial holdings are not in the entry queue, and the full holding is complete. Unchanged Hold decisions are not evidence that status restoration failed. Repeated capacity text still fails to explain the individual candidates.

Watch now presents existing queue priority, sector, the original researchFactors.momentumPercentile on its 0–100 scale, and the signal's dated model close. The internal centered ranking value is not displayed as a percentile. Missing evidence is explicitly unavailable. A common blocker and next condition appear once; different blockers remain attached to their respective rows. No score is recomputed and no external provider is queried.

The screenshot also exposes a calendar-date rendering defect: restored YYYY-MM-DD values were parsed as UTC midnight and displayed the previous day in western timezones. Calendar dates now render at local noon, preserving the date; existing timestamp inputs retain their prior local-date behavior. No stored date, holding-age calculation or purchase history changes.

Focused tests verify source-to-decision momentum evidence, shared-blocker presentation, unavailable data, and calendar date display in Central, Pacific and Auckland timezones. Account/replay and manual recommendation regression suites pass locally. CI/build validates the integrated UI before merge. Only five affected/new application hashes are updated under the owner repair request; the engine, targets, fills, stops, chronology and cron remain unchanged.

# C1 operational recovery repair — September 16, 2026

Authorization: owner requested “Fix all” after the four-defect audit of production d3b9c74. This repair preserves frozen strategy selection, sizing, stops, account fills, holdings, cash and original observed model history.

## Repairs

1. Missed accepted sessions: the collector archives today's input before attempting recovery. When acceptance is behind, it reads at most five intervening trading days, at most 100 archived observations per day. Each immutable archive must match its SHA-256 pathname, payload, envelope and actual contemporaneous observation time. It selects the latest contemporaneous observation deterministically and applies the existing consecutive-session, anchor, economic and conditional-write checks, retaining the original observation timestamp. No reconstruction of old membership and no replay of historical alpha experiments occurs. Retries continue from the accepted book. Missing/damaged evidence still reports an explicit failure; it cannot be invented.

2. Recurring held-model close corrections: retain the historical DELL review and add a general path for two distinct-time archived FMP observations agreeing exactly on the revised prior OHLCV. Only close/volume changes with unchanged open/high/low are eligible. Benchmark corrections, changed ranges, inconsistent/missing evidence, and any difference in complete next-session ledger, queue, paper execution, execution status or summary fail. Original model inputs remain unchanged. An index replay is not a private-account reconciliation: the existing actual historical exposure guard remains intact. Corporate actions and changes affecting actual account history are not silently approved.

3. Early closes: centralize the NYSE 13:00 Eastern close for the day after Thanksgiving, trading-day July 3 and trading-day December 24. Apply it to session status, completed-date freshness, volume progress, checked-quantity expiration and intraday fill time validation. Correct Saturday New Year's Day observation (NYSE does not close the preceding Friday). Source: https://www.nyse.com/markets/hours-calendars (published 2026–2028 schedule). Extend the existing operational collector's weekday retry window to 17–23 UTC to include early closes; normal pre-close retries are already-current no-ops. No research cron is enabled.

4. Audit metadata: recording a subsequent fill now preserves all prior intraday activity metadata, including original replacement-plan and accounting-only exit evidence. Actual fills, quantities, prices, fees, order matching and revision checks are unchanged.

## Verification

Focused regression coverage includes missing-session chronological recovery and limits, missing/corrupt archive rejection, immutable observations, a new held-stock/date correction unrelated to DELL, duplicate or conflicting observations, altered range, a one-dollar economic difference, original history preservation, early-close boundary and quote expiration, normal close/DST/holiday behavior, and sale → replacement purchase → close replay retaining both evidence types. Existing private-account exposure rejection and all strategy gates remain enforced.

The CI workflow adds the market-hours regression; all prior tests/build hooks remain. The freeze manifest updates only the eight changed application files for these explicitly authorized repairs. No guard is removed or weakened.

## Limits

Recovery requires a genuine archived observation for each missed day. It cannot recover a day when acquisition never completed. Likewise, repeat agreement does not authorize economic adjustments, corporate actions or changes to actual historical account exposure. Those failures remain visible rather than creating fabricated input or trade records.

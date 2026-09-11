# C1 owner-authorized manual recommendations — September 11, 2026

The owner explicitly authorized restoring manual C1 recommendations with unresolved research limitations disclosed, while retaining account, price, cash, position-limit and stop checks. This supersedes the diagnostic-only restriction for the private-account manual review path only. It does not establish historical alpha or authorize brokerage execution.

The authenticated account API grants a separate manual-review status after its existing account replay, source identity, membership, adjusted-price anchor, opening quotation and sleeve-funding checks. Missing, stale or inconsistent observations continue to block quantities. Recommendations expire after two minutes or regular-session close. Both Opportunities and Portfolio use the same account result and suppress quantities when entered holdings differ from recorded account state.

Account Hold/Risk monitoring and next-session candidates remain available for manual interpretation. Opening quantities use verified regular-session opening prices, not a claim that an old opening price is currently executable. The owner must verify execution price and available cash before entering each brokerage order. Stops remain conditional; projected fills never become actual account activity.

Historical sector provenance and strategy-selection uncertainty remain disclosed. The generic model remains diagnostic, historical validation flags remain false, and automatic execution remains disabled. No strategy parameters, holdings, original model records, capital history or cron schedules are changed. No completed historical test is rerun.

Validation: focused manual-policy and actual account API/reconciliation regressions; required full CI/build before merge. Synthetic test inputs are not the owner's account. Production confirmation requires the deployed main commit and visible manual-review interface; no private account access is claimed by a public browser check.

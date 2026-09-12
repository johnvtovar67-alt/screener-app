# Held-stock momentum failure diagnosis

The private account can return HTTP 200 while the separate held-stock momentum
request fails. Production previously discarded its error category. This made a
provider rejection, timeout, malformed history, missing trading sessions, accepted
price mismatch and a compiler failure look identical, preventing an exact diagnosis.

The provider now emits allow-listed failure categories, processing stage, HTTP
status and aggregate row counts to the owner project runtime logs. Account-level
configuration and session preconditions emit separate categories. Logs exclude
symbols, holdings, prices, account identifiers, sync keys, URLs and provider bodies.
The response retains its existing unavailable message and adds a safe code.

Validation conditions, source data, frozen options, positions, account records and
cron are unchanged. This makes the failure observable; it is not evidence that
the owner's current momentum review has succeeded. An ordinary authenticated
account refresh must exercise it before the remaining cause can be identified.
No private account credentials or new provider route are introduced.

Regression checks force HTTP, network, short-history and accepted-price failures
and verify that credentials and holding identities never reach diagnostic logs.

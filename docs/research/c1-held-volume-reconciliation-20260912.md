# Held-stock momentum: accepted session volume reconciliation

Production verification returned HTTP 200 and 276 normalized history bars, then rejected compilation as `ACCEPTED_PRICE_MISMATCH`. The old comparison included volume; the logs did not distinguish the mismatched fields. This evidence does not establish that the live difference was volume alone.

The compiler now requires matching positive finite OHLC prices. If only volume differs, it compiles with the saved accepted session volume on a copied final bar. The private review receipt records both volume observations and the policy identifier. The provider history hash continues to identify the original normalized provider input; it is not a hash of the canonicalized compilation input. Missing accepted volume rejects. Neither source data nor existing account records are rewritten.

Safe diagnostics identify only mismatched OHLC field names, never prices, symbols, account identifiers or credentials. Successful reviews also produce a category so a private account refresh can confirm the outcome without exposing its contents.

Synthetic account regression passes: revised-volume compilation equals the canonical signal and ranks; original inputs remain unchanged; each OHLC mismatch and missing accepted volume rejects; receipt/hash and safe diagnostics are retained. Full CI/build is required before merge. No historical experiments, additional provider routes or cron invocations are involved. Trading rules and account gates are unchanged.

The actual private account outcome remains unverified until its next normal analysis request runs this deployment. Deployment alone must not be reported as a successful momentum repair.

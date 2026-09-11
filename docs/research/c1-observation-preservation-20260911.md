# Preserve C1 collection evidence before reconciliation

The normal 21:00:47 UTC production collection on September 11, 2026 reached the price-anchor guard and returned 503. The two BRK.B/BF.B missing lookups are gone after PR157. Eighteen prices now differ: the prior 17 plus ALB (122.11 saved; 121.70 newly observed). Thus the upstream historical-price vintage is still changing. The specific economic cause of each change has not been established.

Previously, the complete compiled observation was discarded when connection rejected a price revision. Only bounded diagnostic logs survived. That could lose the actual observed membership, signals, and price vintage needed for a subsequent audited reconciliation; rebuilding them on a later date is not equivalent.

This repair archives the exact current market input before connection in a separate private, content-addressed Blob object. Its real observation time and provider hashes are retained. Repeated identical input is idempotent; changed input creates another object. An archive failure stops the transition. Existing objects cannot be overwritten. The accepted model and private account are not archive destinations, and no code promotes an archive into either one.

The acquisition also retains an allowlisted set of numeric provider OHLCV/adjusted fields for the last two sessions, using the existing response and no additional provider calls. Original field names are kept; they do not independently certify the reason for an adjustment. Credentials, provider URLs, account fields, and arbitrary response properties are excluded. Logs contain only the observation hash/date and an explicit unaccepted flag.

Focused regressions cover immutable duplicates, changed-price preservation, tampering/create conflicts, failed archival, retention before a rejected connection, field privacy, and unchanged trade authority. CI also runs the existing build and regression suite.

Remaining work: establish dividend/split/vendor-revision evidence for the changed prices and implement/test the corresponding accounting transition. This archive is not that transition, does not advance the model, does not repair previously discarded inputs, and does not certify alpha or live trading. No cron was invoked manually and no schedule or release gate was changed.

Provider documentation: https://site.financialmodelingprep.com/developer/docs/stable/historical-price-eod-dividend-adjusted

## Issuer evidence collected during this repair

Albemarle declared $0.41 per share with a September 11 record date and October 1 payment date. Its observed reduction is also $0.41. Garmin's approved installment is $1.05 with a September 11 record date and September 25 payment date; its observed reduction is $1.05. Regency declared $0.755 with a September 11 record date and October 2 payment date; its displayed price reduction is $0.76. These are evidence consistent with dividend adjustment, not proof that every changed price has the same cause or permission to rebase model shares.

- https://www.albemarle.com/us/en/news/albemarle-announces-quarterly-common-stock-dividend-7
- https://www.garmin.com/en-US/newsroom/press-release/corporate/garmin-shareholders-approve-quarterly-dividend-through-march-2027/
- https://investors.regencycenters.com/news-releases/news-release-details/regency-centers-declares-quarterly-dividends-2

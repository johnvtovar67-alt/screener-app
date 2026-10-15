# Completed eight-security developmental study

The separately authorized bounded acquisition and historical comparison completed under run `eight-20261014-v1`. The run used 16 new requests and 2,813,092 response bytes within its 20-request/12MiB cap. All responses were successful. Read [EXECUTION-ADDENDUM.md](EXECUTION-ADDENDUM.md) for the owner's superseding execution instruction and [PROTOCOL.md](PROTOCOL.md) for the frozen statistical definitions. Earlier paused-status documents are chronological records, not the current execution status.

This experiment is separate from production C1, account records, PR #262 and the frozen 48-Challenger protocol. No production behavior changed. It measures raw factors and partial hypothetical exit outcomes; it does not reconstruct official C1 ranks or portfolio returns, implement an adaptive trigger, or select a winning rule.

## Code and operational evidence

- `analysis.py` imports the preserved sibling analyzer and adds matched/unmatched factor responses, forward outcomes, lagged risk normalization, uncertainty, regimes and influence checks. The double-exclusion sensitivity retains the original full-eight formation groups and common bootstrap draws.
- `run_eight.py` performs the bounded one-time acquisition, validates inputs, computes aggregates and writes private outputs outside Git. Existing run identifiers cannot be reused. Do not run another acquisition merely to verify this checkpoint.
- `report.py` renders existing aggregate JSON into private Markdown/CSV with exclusive creation and directory/file permission checks. It never reads price bars.
- `runs/eight-20261014-v1/operational-audit.json` records requests, schemas, counts, dates, code hashes and validation results. It contains no source prices, provider fingerprints or numerical research outcomes.

The independent NYSE calendar and SPY agree for all requested histories. Warmup, date uniqueness, adjusted OHLCV geometry and missing-observation checks passed. Repeated windows agreed, and targeted split/dividend checks passed. The membership-change feed was available, but a complete dated eligible universe and historical sectors were not verified. All full-history payloads matched the prior fingerprints; calculations used only the new timestamped cohort, without splicing earlier rows. This is neither a vendor atomic snapshot nor original-as-known history.

Private base/extended aggregates, numerical reports, provider fingerprints, exact executed driver and administrative record are retained outside this checkout. No licensed source rows were saved. Neither private numerical results nor support correspondence belong in this repository. The published driver differs from its privately preserved executed copy only in wording of the private administrative-policy template; acquisition and numerical computations are unchanged. The execution audit identifies this distinction, and its driver hash binds the private executed copy.

## Retrieve and verify without data access

Another session can check out this branch or its checkpoint commit, read this document, the protocol and the addendum, and run the following entirely synthetic checks with Python 3.10 or later. The tests use the standard library and make no provider requests:

```sh
python -m unittest discover -s research/c1-eight-20261014 -p 'test_*.py' -v
python -m unittest discover -s research/c1-fresh-20261014 -p 'test_*.py' -v
node tools/c1-release-freeze-check.cjs
```

There are 23 extension/renderer tests and 16 preserved analyzer tests. They cover rule parity, signal timing, lagged risk inputs, causal regimes, matched/unmatched and censored paths, common formation groups, sparse uncertainty, and private report safeguards. Historical results require the owner's permitted private aggregate file; retrieving the code alone does not retrieve numerical findings or source data. Re-rendering requires a new empty directory with mode0700 outside Git:

```sh
python research/c1-eight-20261014/report.py /owner/private/eight-aggregate.json /owner/private/new-report-directory
```

## Remaining scope limits

Provider account-wide remaining quota is not exposed by the connection. The audit records actual consumption and the experiment cap, without claiming a measured account remainder. The narrow technical location-notification question is tracked separately in the private administrative record under the owner's latest instruction; it is not presented as missing research permission. No infrastructure, credential, messaging or recovery work is part of this checkpoint.

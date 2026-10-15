# Prepared eight-security extension — acquisition paused

Status: analysis code and protocol prepared; **zero new FMP market-data requests, no eight-security numerical findings**. The owner expressly requires resolution of FMP's processing-location notification requirement before further acquisition. Actual remaining account request/bandwidth headroom is also unverified. Read `LOCATION-NOTIFICATION.md` and `PERMISSIONS.md`. An email draft exists only in the owner's private workspace and has not been sent.

This is the owner's separate extension of the prior partial study, independent of production C1, PR #262 and the frozen48-Challenger experiment. `PROTOCOL.md` freezes the unchanged definitions and added measurements before data acquisition. Original code/checkpoints and private prior numerical output have not been overwritten or combined with another vintage.

## Prepared implementation

`analysis.py` exposes `analyze(data, bootstrap_replicates=2000)`, where `data` is the same ephemeral normalized OHLC input accepted by `../c1-fresh-20261014/analyze.py`. It imports the original factor/onset/H/P routines rather than replacing the definitions. It adds per-security/year/causal-regime reporting, ex-ante risk-unit measurements, joint response/censoring coverage, shared-quarter block bootstrap uncertainty, equal-security summaries and leave-one-out influence. The output consists of aggregates, including low-count private cells; every numerical output must remain private. It does not fetch or persist market data and does not implement a new volatility-adjusted trigger.

Run synthetic verification only while acquisition is paused:

```sh
python -m unittest discover -s research/c1-eight-20261014 -p 'test_*.py' -v
python -m unittest discover -s research/c1-fresh-20261014 -p 'test_*.py' -v
```

Fifteen extension tests and sixteen preserved tests pass. Read-only independent review found no blocking timing/threshold change; tests cover original-rule parity, lagged sigma/future independence, prior-close regimes, all security partitions, matched/unmatched responses, sparse uncertainty and horizon censoring. These are software checks, not historical findings.

## Resume requirements

First resolve the location/processing/retention scope with FMP using verified identifiers or FMP's accepted managed-cloud procedure, and retain the evidence privately. Separately verify current dashboard headroom for the new20-call/12MiB cap. Then preflight a unique owner-private output directory (0700, files0600) outside Git and freeze a new provider-vintage audit. Use only that fresh cohort; compare response hashes with prior audits without splicing inputs. Save the original eight-name aggregate before extended summaries, expose horizon censoring, and preserve only permitted private aggregate outputs. No prior acquisition command may be used to bypass these prerequisites.

The current private output filesystem was tested successfully for create/write/fsync. No licensed inputs were retained or read by the extension implementation/tests. No market-data request, external message, credential change, infrastructure/Blob operation, deployment, production/account edit or frozen-protocol modification was performed during preparation. The email is draft-only; producing it does not complete notification.

Until real eight-security evidence exists, no updated recommendation to advance a volatility-adjusted Challenger is supported by this extension. The earlier two-security findings remain the earlier limited study.

# Volatility-normalized deterioration research

This is the separately authorized next phase, following checkpoint e352154e8e47c4dd29601f630bb198f6187a56d6. Read PROTOCOL.md first. The candidate, cohort, date splits, timing, costs, outcome labels, uncertainty and decision gates are frozen before the new acquisition. No threshold optimization is allowed.

The study keeps weekly new-entry veto diagnostics separate from identical-entry quarterly Swing holding diagnostics. The unchanged fixed7% control and exact lagged C1 raw factors remain references; sample-relative ranks are never substituted for real C1 ranks. Current source data cannot reproduce the complete rank/account policy.

`common.py` reuses pure preserved primitives and implements the causal candidate/context. `entries.py` supplies common weekly opportunities and symmetric episodes. `holding.py` supplies paired lots. `stats.py` supplies common-quarter intervals and influence checks. `analysis.py` orchestrates without I/O. `run.py` is the one-time bounded acquisition driver and saves only private aggregates/provenance outside Git. Do not rerun a completed acquisition to verify this checkpoint.

Synthetic verification, without credentials or market requests:

```sh
python -m unittest discover -s research/c1-volnorm-20261015 -p 'test_*.py' -v
python -m unittest discover -s research/c1-eight-20261014 -p 'test_*.py' -v
python -m unittest discover -s research/c1-fresh-20261014 -p 'test_*.py' -v
node tools/c1-release-freeze-check.cjs
```

The 2010–2018 interval is previously unexamined by this fresh-data framework, not chronological forward validation or guaranteed project-wide untouched history. 2020–2024 is explicitly development/reused history. 2025 is new to this framework. Price histories use current provider adjustments and are not original-as-known snapshots. Design sector labels and hindsight-selected histories are not a survivorship-free investable universe.

No numerical results, provider fingerprints or source records belong in this repository. They remain in the existing subscriber-private cloud workspace subject to established conditions. The narrow technical-location notice issue is separately recorded; the owner's underlying private-research authorization is settled. Provider-wide remaining quota is not numerically exposed. The driver enforces its new40request/32MiB cap, no retries and no credential/infrastructure changes. Production C1, account records, PR262 and the frozen48program remain unchanged.

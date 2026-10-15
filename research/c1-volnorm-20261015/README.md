# Volatility-normalized deterioration research

Current owner disposition: **closed; no threshold changes, optimization or variants**. Read [DISPOSITION.md](DISPOSITION.md). Original code and private negative findings remain preserved; no rerun is authorized.

This is the separately authorized next phase, following checkpoint e352154e8e47c4dd29601f630bb198f6187a56d6. Read PROTOCOL.md first. The candidate, cohort, date splits, timing, costs, outcome labels, uncertainty and decision gates are frozen before the new acquisition. No threshold optimization is allowed.

Execution completed as `volnorm-20261015-v1`:33requests and18,742,089response bytes within the40request/32MiB hard cap. All24active securities andSPY were retrieved; dates, adjusted geometry, independent calendar, repeats and targeted corporate actions passed. There were no internal price-calendar gaps. TSLA/META leading IPO gaps remain absent and unsupported opportunities/lots are censored. None of the three optional delisted identities was verified within the prespecified two-page metadata bound; no optional history was requested. This does not establish that the provider lacks those histories. No additional endpoint or alias was attempted.

Protocol commit0ae1b8c and numerical implementation commit2e80d7f precede acquisition. The operational audit binds exact source hashes; all five numerical-engine files still match. The exact executed driver is preserved privately. The published driver differs only in a provenance-output privacy correction: it retains identity-verification flags rather than optional source metadata rows. The executed identity map was empty, so zero such rows were saved. Reporting-format code and synthetic checks were added without changing the frozen analysis.

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

Private aggregate JSON, independent numerical audit, Markdown report and detailed aggregate CSV are preserved outsideGit in the existing owner-restricted workspace. This is local private preservation, not a new remote numerical-data backup. The public checkpoint contains no empirical outcome values or derived research recommendation. Another session can retrieve the code and operational evidence and run48new synthetic checks plus39preserved checks with no FMP requests. `report.py <private-aggregate.json> <new-private-directory>` re-renders permitted existing aggregates with0700/0600permissions and no overwrites.

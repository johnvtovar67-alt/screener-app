# C1 capital rotation: historical metadata qualification

Owner-approved scope: qualify 2024-12-31 through 2025-04-03 metadata with at most
25 additional FMP requests. The proposed 1,750-request acquisition is **not
authorized**. No price histories, portfolio simulation or exit variant were
acquired/run. Incidental quote fields returned by profiles were discarded.

**Disposition: NO-GO for the full historical acquisition.** The target change's
effective date and action handling are verified. The entire dated roster,
security lineage and historically valid C1 sector partition are not certified.
This is a completed bounded gate with specific missing evidence, not permission
to repeat infrastructure or archive recovery.

## What actually ran

The existing connection completed **9 requests**, all HTTP 200, totaling 873,541
response bytes. Sixteen requests remain unused under this task's cap; this is
not a claim about the subscription's account-wide remaining quota. The run is
sealed. No bulk prices, new credentials, services or original frozen archives
were accessed. Current metadata was preserved as a distinct 2026-10-15 vintage,
not combined with an older provider vintage.

| Request | Endpoint / qualification purpose |
|---|---|
| 1 | Current S&P 500 constituent schema and anchor |
| 2 | Historical constituent actions and date fields |
| 3 | Test whether an asserted 2024-12-31 date produces an as-of roster |
| 4 | Symbol-change coverage and date-filter semantics |
| 5–8 | Four targeted identity/share-class profiles; incidental quote fields discarded |
| 9 | Available sector labels/schema |

Licensed responses, hashes, detailed numerical diagnostics, rosters and the
dated sample stay in the established subscriber-private working directory.
Support correspondence is also private. This checkpoint contains code,
synthetic tests, public-source references and operational evidence only.

The date-parameter test did not produce a historical snapshot. The current
anchor path also fails strict reconstruction without separately verified later
ticker and corporate-action transitions. The failure is preserved, not repaired
by an undocumented alias or skipped constituent.

## Verified event semantics and reproducible candidate

The [primary S&P announcement](https://press.spglobal.com/2025-03-07-DoorDash%2C-TKO-Group-Holdings%2C-Williams-Sonoma-and-Expand-Energy-Set-to-Join-S-P-500-Others-to-Join-S-P-100%2C-S-P-MidCap-400-and-S-P-SmallCap-600)
was published March 7, 2025; its four S&P 500 additions and four removals become
effective **before the March 24 open**. Membership must not change on March 7.
Its GICS descriptions qualify those event facts, not the complete C1 sector
history. Replacement row pairings do not identify economic rotation pairs.

The [December 27 public snapshot](https://github.com/datasets/s-and-p-500-companies/tree/f455575f4e89aebf51dab5c91a470b41b68a4234)
contains 503 security lines, 500 issuer CIKs and eleven GICS sectors. Applying
the verified target actions gives 503 lines and matches the independently dated
March 26 snapshot exactly. Reverse reconstruction also agrees. These are
necessary checks; they do not certify gaps between snapshot dates. The public
scrape did not reflect the March 24 changes until March 26, demonstrating why a
commit timestamp cannot be substituted for an effective date.

`membership.py` rejects contradictory fields, preserves distinct share classes,
and splits explicitly typed addition/removal actions. A removal-only row's
`symbol` is never reused as an added ticker. Full-date batches permit separate
addition and deletion dates and temporary count changes. Tests cover these
mechanics and fail-closed behavior. A passing parser does not establish feed
completeness. See [primary date and identity evidence](PRIMARY-SOURCE-NOTES.md).

FMP's [public changelog](https://site.financialmodelingprep.com/developer/docs/changelog)
records constituent date corrections on October 6, 2026 and new action fields
on October 12. Fresh retrieval is corrected current-vintage metadata, not a
claim about information delivered by FMP in 2025.

## Blocking evidence and concrete resolution

1. **Complete dated roster:** every candidate security/class was reconciled to the
   [December 31 SPY SEC schedule](https://www.sec.gov/Archives/edgar/data/884394/000175272425043826/NPORT_J905_96606633_1224.htm),
   with zero unresolved identities. Still independently establish complete effective
   action coverage through April 3. ETF holdings and equal counts alone do not define
   index membership. Preserve known-on and valid-on dates separately.
2. **Identity:** date-bound security/issuer/class identifiers and any corporate
   transition; preserve Alphabet, Fox and News Corp classes as separate ranking
   lines despite shared issuer CIKs. Current profiles are corroboration, not a
   historical security master. Later mergers must not become ticker aliases.
3. **Historical sectors:** every ranked member-date needs a supported sector
   interval in the actual C1 input partition. The [FMP FAQ](https://site.financialmodelingprep.com/faqs?code=discountedCashFlow)
   describes a customized classification; a rename of GICS category labels cannot
   establish company-level equivalence. Current profiles and aggregate sector
   performance are insufficient.

Free reliable alternatives were retrieved and checked: the [eleven sector-fund December
31 schedules](https://www.sec.gov/Archives/edgar/data/1064641/000175272425043828/NPORT_J911_72332077_1224.htm)
and a [September 30 report published before baseline](https://www.sec.gov/Archives/edgar/data/1064641/000119312524270452/d870399dncsr.htm),
plus dated official classification/change notices. The December schedules were
filed February 27, 2025; their report date must not be represented as their
availability date. SEC permits public filing access/reuse subject to its
[access rules](https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data).
The public snapshot publisher states PDDL licensing; that is not an independent
warranty about underlying GICS rights or completeness. Use reference material
privately; do not redistribute a compiled sector database under that assumption.

The December 31 SPY schedule and the union of the eleven sector-fund equity
schedules each contain 503 distinct name/class lines, with exactly equal sets.
All 503 reconcile one-to-one to the December 27 public snapshot: 456 normalized
name matches plus 47 explicitly reviewed legal/brand/class aliases, no unresolved
rows and no sector disagreements. This is actual anchor corroboration, not just
an equal-count comparison. The full source line coverage and reconciliation
details are preserved privately; no prices are in the extracted outputs.

The next source task requires **zero FMP calls**: verify the effective-dated
classification notices and complete index-action coverage between the qualified
anchors, retaining any exception rather than silently filling gaps. That can establish a GICS-based
historical input manifest. It cannot manufacture unavailable FMP history.
An external GICS sector partition would be an explicitly changed research input,
requiring its own recorded specification; it must not be called an exact
historical C1/FMP replay. Do not repeat a general licensing/capability inquiry
or propose a paid subscription while these free sources remain available.

Exact historical C1 sector replication requires an already existing dated FMP
baseline plus a complete classification ledger (or authoritative no-change
evidence), with taxonomy, effective/availability dates and security joins.
If no such non-frozen source exists, that exact historical path remains NO-GO;
the alternative is a separately specified GICS study or a prospective observed
metadata period. Neither requires frozen-archive reconstruction.

## Reproduce without acquisition

Check out this research commit and read the previous
[rotation specification](../c1-rotation-plan-20261015/PLAN.md). Use separately
obtained private evidence; raw inputs are intentionally absent from Git.
Do not call `probe.py` to repeat the sealed run.

```sh
python -m unittest discover -s research/c1-metadata-gate-20261015 -p 'test_*.py'
node tools/c1-release-freeze-check.cjs
python research/c1-metadata-gate-20261015/audit.py --private-dir PRIVATE_RUN --public-baseline BASELINE_CSV --out NEW_PRIVATE_AUDIT
python research/c1-metadata-gate-20261015/membership.py --mode public-baseline-forward --private-dir PRIVATE_RUN --public-baseline BASELINE_CSV --public-terminal TERMINAL_CSV --terminal-observed-at 2025-03-26T00:41:22Z --out NEW_PRIVATE_SAMPLE
python research/c1-metadata-gate-20261015/sec_metadata_extract.py --kind sectors --chunks PRIVATE_SOURCE_DIR/sector-rendered-lines.txt --source-url https://www.sec.gov/Archives/edgar/data/1064641/000175272425043828/NPORT_J911_72332077_1224.htm --as-of 2024-12-31 --available-at 2025-02-28 --output NEW_PRIVATE_SECTOR_REPLAY
python research/c1-metadata-gate-20261015/reconcile_public_metadata.py PRIVATE_SOURCE_DIR
```

Private output paths must be inside an access-restricted directory. Files are
created 0600 and existing output files are refused. Preserve source snapshots
and provider vintage independently. `audit.py` makes zero network calls.
For the reconciliation command, use a working copy of the private source packet
without an existing `public-sec-baseline-reconciliation.json`; it refuses
overwrite. Both full SEC documents were replayed locally without network access.
Recorded SEC acceptance timestamps are not proof of the exact minute of public
availability; the replay's February 28 availability date is a conservative bound,
not a newly established publication timestamp. The private 12-row dated sample
contains baseline class examples and all eight March event facts.

The current-anchor mode deliberately fails on unqualified identity transitions;
its failure is evidence, not an instruction to troubleshoot infrastructure.

Verification: 21 focused tests pass; the approved application freeze check and
`git diff --check` pass. Production C1, accounts, PR #262 and the frozen
48-Challenger experiment are unchanged. This gate provides no portfolio returns,
performance comparison or live trading recommendation.

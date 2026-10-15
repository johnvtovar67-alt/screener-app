# Tranche 2: completed acquisition, one quarantined security

**GO for further separately authorized staged assembly; NO-GO for portfolio
economics from the present partial universe.** No historical portfolio replay,
strategy selection or production-equivalence claim is made.

| Operational measure | Actual |
| --- | --- |
| Authorized ceiling | 250 FMP requests /20 MiB |
| Requests made | 248; two unused |
| Response bodies consumed | 14,686,994 bytes /14.006609 MiB |
| HTTP errors /observed provider limits /application retries | 0 /0 /0 |
| Constituent lines acquired across three views | 82, including 76 new lines |
| Constituent triples cleared /quarantined | 81 /1 (BDX) |
| Benchmarks | SPY and QQQ, adjusted view only |
| Full-window price views /rows | 248 /78,368 |
| Missing /extra session observations | 0 /0 |
| Sectors represented | 10; Communication Services remains unacquired |

Each price view contains 253 context observations through 2024-12-31 and 63
evaluation sessions through 2025-04-03. Acquisition was sequential with two-second
minimum actual-start pacing, no redirects or retries. The sealed status is
`ACQUIRED_WITH_ISOLATED_FAILURE`. A second failed security would have stopped
the tranche; none occurred. Successful calls do not establish account headroom.

## Recovery and provenance

Before acquisition, a verifier agent with no parent history recovered all 25
prior-stage responses into a clean directory from the existing authenticated
private store. This was a fresh context in the same managed environment, not a
separate cloud-instance test. Committed recovery code, the evidence inventory,
journal integrity and an independently retained archive digest were checked.

The pre-acquisition method/client checkpoint is `4781622`. Its private manifest
was frozen before the new prices. The exact same six sentinels and two benchmarks
were reacquired rather than silently importing stage-1 inputs. The 20 overlapping
views were compared independently; the vintage comparison remains in the private
unit audit. No previous values were overwritten or combined.

Before the first FMP call, the complete manifest and recovery gate were uploaded
privately. Every response and immutable numbered journal checkpoint was preserved
before another FMP request. After sealing, a clean process recovered all 248
responses, 14,686,994 original bytes, the manifest and recovery gate, and verified
every recorded digest/size. This required zero FMP calls and no original archive.

Exact response hashes, licensed inputs, detailed unit diagnostics, per-security
sector/identity joins and the complete remaining-view inventory are private.
No licensed price/action rows or reconstructable prices are included in Git.

## BDX discrepancy: preserve failure, do not change the check

BDX has all three acquired views with complete dates and valid bar schemas.
Its inferred volume rebasing did not satisfy the frozen numerical unit check.
It remains quarantined; the failure was not converted into a pass by changing a
tolerance, inferring an action or selecting a new price vintage. The other 81
triples cleared the mechanical checks. Passing these checks is internal vendor
consistency, not independent exchange validation or complete action accounting.

A narrowly bounded public-source check found a **post-evaluation** BDX event:
its [February 9, 2026 SEC 8-K](https://www.sec.gov/Archives/edgar/data/10795/000119312526042827/d104936d8k.htm)
documents the spin-off of Biosciences and Diagnostic Solutions and combination
with Waters. This supports investigating a non-split corporate adjustment; it
does not establish FMP's precise adjustment convention or validate a share-volume
factor. The 2026 event must not be entered in the 2025 economic ledger or used
in a 2025 decision. No further FMP request was made to investigate it.

The smallest remedy is to qualify BDX's exact nominal-share/action basis and the
precision of the adjustment factor against independently documented action facts
and the already acquired nominal volume. Reacquisition alone is not a prescribed
remedy. If qualification fails, apply an explicit symmetric BDX quarantine and
report its ranking/holding sensitivity; do not silently change the accepted pool.

## Exact remaining scope

The accepted approximate regular union remains 505 lines: **81 cleared, one
acquired but quarantined, and 423 not acquired in this cohort**. Therefore the
unacquired price requirement is **423 × 3 = 1,269 requests**, not 1,270. The
one failed individual validation attestation and all three quarantined BDX views
are separately inventoried; they are not an automatic refetch instruction.

Of the 423 unacquired lines, 18 have the documented alias/merger deferrals in
[STAGE-2.md](STAGE-2.md); the other 405 require 1,215 three-view calls. The
deferred 18 would require another 54 price calls only after lineage treatment.
Deferrals are not permanent exclusions. BLDR/BWA/CAG have dated identities but
lack corroboration in the later current-index snapshot; that absence is not
itself a historical identity contradiction. All these qualifications remain
visible in the private coverage report.

The remaining nonprice requirements are:

1. Complete 2025-01-01..2025-04-03 dividends and splits, verified ex-date nominal
   amounts and payment dates, and effective-open membership removals. This stage
   acquired no actions; adjusted returns do not replace those ledger facts.
2. Resolve BDX's unit/action basis and the 18 deferred security lineages using
   bounded existing provider/official evidence, or document symmetric exclusions
   and their economic limitations. Do not substitute a current reused ticker.
3. Join every accepted member-date to the frozen GICS approximation and identity,
   seal the complete input manifest, then compile the full source ranking pool
   and eligible queues. Only then run the unchanged H/Champion pair and its
   prespecified execution/exclusion sensitivities.

An explicit planning reserve of at most 133 further nonprice/consistency calls
can be allocated as 28 dividend-calendar calls (14 consecutive seven-day-or-less
windows, at most two pages each), two split-calendar calls, at most 54 targeted
action-remediation calls, at most 36 identity calls, and 13 vintage-overlap calls.
The reserve includes BDX qualification; it is not permission to make all calls
or to retry failures. Missing facts at a page/reserve cap stop that component and
are disclosed. Exact endpoint/symbol manifests precede any new authorized tranche.

Thus the remaining proposal is **at most 1,402 requests** before any explicitly
approved scope change. Price-body sizes suggest roughly 72 MiB for the unacquired
member histories; this is an estimate, not subscription quota. A remaining
114-MiB planning envelope allows the bounded action/identity work. Neither the
request proposal nor byte envelope is authorized by the completed tranche.

The recorded rotation metadata gate used nine requests /873,541 bytes; stage 1
used 25 /2,273,904; this tranche used 248 /14,686,994. Conservatively counting all
three gives **282 requests /17,834,439 bytes**. Adding the 1,402-call proposal
would give 1,684 requests, inside the overall 1,750 ceiling; the 192-MiB overall
ceiling remains controlling too. This is experiment-ledger arithmetic, not a
claim about account-wide usage or remaining subscription capacity.

## Reproduce the audit

The code is nonproprietary; inputs and outputs below must stay private:

```sh
python research/c1-rotation-execution-20261015/audit_stage2.py \
  --journal PRIVATE_STAGE/journal.json \
  --previous-journal PRIVATE_STAGE1/journal.json \
  --output NEW_PRIVATE_UNIT_AUDIT.json
python research/c1-rotation-execution-20261015/stage2_coverage.py \
  --journal PRIVATE_STAGE/journal.json \
  --manifest PRIVATE_STAGE/manifest.json \
  --output NEW_PRIVATE_COVERAGE.json
```

The audit independently parses/checks response hashes and bars. The coverage
builder checks journal attestations and dated joins and produces the exact
remaining list; it does not independently validate action accounting. Recovery
instructions are in [STAGE-2-ACQUISITION.md](STAGE-2-ACQUISITION.md).
Sixteen manufactured acquisition-guard tests and twelve manufactured recovery
checks pass. The production release freeze passes. Production C1, accounts,
PR #262 and the frozen 48-Challenger program remain unchanged.

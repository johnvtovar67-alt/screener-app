# Capital rotation: bounded acquisition and offline implementation

Status: **stage 1 completed; GO for a separately approved acquisition expansion;
NO-GO for a historical portfolio result from this partial input.**

The owner's 25-request/8-MiB instruction supersedes the earlier dashboard
headroom prerequisite for this stage. The larger acquisition is not authorized
by this checkpoint. Account-wide remaining quota is unknown and successful API
responses are not used to estimate it. General personal-research and private
processing authorization remains settled; this stage does not reopen it.

## What actually ran

The frozen [stage manifest](STAGE-1.md) used the existing connection for exactly
25 requests, all HTTP 200, with 2,273,904 decompressed response bytes
(2.168564 MiB). There were no retries, transport errors or observed provider-limit
responses. Starts were at least two seconds apart and requests were sequential.
This conservatively limits this job's load but cannot certify production quota
headroom or exclude simultaneous usage elsewhere. The journal is sealed.

Six mechanical sentinels—NVDA, ORLY, FAST, PG, WSM and BRK-B—have three separate
price views. SPY and QQQ have the dividend-adjusted view. The 20 full-window
series cover 2023-12-29 through 2025-04-03: 253 context observations through
December 31, followed by 63 evaluation sessions. A separate six-session overlap
request was checked without merging vintages. Coverage and exact-response
provenance are private; no prices, action amounts, rankings or detailed market-
derived numerical outputs are included in this repository.

The action probes are deliberately partial: a March 10–21 dividend calendar,
January 1–March 31 split calendar, PG dividend history and ORLY split history.
Neither success nor a below-cap page certifies complete action coverage.

All 25 exact responses and the sealed journal were saved at new immutable,
subscriber-private paths using the existing store. A separate process retrieved
all responses, decompressed them and matched every original byte hash, recovering
2,273,904 response bytes. No original frozen archive was listed or accessed.
The journal's licensed-record hashes and private object addresses stay private.

## Frozen design and code

[PROTOCOL.md](PROTOCOL.md) and [design-freeze.json](design-freeze.json) retain the
pre-acquisition H intervention: five-session source-adjusted return at or below
−7%, minimum holding age five sessions, one chronological eligible original
position across the combined three-sleeve account. Ordinary source exits,
protections and buys retain their opening priority. Released cash can first fund
a new close-planned order for a later session. No security or trigger was chosen
from acquired outcomes. The failed volatility candidate remains closed.

* [stage_acquire.py](stage_acquire.py) enforces the single caller, fixed manifest,
  request/byte limits, immediate stop and immutable private preservation.
* [validation.py](validation.py), [PRICE-UNIT-EVIDENCE.md](PRICE-UNIT-EVIDENCE.md)
  and [DATA-UNIT-CONTRACT.md](DATA-UNIT-CONTRACT.md) separate dividend-adjusted
  signal ratios, split-only volume units and nominal execution dollars. A unit
  correction is not a change to the strategy or its thresholds.
* [signals.cjs](signals.cjs) invokes the unchanged source compiler with its
  actual 253-row gate and daily recommendation-memory reset. See
  [SIGNALS-API.md](SIGNALS-API.md) for dated joins and private input contracts.
* [engine.cjs](engine.cjs) preserves uninterrupted account state, the actual
  three sleeves and 1/2/1 account scaling. Its separate verified action adapter
  handles split share units and nonspendable dividend receivables. See
  [ENGINE.md](ENGINE.md). Incomplete economic inputs fail closed.
* [recover_stage.mjs](recover_stage.mjs) demonstrates exact-path recovery of this
  newly created stage, using the existing private SDK and bindings. It is not an
  archive-recovery tool.

The offline checks use manufactured data: 20 Python budget/validation tests,
the signal-adapter suite and 23 engine checks pass. These prove implementation
properties, not historical strategy effectiveness. The production release-freeze
check passes. No production file, account, PR #262 or frozen 48-Challenger
artifact is changed.

## What a new session can reproduce

Retrieve this research directory and its pinned application source from the
same Git commit. No licensed input is needed for these checks:

```sh
python -m unittest discover -s research/c1-rotation-execution-20261015 -p 'test_*.py'
node research/c1-rotation-execution-20261015/test-signals.cjs
node research/c1-rotation-execution-20261015/test_engine.cjs
node tools/c1-release-freeze-check.cjs
```

An authorized private session additionally needs the current-stage private
journal address and journal hash, the existing store binding, and the dated
metadata packet. Obtain those from the subscriber-private stage inventory, not
Git. `recover_stage.mjs RUN_ID NEW_PRIVATE_DIRECTORY EXPECTED_JOURNAL_SHA256`
retrieves only this stage's exact paths. The existing dependency installation is
used; its SDK path is explicit in the storage/recovery scripts. Do not run
`stage_acquire.py` again without fresh authorization: its cap is per stage, not
an account-wide acquisition permission.

## Remaining acquisition and calculation

The approved approximation has 503 baseline security lines and four documented
regular additions, giving a 507-line union before primary LEN/WDC exclusions.
Thus the current planned regular acquisition union is 505 security lines, subject
to documented identity quarantines. MRP/SNDK entitlements are not invented.
The two benchmarks are additional. The six sentinel securities are not a valid
substitute for the full opportunity universe or source replacement queue.

1. Freeze the complete request manifest and security-line/provider-alias map.
   Verify reused or changed symbols against the documented issuer/class lineage;
   in particular, a current PARA response must not silently substitute another
   issuer for historical Paramount. Quarantine an unsupported lineage identically
   in both arms and record its denominator/holding sensitivity. This does not
   reopen exhaustive metadata certification.
2. Acquire all three views for the accepted union and the two benchmark adjusted
   views in a new, separately labeled cohort. This is 505 × 3 + 2 = **1,517 price
   requests** before any explicitly documented quarantine. Reacquiring sentinels
   avoids silently stitching today's stage into a later provider vintage. If
   explicit mixed-vintage reuse is later approved, the mechanical remaining-price
   count is 499 × 3 = 1,497, with the existing two benchmarks; reuse is not the
   default. Current six-name response sizes project about **86 MiB** for the
   three-view member component; this is a planning estimate, not quota evidence.
3. Assemble full January 1–April 3 action coverage, including the unacquired
   April 1–3 splits. Use bounded calendar windows/pagination, company-level
   remediation only for accepted lines with missing facts, and verified nominal
   ex-date dividend amounts/payment dates. Check post-window splits to explain
   vintage units without treating them as in-period economic events. Preserve
   documented effective-open removals and original security identities.
4. Join the approved dated roster and GICS approximation to every session,
   validate all available-life histories and units, then seal a complete private
   input manifest. Both arms use the identical approximate inputs. Only then
   compile the full rank denominator and eligible queue and run the frozen pair.
   Accounting, exclusions, costs and timing sensitivities precede any conclusion.

A proposed remaining envelope is **at most 1,650 additional requests /128 MiB**:
1,517 price calls plus at most 133 action, identity, pagination and consistency
calls. This would put this acquisition plus stage 1 at at most 1,675 requests
and 130.169 MiB, inside the earlier overall 1,750-request/192-MiB ceiling.
It is not approved by stage 1. These totals cover this new price/action acquisition,
not a claim about lifetime account usage or earlier metadata requests. If the
remaining overall experiment allowance is lower in its shared ledger, that lower
limit controls. A manifest must allocate every reserve before use; unused reserve
does not authorize arbitrary calls. Missing coverage at the ceiling is reported,
not patched by exceeding it.

The next practical approval is a **250-request/20-MiB tranche** within that
envelope, sequential at the same conservative rate, reporting actual consumption
before another tranche. Any provider limit stops the job immediately, with no
retries. Each tranche is an acquisition checkpoint; none is a portfolio result.

The precise current blocker is incomplete licensed input coverage, not access,
credentials, infrastructure or a demand for perfect metadata. No economic A/B
return, drawdown, replacement gain, giveback or opportunity-cost finding is
available from this stage. The runner and private recovery path are ready for
the bounded full-universe assembly; empirical economics remain to be executed.

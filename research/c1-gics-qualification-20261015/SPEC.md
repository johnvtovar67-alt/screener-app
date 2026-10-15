# C1-GICS-ROTATION-2025Q1-v1

Frozen on 2026-10-15, before new evaluation-price acquisition or outcomes.
Owner approval: separately reconstructed historical GICS inputs for the focused
capital-rotation comparison. **Metadata qualification remains incomplete;
acquisition and economic execution are closed.**

This specification supersedes the historical **FMP sector** requirement in the
[previous rotation plan](../c1-rotation-plan-20261015/PLAN.md) and its metadata-gate
disposition. Missing FMP sector history is no longer a blocker. GICS does not
claim exact original C1/FMP replication. All other source calculations,
eligibility, allocation, risk and accounting requirements in that plan remain.

## Fixed sample and input contract

- Baseline: 2024-12-31 close. Run: the 63 sessions 2025-01-02 through 2025-04-03,
  plus the baseline ranking decision, for 64 decision dates. Exclude the January
  9 Carter closure. Use the official NYSE calendar, 16:00 America/New_York close
  timestamps including DST, and a separately evidenced calendar exception list.
- Price context begins 2023-12-29, with 253 benchmark sessions through baseline
  and 316 including the run. Warmup is price context, not permission to rank a
  current constituent before its actual admission. Available-life histories and
  the unchanged compiler's history exclusions apply to new listings.
- The ranking universe is the full effective-dated S&P 500 security-line pool,
  including any temporary spin-off/index placeholder actions. The baseline has
  503 corroborated share-class lines and 500 issuer CIKs. Four regular additions
  and removals give a **conditional** 507-line union; this is not a certified
  complete union. MRP and SNDK temporary actions remain unresolved. Do not fix the
  denominator at 503, omit temporary lines, or omit a difficult high-ranked name.
- For each ranking date, join exactly one membership and security identity
  interval for every effective member, and exactly one GICS sector interval for
  each member eligible under the unchanged source history/factor rules.
  A temporary placeholder proven to lack sufficient same-security history may
  be explicitly excluded from factor ranking without inventing a sector. This
  is not permission to omit its index action, identity or economic entitlement.
  Distinguish `valid_from/to`
  from `known_at`, source publication and retrieval time. Date-only announcements
  use a conservative end-of-publication-day bound; never move a fact earlier.
  Late filings corroborate prior facts rather than establish earlier knowledge.
- Identity key: explicit research security line plus issuer CIK and share class,
  with date-bounded ticker aliases. Distinct classes remain distinct ranking
  lines; issuer grouping remains shared. CUSIP/ISIN is additional evidence where
  needed, not a universal new dependency. A merger is not a spelling alias.
- Sectors use the eleven documented GICS sectors and consistent codes/labels in
  `sector` and `primaryTheme`. No current-profile backfill, mixed FMP/GICS map,
  `Other` fallback or guessed carry-forward interval is permitted. Every
  required interval needs dated facts and full-scope change/continuity evidence.
- All raw source vintages remain distinct. Provider corrections never overwrite
  an earlier response. Licensed source inputs, detailed joins/ranks/fills and
  derived private outcomes stay private under the established arrangements.

The [December 2024 baseline source](https://github.com/datasets/s-and-p-500-companies/tree/f455575f4e89aebf51dab5c91a470b41b68a4234)
is a dated external observation, corroborated by the later SEC schedules. Its
Git committer timestamp is evidence of a dated repository observation, not an
independently certified first-publication minute. Preserve that limitation.
The [NYSE 2025 calendar](https://www.nyse.com/publicdocs/ICE_NYSE_2025_Yearly_Trading_Calendar.pdf)
and [December 30 closure announcement](https://ir.theice.com/press/news-details/2024/The-New-York-Stock-Exchange-Will-Close-Markets-on-January-9-to-Honor-the-Passing-of-Former-President-Jimmy-Carter-on-National-Day-of-Mourning/default.aspx)
define the session count. This developmental period is not untouched validation.

## Identical source calculations in both arms

Both Champion A and rotation B receive **the same GICS-based historical input
manifest**, provider vintages, execution prices/actions, sessions and research
origin. A is current C1 under modified GICS inputs, not unconditional holding.
B differs only in its separately frozen one-time intervention.

Pin application code to `9416059bdf1b5e5053d0d8d31a83c8ce21519fe0`; source hashes
are in `source-pins.json`. Import the existing pure functions, do not approximate
or rewrite the score. Slow/fast momentum remain R(100,20)/R(55,5), with weights
.40 global slow, .25 global fast, .22 sector slow, .13 sector fast. Preserve
midpoint ties, component normalization, canonical-symbol tie breaking, benchmark
context, entry timing and full pre-screen percentile denominators. Preserve
MSTR/SCHW semantics and every source liquidity, price, volatility and history
exclusion. Metadata coverage is not a claim that every member has a valid score.

The offline adapter supplies the date's eligible pool and GICS profiles to the
unchanged compiler. Its static profile map must not become a timeless sector
map. Use resumable one-session compilation as needed, retaining raw price
prefixes, complete output-session alignment and `decisionMemory`. Warmup sessions
may provide bars with an empty ranking universe; do not create prebaseline
rank/decision history from backdated profiles. The explicitly simulated account
and decision memory begin at the declared research origin. Do not restart memory
at a sector transition. Prove segmented/constant-sector parity and future-data
mutation invariance before economic execution.

Preserve the source simulator's **entry-sector** value on an existing position;
it is not automatically refreshed after a classification change. New signal
ranks/entry checks use that decision date's GICS. Do not introduce a new held-
position sector-reclassification rule in the name of metadata accuracy.

## Unchanged account and execution contract

Use the previous plan's explicit from-cash research account: $400,000 actual
capital across $100,000/$200,000/$100,000 sleeves, normalized source units with
1/2/1 actual-dollar scaling and consistent integer actual shares. Seed the
current account overlay causally. This is not the user's actual historical
account. Keep all three sleeves separate and retain source whole-share sizing,
minimum orders, no borrowing, cash availability, top-nine candidate queue,
issuer/sector/name limits, gap guard, stops, momentum overlays, cooldowns,
portfolio drawdown controls and order priority. Do not change account records.

The intervention clock remains close t decision, extra B sale at t+1 opening
price **after** ordinary opening sales and queued buys and before intraday stops.
The released cash/slot cannot fund any t+1 queued buy. Next normal close planning
may select a replacement for t+2 open, subject to every source constraint. No
forced replacement or best-future-return selection. Keep 12 bps per filled leg
and the prior plan's fee/cash/share accounting. Standing-stop and mandatory-exit
priority remain intact. Terminal April 3 is a common mark, not forced liquidation.

Mandatory distributions to actual held LEN/WDC shares cannot be discarded
because a new spin-off lacks momentum history. Resolve the event/share/cash and
price-adjustment contract before a portfolio run; do not double count a
distribution in both adjusted prices and a separately booked entitlement.

The intervention manifest is still **unset**. It must separately name the
authorized rule, event/selection procedure, sleeve scope, quantity and decision
clock before new evaluation outcomes are inspected. This specification invents
no exit indicator, optimizes no threshold and does not revive the rejected
volatility-normalized candidate. A missing/no eligible contrast is a result,
not permission to substitute a more favorable event.

## Qualification, validation and reporting

`coverage.py` checks every declared index member/date, source availability,
interval uniqueness, class identity, clock and full-scope continuity evidence.
It separates the index roster from source-rankable members. Missing factor
sectors on non-rankable temporary lines require a verified same-security
insufficient-history exclusion; they are not a separate ranking blocker.
Evidence verification is an explicit review assertion, not proof inferred from
matching endpoints. A verified baseline plus a complete official event ledger
may jointly establish continuity; a separate enormous identifiers subscription
is not required. Missing or overlapping intervals fail. Retrospective ledger
confirmation may validate a known baseline; it cannot backdate a new fact.

Before any acquisition approval request, certify complete membership/action
identity coverage and GICS/identity coverage for every potentially source-rankable
member, then produce the exact union/request manifest. Any required sector for
an economically held distribution remains an accounting/risk prerequisite,
separate from its eligibility for a new momentum entry.
Before economic execution, validate nominal/adjusted price/share/volume units,
corporate actions, no-op source-engine parity, A/B pre-intervention equality,
cash/share conservation and the delayed intervention ordering. Metadata GO alone
does not approve the 1,750-request plan or prove executable accounting.

Report A/B equity and cash paths, costs, turnover, replacement contribution,
original-position opportunity cost, cash delay, risk/cooldowns and rejected
candidates under **modified GICS inputs in both arms**. No alpha/live-rule claim.
Quantify GICS/FMP differences only on genuinely contemporaneous paired evidence.
At this freeze, verified contemporaneous paired classification coverage is zero;
the historical difference rate is unidentified, not zero. Existing cross-vintage
diagnostics stay separately labeled and private.

This qualification has a **zero-additional-FMP-request** budget and no new price
acquisition. The previous nine-request metadata run remains sealed; unused
allowance is not automatically carried into this stage. Preserve nonproprietary
specifications/code/source evidence in GitHub. Production C1, account records,
PR #262 and the frozen 48-Challenger program remain unchanged.

Version changes require an explicit recorded scope amendment before outcomes,
preserving this version and its hash. The missing evidence does not authorize
changing dates, thresholds, membership or sector assumptions to make a run pass.

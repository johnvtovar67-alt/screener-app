# One C1 recent-momentum Challenger

This records the original isolated implementation at `be24d87`. The later owner-authorized live integration and giveback extension are documented in [the production release](c1-recent-momentum-production-20261015.md); research-only statements below describe the original checkpoint.

Owner authorization: October 15, 2026 request to implement the reviewed 1/3/5-session decision gate in an isolated branch, with a 60-minute effort limit and no merge, deployment, account changes, new acquisition, platform evaluation, infrastructure, or broad research. This is one Challenger, separate from the frozen 48-Challenger program. No application route, cron, account service, or live recommendation imports it.

Champion reference: `f0d46ffceb98ba3fd5fca121beba6d8f23ccbdde`. The canonical account simulator, its generator, frozen historical simulator/options, current live rank-exit overlay, historical captures and account records remain unchanged. A new generator pins the complete canonical account simulator SHA-256 and applies explicit, unique seams to produce the separate Challenger engine. `--check` verifies its generated source.

## Exact decision rules

At each accepted completed session t, use six consecutive adjusted closes to calculate `R_h = 100 * (C_t / C_(t-h) - 1)` for h=1,3,5. Reuse the canonical same-session `entryTiming.macdImproving` boolean. This means the MACD histogram increased versus its previous value; false does not necessarily mean negative MACD. Do not reconstruct a missing indicator or use an opening day's later close, high, low or timing to determine an opening trade.

Define:

```
negativeWindows = R3 < 0 && R5 < 0
weakLatest      = R1 < 0 && macdImproving === false
recovery        = R1 > 0 && macdImproving === true
entryAllowed    = !weakLatest && (!negativeWindows || recovery)
```

This is a veto on existing eligibility, never independent buy authority. It applies to new purchases, existing-position additions and partial-target completions. It is checked when the close-generated queue is built and at execution against its causal preceding-close evidence. Existing opening-price, cash, issuer/sector, position, gap, minimum-trade and stop checks still apply. Queue ordering and target sizing are inherited from Champion.

A deterioration episode starts on a post-entry close with all three returns negative and MACD not improving. It continues on consecutive verified closes while R3 and R5 remain negative and MACD is not improving, including a small green one-session bounce. A recovery in either longer recent window, or improving MACD, breaks the confirmation sequence. If both windows remain negative, entry eligibility still requires the positive-session/MACD recovery exception.

Queue a full next-regular-open exit after three qualifying completed closes. Once validated since-entry daily-high peak gain has reached 12% against the current entry basis, use two qualifying closes. The armed state is latched for that sleeve/ownership lifecycle; it remains armed if gains disappear or a completion subsequently changes average cost. This adds no fixed-percentage-decline sell. The new branch can override the 30-session minimum and applies after entry at all holding ages. Existing full exits retain precedence.

State is keyed by symbol, sleeve and position lifecycle; a sale/reentry cannot inherit confirmation or profit arming. Repeated evaluation of one completed date does not add a confirmation. Missing, duplicate, stale, mismatched, unadjusted or gapped observations block fresh capital and break confirmation evidence. They do not authorize a new recent-momentum exit or a supported Hold. Established Champion risk exits retain their original authority.

## Implementation and isolation

- `lib/c1RecentMomentumGate.js`: shared pure extractor and decision state.
- `tools/generate-c1-recent-momentum-challenger.cjs`: pins canonical source and generates only the isolated derived engine.
- `lib/c1RecentMomentumChallengerSimulator.js`: actual simulated queues and fills, using all established C1 accounting/execution logic plus the gate.
- `lib/c1RecentMomentumChallenger.js`: paired Champion/Challenger wrapper for the three independent normalized sleeve books. Both use opening-account mode so Champion includes the current early/profit rank-exit overlay. The initial 25/50/25 weights combine complete portfolio equity paths without inter-sleeve transfers or artificial rebalancing.
- `tools/run-c1-recent-momentum-challenger.cjs`: existing local JSON input and stdout only. It never calls FMP, Blob, accounts, jobs, or another platform.
- `tools/c1-recent-momentum-challenger-regression.cjs`: deterministic offline integration checks through simulated decisions and fills.

The freeze manifest adds only hashes of the three new library files and an explicit isolated-Challenger authorization note. Existing application hashes, freeze checker, canonical-integrity checker and build hooks are not changed. This permits normal verification of the authorized branch additions without altering the Champion.

## Running it

From the branch root:

```
node tools/generate-c1-recent-momentum-challenger.cjs --check
node tools/c1-recent-momentum-challenger-regression.cjs
npm run build
node tools/run-c1-recent-momentum-challenger.cjs work/existing-input.json
```

Input shape:

```
{
  "dataset": {"metadata": {}, "sessions": []},
  "startDate": "an existing session date",
  "endDate": "an existing session date"
}
```

Supply existing accepted C1 session objects; the empty example is a schema illustration and is rejected. Include at least six prior/current consecutive price observations for the first current-momentum assessment, plus canonical stored timing. Optional `openingAccounts` contains all three existing normalized simulation opening seeds; omitted seeds start each model sleeve with $100,000 cash at the requested start close. Optional `completionRules` supplies existing dated completion rules keyed by sleeve. These are simulation inputs, not saved or inferred personal-account transactions. Actual execution-record replay is rejected by the Challenger.

For a self-contained offline demonstration, create the local synthetic fixture and run the same CLI:

```
node - <<'JS'
const fs = require('node:fs');
const {fixture, seedFor} = require('./tools/c1-recent-momentum-challenger-regression.cjs');
const f = fixture([100,99,98,97,96,100,105,110]);
const openingAccounts = Object.fromEntries(['base','cooldown15','sector40'].map(sleeve => [sleeve, seedFor(f,{sleeve})]));
fs.mkdirSync('work',{recursive:true});
fs.writeFileSync('work/c1-recent-momentum-demo.json',JSON.stringify({dataset:f.dataset,startDate:f.start,endDate:f.end,openingAccounts}));
JS
node tools/run-c1-recent-momentum-challenger.cjs work/c1-recent-momentum-demo.json
```

Output contains the complete paired sleeve runs, combined equity/cash curves, transaction and pending-decision ledgers, diagnostics, return/ending-equity/transaction-count differences and input SHA-256. Those portfolio paths include replacement-investment returns, subsequent reentries and missed recoveries; an avoided-loss-only calculation is not reported. Aggregate weighted model shares are not whole-share broker tickets.

## Verification

- Final focused suite: 222 assertions pass through actual synthetic portfolio queues/fills and shared-gate cases. It covers ordinary deterioration, armed profit protection after gains disappear, all holding ages, buys/adds/completions, a correction that recovers, small green days within continuing deterioration, new-position/reentry state reset, duplicate/stale/missing/future-dated evidence at both decision and opening execution, actual replacement purchases and missed recoveries.
- Canonical-source generator `--check` passes. No-trigger three-sleeve runs retain exact Champion trade, curve, cash and original-position-state parity.
- Standard `npm run build`: release freeze and canonical-integrity guards pass; 94/94 regression/simulation scripts pass; optimized Next.js compilation, static generation and tracing pass. The environment required child-process permission for the standard test harness; no guard or test runner was weakened.
- The local JSON/stdout CLI proof runs successfully. The synthetic rebound fixture intentionally produces lower Challenger ending equity, demonstrating that replacement returns and missed recovery gains are included rather than hidden.
- Original checkout remains clean at the pinned Champion commit. No merge, push, deployment, production/account write, new data acquisition or frozen experiment modification was performed.

## Limits

The tests use synthetic price paths, including DELL-like persistent deterioration and MPC-like daily-high profit activation, not newly acquired DELL/MPC histories or a historical alpha experiment. The 3/2 confirmation counts are one fixed proposal, not optimized or statistically validated. A persistent correction can still trigger an exit before a later rebound. The portfolio tests establish executable mechanics, not superior investment performance.

Only validated highs present in the supplied existing session history can establish the supplemental opening profit arm. Older peaks outside that history are not invented; incomplete coverage is exposed in diagnostics. Canonical existing risk calculations remain unchanged. Supplied market-availability timestamps are checked against their enclosing decision time; absence of those fields retains accepted-session provenance rather than certifying it independently. Point-in-time universe/sector quality and correctness of accepted source data remain properties of the supplied dataset, not claims made by this runner.

Live UI/account integration, real fills, deployment and changes to production rules are outside this branch. Before any release decision, review this exact implementation and assess a bounded paired portfolio replay on an already authorized dataset, including costs, replacement returns, drawdowns, turnover and missed recoveries.

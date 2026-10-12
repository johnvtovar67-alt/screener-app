# Independent C1 Challenger research

**Research remains open. A — KEEP CURRENT C1 is the interim production decision, not a final Challenger conclusion.** Read [the continuation checkpoint](continuation.md), [checkpoint report](checkpoint-report.md), [frozen plan](plan.md), and [experiment matrix](experiments.json). No new historical baseline or Challenger comparison is verified. Production and live accounts are untouched. [Issue #259](https://github.com/johnvtovar67-alt/screener-app/issues/259) remains open for provider-permitted private access to the exact original inputs.

The owner selected [two separate immutable source baselines](baselines/README.md). The audit source preserves the saved 289.07% historical provenance; the production-equivalent source excludes SCHW from allocation and preserves holding ranks. Final Challenger comparisons use only the latter. Their performance must be established independently.

This directory contains both source snapshots, the original replay code, all 48 research overlays, independent replay verification, and development/locked-validation analysis. It is outside application imports and build hooks. Source copies are evidence; application files remain unchanged.

From the repository root:

```sh
python3 research/c1-challenger-20261012/fetch_public_references.py
python3 research/c1-challenger-20261012/audit_saved_evidence.py
python3 research/c1-challenger-20261012/preflight.py --baseline production-equivalent
node research/c1-challenger-20261012/provenance/reproduce.cjs
node research/c1-challenger-20261012/mechanics/options-mechanics-regression.cjs
node research/c1-challenger-20261012/harness/implementation-inventory.cjs
node research/c1-challenger-20261012/harness/harness-driver-regression.cjs
node research/c1-challenger-20261012/analysis/diagnostics-regression.cjs
```

The first command fetches only reference files already public at the immutable validation commit and verifies Git blob identities. It downloads no private price/factor chunks. The preflight intentionally exits 2 while exact inputs and licensed private durability are unavailable. It never executes a strategy. Synthetic checks establish software behavior, not historical performance or finalist eligibility.

Follow [the historical runner instructions](harness/README.md) and [analysis/lock instructions](analysis/README.md) after the gates pass. Do not rebuild substitute inputs, publish proprietary market data here, select finalists from synthetic fixtures, merge, deploy, or change production C1. Saved conditional figures remain source-bound reference evidence, not certified alpha. Temporarily unavailable inputs defer dependent runs; they do not close this program.

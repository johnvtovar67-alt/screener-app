# Independent C1 Challenger research

Read [the checkpoint report](checkpoint-report.md), [frozen plan](plan.md), and [experiment matrix](experiments.json). No historical Challenger comparison is verified. Production and live accounts are untouched. Private licensed inputs and exact Champion identity remain unresolved; [handoff issue #259](https://github.com/johnvtovar67-alt/screener-app/issues/259) coordinates with the source session.

This directory contains an immutable application-source snapshot, original replay code, independent evidence-review code, synthetic provenance fixtures, and research-only option mechanics. It is outside application imports and build hooks. Source copies are evidence; they are not application changes.

From the repository root:

```sh
python3 research/c1-challenger-20261012/fetch_public_references.py
python3 research/c1-challenger-20261012/audit_saved_evidence.py
python3 research/c1-challenger-20261012/preflight.py
node research/c1-challenger-20261012/provenance/reproduce.cjs
node research/c1-challenger-20261012/mechanics/options-mechanics-regression.cjs
```

The first command fetches only reference files already public at the immutable validation commit and verifies Git blob identities. It downloads no private price/factor chunks. The preflight intentionally exits 2 while exact inputs, private durability and Champion source identity are unresolved. It never executes a strategy.

Do not run historical comparisons until these gates pass. Do not rebuild substitute inputs, publish proprietary market data in this repository, select finalists from synthetic fixtures, merge, deploy, or change production C1. Saved conditional figures remain source-bound reference evidence, not certified alpha.

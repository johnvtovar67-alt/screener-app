# Screener source-of-truth policy

## Canonical production

- Git repository: `johnvtovar67-alt/screener-app`
- Canonical branch: `main`
- Canonical Vercel project: `screener-app-cq5t`
- Canonical production host: `screener-app-cq5t.vercel.app`
- `/api/version` must report the deployed Git commit, branch, release manifest and canonical project.

## Non-negotiable release rules

1. Application source must be fully committed before deployment. Build and verification scripts may test source but may not mutate `pages/`, `lib/`, or other application code.
2. Every production change must land on `main`. Feature branches are temporary review surfaces, not alternate production lineages.
3. A feature is considered present only when it is represented in committed source and covered by a regression/integrity check. A Vercel build-time patch is not source of truth.
4. Production should be deployed only from `main` to `screener-app-cq5t` after `npm run build` succeeds.
5. Do not delete historical branches or Vercel projects until reconciliation confirms they contain no unique behavior that is absent from canonical source.
6. New trading logic must include a regression that fails if the intended gate, decision, or safety behavior disappears.

## 2026-08-26 reconciliation findings

All repository branches were compared against `main`. Most historical feature branches are fully behind `main`, meaning their commits are already ancestors of the current line. Two historical branches were technically diverged:

- `fix-forward-asymmetry-rotation`: four branch-only commits. Their intended behaviors were reviewed against current source. Current canonical code contains later/superseding forward-asymmetry gates, entry-impulse anti-chase logic, capital-confirmation margins, capital-efficiency ranking, Strong Buy continuity/hysteresis, and stricter portfolio decision logic. The old branch must not be merged wholesale because doing so would overwrite later safeguards.
- `hardening/version-control-2026-08-25`: seven branch-only commits. Its intended version/health/CI/source-materialization safeguards are present in later canonical source. The remaining build-time mutation problem was resolved during this reconciliation by materializing the exit-stability patch into committed source and converting build scripts to verification-only.

The reconciliation branch `reconcile/canonical-2026-08-26` was created from current `main`; all legacy build-time patches were applied once, the resulting application source was committed, and a clean build completed successfully. `tools/canonical-integrity.cjs` now fails builds if critical trading safeguards disappear or if an `apply-*` mutation script is reintroduced into `prebuild`/`verify`.

## Critical behaviors guarded by canonical integrity

- forward reward/asymmetry gating
- base scoring gate alignment
- anti-chase entry impulse controls
- capital confirmation before funding
- capital-efficiency/whole-share friction ranking
- material company-news and FDA safety-event gating
- Strong Buy retention/hysteresis without bypassing hard entry gates
- structural exit confirmation and capitulation review guard
- production version/commit visibility
- immutable build source

This file describes deployment/source-control policy, not investment performance. Trading recommendations still require ongoing empirical validation against the performance ledger and forward returns.

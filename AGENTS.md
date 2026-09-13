# C1 operating instructions

## Current owner decision — September 13, 2026
The owner explicitly restored the reviewed application at commit 8007dc84820a9f2cb52266fe616df5406768815f through PR #177, then requested protection against another unintended change. This is the active source of truth for this repository.

The authorized operating mode is the existing private-account manual C1 recommendation flow, with its existing account, price, freshness, cash, concentration, stop and market-session checks. It does not authorize automatic brokerage execution or certify historical alpha.

PR #176's one-percent-per-name, three-name account-wide, two-session pilot overlay was explicitly reversed. Do not reapply it because an older conversation, research document or generic authority flag says pilot-only or diagnostic-only.

## Freeze and changes
- Keep the restored strategy, sizing policy, entry/exit rules, and user interface frozen.
- Changes to those behaviors require a NEW explicit owner instruction covering the proposed change. Generic requests to audit, harden, review readiness or prevent regressions are not permission to redesign or tighten trading policy.
- Previously authorized, reproducible software repairs may proceed if they preserve those behaviors. Document the defect, changed files and focused verification.
- Read this file before editing. Check current main and production before making readiness claims; bind every review to its deployed commit.
- Never reset holdings, cash, purchase history, capital history or original model records. Never invent fills or request sync keys.
- Leave cron running normally. Do not rerun completed historical experiments, retry blocked research endpoints through alternate routes, or reinstate the waived 60-session wait.

## Build enforcement
docs/c1-release-freeze.json records the approved application file hashes. tools/c1-release-freeze-check.cjs runs before normal builds and in CI, rejecting changed, added or missing application files.

Do not remove, skip or weaken this check, or regenerate hashes just to pass it. For an explicitly authorized behavior change or supported behavior-preserving repair, document the applicable owner instruction or defect in the PR, update only the affected manifest entries, and verify the change. Any guard/manifest/build-hook change must be explicitly described in the PR.

This is an accidental-change guard, not an access-control boundary. Repository administrators can change it. Do not claim it is impossible to bypass.

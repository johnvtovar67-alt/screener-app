# Honor the existing provider non-retry branch — October 24, 2026

Starting main/canonical production: `8b7b1c54e3cc3ce5ef195422bd287445c65e4f5e`
(PR326). Current AGENTS/audit/ledger read; no overlapping active hardening PR.
Root owns branch `harden/c1-fmp-client-errors-20261025` until verified handoff.
Parallel reviewers are read-only and cannot edit/deploy this branch.

## Reproduced defect and bounded repair

The actual fundamentals transport throws a non-success HTTP status below500,
but its generic catch retries permanent client responses too.
The exact frozen module with an offline404 response makes two requests and waits
450ms. The new regression first fails against that original code: HTTP400 is
retried twice instead of once. This is synthetic evidence of a software defect,
not proof that a particular live provider failure has occurred.

Carry a local per-attempt boolean for only400/401/404/405/410/422 into the catch.
This is not a transport rewrite, new endpoint, credential policy, backoff system
or broader retry-policy redesign. HTTP402/403/429 retain their existing immediate
stop/cooldown; server errors, network/JSON failures and deadline identity retain
their precise previous behavior. Returned error/status text, success bodies,
fallback evaluation, cache writes, bulk fetch behavior and public schemas remain.
HTTP408/425 and other statuses, including unfollowed3xx and409, retain their
existing recovery behavior. Independent review caught their overbroad handling
in the initial candidate before any publication; it was narrowed and new exact
recovery fixtures added. Initial full local build passed, but is not final-head
acceptance; final narrowed source must rerun the full gates.
Transient/availability failures are not made into purchases or empty success.
No claim all provider failures or duplicate cross-instance acquisition are solved.

Only `lib/fmpFundamentals.js` application hash changes plus the explicit manifest
authorization. Guard/CI/hooks, C1 rules, sizing/four-Swing ceiling, ranks/stops,
UI, dependencies/auth/config, holdings/cash/capital/history/fills and normal
crons stay unchanged. No live provider/account/Blob/top5 call is used to test.

## Verification

`node tools/fmp-client-error-retry-regression.cjs` loads the actual old/current
modules with synthetic HTTP/storage, isolated globals, fixed clock and fake
timeouts. Frozen original blob `4b2bd3e61c91204df675f13ad985cd335113311c` is
hash checked; exact three-edit reversal recovers that entire source.

- Old duplicate non-retryable response reproduced; current400/401/404/405/410/422
  stops once with identical terminal error/status and no delay/write.
- Successful responses, HTTP402/403/429 cooldowns, server-error recovery,
  exhausted503,408/425/302/409 recovery, other client errors, network/JSON
  recovery and deadline identity match old outputs,
  attempt counts and timers.
- Actual public enrichment Maps/rows and cache writes match on success and
  401/404/422/429/503 failure; only redundant client-error calls disappear.
  Warm success returns identical cache data without another provider request.
- Bulk's existing one-attempt results/failures are unchanged.
- Existing symbol/extraction regression reverses this bounded repair before
  its prior exact hash assertion; the old target/hash is not weakened/replaced.

Focused checks PASS. Full124-task suite/build and exact CI/preview/production
checks remain pending at this source checkpoint. Do not call this live until
those gates pass. Public health does not prove live account/browser acceptance.

The remaining audit includes provider consolidation, safely justified research
retirement, immutable screen/read separation and full private account/browser
acceptance; configuration/auth choices still need explicit owner decisions.

# Distinguish account-screen failure from legacy emptiness — October 24, 2026

Starting main/canonical production `daff5c07c58230a1167d5e55cb25a05f0c95a8d1`
(PR #324). Current AGENTS, audit and ledger read. No active hardening PR or edits
found. No private account, provider, credential or live screen request used.

## Characterize before changing the fallback

`evaluateC1Account` catches every `buildC1StockScreenSnapshot` failure and creates
an otherwise ordinary screen with `candidates:[]`. A fault injected only at that
pure builder boundary, while the rest of the actual account service runs on the
existing synthetic workflow, is swallowed: one held position plus an empty
screen, zero writes. This proves a software failure mode, not a current live
provider/input incident. A separate malformed-name attempt failed earlier in
account replay; it is not used as evidence of a hidden live screen defect.

The broad catch also has legitimate behavior: the frozen classifier requires
three qualified candidates and deliberately throws for counts0/1/2. Older or
sparse sessions use that empty fallback to keep account review available. Do not
remove the catch entirely or label these expected cases as new outages.

## Narrow repair

Keep exactly the existing fallback for the three exact known insufficient-count
messages. Accept only a string message, with a fully anchored pattern for counts
0–2 of3. All other errors are rethrown unchanged into the existing API boundary:
sanitized HTTP500, `ACCOUNT_ANALYSIS_FAILED`, nonexecutable, no automatic retry.
The existing client retains its previous saved view on500. No classifier or
minimum-candidate threshold is changed; no new error framework or log added.

The allowlist is intentionally tied to the frozen three-candidate constructor
contract. A future owner-authorized policy change must explicitly revisit it.
It is an internal software-error classifier, not authentication or a trusted
provider evidence marker. No new catch-based purchase authority is introduced.

Only `lib/c1AccountService.js` application hash and this slice's authorization
change. Success responses, legacy empty responses, positions, exits, quantities,
C1 policy/four-Swing cap, original accepted inputs, account/cash/history/fills,
UI, dependencies, auth/config policy, normal crons and guards remain unchanged.

## Focused evidence

Expanded existing `tools/c1-api-errors-regression.cjs`, no new scaffold/module:

- Exact reversal of the one catch recovers complete prior service Git blob
  `4ae7a2e61f47bddc78404b85e6423eda4c5b82c9`.
- The real screen constructor supplies0/1/2-candidate failures and3/9-candidate
  successes; actual old/current service decisions, holdings and economics match
  exactly for all five cases. Pure input construction is synthetic only.
- TypeError, Error, unrecognized message/status, primitive/null and coercible
  message objects cannot become an empty screen. The original exception identity
  is retained. Dated-source errors and an impossible3/3 error also propagate.
- Actual service integrated into the real account API with memory storage:
  unexpected failure becomes sanitized500/nonexecutable with zero writes and one
  account/input read; a later normal request recovers without a process reset.
- A successful synthetic cash-observation save followed by an analysis failure
  remains committed exactly once. The error does not claim it was unsaved,
  perform rollback or retry; a normal reload reads its new revision. Original
  fixture account/book inputs remain unchanged. No live record was involved.
- Account/book/clock input bytes stay identical. Raw synthetic details, key and
  namespace are not exposed. Existing read/write conflict, uncertain-save,
  no-automatic-mutation-retry and retained-client-view checks remain active.

Focused API/client checks and freeze/canonical guards are required, followed by
the normal122-task/build, exact-head CI/preview and production release gates.
Release evidence is pending at this source checkpoint; record in the PR and
update during next legitimate implementation, not a docs-only deployment loop.
Build/public health does not establish private-account/browser parity.

Branch `harden/c1-account-screen-failure-20261025` is owned by this run until
exact verified handoff. Broader provider cleanup, research retirement, immutable
screen reads and complete account/browser acceptance remain unfinished. No
historical thesis experiments are reopened.

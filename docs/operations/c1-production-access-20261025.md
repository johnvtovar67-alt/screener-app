# Owner-approved production access restriction — October25,2026

Baseline main/production7d19bfb263d4db815db09d18ee664e4bc51fc05c, READY deployment
dpl_o3PraDdpfTMQRBbuEPfd3H6y2nKh. Owner explicitly approved blocking public
production research-run endpoints and restricting new-account creation while
preserving normal C1 jobs, existing account access, trading rules and records.
Current AGENTS/audit/ledger and active PRs checked; no overlapping hardening PR.

## Exact scope

- Each of53 research API handlers first calls a shared production access gate.
  Public/incorrect/missing authorization returns404 Not found. Existing internal
  workers must carry the already-configured CRON_SECRET bearer authorization;
  their original downstream method/mutation guards remain unchanged. No new
  credential or authentication system. Preview/development and offline tools
  retain existing behavior. Originally production-disabled routes remain disabled.
- Production portfolio-sync PUT cannot create an absent namespace. Production
  C1 adopt cannot create an absent account. Existing account/portfolio reads,
  edits, ETag guards, cash observations and actual fills retain their contracts.
- This freezes new account creation; it does NOT enumerate, delete or claim to
  identify every preexisting namespace as the owner. Existing keys are unchanged.
  A stricter single-identity allowlist would need a separately controlled identity
  enrollment, not secret extraction or guessing from account records.
- Both configured cron paths are outside research. Their schedules and all cron
  source hashes remain unchanged. Research coordinator forwards existing server
  authorization to workers; its source is unchanged. No cron or research run is
  invoked as a test. No private account request or live storage test write.
- Route import timing is unchanged: this blocks public handler execution, not all
  research module packaging/initialization. Frozen engines/evidence remain intact.

## Verification and release checkpoint

New synthetic regression checks every route/method with hostile query/body getters,
missing/wrong authorization, missing config and retained trusted worker access.
Exact reversal recovers every original route and both account API sources using
the committed baseline hash map. Complete real portfolio handler memory tests
cover absent zero-write denial, existing GET/PUT/conflict parity and preview
creation. Real C1 handler production adoption rejects before market-input reads
or writes. Existing sync fixture explicitly declares its test environment;
existing research lazy-load and holdings-comparison fixtures load the real guard
with synthetic nonproduction config. A storage403 retains its original500 error
instead of being mislabeled as a new-account denial.
No assertion or guard is removed. Final127/127 regressions, release-freeze,
canonical-integrity and standard optimized build PASS. An initial full run caught
the old comparison fixture's missing guard dependency; the actual helper is now
loaded and every original assertion retained. A pre-publication review also
narrowed creation denial to its dedicated code, preserving unrelated storage403
error behavior. Exact-head CI/preview/production remain PENDING at this source
checkpoint; final PR release evidence supersedes source-time pending states.

Runtime test credentials and storage are synthetic. Production version/health
and public-research404 checks do not prove private account/brokerage parity.
Owner screenshots already verified visible portfolio rendering on prior7d19bfb;
the earlier intermittent Load failed cause is still unconfirmed. Upstream bundled
Zod advisory is not remediated by this access-policy slice.

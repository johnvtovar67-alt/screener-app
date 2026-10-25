# Isolate the live compiler's schema dependency — October 25, 2026

Starting GitHub main/canonical production:
`840a14470544945146c8b2b6a15531966b803a44` (verified PR328).
Current AGENTS, audit and progress ledger read; no competing active hardening
PR. Root owns `harden/c1-runtime-schema-isolation-20261025`; independent review
is read-only. No historical thesis experiment is run.

## Reproduced unnecessary live dependency

historicalSignalEvaluator imports only POINT_IN_TIME_SCHEMA from the3517-line,
129965-byte walkForwardBacktest simulator. Its sole use is metadata.schema;
the exported value is the immutable primitive string screener-pit-v1.

The actual prior optimized build, with its installed dependencies, identifies
the pure simulator factory by code markers/import shape rather than a fixed
webpack ID. Native compiled c1-account route import completes and initializes
the49850-byte simulator factory once, with no handler invocation or observed
network activity. Expected-zero assertion correctly fails against that build.
This demonstrates unnecessary initialization, not a measured production incident
or latency slowdown. Genuine research consumers still need the engine.

## Exact bounded change

Change one compiler import to the new two-line pure pointInTimeSchema module.
Keep the original engine, frozen simulators, generator outputs and historical
evidence unchanged. Do not rewrite/reexport the frozen engine. Test equality
against its actual exported constant to prevent future schema drift.

Only historicalSignalEvaluator.js and the new schema module's manifest entries
plus explicit authorization change. No guard/CI/build-hook implementation,
dependency, platform, API/UI, auth/configuration, C1 rules/sizing/four-Swing cap,
stops/ranks, account/cash/history/fill or normal-cron change.

## Focused evidence

`node tools/c1-runtime-schema-regression.cjs` uses the actual existing module
loader in isolated VMs, a fixed clock and synthetic260-session/two-issuer input.
It compares complete outputs, not only signals: metadata, sessions, diagnostics,
checkpoints and progress. Full, empty/default, short-history, cumulative13-session
resume and independently chunked paths match; raw inputs remain immutable.
The fixture reaches genuinely qualified compiler output and includes changed
membership/delisting and dated fundamentals; it is not investment evidence.

One-import reversal recovers the entire prior compiler blob
`019fbe81dc8f79fbc8662afa2aa5039fb4a9013b`. The engine blob remains
`9e294411566722e93632d88c9b5a127d29df1535`; frozen oracles are untouched.
Old compiler load fails on injected research-engine initialization failure;
the changed compiler loads and completes without reading that engine at all.
Current90-member live-input regression and independent focused review PASS.
No loader/assertion/oracle change or fake schema injection is needed.

`node tools/c1-compiled-schema-load.cjs <build-root> <expected-count>` scans
compiled chunk registrations, instruments the actual API webpack factory and
imports the real compiled c1-account module only. It clears the child environment,
traps fetch/HTTP/socket/TLS networking and fails on unexpected instrumented
synchronous string-path reads. That file-read check is a diagnostic bound,
not a comprehensive filesystem/credential sandbox. No handler, provider or
private store is requested, and no existing credential is sought.

Prior build: successful route import, simulator initializations1, observed
network calls0, factory49850bytes (ID4503/chunk3442 in this build only).
Changed build: successful route import, simulator initializations0, observed
network calls0 and no registered simulator factory in the account route. The
engine remains packaged for real research consumers (factory49821bytes in a
different shared chunk); no general deployment retirement is claimed.
Full126/126 regressions, freeze/canonical and standard optimized build PASS.
Independent focused review PASS. Exact CI/preview/production release gates are
PENDING at this source checkpoint; final exact PR release evidence supersedes
that source-time status. Do not claim a smaller
deployment, faster user refresh or private-account/browser acceptance from a
source import change or initialization count alone.

## Finite remaining scope

After this candidate is verified, reconcile the original audit into implemented,
production verified, retained, deferred and blocked obligations. Existing public
research routes/oracles are not presumed unused. Daily-only observation timing
fails current golden parity. Authentication/rate-limit/retirement choices need
controlled owner decisions. The upstream bundled Zod advisory and actual private
account/browser acceptance remain unresolved; neither is hidden by this cleanup.

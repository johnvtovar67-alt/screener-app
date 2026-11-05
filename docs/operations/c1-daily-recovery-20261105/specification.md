Act as the lead engineer responsible for stabilizing this production financial application. Complete the engineering work described below. A review, proposed plan, passing test count, or isolated symptom fix is not the deliverable.

Repository: johnvtovar67-alt/screener-app
Production: https://screener-app-cq5t.vercel.app
Vercel project: prj_9MJJaMsEfOdtQKXj4VFI7TfJcBjQ
Vercel team: team_vBLhac1QJ54zPEiWFFK7XmGN

The application repeatedly becomes unavailable or misleading around daily updates, provider revisions, quote verification and refreshes. Earlier repairs passed extensive tests but did not establish reliable operation across successive trading days.

**Objective**

Deliver a dependable daily-data, reconciliation and recovery process that supports the existing C1 strategy. Resolve the demonstrated recurring failure classes and verify that ordinary operation recovers correctly after interruption.

This authorizes necessary implementation, tests, operational diagnostics and clear status messages. You may merge and deploy supported repairs after the required review and release gates pass. It does not authorize changing investment policy or rewriting financial history.

**1. Establish the current facts and preserve the work**

Read current AGENTS.md and applicable repository instructions. Compare current main, the actual canonical production deployment and /api/version before drawing conclusions.

Use one dedicated branch. Save the specification, milestones, evidence, decisions and outstanding work in the repository. Update that record as work proceeds so another session can resume without repeating the investigation.

Use independent agents for separable investigation, testing and review if available. Keep one owner responsible for the integrated change and release.

Start with this verified incident evidence, then check whether it remains current:

- Production commit 200263dfae6f0ad49d6e160a1e5b70c95dc1e53d was serving release 2026-11-04-c1-automatic-held-stops.
- November 4 after-close index attempts repeatedly failed at reconciliation with providerRevision.stage = model-parity.
- Logs reported 275 changed prior-session closing-price anchors between November 3 and November 4. They did not identify the complete economic difference responsible for rejection.
- Automatic retries did not resolve the observed failure.
- The accepted analysis remained dated November 3.
- Earlier afternoon market-service probes passed. Normal account/browser observations also reported CHECKED_ZERO_UNCONDITIONAL_BUY_ORDERS and PUBLISHED. Therefore, do not attribute the entire day’s cash position to the later update failure.
- Existing reconciliation regressions passed despite the production incident.

These are investigation starting points, not proof that all revisions are harmless or that every failure has the same cause.

**2. Demonstrate the root cause before changing acceptance rules**

Trace the complete path:

provider data → validation → immutable observation archive → revision reconciliation → accepted session → account/opening analysis → browser publication.

Identify where historical model replay, accepted records and present-day recommendations depend on one another. Inspect earlier incident repairs and determine which recurring cases they leave unsupported.

Obtain the smallest authorized evidence necessary to reproduce the failed transition. Compare the original and revised results precisely: historical fills, cash, positions, pending orders, stops, summaries and metadata. Distinguish financially meaningful differences from representation or bookkeeping differences.

Do not infer the cause from the first mismatched ticker or assume a small price difference is immaterial. If exact evidence is inaccessible, identify the precise missing artifact, complete all unblocked work, and clearly limit the conclusion.

Use existing authorized market-data archives where available. Do not rerun completed economic experiments or conduct a strategy backtest.

**3. Implement a general repair supported by that evidence**

Evaluate the architecture before adding another exception. Establish explicit rules for:

- Which observations are accepted, revised, quarantined or rejected.
- How confirmed provider corrections interact with immutable accepted history.
- When a new session can advance safely.
- Which discrepancies genuinely prevent current decisions.
- How interrupted or delayed updates recover without duplicate effects.

Prefer a coherent implementation over accumulating date-specific, ticker-specific or record-hash-specific patches. Preserve required historical compatibility; remove redundant paths only when tests prove they are unnecessary.

Do not introduce a price tolerance, ignore revisions, weaken verification or bypass economic checks merely to produce a healthy screen.

Recovery must be bounded and idempotent. Handle duplicate observations, partial writes, concurrent workers, timeouts, provider errors and archived missing sessions explicitly. Never fabricate missing sessions or replay uncertain financial writes.

Any proposed change that would materially alter ratings, orders, quantities or risk policy requires a separate, concrete owner decision. Continue other authorized work while that decision is pending.

**4. Make the user-visible state accurate**

A user must be able to distinguish:

- Current analysis with no qualifying purchases.
- A legitimate cash, concentration, issuer-event or market-session restriction.
- An update still within its normal publication window.
- An actual update failure or stale analysis.

Show the relevant source date, specific reason and recovery state. Do not present stale evidence as current, hide a failure behind an empty opportunities list, or tell the user to reload repeatedly when the server cannot recover.

Every asynchronous action must finish with a visible result or bounded error. Ordinary refreshes must not falsely imply holdings changed. Superseded requests must not publish obsolete results.

Apply these requirements to desktop and mobile using the real Home/App flow.

**5. Prove failure and recovery across successive sessions**

Create regression cases that fail against the defective implementation and pass with the repair. Use real incident evidence when available, with private information removed.

Exercise complete sequences rather than isolated successful requests:

- Multiple consecutive trading days and repeated provider revisions.
- Revisions that leave decisions unchanged and revisions that genuinely change them.
- Opening, regular trading, closing-publication grace and after-hours transitions.
- Weekends, holidays, early closes and daylight-saving changes.
- Provider timeouts, malformed responses and missing evidence.
- Storage failures, interrupted writes, conflicting workers and retries.
- Delayed sessions recovered from valid contemporaneous archives.
- Refreshes during updates and clients running an earlier deployment.
- Failure followed by successful recovery.

Verify preserved history, accounting, stops, quantities, session identity and request ownership. A safe rejection must have the correct explanation. Recovery must make the application usable again without silently relaxing its rules.

Preserve the full build/regression/audit job and all three required real Home/App browser jobs. All must pass on the exact reviewed commit. Do not weaken existing assertions, source or economic oracles, freeze checks or CI requirements.

Have an independent reviewer inspect the implementation and test adequacy before release. Address substantive findings.

**6. Respect production boundaries**

Preserve the current strategy, sizing, concentration limits, momentum rules, profit protection, captured stop policies and manual brokerage execution.

Never reset or rewrite private holdings, cash, trades, fills, purchase history, capital history or original accepted model records. Do not retrieve credentials, sync keys or storage namespace listings.

Do not use /api/top5, private /api/c1-account, cron or research endpoints as test traffic or health canaries. Inspect normal-traffic logs instead. Use the Vercel connector for permitted /api/version, /api/health and /api/c1-readiness diagnostic reads.

Leave existing cron schedules unchanged. Do not manually dispatch jobs or restart the previously stopped reliability automation.

Interpret readiness semantically. HTTP 200 and CHECK_PASSED do not authorize purchases or establish private-account parity. Respect the actual exchange calendar, opening allowance, existing 35-minute closing-publication grace and scheduled observation hours. Allow a new deployment 20 minutes for its normal observation and job budget.

**7. Release and report against explicit acceptance criteria**

Before deployment, document rollback and data-compatibility considerations. After deployment, verify main, actual production commit and canonical /api/version agree.

Observe the next ordinarily scheduled update and its recovery outcome. If it cannot yet be observed, mark production acceptance pending rather than claiming completion.

Use these separate statuses:

- IMPLEMENTED: repair and regression evidence complete.
- RELEASED: reviewed commit deployed and canonical identity verified.
- PRODUCTION VERIFIED: normal scheduled processing demonstrates the repaired behavior.
- STABILITY WINDOW COMPLETE: five consecutive trading sessions have been checked against defined acceptance criteria.

Future observations remain pending until actually obtained. Prepare the five-session checklist; do not claim unattended monitoring unless it has separately been configured and authorized. Five successful sessions provide bounded evidence, not a guarantee against every future fault.

Keep updates short and factual: demonstrated cause, completed work, remaining evidence and blockers. Do not stop at a plan when implementation is possible. Do not expand into unrelated features, strategy research or a wholesale rewrite.

The final report must state:
1. What caused the recurring failures.
2. What changed structurally.
3. Which failure-and-recovery sequences were demonstrated.
4. What is live and what remains unverified.
5. Any remaining limitation requiring a specific owner decision.

Success means the demonstrated recurring failure classes have a tested recovery process—not merely that today’s warning disappeared.
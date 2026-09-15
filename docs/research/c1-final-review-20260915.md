# C1 final implementation review — September 15, 2026

Reviewed baseline: `b65f32fc521caa15bfe2eb0d7dc6cc80b0ec2cdc` (PR #189), confirmed against the production alias and Vercel deployment `dpl_DZWX9sNVCfPWRr8SG7ChxE1kFxy2`. This report describes the repair commit containing it. The PR and deployment record identify the released revision.

The owner authorized a deep accuracy, legacy-code and UI review. The September 13 operating instructions remain controlling: retain the restored C1 strategy and user workflow. This is an implementation repair, not a new strategy, capital policy or claim of proven live alpha.

## Reproduced defects and repairs

| Finding | Repair | Verification |
| --- | --- | --- |
| With no account loaded, public Opportunities displayed the superseded 1% pilot recommendations. Swing holdings could fall through to older portfolio rules when C1 was unavailable. | Opportunities now shows a clear account/loading status; every Swing holding uses C1 or an explicit unavailable/mismatch status. Core analysis remains available. Single/Themes neutralize superseded pilot instructions and identify their stock-analysis purpose. | Actual page decision functions and React rendering; missing account, stale review, ownership mismatch, cash and Core cases. |
| A generic 35% factor-governor message and older time-review block could confuse C1's own rules. | Removed the obsolete factor box from the portfolio view and excluded C1 holdings from the older time-review presentation. C1's existing risk rules remain active. | Source and decision regression checks; frozen options unchanged. |
| Missing momentum values could become numeric zero through JavaScript coercion. | Missing, blank and boolean values are rejected; genuine zero and numeric scores remain valid. | Missing-value cases plus existing Buy/Watch classification tests. |
| A checked opening exit reason could disappear when the portfolio explanation was rebuilt using a newer displayed price. | Persist the exit's sleeve, quantity and reason alongside its status. | A portfolio-drawdown exit retains its cause after a quote refresh, without mutating the original decision. |
| Replacement purchases could appear before the exits that fund them. | Show exits first and explain the sales assumption when replacement buys coexist. | Actual component rendering, expiry, holdings mismatch and conditional-stop-only cases. No new trade instruction is inferred. |
| Generating multiple pending activity sessions repeatedly replayed all earlier carried sessions. | Collect pending sessions during the existing single carry-forward pass. | Same plans and derived account as the former replay, including a multi-session stop fixture. |
| Portfolio sync used unconditional overwrites. A stale device could replace a newer save, and a late read could replace an edit made while it was loading. | Atomic storage version checks; serialized client writes; stale-write rejection; late-read guards. Manual Reload/Analyze can pull newer saved holdings. Conflicting local edits remain local; an explicit conflict recovery keeps a pre-sync copy. | Real API handler with competing devices and a read/write race; real client functions with queued edits, conflicts, disconnects, late reads and manual refresh. |
| Two components had no consumers. | Remove `C1HoldingRisk` and `C1ModelStatus` components. Retain shared libraries still used by active or historical paths. | Import/reference inspection and release manifest check. |
| Dependencies included reported critical/high advisories. | Upgrade Next.js 14.0.0 to 15.5.24, retain compatible React 18.2, pin PostCSS 8.5.28 and commit the lockfile. | Dependency audit reports zero known vulnerabilities in the resolved production graph; full regression, compilation and local production HTTP 200. |
| The existing freeze checker was not connected to the normal package build/verify hooks. | Restore the checker to both hooks, add the focused C1 UI authority regression, and use `npm ci` in CI. | Normal verify/build invokes the guard. Only the eight repaired application-file hashes and two deleted component entries were updated. |

The security patch selection uses the [Next.js advisory for patched 15.5.24](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4) and the [official version 15 migration guide](https://nextjs.org/docs/app/guides/upgrading/version-15). Zero reported dependency advisories is a dated audit result, not proof of no vulnerabilities.

## C1 rules actually implemented — preserved

| Rule | Frozen implementation |
| --- | --- |
| Capital allocation | Three strategy sleeves: base 25%, cooldown15 50%, sector40 25%. |
| Position capacity | Up to three positions **per sleeve**. Their combined holdings need not always be three distinct stocks. The three displayed selected opportunities are a separate classification view. |
| Entry selection | Momentum ranking; target count three and ranked entry queue nine, with the existing liquidity, price, gap, cash, sector and eligibility checks. |
| Initial individual stop | **14% below the entry reference**, with actual-account execution-price handling. A universal 12% loss-from-cost stop is not the frozen rule. |
| Portfolio loss control | **12% drawdown from each sleeve's retained high-water mark**, with existing 10/15/10-session cooldowns. This differs from a stock's gain/loss percentage. |
| Minimum rank-based hold | **30 completed trading sessions**, then rank-buffer-six exit logic. This is neither 30 calendar days nor 40 trading days. |
| Other exits | Existing stops, sleeve loss control, universe-removal handling and the configured 252-session time-stop condition remain distinct from rank-based exits. |
| Sector exposure | Existing maximum two names per sector; sleeve sector caps 50%, 50%, 40%. |
| Held Buy / partial entry | Stock qualification is separate from account action. A completed target does not authorize another purchase. A recorded partial fill can produce a remaining quantity only while C1 still qualifies it and sizing/cash checks pass. |
| Timing | Model analysis uses completed sessions; opening plans use observed regular-session opening prices and expiring validation. A current screen quote does not guarantee that an opening-based estimate is still executable at that price. |

The frozen options, simulator, actual fill engine, historical artifacts, cron schedule and stored account were not edited. Existing MSTR holdings remain Core analysis; existing blocked-purchase rules remain intact. No 1% pilot cap, extra confirmation period or automatic brokerage execution was added.

## Verification evidence

- `npm run verify`: passed, including C1/legacy compatibility regressions and new sync/UI cases.
- `npm run build`: passed its prebuild gates and Next.js production compilation; the built application served HTTP 200 locally.
- C1 fixture parity: **976 historical fills and 5,508 cash/equity/position checkpoints**, plus combined holdings across **1,836 historical sessions**. These compare existing frozen fixtures; they are not a new backtest or holdout.
- Actual-account checks: partial and complete fills, remaining targets, fees, cash conservation, duplicate/overfill rejection, original dates, retained peaks, stop gaps, pending unfilled exits, cooldown and no-trade continuation.
- Client/API checks: account refresh/import races, storage conflicts, unchanged source revisions, live explanation consistency, missing momentum values, expired action suppression and sell-before-replacement display.
- Production baseline: normal September 14 collection runs reported success. The scoped six-hour runtime error query returned no matching errors. A broader query timed out; no 24-hour clean claim is made.
- Release requirements: GitHub CI and Vercel preview must pass before merge; verify the production alias against the merged SHA and exercise public navigation afterward. The PR/deployment record holds those results.

## Workflow and evidence limits

No-trade days continue the **last recorded ownership** without a daily confirmation and without inventing fills. Actual trading must still be recorded. The portfolio Add/Update form edits entered holdings; it is not by itself a completed C1 trade ledger entry. The tested remaining-quantity behavior uses recorded completed fills. If entered holdings disagree with the C1 account, the app reports that mismatch rather than fabricating reconciliation. This audit did not rewrite that accounting workflow.

The review used synthetic account fixtures. It did not access the owner's Schwab account, request a sync key, or independently reconcile the owner's actual trades. Cloud sync race tests prove the exercised conflict cases, not that every device already has identical state. Reload both devices after release so both use the version-aware sync client; an older page's unversioned write will be rejected rather than overwrite a newer saved portfolio.

The preserved historical results remain research evidence. The existing September 11 source-dependency audit identifies **undated historical sector labels** despite sector-dependent position caps; the magnitude and direction of their performance effect are unknown. Existing randomized controls do not establish family-wide, selection-adjusted significance or an untouched future holdout. Two overlapping stock universes do not provide independent time validation. Historical returns, slippage assumptions and simulated fills therefore do not establish future net alpha or achievable brokerage execution.

This release improves demonstrated reliability while preserving the strategy. It cannot certify that every line is defect-free, eliminate provider outages, or guarantee profitable trading. The freeze guard reduces accidental changes; repository administrators can alter it. Active scheduled tasks were inspected and do not authorize C1 modifications; no task or market-data cron was changed.

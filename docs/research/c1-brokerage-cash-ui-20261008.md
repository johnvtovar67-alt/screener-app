# Compact Brokerage Cash presentation — October 8, 2026

Owner instruction: “Make a cosmetic-only UI cleanup to the Brokerage Cash section.”
Replace the large card with the three existing cash amounts and an Update control;
hide the existing editor until requested and collapse it after a successful save.
Preserve observed/current status, accessibility labels, all error/status messages,
and clean mobile wrapping. Do not add a CASH holding chip or change accounting.

Reviewed main and production baseline: `a9b430b32d34906ed240ddf7d70330c6463cd251`
(PR #253), production deployment `dpl_9BJQxSvepPC1rafWx46JaHStP8nh`.

Application changes are confined to `components/C1BrokerageCash.js` and
`styles/card-layout.css`: compact summary, local editor visibility, keyboard
focus, and wrapping/secondary-text styles. The existing input constraints,
validation, save callback arguments, and messages are preserved. A successful
save collapses the editor; an invalid value or failed save leaves it open.

`brokerageCash`, `strategyCash`, `executableCash`, the dedicated
`update-brokerage-cash` operation, current-date freshness, and the lower-cash
execution cap remain exactly as in PR #253. All API, persistence, validation,
accounting, strategy, execution, and Portfolio calculation modules are unchanged.
The focused UI regression exercises the disclosure and save outcomes; the
existing client regression remains unchanged.

Only the two affected application hashes are updated in the release manifest,
with this explicit owner authorization. The release-freeze checker, canonical
guard, build hooks, and CI workflow are unchanged.

Verification: the focused UI regression and unchanged brokerage-cash client
regression pass. `npm run build` passes release/canonical guards, all 82
regression/simulation checks, and Next.js compilation/static generation. An
isolated mounted-React Chromium fixture confirms the compact desktop row,
Update disclosure, original save arguments, successful collapse/focus return,
failed-save alert, visible stale/missing-account messages, and no overflow in
the summary or editor at 320px and 375px. No private production account was
read or modified. Independent diff review confirms all 175 other protected
application files match PR #253 byte-for-byte, including Portfolio calculations,
API, cash accounting, validation, and execution logic.

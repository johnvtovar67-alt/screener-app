# C1 owner-recorded exit repair — 2026-09-22

## Owner instruction and defect

The owner reported a completed discretionary sale of an existing C1 holding and explicitly requested a way to record it. The current-session form only offered C1-generated orders, while the completed-session form was for the prior market date and disabled saving until its completeness confirmation was checked. This left a valid broker sale impossible to record without falsely identifying it as a stop fill.

## Repair

- Add an accounting-only `owner-discretionary-exit` choice for every currently held symbol during the regular session.
- Permit only sales of already-owned whole shares; discretionary purchases remain prohibited.
- Preserve the exact recorded quantity, execution price, fee, time, and sleeve allocation.
- Replay the recorded exit through later C1 sessions without changing the frozen strategy or treating the sale as a C1 recommendation.
- Keep planned sales and actual stop fills separately labeled.
- Clarify that the completed-session form applies only to its displayed date and explain how to enable its save button when no order filled.

## Changed application files

- `components/C1AccountActivity.js`
- `components/C1IntradayActivity.js`
- `lib/c1AccountExecution.js`
- `lib/c1AccountSimulator.js` (generated from the frozen simulator through the declared account-only seam)
- `lib/c1ActualFillReplay.js`
- `lib/c1IntradayActivity.js`

Supporting changes are limited to the simulator generator, focused regression, this note, and the affected release-freeze hashes.

## Verification

`tools/c1-intraday-regression.cjs` covers the owner-recorded sale, exact cash and holdings, close replay, UI labels, and rejection of a discretionary buy. The generated simulator parity and release-freeze checks remain mandatory in the production build.

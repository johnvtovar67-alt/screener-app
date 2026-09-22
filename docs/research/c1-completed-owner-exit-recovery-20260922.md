# C1 completed owner-exit recovery — 2026-09-22

## Reported failure

After the owner recorded the completed FCX sale and the application calculated a same-session MPC replacement, the saved activity retained only the accounting-only exit plan. After the close, Account settings rebuilt the trade selector from that stale plan and offered only stop exits and discretionary sales. The already-calculated MPC purchase could not be recorded.

## Repair boundary

For the latest completed market session only, an activity containing an owner-discretionary exit and no purchase can recover its replacement queue from the accepted, hash-bound completed-session opening. Recovery requires the same source session and observation receipt and runs the existing C1 replanning engine against the recorded sale. It does not fetch a live quote, create a current recommendation, infer a fill, alter frozen selection or sizing rules, or persist anything during a read.

The recovered purchase becomes recordable only when the owner submits the actual broker fill with its regular-session execution time. That write then follows the normal revision, validation, replay, and conditional-save path.

## Regression coverage

The intraday regression now starts with a legacy owner-exit activity whose saved plan omitted its replacement, reloads it after the close without live opening collection, verifies that the exact post-exit replacement returns, records the completed purchase, and confirms that the fill is durably saved.

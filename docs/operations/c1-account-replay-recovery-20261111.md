# C1 saved-account replay recovery

The owner reported failed account verification, unavailable accepted-session
evidence and unavailable analysis after the account-policy v2 release, and
explicitly requested a behavior-preserving repair with deployed verification.
The affected production source is f2531391c661ab47bb032ebcdfcc9868d20a0db4.

## Defect and scope

The deployed commit and canonical alias match. Normal account requests read the
saved account and accepted November 10 source successfully, then fail during
account analysis. The session-unavailable message follows from the missing
account response; it does not establish a failed session retrieval.

The new stock restriction helper serves two different phases: selecting the next
purchase queue at the November 10 close, and authorizing purchases from the
November 11 opening. Applying that helper without an execution-date guard also
suppresses already-recorded November 10 purchases during historical replay. An
unconsumed actual fill then correctly fails reconciliation, preventing analysis.

Restrict the buy-execution gate to the policy's execution activation. Keep the
source-close gate for selecting the following session's queue. This preserves
the actual recorded pre-activation purchases without authorizing restricted
post-activation purchases. Cash, basis, fees, holdings, account records, accepted
source hashes, stops, cooldown clocks, ranking and operational risk rules remain
unchanged. No stored account or market book is rewritten.

## Verification and release

`tools/c1-policy-activation-fill-replay-regression.cjs` reproduces the released
failure through real account continuation and exercises the real account handler
with representative pre-activation completed and saved intraday purchases. It
checks successful GET and analysis refresh without changing saved financial
facts, retains the following session's stock restriction, and rejects missing
or altered fill authority. Synthetic inputs establish software behavior only.

Preserve the released v2 source-inverse fixture and all earlier economic oracle
hashes. The separate repair inverse restores both generated simulator and
generator to their exact released sources before the original v2 inverse runs.
`tools/c1-policy-activation-replay-oracle-regression.cjs` verifies both layers and
rejects unknown sources. Only the affected simulator application entry changes
in the release-freeze manifest, with explicit repair authorization. The freeze
check and all four CI jobs remain required on the exact reviewed head.

After deployment, compare main, actual production metadata and canonical
`/api/version`. Verify the actual authenticated recovery using an ordinary owner
reload and its bounded production response logs. Do not create an account,
fabricate a fill, acquire a sync key, invoke producer jobs or use private routes
as health canaries. Missing live recovery evidence remains an explicit limit.

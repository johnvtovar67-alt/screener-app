# Diagnose the observed automatic-repair rejection

The owner's normal production reload of 877b25f returned HTTP 422 at the
approved-account-repair boundary at 22:07 UTC on November 25. The screenshot
shows the same build and generic verification failure, followed by unavailable
analysis. This proves a live rejection, not successful recovery. Existing logs
did not distinguish the helper's guards.

The application already supports legacy cash pseudo-positions. Its normal
portfolioHoldings view excludes them, and mergeC1AccountPortfolio retains them
as brokerage metadata. The approved repair instead fingerprinted every saved
row against the approved security snapshot. A supported hidden cash row could
therefore reject identical security ownership. Use that existing holdings
boundary consistently. This does not authorize cash from a portfolio row: the
separate exact confirmed brokerage-cash and freshness guards remain unchanged.
Every real security, role, quantity, economic-source check, conditional write,
financial review, audit and once-only risk reset remains protected.

The uploaded source independently passes the configured source, current-cash,
statement and marker-link probes. That does not prove the current production
source or portfolio is identical. Hidden cash metadata remains a specific
compatibility defect, not a confirmed explanation of this live rejection.

Tag each helper guard with a finite identifier and expose only an allowlisted
reason in the existing structured API-failure log and response. Keep the same
HTTP status, generic owner message and purchase pause. No private values,
hashes, statement content, provider error or stack enters diagnostics. Unknown
errors retain the existing presentation and cannot select arbitrary reasons.

Preserve every one of the 88 published fixture blobs. Add a new exact source
inverse from 877b25f for the two changed application files and normalize the
older oracle through that exact inverse. Update only those two application
freeze pins. Add native handler coverage for supported legacy cash rows,
continued exact funding/ownership/source protection and bounded diagnostics.
Run the full build and four exact-head CI jobs, inspect the matching preview,
compare merged trees, and verify canonical production assets. Then observe the
real normal account request, genuine saved journal/allocation readback and
client publication. The owner's visible screen remains separate evidence.

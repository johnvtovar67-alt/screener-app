# October 30 momentum evidence badge repair

Owner instruction: “Solve it” after the October 30 MPC portfolio screenshot
showed “Evidence unavailable” alongside a recovering HOLD explanation.
Main and production were c0d3bc5e28959a26972d418f64915a8ad809b170.
The normal scheduled index update had accepted October 30 at 20:18:23 UTC;
the remaining issue concerns the holding's momentum presentation.

## Reproduced defect

The real classifier returns null directional classification with no limitations
for a verified current rank, adjusted close, positive average slope and relative
strength, but negative five-session return. Its generic fallback nevertheless
labels this complete, conflicting evidence “Evidence unavailable.” The added
regression fails on the complete unchanged production module with that exact
label mismatch, and passes with the repair.

The actual private MPC input was not retrieved, and the screenshot does not
identify its precise classifier branch. A fresh public MPC lookup separately
verified earnings, mergers and news clear at 20:23:07 UTC. Those event checks
are separate from this holding momentum assessment.

## Repair boundary

Only lib/c1MomentumEvidence.js and lib/c1DecisionCopy.js change application
code. The final unclassified fallback checks the same verified current rank,
price trend, relative-strength and adjusted-close prerequisites. Present but
conflicting signals receive the neutral “Mixed momentum” label and an
available/partial display status; their directional classification stays null.
Incomplete supporting comparisons remain disclosed. Missing required current
inputs retain “Evidence unavailable.”

The existing compact supporting field now names known missing inputs for an
unclassified assessment, or explains mixed signals. It also explains a changed
position risk signature. This uses fixed application-owned limitation mappings,
never arbitrary provider bodies or technical narratives. Both desktop and
mobile use the unchanged row/component layout. Stale and new-holding states,
position signature checks, positive risk labels and all actual holding actions
retain their existing behavior.

The changed display availability field is consumed only by existing presentation
copy. It does not feed account selection, sizing, eligibility, exits, stops,
orders, quantities or counters. No account, cash, history, fill, provider,
configuration, authentication, schedule, dependency, guard, CI or build hook is
changed. The release manifest updates exactly the two affected application blob
hashes and records this explicit repair authorization.

## Verification

The classifier regression exercises complete mixed evidence, missing current
rank/trend/relative-strength/close, stale technical input and incomplete history.
The real classifier, signature resolver and original JSX rows are rendered for
desktop and mobile with recovering HOLD, exact original counters, mixed and
missing explanations, stale rejection and changed-risk rejection. Position and
input bytes remain unchanged. Fixed limitation mappings reject arbitrary text.
The existing full release suite and normal optimized build remain mandatory.

Private-account parity and a live owner's browser result are not established by
synthetic rendering or a public lookup. Release reporting must distinguish them.

# Clear C1 action wording

Owner authorized the proposed wording with “fix that” on September 15.

Update components/C1AccountOpportunities.js to lead with Buy/Add quantity and symbol, remove ambiguous Review now and redundant Manual execution, label the opening reference price and signal close explicitly, and explain refresh expiry and recording a completed purchase. No selection, sizing, account or expiry behavior changes.

Update the existing UI authority test to identify the replacement recommendation by its new label while preserving the exits-before-buys assertion. Update only the component hash and authorization in docs/c1-release-freeze.json; guard code and build hooks are unchanged.

Verification: release freeze and rendered UI authority regression, followed by required CI and production build.

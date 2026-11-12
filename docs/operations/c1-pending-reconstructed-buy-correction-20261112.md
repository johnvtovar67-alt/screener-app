# Prior-session reconstructed Buy correction — November 12, 2026

## Defect

The prior-session activity form received its order options from `pendingC1AccountSession`, which reconstructs a dated plan from historical account inputs and actual opening prices. That reconstruction is useful as accounting context but does not prove the live screener displayed or authorized those orders. Its buy candidates were presented as ordinary C1 order choices. In the reported case, the form offered OKTA even though the current Opportunities view said no purchases were authorized and the Watch row showed WAIT because company-event verification and accepted-close timing were unconfirmed.

## Repair

- Hide prior-session reconstructed buy candidates unless the plan carries both provider verification and executable authority.
- Label retained sell/stop candidates as candidates and state that only actual Schwab fills should be recorded.
- Explain that historical reconstruction does not establish what the live screen displayed or whether an order was authorized.
- Leave the confirmed no-fill session path available.

## Preserved behavior

This is a recorder presentation correction. It does not create a Buy, change the Watch list, bypass event or entry-timing checks, adjust sizing, authorize brokerage activity, or write any trade or account record. The screener continues to show WAIT while required current checks are unavailable.

## Acceptance

Run the repository release-freeze check, canonical integrity check, full regression suite and production build through the existing CI workflow. Require all four CI jobs to pass on the exact reviewed PR head, then verify the deployed UI and commit. Do not infer an OKTA fill or change the user's account.

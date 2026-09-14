# Restore confirmed entry status without reconstructing fills

The owner's updated screenshot confirms missing saved purchase targets/partial-entry metadata on all three Swing holdings. The owner previously confirmed partial/full entry status and authorized repairs. The existing purchase-history import requires individual transaction costs that are not necessary to restore entry status and must not be fabricated.

A separate c1-position-stage-v1 contract restores only owner-confirmed status. It verifies supplied whole shares and average cost against the immutable adoption, requires the current revision, preserves all existing purchase history, and creates no fills or dates. Status-only imports skip date corrections. The existing account settings import accepts this contract using the same hash-fragment delivery, private session storage and authenticated save path. The server still replays and validates the account before saving.

Regression tests cover idempotence, stale revision and share mismatch rejection, preservation of adoption and purchase history, no invented transactions, qualified partial completion and full-position exclusion. The current full-target engine, historical strategy, original model records and cron are unchanged. Only the three changed application hashes are updated under the existing repair authorization.

Actual private save must occur in the owner's already-synced browser. Deployment does not itself mark private account data as corrected. The prepared status link contains only owner-supplied portfolio facts, no sync credential. Restoring partial status permits a fresh C1 eligibility review; it does not guarantee a Buy or reconstruct the original historical recommendation target.

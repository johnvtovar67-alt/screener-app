# Remove the temporary Watch download control

The owner asks whether the diagnostic download button will now be removed.
Its temporary purpose is complete. Restore the prior clean Watch presentation
by removing only its import and button from
components/C1AccountOpportunitiesView.js. Baseline main and canonical production
is 5790522d58e487bd3cf0b3484c1dfad2af04f4db.

The corrected stock-specific vs shared account-wide warning remains unchanged.
The pure allowlisted report helper remains as historical/test support; it has
no UI consumer after cleanup. No new request, storage change, account write,
ranking, selection, sizing, quantity, price, cash, stop, cooldown, risk reference,
holding timer, exit rule or normal job changes. No private diagnostic payload or
owner holding facts are included in this repository.

Update only this view's freeze hash and authorization metadata. An exact
one-file inverse reconstructs the prior diagnostic view for historical source
and export-interaction coverage; original fixtures, hash pins, financial and
gate assertions remain unchanged. New raw-view coverage verifies no control,
no other rendered difference and unchanged actions, quantities and Watch rows.
Current normal/closed-market browser checks return to control absence, retaining
all position/rank/financial assertions and hidden universe counts.

Require focused checks, the complete build and all four CI jobs on the exact
reviewed head, matching preview, merged-tree equality, canonical production
identity and actual served bundle. The owner's final reload should confirm the
button is gone; no account edit or financial transaction is needed.

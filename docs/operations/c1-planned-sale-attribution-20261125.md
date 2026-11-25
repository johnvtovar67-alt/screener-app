# Keep a recorded sale in its selected order group

The owner reports repeated sale notices and calls the stair-step liquidation
inefficient. A focused reproduction through the actual recorder demonstrates a
software defect independent of any portfolio-risk policy comparison. Baseline
main and production is a3d7e614888289d82962556d85bf7507f1fe6064.

The form offers planned sales and stop-triggered sales separately, but dropped
that distinction from its ticket. The server sorted unconditional exits first,
then proportionally allocated the ticket across both those exits and other
allocations' conditional stops. Ledger conservation passed while the intended
planned exit retained a remainder. The repeated risk evidence can therefore
describe the original unfinished exit rather than a new loss episode.

Preserve the selected sale kind and original group order IDs in the ticket.
Validate the exact available server-derived group before allocating shares.
Client IDs restrict the existing server evidence; they never create permission.
Reject unknown, duplicate, cross-kind or stale IDs, and reject ambiguous legacy
submissions that do not identify the selected group. Keep unambiguous legacy
entries and explicit owner-discretionary sale accounting compatible. Use the
existing safe error boundary to return actionable reload/validation errors.

The correction changes only the recorder component, recorder domain function
and allowlisted API errors. It does not change recommended quantities, signals,
stop triggers, risk thresholds, resets, cooldowns, selection, sizing or funding.
No automatic migration or reassignment of existing financial records is included.
The original tickets, fills, identities and financial facts remain unchanged.
Current saved account evidence is required for any separate historical recovery;
an offline reproduction cannot establish the exact private account attribution.

Committed checks use wholly fictional holdings and prices. Private screenshots,
account values, quantities, files and owner fill facts stay outside this repo.
Update only the three affected freeze entries and scoped authorization metadata.
An exact source inverse must preserve all historical fixtures and pins. Require
focused real-form/domain/API checks, complete regression/build/audit, all four
CI jobs on the exact reviewed head, matching preview and merged-tree identity,
canonical production served-code checks and the owner's actual recovery path.
Do not call this complete from tests or deployment alone.

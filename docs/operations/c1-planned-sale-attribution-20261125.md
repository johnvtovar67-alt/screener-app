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

The owner subsequently supplied a fresh private saved record confirming the
same attribution defect. Keep that evidence outside version control. Add an
explicit current-session correction review using only the saved original plan,
broker tickets and allocation parts. Eligible cases require the complete
original portfolio-loss sale target, no later dependent purchases, one affected
allocation, and a flat allocation after correction. Unsupported or finalized
cases remain unavailable; they must not be guessed or silently migrated.

The owner reviews the original and proposed share splits, unchanged account
quantities/cash, and any change in calculated remaining C1 basis caused by
correcting which allocation's shares were sold. The original purchase bases,
dates, stop prices, broker execution prices/fees/times/IDs, plan and prior daily
records stay intact. Confirmation archives the original tickets and raw parts,
source revision/digest, intended effective parts and approval time in a durable
append-only audit. Only the live effective fill vector is reclassified; the
audit is not counted as another trade. A hash-bound review plus the existing
revision and strong-ETag write prevents stale or duplicate application. The
normal account analysis must validate before saving. Original form selection
and pre-execution issuance are unavailable and are not fabricated.

This is a recording repair, not a risk-model revision. Existing thresholds,
signals, stops, cooldowns, sizing, funding and operational reset rules continue.
A completed liquidation still requires the normal verified next-eligible-opening
process; no historical peak or loss is cleared. Do not automatically replay an
uncertain correction POST. The owner confirms this accounting correction in the
normal authenticated account, without a sync-key request or direct Blob edit.

Application scope: components/C1IntradayActivity.js, lib/c1IntradayActivity.js,
lib/c1ApiErrors.js, new lib/c1SaleAttributionRecovery.js,
pages/api/c1-account.js and pages/index.js. Update only these freeze entries and
scoped authorization metadata. The freeze checker, canonical checker, CI and
build hooks remain unchanged. The exact new source inverse covers these files;
all previously published source/economic fixtures and pins remain immutable.
Manual API test harnesses import the new real helper and the existing sector
label oracle explicitly reverses only the new exact index source seam.

Committed checks use wholly fictional holdings and prices. Private screenshots,
account values, quantities, files and owner fill facts stay outside this repo.
Require focused actual form/domain/API checks, complete regression/build/audit,
all four CI jobs on the exact reviewed head, matching preview and merged-tree
identity, canonical production served-code checks and the owner's actual
review/confirmation/reload path. Tests and a deployment alone are insufficient.

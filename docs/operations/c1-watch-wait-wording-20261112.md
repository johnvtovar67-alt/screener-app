# Consistent Watch WAIT wording — November 12, 2026

## Defect

The C1 Watch table rendered a blocking `WAIT` message only when a row had a stock-specific wait reason. If a monitor had only shared account/opening/execution blockers, the same non-Buy state instead appeared as neutral “Dated monitoring candidate; this is not a purchase instruction.” The owner correctly identified that mixed wording as wrong behavior because all these rows lack current Buy/Add authority and the shared blockers still prevent purchases.

## Repair

- Use `WAIT` consistently on every non-Buy row in the Watch monitor list.
- Show row-specific event, momentum, timing, quote, or purchase restrictions first, followed by shared account/opening/execution blockers.
- If no individual or shared reason is available, say the row is dated monitoring only and no Buy/Add is authorized.

## Preserved behavior

This changes explanation copy only. It preserves the dated top-ten list, rank order, candidate eligibility, structured wait reasons, Buy/Add gates, event checks, account checks, execution authority, quantities, and all financial records. No new purchase is authorized.

## Acceptance

Require the existing release-freeze, canonical-integrity, regression/build checks, and all three browser rehearsal jobs to pass on the exact PR head. Verify the production deployment and the rendered Wait explanations.

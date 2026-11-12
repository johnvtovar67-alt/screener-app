# Consistent Watch WAIT wording — November 12, 2026

## Defect

The C1 Watch table could lead with “Current company-event verification is unavailable” even when a separate entry trigger had already failed or a shared opening/account check blocked every row. Event evidence is requested only for candidates that can still become actionable, so a missing event receipt on an already-ineligible monitor was misleading as the primary explanation. The same table also used neutral dated-monitoring copy for rows blocked only by shared account/opening/execution checks.

## Repair

- Use `WAIT` consistently on every non-Buy row in the Watch monitor list.
- Lead with independent quote, momentum, timing, account, or shared opening blockers. Keep a raw `event-unverified` reason in structured diagnostics, but show it as the row explanation only when no other blocker is present.
- Keep event verification mandatory as the final gate for any otherwise-qualified Buy/Add. This presentation change does not make an unverified event clear.
- If no individual or shared reason is available, say the row is dated monitoring only and no Buy/Add is authorized.

## Preserved behavior

This changes Watch explanation priority only. It preserves the dated top-ten list, rank order, candidate eligibility, raw structured wait reasons, Buy/Add gates, event checks, account checks, execution authority, quantities, and all financial records. No new purchase is authorized.

## Acceptance

Require the existing release-freeze, canonical-integrity, regression/build checks, and all three browser rehearsal jobs to pass on the exact PR head. Verify the production deployment and the rendered Wait explanations.

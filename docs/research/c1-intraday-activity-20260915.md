# Intraday completed-trade accounting — September 15, 2026

The owner requested immediate repair after selling STX and deleting its entered holding. The saved C1 account still owned STX, while the completed-session form could not accept a trade during market hours. That prevented an accurate replacement review. A separate portfolio-sync failure used a weak compressed-response ETag for a conditional write.

## Change

Account settings now accepts one aggregate completed broker fill during the regular session. The server allocates it to the existing sleeve orders, validates quantity, timing and actual cash, and saves it with the account revision and storage ETag. Actual proceeds update holdings and cash immediately. Duplicate submission IDs are idempotent; conflicting IDs, oversells and failed writes do not change the saved account.

The original opening plan and fills are retained. Remaining recommendations use actual cash and fresh prices while preserving the existing selections and remaining quantity limits. Unfilled sales cannot fund purchases. Position, sector, entry-gap and sleeve drawdown/cooldown checks still apply. A sale does not guarantee a replacement: an eligible order must already be available under C1's plan and pass those checks.

At the next completed capture, the recorded intraday fills enter the existing completed-session replay exactly once. No daily no-trade confirmation is introduced. Older session forms cannot overwrite a session with intraday fills already saved. Core holdings remain intact when the entered portfolio is reconciled.

Confirmed C1 exit candidates display **Exit** in portfolio rows. Unconfirmed **Stop review** remains distinct; internal state and exit rules are unchanged.

Portfolio sync requests identity encoding for the strong storage ETag. Genuine ETag conflicts remain conditional-write conflicts and return 409, including the SDK's message-only error form. There is no blind overwrite or version-check removal.

## Scope and validation

The frozen simulator, options, ranking, stops, holding periods, sleeve allocations, accepted historical sources and cron schedules are unchanged. Freeze hashes are updated only for the affected UI/account implementation and new modules. The freeze checker itself is unchanged. Build and verification hooks add the focused intraday regression.

The regression exercises the actual API and accounting with synthetic data: intraday sale, credited proceeds, qualified replacement, recorded purchase, reload, completed-session replay, partial sales, duplicate IDs, failed persistence, aggregate form rendering, entry-gap rejection and cooldown rejection. Existing regression gates and the production build are required before release. The brokerage label assertion now evaluates the actual display expression instead of requiring the old literal string.

No real broker fill was invented or submitted. The owner must enter the actual STX execution details once. Production build verification cannot establish the state of the owner's browser or account; the actual replacement depends on its saved fills and current C1 checks.

# Pending-session visibility and fill-entry wording — November 12, 2026

## Observed issue

The owner saw a dropdown option reading “C1 planned purchase: OKTA · up to 77 shares” in the completed-trade recording form and correctly reported that the Opportunities screen had never shown an OKTA Buy. The dropdown is an accounting form for recording an actual Schwab fill; a planned allocation in that form is not a Buy recommendation or proof of a fill.

Production account logs on November 12 show the 253-symbol opening scan completed in roughly 7–10 seconds. Three subsequent opening-review requests returned `ACCOUNT_ACTIVITY_PENDING`, so the server withheld a current checked-buy result. The prior-session activity form was inside the hidden Account settings panel and collapsed, while the current-session trade form could remain visible. The user could not find the no-fill completion form from the blocked Opportunities view.

## Repair

- Display the pending prior-session activity form directly on Opportunities and My Portfolio whenever a session remains unresolved.
- Explain that the form records only actual Schwab fills, and that confirming a no-fill session records activity without placing an order.
- Change completed-trade dropdown labels and explanatory copy so planned buys, planned sells, and stop levels cannot be mistaken for executions or Buy instructions.
- Keep the Account settings entry available and expanded when opened.

## Preserved behavior

No account record, trade, order, holding, cash, ranking, event check, entry-timing check, size, stop, or purchase gate is changed. The no-fill confirmation still requires an explicit user checkbox and save. The prior session must be resolved before the app can complete a current Buy/Add review. No Buy is promised: OKTA must still pass its current event and entry-timing checks.

## Acceptance

Update the existing intraday regression's expected selector copy. Require all four repository CI jobs on the exact PR head before merge, then verify the deployed commit and the owner's actual Opportunities screen. This UI repair itself does not confirm a user account write or a brokerage fill.

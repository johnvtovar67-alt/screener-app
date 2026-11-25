# Deployed cash-review response recovery

The owner's actual screen loads the prepared statement but remains in review.
The browser callback uses the ordinary account-response reader, which requires
an account decision; the review endpoint correctly returns a cashReview instead.
A successful proposal would therefore fail the wrong response contract. Recent
production logs also contain generic account-analysis failures without an
operation or underlying invariant, so that evidence cannot identify whether
review, confirmation or another account POST failed.

Use a dedicated strict cash-review reader bound to the requested revision,
proposal identity, reconciled balances, risk evidence and sale-allocation rows.
Keep the normal account-decision reader unchanged in strength. Bound the entire
read-only review request, including waiting for headers, so a stalled request
releases the spinner and retains the draft. Never automatically retry a request
or alter confirmation, trade recording or financial mutation behavior.

For these two cash operations only, report a bounded operation/stage and reason
identifier. Exact allowlisted invariant text may be shown; unknown messages,
private values, URLs, stacks, keys and bodies remain hidden. Existing revision,
validation, dependency and integrity classifications remain intact. This adds
no monitoring task, producer job, credential flow or new financial authority.

The provided activity and uploaded account already reconcile privately. The
actual accepted market book is still needed by the server's financial checks;
format parsing or cash arithmetic cannot replace those checks. No new input is
invented and no original record, stop, cooldown, risk reference or trading rule
changes. Native owner confirmation remains required for a saved correction.

Preserve all 85 published fixture blobs and prior oracle assertions. Add one
exact follow-up source inverse against published d2f748d before the existing
cash-authority inverse. Refresh only the four affected application entries in
the release freeze; canonical code, guards, CI/build hooks, configuration,
credentials and dependencies stay unchanged. Verify actual browser callback
and HTTP-handler response paths, bounded failures, full release gates and the
deployed owner workflow. Passing fictional regressions alone is not recovery.

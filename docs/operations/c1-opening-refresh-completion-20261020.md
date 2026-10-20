# Account/opening refresh completion — October 20, 2026

Owner requests completion of the persistent mobile Opportunities refresh repair.
Main and production baseline: `e60a9534d3c48920fc4a9eaad1ee7d990098e5f1`.
The latest supplied screenshot no longer contains the screen-evidence warning;
the remaining empty-state warning therefore comes from the independent account/
opening review, not the screen-evidence pending branch. It does not establish
the specific private server failure or whether that request was still running.

## Reproduced defects and repair

The actual Home loader starts opening preparation with `void` and finishes
Reload when the compact screen and holding quotes finish. A delayed opening
review leaves the application reporting a completed refresh without completed
purchase verification. The regression fails on the baseline: “Reload must not
report completion before opening verification returns” (true !== false).

Keep the existing screen and opening requests parallel, publish current rows
and holding quotes immediately, and await both before clearing the Reload state
or stamping application-refresh completion. Do not serialize screen work behind
opening work. Existing request-id and account-identity fences remain intact.

The empty state currently sends even an already-specific manual review reason
through the generic short-copy formatter. Preserve the actual waiting reason
there, including expired/missing account verification. A response for a changed
account was silently discarded; retain the completed analysis and surface the
specific account-changed error instead. No mismatched plan is accepted.

These are client sequencing and disclosure repairs. No account endpoint,
source/ranking/classifier, safeguard, sizing, cash, ownership, fill, stop,
adoption, execution-authority or strategy rule changes. No live account data
or sync keys were read, requested or written. The specific remaining private
blocker is not inferred from fixtures or the screenshot.

## Verification and guard

Actual-loader tests delay opening review while proving screen rows already
published, Reload stays active and the completion timestamp is withheld. Once
the review returns, Reload and the timestamp complete. Actual-component tests
show the full account reason when screen evidence is complete. Actual-client
tests visibly reject changed-account responses while retaining the completed
decision, existing failed-request handling and superseded-response fences.
Existing held-quote/stop and historical presentation tests pass.

Only pages/index.js and components/C1AccountOpportunities.js application hashes
change. Historical source comparisons reverse only the four enumerated Home
seams and the one empty-state copy binding; original comparison hashes remain
pinned. Release guard, canonical guard, build hooks and dependencies are intact.
Full normal CI/build results are recorded in the PR. Successful software checks
are not a claim that an unobserved signed-in account has a qualifying purchase.

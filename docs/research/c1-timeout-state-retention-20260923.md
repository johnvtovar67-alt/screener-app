# C1 timeout state retention — 2026-09-23

## Reported failure

On Account settings, a C1 account read exceeded the browser's generic 15-second API timeout. The C1 endpoint itself permits up to 90 seconds because it may verify dated account inputs. The client aborted the healthy server request, cleared the loaded account view, and treated the ambiguous null state as proof that no account existed. This exposed **Start C1 with current portfolio** even though the saved account remained intact.

## Repair boundary

- C1 account GET requests now use the endpoint's existing 90-second execution budget; other ordinary API routes retain the 15-second budget.
- A transient timeout, network failure, malformed response, or server failure does not clear an already-loaded account view.
- A null/temporarily unavailable view is distinct from an authoritative 404. Only a confirmed 404 permits account activation.
- When the saved account cannot currently be loaded, Account settings says it was not removed and offers **Retry saved account**.
- Authentication failures still clear the view. Disconnecting still clears local account state and cancels in-flight responses.

No strategy, recommendation, holdings, cash, fill, provider-reconciliation or execution behavior changes.

## Verification

Client regression covers network failure, invalid JSON, authentication failure, authoritative 404, request races, disconnect cancellation, conflict recovery, guarded activation and the route-scoped timeout. Existing intraday and account replay regressions remain unchanged.

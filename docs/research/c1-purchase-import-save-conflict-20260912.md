# Purchase-history save conflict repair

A production screenshot showed an ETag mismatch while applying the prepared
purchase history, followed by a disabled Apply button and a legacy capital
reconciliation warning.

The API collected holding-rank observations on every POST, including metadata
imports. This enlarged the interval between reading and conditionally saving an
account, allowing an ordinary refresh to win the save first. The failed request
cleared the client's account view. Portfolio analysis also consulted its old
React account value after awaiting refresh, allowing the obsolete capital path
to run despite a successfully loaded private account.

The repair retains conditional writes. A losing analytical refresh reads the
winner instead of overwriting it. A purchase-context save may retry once against
the winner only if protected account state is unchanged: ownership, adoption,
dates, capital, fills, existing context, corrections and accepted source records.
Only observation enrichment and revision may differ. All evidence is revalidated.
A competing economic or factual edit remains a conflict, not an overwrite.

Metadata imports no longer collect market data. The client reads a fresh revision
before applying the import; unresolved conflicts reload a fresh read-only account
view while retaining the pending import. A separate Refresh saved account control
allows recovery even without a loaded decision. Visible working state releases
on failure. Portfolio analysis uses the result it awaited and never rewrites the
legacy capital record following a failed or superseded account request.

Synthetic tests force the exact ETag error in both completion orders. They verify
retained purchase context, analytical observations, account records and adoption,
and reject rebases over newer fills, capital, dates or context. Client tests cover
fresh-view recovery, read-only requests, disconnect cancellation and absence of
legacy capital writes. Existing account, client and recommendation gates remain.
No real holdings, cash or fills are changed by these tests; no historical study
is repeated, no research endpoint is retried and the cron is unchanged.

Vercel documents conditional writes and their precondition error in the
[Blob SDK reference](https://vercel.com/docs/vercel-blob/using-blob-sdk), and
[origin-consistent private reads](https://vercel.com/changelog/vercel-blob-now-supports-consistent-reads-on-private-storage).

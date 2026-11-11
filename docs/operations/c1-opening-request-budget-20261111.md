# Opening-review request budget — November 11, 2026

The owner's new screen shows an opening-review timeout. Normal production logs
on `dd2d86d` establish that shared storage now works: four requests progressed
64, 128, 192 and 241 of 241 opening candidates, restoring prior batches each time.
The final server response at 20:05:59 UTC contained a checked plan. The first
opening request began at 20:04:31.454 UTC; the server-side chain took 87.647
seconds before mobile/network overhead, leaving insufficient room inside the
existing 90-second client timer. This is observed production behavior, separate
from synthetic tests. A checked server plan alone does not authorize purchases
through the phone's other account and execution gates.

Each partial HTTP review repeats full account analysis and fallback replay.
Actual scan batches took approximately 0.6–1.2 seconds, while partial requests
took roughly 13 seconds each. The repair acquires additional 64-name batches in
the same review when the existing provider budget permits. Eight workers, the
30-second provider deadline and 90-second client deadline remain unchanged.
Another batch is admitted only with more than the greater of ten seconds or
twice the observed batch cost plus one second remaining. This reserve is an
admission heuristic; the original provider deadline remains the hard bound.
Every batch is committed to shared progress before continuing. Stalled or
changed-source progress, slow batches and acquisition errors retain explicit
incompleteness; no partial scan grants purchase authority.

Fresh quotes, both membership observations, current events, source-basis
verification and every account/quantity/risk gate still apply after acquisition.
No ledger cache, financial record, stop, risk reference, ranking, sizing,
funding, concentration, universe or infrastructure change is introduced. Legacy
and explicitly isolated warm-worker fixtures retain their old await boundaries.
Only the provider application hash changes; all earlier fixtures and economic
oracles remain intact through one additional exact inverse.

Release requires a full production-environment build and all four exact-head CI
jobs. Synthetic fast/slow and cold-worker tests establish behavior; deployed
end-to-end latency and the owner's visible recovery must be checked normally.

# C1 high-to-price historical comparison run — 2026-10-23

Owner authorization: test the already pre-registered high-to-price challenger
immediately rather than waiting for the prospective 30-trade/90-day promotion
gate.

This branch adds one temporary preview-only read endpoint. It restores the
existing accepted point-in-time S&P 500 dataset from its exact private manifest
and compressed chunks, verifies their ordering and dates, and runs the frozen
Champion and single Challenger through the same simulator for 2023-01-04
through 2026-09-01.

The historical comparison starts each sleeve from the simulator's standard
normalized $100,000 cash book. It does not synthesize a current-account
adoption record; those records require separate dated opening evidence and are
not needed for a paired strategy replay.

Before execution, the transformation was hardened so fresh-entry and
holding-only signal rows receive one consistent dated Challenger rank. This
prevents a held stock from retaining a Champion rank while candidates use the
Challenger definition.

The endpoint:

- returns 404 in production;
- runs the paired simulation in a memory-bounded sequence (Champion first,
  then Challenger on the same disposable private restore) rather than making
  six full copies of the accepted replay;
- validates all 24 manifest entries, then restores one required chunk at a
  time to bound transient decompression memory;
- retains the exact causal input window beginning 122 sessions before the
  evaluation start (index 130, 2022-07-12): the registered 120-session
  formation window plus the simulator's two pre-start persistence sessions;
- logs only elapsed restore-chunk, transform, and sleeve phase boundaries so a
  bounded preview failure can be attributed without exposing dataset rows,
  holdings, trades, credentials, or account state;
- performs no provider acquisition and no storage write;
- exposes no holdings, account records, orders, credentials, or raw dataset;
- returns only aggregate offline research metrics;
- cannot authorize or change a recommendation or trade.

After the bounded historical result is captured, the temporary endpoint must
not be merged into production. A weak result rejects the challenger. A survivor
still requires the previously fixed prospective evidence gate before any C1
policy review.

## Bounded preview result

The single instrumented invocation ran against preview deployment
`dpl_Gf5ahnsPaKjbHj9efiRPFbaouZNN`, Git commit
`dade3aa7917690e250f604befa79ec5551efb261`, request
`nl2jv-1792795578938-4525c22701e9`. It returned HTTP 500 after
103.016548 seconds. Vercel reported that the function instance was killed
because it ran out of available memory.

The last completed checkpoint was 20 of 24 chunks and 1,000 of 1,170 sessions
restored at 72.240 seconds. The final four-chunk batch began at 72.241 seconds.
No `restore-complete`, Champion-sleeve, Challenger-transform, or
Challenger-sleeve boundary was reached. Therefore this invocation produced no
historical comparison result and supports no inference about the Challenger.
It localizes the failure to full-dataset restoration before simulation.

The stored-chunk contract already writes
`compiledDataset.sessions.map(compactReplaySession)`. Applying the same helper
again is a defensive, idempotent restore check; it is not evidence that the
accepted payload contains an unprojected session graph. No second blind run was
started.

The authorized bounded follow-up preserves the exact simulator meaning while
removing data that neither arm can consume. A permanent regression compares the
full-history result with the 122-session causal-window result by deep equality.
This is an isolated preview repair only: it adds no storage, provider, worker,
credential, production authority, parameter search, or live-strategy change.
The branch remains **DO NOT MERGE**.

The next single invocation ran on preview deployment
`dpl_5yavos5rKrA6mwmDiR4XNLXGjaZU`, request
`zbd5m-1792798229829-8e7386561a6b`. It restored all 1,040 retained sessions and
completed every Champion sleeve (base: 173 transactions; cooldown15: 151;
sector40: 175). The Challenger transform then stopped before any Challenger
sleeve ran because MBC lacked the fixed formation rows on 2023-02-22. This is
not a comparison result and supports no inference about the Challenger.

The accepted compiler establishes the applicable missing-history policy. It
can admit a security after 50 observed price bars, but `return120Ex20` remains
unobserved until 121 closes exist. Cross-sectional factor construction excludes
an unobserved input rather than imputing it; the frozen C1 configuration has no
minimum-momentum or minimum-factor-coverage gate, and its momentum-only rank
centers an unobserved percentile at neutral. The Challenger now applies that
same eligibility state exactly: a late entrant with an unobserved accepted
formation factor receives null Challenger formation/rank fields and is excluded
from the peer denominator. It never receives a shortened or fabricated price
history. Conversely, if the accepted Champion factor is observed while the
fixed Challenger price window is incomplete, the transform still fails closed
as contradictory evidence. Regressions cover the MBC-shaped late entrant,
unchanged ranks for observed peers, contradiction rejection, and full-history
versus 122-session-window deep parity.

No rerun was initiated while this semantic correction was being reviewed.

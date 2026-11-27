# November 27 screener reliability review

The review starts at production main `e73dbf69f78c4c52cffe3a5db5b84cc78e8ec933`. It covers the normal browser journey from the accepted market book through account analysis, the opening review, candidate verification and publication. On the morning after Thanksgiving, November 25 was the correct completed source session. Verified quotes for the five held names covered those holdings. Candidate verification covered a separate 279-name scan.

## What happened

| Failure | Evidence and disposition |
| --- | --- |
| Opening review exceeded the server deadline | Production logs reached full anchor coverage before the timeout. A synthetic run through the real handler isolated repeated momentum lookups. The repair reduced a comparable replay from 116.5 to 63.8 seconds with identical output. A normal production opening review then returned in about 57 seconds. [PR #399](https://github.com/johnvtovar67-alt/screener-app/pull/399) |
| The candidate scan ran out of time | Eight 32-name batches reached 256 of 279 candidates. A normal run consumed about 101 seconds from its first response. The repaired server admits a second bounded batch on a continuation only when the existing deadline has room. A subsequent normal scan finished all 279 in five requests. [PR #400](https://github.com/johnvtovar67-alt/screener-app/pull/400) |
| An interrupted opening response exhausted the recovery allowance | A normal browser started the recovery GET about 56.5 seconds after its POST. The GET took about 57.7 seconds, so the shared 90-second window expired first. The one existing read-only recovery now gets its own bounded interval. [PR #401](https://github.com/johnvtovar67-alt/screener-app/pull/401) |
| The after-close update could not reconcile a provider correction | FMP revised BBY's November 25 opening price from $101.84 to $99.60. The reviewed counterfactual changed an already recorded model buy's quantity, stop and risk reference. The owner approved a scoped recovery on the recorded basis. Production accepted November 27 at 4:31 p.m. Central, the authenticated browser reported publication at 4:35, and the next scheduled run read the accepted session at 4:45. [PR #402](https://github.com/johnvtovar67-alt/screener-app/pull/402) |

The mergers feed reported overlapping pagination and subsequently verified identical partition coverage. The BBY archive replay reproduced the closing failure specifically at economic reconciliation. The browser reported `MARKET_CLOSED` with current November 27 analysis at the end of the day.

## Preventive fixes

- Hold the scan to its existing 90-second continuation budget, including a pass that has returned headers and is still waiting for its body. A late result cannot settle the frame. The existing per-request and account opening deadlines continue to govern their own work.
- Retain the highest valid progress receipt when another worker reports a lower count. Allow one ordinary read-only continuation in the remaining budget. Source identity and total must still match, and one response must verify the full accepted universe.
- Keep the scan incomplete if a continuation omits its receipt or lacks an explicit completion flag. A successful broad-screen response cannot clear an active scan.

The browser rehearsal reproduces the stalled body and missing receipt with real Home/App and localhost HTTP, then checks that publication keeps the incomplete count, withholds fresh purchase quantities and never changes the saved account. A separate regression uses two isolated instances of the real screen handler and reproduces progress of 96 followed by 64 after a worker change. The repair continues through the warm worker to 279. The existing cases still exercise wrong sources, incomplete totals, flat progress, exhausted budgets, superseded requests and interrupted opening reads. The only application file in this release is `lib/c1ScanContinuation.js`. The four CI jobs run with the existing workflow and source and economic oracles.

## Remaining provider boundary

A genuine correction can still change the economics of recorded history and trigger the existing review. One way to reduce this class of interruption is to test whether execution-sensitive bars stabilize before the first accepted capture, using the existing archive and schedule. Review that approach across multiple ordinary and early closes and measure any publication delay before changing the acceptance rule. Unavailable provider evidence and repeated worker regressions still leave the scan honestly incomplete.

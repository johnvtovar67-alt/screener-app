# Opening comparison rejection diagnostics

The November 13 owner report authorizes diagnosis and repair of a current
opening review that fails before checked manual purchase quantities can be
published. This release identifies the failed comparison without changing
whether any opening review is accepted.

The existing rejection reports `comparison unavailable` when the unequal field
is outside its short diagnostic list. A synthetic full-universe execution
reproduces that result when a repeat-confirmed close changes only a negative
purchase-block explanation for an unused backup. Actual orders, holdings,
selected candidates and account limits remain identical in that reproduction.
It does not establish the cause of a particular private account request.

Only `lib/c1OpeningPriceReview.js` changes in application code. Rejected reviews
now identify allowlisted policy, exposure, recheck, risk or action fields and
serialization-order differences. Bounded diagnostic booleans and a count can
identify differences confined to known negative background purchase blocks.
Neither symbols nor financial values enter shared logs. These observations
never accept a plan or weaken the original comparison.

The existing acceptance comparator, revision source overlay, proof generation,
receipt validators, ranking, sizing, orders, history, account records, event
checks, quote requirements and cron behavior are unchanged. Only this file's
freeze entry and repair authorization metadata are updated. The build hooks,
release guard and CI workflow remain unchanged.

Focused regression coverage exercises the real account execution rejection,
diagnostic privacy, background versus protected policy blocks, serialization
order and preserved trade rejection. An exact inverse recovers the previously
released application bytes before earlier historical source seams; all earlier
fixture pins and economic assertions remain intact. Full build/regression and
all four CI jobs are required on the reviewed head before release. Production
diagnostics must establish the actual unequal field before any acceptance repair.

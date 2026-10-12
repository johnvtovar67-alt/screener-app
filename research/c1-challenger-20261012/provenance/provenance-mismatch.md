# Champion source mismatch: allocation repair versus audit reconstruction

Read-only source inspection and four-session synthetic verification establish that the preserved conditional Champion result does not use the same account policy source as engineering repair commit `e2b98471311fb702113baf0ca64473b92ccfd142`.

| Identity | Engineering repair | Preserved audit Champion |
| --- | --- | --- |
| Commit | e2b98471311fb702113baf0ca64473b92ccfd142 | 006e067697385143684c7417b18bc7909c2d217e |
| Account simulator SHA-256 | aa9171972572607cbe63fbe68911c0825f4d67113e5ebf2649704d04f4cf6e13 | 2c5e4036d4fac8992c8bedbeb0899c627a82e3b54b4f1cf59e924409dc95ac83 |
| SCHW excluded before allocation | Yes | Yes |
| SCHW removed from holding-rank pool | No | Yes |
| Independent account-rank helper excludes SCHW | No | Yes |

The engineering repair creates `allocationBlocked` and uses it only for entry eligibility and purchase allocation. Its `rankedPool` still uses the existing `blocked` set. The audit reconstruction puts SCHW in that shared `blocked` set, thereby removing it from `rankedPool`. Position holding rank is the index within that pool. This rank drives early Top9/3, profitable Top6/2, and age-30 Top6/1 exits. The audit's changed `c1AccountRankEligible` also changes the eligible peer pool used by `c1HeldRankReview`.

MSTR is already excluded by all three frozen sleeve configurations. The ordinary current-sleeve distinction demonstrated here is SCHW's treatment in holding ranks, rather than a changed momentum formula or exit threshold.

Synthetic fixtures retain a qualifying high-ranked SCHW, use unchanged production sleeve options, and seed an already-held stock at the adjacent exit-rank boundary. Both versions exclude SCHW purchases. Nevertheless:

| Fixture | Engineering repair result | Audit reconstruction result |
| --- | --- | --- |
| Age 30+, held rank 7 including SCHW / 6 excluding it | Rank exit September 2, 2026 | No held-stock sale |
| Peak gain 20%, held rank 7 / 6 | Confirmed profit rank exit September 3, 2026 | No held-stock sale |
| Age 5–29, held rank 10 / 9 | Confirmed early rank exit September 4, 2026 | No held-stock sale |

Verification: `node research/c1-challenger-20261012/provenance/reproduce.cjs` passes three fixtures against two SHA-256-checked source copies. Both use the same repaired calendar. Results are saved in `synthetic-holding-rank-evidence.json`. These fixtures contain four invented sessions and no provider data, actual account records, or historical replay. They prove possible policy-path divergence; they do not quantify its effect on the historical archive.

The 12/25/50 bps saved Champion checkpoints all pin account simulator hash `2c5e4036...`, source graph `ac7355c070966f6ce34fcbd5d930f93280c8d271dedb469146a5c27afa262fdb`, and replay engine `36a8e41afdd825de46d0302b0fc3008354b30ff0ba2bd5483920ad12721d532a`. Their reported results remain preserved conditional audit results. They cannot be relabeled as the exact engineering-repair Champion or as evidence of that source's historical equivalence. Synthetic checks or changing a manifest pin cannot establish equality of the two historical portfolio paths.

Research must resolve this source identity before declaring an exact repaired-policy Champion reproduction or measuring Challengers against it. No engineering repair, strategy change, deployment, account write, or long historical run was performed for this inspection.

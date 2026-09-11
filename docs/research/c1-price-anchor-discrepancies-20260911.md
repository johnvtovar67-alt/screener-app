# C1 production collection: September 11, 2026

Production collection at 20:45:47 UTC on deployment `dpl_GEgNpkkXnfLsYTz9xnuBq9Lugqis` reached preparation, acquisition, and connection, then returned HTTP 503. These results establish that cron authentication, reading the existing book, and completed-input acquisition worked. They do not establish model advancement or trading readiness.

The failed transition compared September 10 prices while attempting to accept September 11. It identified 19 discrepancies:

| Symbol | Saved September 10 close | Newly observed September 10 adjusted close |
|---|---:|---:|
| ABBV | 254.98 | 255.00 |
| ADP | 267.33 | 265.63 |
| BF.B | 26.59 | missing lookup |
| BKNG | 174.33 | 173.91 |
| BRK.B | 507.00 | missing lookup |
| CB | 338.67 | 337.65 |
| CVX | 212.75 | 212.76 |
| FIS | 38.52 | 38.08 |
| GPN | 88.55 | 88.30 |
| GRMN | 272.20 | 271.15 |
| LLY | 1123.04 | 1123.00 |
| MS | 212.73 | 212.66 |
| NDAQ | 92.01 | 91.70 |
| ORCL | 153.17 | 152.94 |
| PG | 143.00 | 142.97 |
| REG | 75.31 | 74.55 |
| TXT | 79.20 | 79.18 |
| WM | 214.77 | 213.82 |
| WMB | 72.82 | 72.29 |

## Established software defect

The historical compiler replaces a dash with a dot in symbols. The acquisition code previously keyed previous-session anchors by unconverted provider symbols. Thus BRK-B/BF-B did not match BRK.B/BF.B in the saved compiled model.

The accompanying fix canonicalizes these two explicit share-class aliases when constructing anchors, rejects duplicate canonical keys, and leaves provider request symbols and observed prices unchanged. It does not ignore the remaining 17 changed prices or clear reconciliation gates. Production confirmation after deployment is still required.

## Remaining evidence requirement

Determine which price changes are corporate-action adjustments and which are vendor revisions, and implement an audited transition that preserves the accepted input history, position ownership, cost basis, cash and model decisions as appropriate. Do not merely raise the tolerance or overwrite the saved September 10 record.

AbbVie announced a $1.73 dividend on September 10 with an October 15 record date and November 16 payment date. That announcement alone does not explain the two-cent change above: https://news.abbvie.com/2026-09-10-AbbVie-Declares-Quarterly-Dividend

The normal application was checked during this investigation and still displayed September 10 with no current model decision. No private portfolio holdings or fills were modified. The separate historical-sector and strategy-selection evidence limitations remain.

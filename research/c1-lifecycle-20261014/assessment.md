# Completed diagnostic and interpretation

C1's authoritative score uses 62% weight on 100 included return sessions ending 20 sessions earlier, and 38% on 55 sessions ending five sessions earlier. Early and profit rank exits depend on that same leadership pool. Confirmation counts cannot react to information absent from rank. This is a code-established responsiveness risk, not proof of the value of a replacement policy.

The early rule applies only at holding ages 5–29 and requires three consecutive completed closes worse than rank nine. The profit rule applies only at ages 5–29, requires an intraday-high peak gain of at least 12%, current closing profit strictly above zero, and two closes worse than rank six. A failed condition resets its streak. Age 30 onward uses one close outside the top six. Entry day is age zero. Account-seeded continuation is required; a no-seed simulator omits the early/profit overlay. The 14% entry-based stop does not trail peak gains and can be exceeded through gaps. These statements are bound to application commit `f0d46ffceb98ba3fd5fca121beba6d8f23ccbdde`.

The existing local outputs supported a bounded archived holding diagnostic, not full portfolio reconstruction. The specification preceded comparative outcome calculation locally; it was not an independently sealed unseen holdout. All input history is reused. Thresholds were not calibrated to DELL, and October 14 DELL is outside the data.

Primary 25 bps EXIT-cost comparison, with independent H7/P50/V2 arms and original entry quantities fixed:

| Evidence set | Rule | Changed episodes | Higher/lower proceeds | Weighted fixed-episode proceeds difference |
| --- | --- | ---: | ---: | ---: |
| S&P | H7 | 115 | 61/54 | -$102,975.92 |
| S&P | P50 | 42 | 25/17 | -$19,841.30 |
| S&P | V2 | 31 | 14/17 | -$15,216.32 |
| Nasdaq | H7 | 108 | 51/57 | -$100,061.15 |
| Nasdaq | P50 | 46 | 25/21 | -$73,292.91 |
| Nasdaq | V2 | 38 | 21/17 | +$20,818.38 |

These are neither portfolio returns nor realizable strategy profits. Earlier exits may change later affordability, sizing, reentry, replacement and cash paths; those effects are absent. Matching exit-cost haircuts simply scale these differences. H7/P50 results show that helping more individual episodes can coexist with lower aggregate proceeds when forgone recoveries are large.

V2 has limited, later observation support: 152/245 S&P and 150/225 Nasdaq episodes had usable history. Nasdaq V2's +$20,818.38 includes +$19,130.61 from exits after holding age 30; 32/38 changed exits occur after that age. Since 30 is a minimum ordinary-rank holding age, this is relevant to longer holdings but does not validate early ages 5–29 profit protection. V2's opposite aggregate signs and unequal coverage do not identify a preferred rule.

Original observed CLOSE-peak gain reached at least 12% in 106 S&P and 91 Nasdaq sleeve episodes. Sixteen in each set subsequently returned to/below entry while still held. Median maximum running-peak-to-current CLOSE drawdown among those winners was 10.51% and 12.25%, respectively. Intraday peaks and some final-day extremes are unavailable. Sleeve and universe observations overlap; these are not independent replications.

H7 released median capacity of 9 S&P and 13 Nasdaq sessions among changed exits; P50 released 8.5 and 14. Capacity is an option to redeploy, not measured replacement alpha. Endpoint recovery and replacement-return hurdles are reported in aggregate evidence. No unheld opportunity series exists locally to identify the actual replacement path.

Full published aggregates preserve all costs, coverage and failures. There is no finalist, portfolio-performance improvement, trading-rule proposal for deployment or retrospective relabeling of this diagnostic as the current Champion backtest.

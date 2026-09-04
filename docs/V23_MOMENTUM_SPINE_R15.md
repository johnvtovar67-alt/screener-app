# V23 / parallel R15–R19 momentum-spine research contract

Status: frozen research contract. It has no production authority.

## Correction of research direction

R14 tested SEC filing changes as the primary rank and failed with insufficient
exposure and negative expectancy. R15 restores momentum as the primary engine.
Fundamental information is not permitted to displace price leadership in this
family. Every R15 candidate is calculated only from information available at
the historical close and fills at the next open.

Five bounded, economically distinct research generations are frozen together
before execution and run as separate workers:

1. R15: persistent dual-benchmark leaders;
2. R16: controlled pullback followed by momentum reacceleration;
3. R17: volume-confirmed momentum leadership;
4. R18: volatility-contraction leaders inside an established trend; and
5. R19: slow runner retention designed to reduce premature rank exits.

The parallel workers vary their economic mechanism and holding horizon rather
than searching an unrestricted weight grid. Exact weights and lifecycle rules are in
`lib/momentumSpineResearch.js` and fingerprinted into the report.

## Execution and evidence rules

- point-in-time S&P 500 membership and corrected adjusted prices;
- SPY and QQQ as uncompromised simple-return benchmarks;
- residual capital remains cash, never an index completion sleeve;
- whole-share next-open execution with 12 bps slippage per side and zero
  commission;
- five active candidates, a matched simple-momentum control, and a matched
  deterministic random control;
- development survivors only may enter validation, and at most one unchanged
  validation survivor may enter the historical audit;
- positive return, expectancy, profit factor, benchmark superiority, drawdown,
  trade-count, exposure, and fold-stability gates remain unchanged;
- any historical survivor still requires Newey-West significance versus both
  benchmarks, a separate 1,000-seed maximum-statistic placebo test,
  independent replication, and 60 genuinely new sessions before promotion.

Every stored session through 2026-09-01 was already observable before R15. It
may reject this family but cannot establish prospective alpha. The earliest
unchanged prospective ledger begins after the 2026-09-04 freeze. Production V11
and its constrained pilot remain unchanged during research.

## Research basis

- Jegadeesh and Titman, “Returns to Buying Winners and Selling Losers” (1993).
- George and Hwang, “The 52-Week High and Momentum Investing” (2004).
- Da, Gurun and Warachka, “Frog in the Pan” (2014).
- Lee and Swaminathan, “Price Momentum and Trading Volume” (2000).

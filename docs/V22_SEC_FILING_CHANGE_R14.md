# V22 / R14 SEC filing-change research contract

Status: data engineering and preregistration only. It has no production authority.

## Why this is a new research family

R7 through R13 exhausted increasingly broad price-only, sizing, Nasdaq and
vendor earnings-surprise variants without clearing the unchanged benchmark and
stability gates. R14 will test filing-date-safe changes in reported business
performance. It will not add another momentum weighting to those failed runs.

The source is the SEC `companyfacts` and submissions data. A fact becomes usable
only on the first market session strictly after its SEC filing date. The fiscal
period end is never treated as its availability date. For an amended period, a
historical decision may use only the latest accession filed before that decision.

## Data contract frozen before model results

- issuer key: permanent SEC CIK already carried by the historical universe;
- forms: 10-Q, 10-K, 20-F and 40-F;
- quarterly duration: 70–110 days;
- cumulative six-, nine- and twelve-month facts: converted to discrete quarters
  only when a same-start prior cumulative filing permits an exact subtraction;
- comparable prior period: 330–400 days earlier and within 14 duration days;
- initial fields: revenue, profitability (operating income where available,
  otherwise reported net income) and operating cash flow;
- availability: filing date strictly earlier than the signal date;
- missing facts, taxonomy aliases or CIKs: disclosed and failed closed;
- restatements: usable prospectively only after their own filing date;
- idle capital: cash; never SPY or QQQ;
- execution: signal at close and whole-share fill at next open with 12 bps
  slippage per side and zero commission.

No candidate thresholds or weights will be frozen until coverage, taxonomy
mapping and issuer-link integrity pass without examining strategy returns.

## Evidence boundary

All sessions through 2026-09-01 have already been inspected by the program.
They can reject R14, but they cannot provide genuinely prospective validation.
Promotion remains impossible without every existing return, expectancy, profit
factor, drawdown, exposure, fold-stability, SPY, QQQ, 1,000-placebo, independent
review and 60-new-session gate.

V11 production and the constrained pilot remain unchanged.

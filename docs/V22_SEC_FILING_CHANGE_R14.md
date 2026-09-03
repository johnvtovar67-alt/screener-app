# V22 / R14 SEC filing-change research contract

Status: frozen research contract. It has no production authority.

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

## Frozen candidate family

Before any R14 return was calculated, the code froze five active candidates:

1. balanced operating inflection: sales acceleration, profit growth, margin
   expansion and cash generation;
2. cash-backed growth: sales acceleration must be confirmed by improving cash
   conversion;
3. margin-expansion drift: newly reported margin improvement with limited
   benchmark-relative price confirmation;
4. triple-positive confirmation: reported sales, profitability and operating
   cash flow must all be positive year over year;
5. delayed confirmation: wait two completed sessions after filing and require
   residual strength.

The common lifecycle is also frozen: five-session ranking, eight holdings,
12.25% targets, ten-session minimum holds, a 16% initial invalidation stop,
60-session maximum holding period, three-name/37.5% sector caps, $30 million
minimum average dollar volume and a $5 minimum price. Residual capital stays in
cash. The exact weights, scales and thresholds live in
`lib/secFilingResearch.js` and are SHA-256 bound to every staged result.

Two non-selecting development controls are frozen: a matched-lifecycle residual
momentum model and a deterministic random rank (seed 14). Controls cannot be
selected as R14 winners.

The five active candidates must first clear every development gate. No more
than two can enter validation. Exactly one unchanged validation survivor may
enter the historical audit. The audit cannot select or retune. Any deterministic
audit survivor still requires a separate 1,000-seed maximum-statistic placebo
test and 60 genuinely new sessions.

The economic premise is filing-information underreaction rather than price
trend extrapolation. It is informed by Robert Novy-Marx's evidence on
fundamental momentum: https://www.nber.org/papers/w20984.

## Evidence boundary

All sessions through 2026-09-01 have already been inspected by the program.
They can reject R14, but they cannot provide genuinely prospective validation.
Promotion remains impossible without every existing return, expectancy, profit
factor, drawdown, exposure, fold-stability, SPY, QQQ, 1,000-placebo, independent
review and 60-new-session gate.

V11 production and the constrained pilot remain unchanged.

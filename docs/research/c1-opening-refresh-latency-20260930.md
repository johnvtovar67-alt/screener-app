# C1 opening refresh latency repair — September 30, 2026

## Owner instruction and observed defect

After a verified morning refresh took roughly 45 seconds and the resulting
checked recommendation expired almost immediately, the owner explicitly asked
whether both defects were being addressed. Production logs showed successful
C1 and broad-screen requests but no provider-stage timing. Direct observation
confirmed the private account request was the dominant wait.

## Root cause

The opening collector requested one FMP quote and one independently adjusted
prior-close anchor for every required account/candidate symbol. Only three
workers processed those paired requests, so a normal fourteen-symbol opening
review serialized most of the provider latency. The page then waited for the
account review before starting the opportunity feed, and that feed waited for
performance history. Finally, the checked recommendation expired two minutes
after observation, consuming much of its usable life during the refresh itself.

## Repair

- Use FMP's documented `batch-quote` endpoint once for all required symbols.
- Continue fetching each dividend-adjusted prior-close anchor independently,
  with bounded eight-way concurrency. Preserve both S&P membership observations,
  exact adjusted-close revision review, the three-percent opening-gap gate, and
  every frozen ranking, sizing, risk, cash, position and execution rule.
- Run the private-account refresh and broad opportunity refresh concurrently.
  Preserve the required ordering in which performance history is read only
  after the broad screen records the current signal observation.
- Preserve the required unknown-account guard: a missing private account must
  return before any model read begins. Emit a privacy-safe end-to-end timing
  marker for the account read, model read and total request, containing only
  milliseconds, so any remaining storage bottleneck can be isolated safely.
- Keep collected quotes no more than two minutes old when they are verified,
  but keep the resulting manual recommendation available for ten minutes (or
  until the actual market close, whichever comes first). The interface continues
  to require confirmation of current broker price and available cash before an
  order is submitted; no brokerage execution is authorized.
- Emit bounded `C1_OPENING_TIMING` diagnostics without account identifiers,
  symbols, prices, holdings or the portfolio sync key.

## Verification

The focused performance regression rejects individual quote requests, verifies
one batch quote, verifies two membership observations, requires one adjusted
anchor per symbol, and proves bounded concurrency above the former three-worker
bottleneck. Manual-recommendation regression proves the ten-minute window and
market-close boundary. Existing intraday and UI-authority regressions continue
to cover exact fills, cash, ownership, sell-before-buy ordering and expiration.

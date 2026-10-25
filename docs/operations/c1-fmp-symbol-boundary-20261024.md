# Shared FMP provider spelling — October 24, 2026

Starting main/production: `cddfe3e70a3276f81b4bf1c2b4245f5c8105df59`.
No active hardening PR or handed-off branch edits were found. Historical research
and UI drafts are outside this cleanup and remain untouched.

## Reproduced maintenance defect and bounded repair

`lib/fmpQuotes.js` and `lib/fmpFundamentals.js` independently implement the same
provider spelling expression: falsy input becomes empty string, coerce once,
replace the first dot with a dash, uppercase, trim. This duplicate boundary can
drift when one provider consumer is repaired without the other. No existing
production symbol mismatch or performance improvement is claimed.

The owner authorized continued behavior-preserving provider/symbol cleanup.
Move that exact expression into six-line pure `lib/fmpSymbols.js` and import it
in just these two consumers. Keep the quote consumer's local `norm` alias.
The API's other normalizers and explicit account BF.B/BRK.B alias maps have
different scope/contracts and are deliberately not consolidated in this slice.
No generalized canonicalizer, validation policy or alias expansion is added.

Only these three application manifest entries and this slice's authorization
are added/updated. Guard implementations, CI and build hooks are unchanged.
There is no dependency, route, provider call, store, diagnostic or infrastructure
addition. URLs, cache keys, retry/cooldown/deadline behavior, response annotations,
accepted bars, C1 decisions/UI, crons and account facts are unchanged.

## Evidence and verification

- Differential tests compare both original expressions against the actual new
  helper for 72 mixed/edge inputs, including share classes, Unicode, null/falsy,
  symbols, arrays and coercible objects. One coercion and thrown-error identity
  are retained. Only the first dot is replaced; this is not blanket aliasing.
- Reversing only the new import and removed declaration recovers both complete
  reviewed production blobs exactly: quotes `00e6b3170856577085573b203adfd07e61827fd3`,
  fundamentals `5dacd7e90008fdcb48b32f1bb57814476f750851`.
- Actual quote-provider/cache tests run offline: BRK.B/BF.B request spellings and
  equivalent-spelling cache reuse remain identical. Multi-dot input keeps its
  existing request spelling and non-idempotent rejection; this was characterized,
  not silently fixed. All provider replies and keys are synthetic.
- Existing fundamentals fallback/fanout/cache assertions pass with the actual
  shared helper injected at the existing external-I/O test boundary. Existing
  full/compact screen and deadline regressions load the real local import graph.
- Focused tests, freeze/canonical, full121/121 and optimized build PASS.
  PR #323 production verified on `e0aef6f16c2be4a2ef062cff614527aab148e4fd`,
  deployment `dpl_BBD2qTmMyKbqLkAnaMW2fsMGumog` READY, canonical version/health200,
  all configuration checks true and scheduler configured; initial scoped error
  scan clear. Exact head `177a7671b942dd696ca724956326269052dca6ca` passed CI #979
  (40147590281); preview `dpl_9k1oSid7MxKpdETdmG72iRK74o8c` READY/version/health200.
  Exact local/reviewed/merged tree `53a9cc6a75a2cb0178c025141dbfc8340934276d`
  matched. Initial deadline harness needed a one-line real-helper import; no
  deadline assertion or production behavior was weakened.

No live `/api/top5`, failing provider, account mutation or credential/private
capture was used. Private-account/browser parity remains NOT_VERIFIED.
Broader adapters, research-runtime isolation and immutable reads remain pending.

## Ownership

PR #323 verified release and ownership handoff are complete. No active edits
remain on its merged branch. Private-account/browser parity is still unverified.

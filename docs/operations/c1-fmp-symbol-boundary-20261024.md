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
- Focused tests, freeze and canonical guards PASS. Full suite/build and exact
  head CI/preview/production gates are pending at this source checkpoint.

No live `/api/top5`, failing provider, account mutation or credential/private
capture was used. Private-account/browser parity remains NOT_VERIFIED.
Broader adapters, research-runtime isolation and immutable reads remain pending.

## Ownership

This run owns `harden/c1-symbol-boundary-20261025` until exact release/handoff
is recorded in its PR. Do not edit concurrently. Release facts supersede these
source-time pending states; update during the next legitimate implementation,
not a documentation-only release.

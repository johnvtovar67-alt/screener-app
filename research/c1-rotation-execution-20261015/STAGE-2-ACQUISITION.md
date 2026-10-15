# Bounded second acquisition tranche

This adapter changes no production source, portfolio rule or frozen exit
specification. It acquires and validates prices only; it cannot establish a
complete ranking universe, action ledger or portfolio comparison.

The authorized limits are 250 additional FMP requests and 20 MiB of consumed,
uncompressed response bodies, including errors. Calls are sequential, with at
least two seconds between actual starts. There is no retry path. Account-wide
remaining quota is unknown and is never inferred from successful requests.

## Private inputs and recovery gate

Supply a new private `stage2-*` run directory outside Git, a frozen private
manifest and a validated private recovery receipt. The manifest contract is:

```json
{
  "contract": "c1-rotation-stage2-manifest-v1",
  "requests": [
    {
      "endpoint": "historical-price-eod/full",
      "params": {"symbol": "EXAMPLE", "from": "2023-12-29", "to": "2025-04-03"}
    }
  ]
}
```

Only `historical-price-eod/full`, `historical-price-eod/dividend-adjusted`
and `historical-price-eod/non-split-adjusted` are accepted. Bounds are fixed.
Duplicate endpoint/parameter pairs are forbidden, as are request manifests
larger than the stage cap. Additional manifest documentation is preserved
without generating additional requests.

The recovery receipt must use contract
`c1-rotation-stage2-recovery-gate-v1`, record positive `restored_responses`
and `restored_bytes`, and set these flags:

```json
{
  "passed": true,
  "fresh_context": true,
  "authenticated_private_read": true,
  "clean_output_directory": true,
  "original_local_inputs_accessed": false,
  "original_archive_accessed": false,
  "separate_cloud_instance": false
}
```

This scope means a fresh agent context recovers durable private objects into
an empty local directory without using original local inputs. It does not
claim that another cloud instance was provisioned. The receipt should reference
the evidence for the actual recovery test. A receipt is a prerequisite, not a
substitute for performing that test.

The command is:

```sh
python research/c1-rotation-execution-20261015/stage2_acquire.py \
  --private-dir /private/path/stage2-NEW-UNIQUE-ID \
  --manifest /private/path/frozen-manifest.json \
  --recovery-receipt /private/path/recovery-gate.json
```

Existing environment bindings supply FMP and private-store credentials. Do not
put either credential in a manifest, command argument, log or repository.

Before the first FMP request, the adapter uploads immutable compressed copies
of the entire manifest and recovery receipt, followed by checkpoint zero. If
any upload fails, acquisition stops with zero FMP requests. Each subsequent
response is saved privately, followed by an immutable numbered journal
checkpoint, before another FMP request can begin. The final sealed journal is
also immutable. The new stage prefix is independent of the original archive.

## Validation and stopping behavior

Every response is privately preserved before its values are validated. The
local journal reserves a request before network access and records source
vintage, endpoint, parameters, bytes, private response hash, code hashes and
the frozen protocol hash. Licensed input hashes, URLs, values and detailed
diagnostics remain private. Standard output contains only operational counts,
status and whether validation passed.

Successful HTTP status does not bypass error detection: provider error objects
and arrays containing error or message fields stop the stage. HTTP, transport,
authentication, storage or provider-limit failures stop immediately. A
`Retry-After` header or zero remaining rate limit also stops the stage. Response
compression is refused rather than assuming compressed bytes equal consumed
uncompressed data. Declared oversize bodies are refused before reading; unknown
length reads are bounded by the remaining byte allowance.

Each price view must contain exactly the 316 expected NYSE sessions, respecting
the January 9, 2025 closure, and must pass endpoint-specific OHLCV schema,
symbol, date, uniqueness, finite-value and geometry checks. A failed security
is isolated and its remaining views are skipped. A second distinct failed
security stops the stage. This failure policy is specified before acquisition.

For each completed three-view security, the existing offline validator checks
matching dates, common within-day OHLC factors, adjusted/full volume equality
and the split-factor relationship to nominal volume. Existing 0.3% common-price
factor and 0.00001-share transformed-volume diagnostic tolerances are retained.
Dividend factor changes remain diagnostics until action coverage is complete.
Partial-view symbols are labeled partial and never counted as complete triples.

Adjusted signal prices, nominal execution prices, split-based share-volume
normalization and corporate-action accounting retain their separate meanings.
Passing cross-view checks does not certify complete split/dividend accounting.
New provider vintages are stored separately from stage one; old values are
neither overwritten nor silently combined. Any cross-stage merge requires an
explicit vintage comparison and a separate downstream manifest.

## Offline verification

```sh
python -m unittest research/c1-rotation-execution-20261015/test_stage2_acquire.py
```

The tests use manufactured responses and fake private storage only. They cover
pre-request durable metadata, checkpoints before subsequent calls, budget
boundaries, pacing, first-security isolation, repeated validation failure,
cross-view volume disagreement, HTTP-200 provider errors, HTTP/rate/transport
failures, storage failures, duplicate manifests and recovery-receipt scope.
They make no FMP or other network calls.

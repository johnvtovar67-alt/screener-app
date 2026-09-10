# C1 first-observed input archive

The completed current research input is now captured before advancing the paper model. First captures are create-only private objects with observation time, source path, checkpoint signature, metadata and a SHA-256 digest. A changed session or metadata is saved under a separate revision digest and quarantined; it cannot overwrite the original or advance the model. Retries preserve the original timestamp. Concurrent creation re-reads the winning record. Stored payload digests are checked on read. Preview archives are isolated by commit.

This is an evidence-preservation layer, not a point-in-time dataset certification. It archives the existing provisional source exactly as supplied. Source qualification and all live/alpha eligibility remain false for the current feed. No old baseline is replaced, no historical dates are imported as new forward observations, and no model options or promotion gates change.

Capture occurs on snapshot refresh, including the existing scheduled refresh path. A missed collection remains a gap; the archive does not fabricate missed observations. A new valid point-in-time source and reconciled model lineage are still required before prospective validation can proceed. The historical three-sleeve simulator is not replaced by the aggregate recommendation engine.

Validation: full regression suite plus archive tests covering immutable originals, revision quarantine, idempotence, concurrent creation, corruption and preview separation. Preview verification is required before merge.

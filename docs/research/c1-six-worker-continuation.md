# Six-worker continuation

Supersedes the three-worker execution note. On September 10, 2026, coordinator session 87831 was deliberately interrupted after 21 S&P controls had been fsynced to the canonical JSONL. Six workers now evaluate only the missing seeds; the original Nasdaq job remains active. New coordinator session: 93499. The canonical output paths and completion criteria are unchanged.

The coordinator reconstructs contiguous missing ranges, splits the largest ranges to six, verifies a disjoint exhaustive partition of seeds 0–999 including the preserved controls, and limits each worker heap to 2,560 MB. CPU allowance is eight cores and memory limit is 20 GiB. No simulator changes were made. Previously verified shard seed parity still applies.

Six-worker start is not a completed test or a new evidence gate pass. Check actual complete records and all 1,000 unique seeds before reporting results. Worker checkpoints use timestamped parallel-prefix filenames. Initial repository checkpoints remain incomplete snapshots.

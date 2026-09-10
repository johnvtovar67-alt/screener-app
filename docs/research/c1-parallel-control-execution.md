# C1 control execution change

The S&P sequential worker was stopped after its completed, fsynced control prefix. The unfinished seed range is divided into three disjoint contiguous ranges by tools/c1-placebo-parallel.cjs. Nasdaq continues its original sequential audit. Production is unchanged.

Before switching, S&P seed 0 was independently rerun through shard mode and matched the original JSON record exactly: cumulative return, drawdown, and all three component returns. This is execution-equivalence checking, not additional statistical evidence. The duplicate verification seed is excluded from the 1,000 controls.

The coordinator appends each new unique control to the original c1-placebo-sp500-1000.jsonl output and refuses completion unless exactly seeds 0–999 are present. A static parallel-prefix copy preserves the restart checkpoint; per-worker shard files preserve intermediate results. Worker contract checks require the original data hash, options, weights, statistic and random-ranking method. A shard-complete marker is not an audit-complete marker.

Local coordinator exec session: 87831. Nasdaq session: 49990. Original S&P session 80941 was intentionally stopped and superseded. Local output root: /workspace/scratch/72d4008e26cf/. Initial GitHub checkpoints remain static and must not be treated as live or completed results.

No simulator, hypothesis, costs, acceptance gates, historical sample or p-value definition changed. Fixed-candidate historical controls do not establish family-wise search significance or new prospective evidence.

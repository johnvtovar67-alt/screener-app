# Top5 timeout investigation

Owner explicitly requests profiling and a targeted performance/robustness repair of GET /api/top5 on production ffdd79b. This diagnostic preview adds operational phase and sanitized provider timings only. Execution order, retries, data policy, classification, ranking, cash/account behavior and the compact Brokerage Cash UI remain identical. No secret values, provider response bodies or URLs are logged. Measurements and repair evidence will be added after the hosted baseline request. Release guard and build hooks are unchanged; only hashes of instrumented application files are updated.

The diagnostic-only preview reads the accepted production market book at its fixed path (read-only) because per-commit preview books are not prepared. No collection, seed, write, account or trading-authority bypass occurs. This data binding is excluded from the eventual repair; it measures the same input size/candidate queue as production.

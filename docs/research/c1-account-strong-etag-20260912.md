# Private account weak ETag repair

Production at 16:04:50 UTC confirmed successful held-stock momentum compilation followed by `REFRESH_CONFLICT_RELOADED`, `sameVersion:true`, `weakVersion:true`. The account read repeatedly returned the same weak validator. Passing a weak validator to a protected write cannot satisfy strong If-Match comparison; the conflict fallback returned the unchanged account, explaining repeated calculation and the unchanged portfolio message.

The account adapter now requests `accept-encoding: identity` together with the existing private origin read. This requests the uncompressed representation, avoiding a compression-weakened validator. The body and its exact returned ETag remain paired. No W/ prefix is stripped, no separately read metadata tag substitutes for the body version, and conditional writes remain unchanged. A successful save emits only the safe SAVED category.

The real SDK/mock-transport regression exercises the actual production adapter: a default weak-tag read fails the protected write; the identity read returns its strong tag and saves the enrichment with holdings and records intact; a stale tag still rejects. Synthetic account regression also passes. Full CI/build required before merge. Post-deployment private account save remains to be confirmed; deployment is not proof of that outcome.

No holdings, cash, fills, stops, original model records, trading rules, cron behavior or research tests are changed.

Protocol reference: https://www.rfc-editor.org/rfc/rfc9110.html#name-if-match

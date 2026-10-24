import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";

// Request-scoped operational timings. Never log provider URLs, keys or bodies.
const requests = new AsyncLocalStorage();
const elapsed = (start) => Math.round((performance.now() - start) * 10) / 10;
export const TOP5_REQUEST_BUDGET_MS = 55_000;
export class Top5DeadlineError extends Error {
  constructor() {
    super("Broad screen update timed out. Existing portfolio analysis remains available; new capital is paused until refresh succeeds.");
    this.name = "Top5DeadlineError";
    this.code = "TOP5_TIMEOUT";
  }
}
export function isTop5Deadline(error) { return error?.code === "TOP5_TIMEOUT"; }
export function assertTop5Active() {
  const context = requests.getStore();
  if (!context) return;
  if (performance.now() - context.start >= TOP5_REQUEST_BUDGET_MS && !context.controller.signal.aborted)
    context.controller.abort(new Top5DeadlineError());
  if (context.controller.signal.aborted) throw context.controller.signal.reason;
}
export function top5WithinBudget(task) {
  const context = requests.getStore();
  if (!context) return task();
  return new Promise((resolve, reject) => {
    assertTop5Active();
    const signal = context.controller.signal;
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve().then(task).then(value => {
      assertTop5Active();
      return value;
    }).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
export function top5Fetch(url, options = {}) {
  const context = requests.getStore();
  assertTop5Active();
  const signal = context
    ? options.signal ? AbortSignal.any([options.signal, context.controller.signal]) : context.controller.signal
    : options.signal;
  return top5Network(url, () => fetch(url, { ...options, ...(signal ? { signal } : {}) }));
}
function emit(context, event, values = {}) {
  if ((values.phase?.startsWith("network:") || ["timing.symbol", "fundamentals.symbol"].includes(values.phase)) && (event !== "end" || (values.ms < 1000 && values.status === "ok"))) return;
  console.info("TOP5_TIMING", JSON.stringify({ request: context.id, event, elapsedMs: elapsed(context.start), ...values }));
}
export function top5Count(name, count = 1) {
  const context = requests.getStore();
  if (context) context.counts[name] = (context.counts[name] || 0) + count;
}
export function top5Phase(name, task, metadata = {}) {
  const context = requests.getStore();
  if (!context) return task();
  const start = performance.now();
  emit(context, "start", { phase: name, ...metadata });
  const end = (status) => {
    const ms = elapsed(start);
    context.phases[name] = (context.phases[name] || 0) + ms;
    emit(context, "end", { phase: name, ms, status });
  };
  try {
    const result = task();
    if (result && typeof result.then === "function") return result.then((value) => { end("ok"); return value; }, (error) => { end("error"); throw error; });
    end("ok");
    return result;
  } catch (error) { end("error"); throw error; }
}
export function top5Network(url, task) {
  const context = requests.getStore();
  if (!context) return task();
  const parsed = new URL(url);
  parsed.searchParams.delete("apikey");
  const key = createHash("sha256").update(parsed.toString()).digest("hex").slice(0, 12);
  top5Count("providerCalls");
  top5Count(`provider:${parsed.pathname}`);
  if (context.network.has(key)) top5Count("duplicateProviderCalls");
  context.network.add(key);
  return top5Phase(`network:${parsed.pathname}`, task, { requestHash: key });
}
export function profileTop5Request(task, metadata = {}) {
  const context = { id: createHash("sha256").update(`${Date.now()}:${Math.random()}`).digest("hex").slice(0, 10), start: performance.now(), phases: {}, counts: {}, network: new Set(), controller: new AbortController() };
  return requests.run(context, async () => {
    const timer = setTimeout(() => context.controller.abort(new Top5DeadlineError()), TOP5_REQUEST_BUDGET_MS);
    emit(context, "request", metadata);
    try { return await task(); }
    finally { clearTimeout(timer); emit(context, "summary", { phases: context.phases, counts: context.counts }); }
  });
}

// Passive response-boundary diagnostics, not a C1 selection/account gate.
// Only already-computed feed metadata and aggregate counts may leave here.
export function top5ScreenOperationalStatus(payload) {
  const meta = payload?.meta;
  const base = { contract: 'c1-screen-operational-status-v1', boundary: 'BROAD_SCREEN_RESPONSE',
    executable: false, c1Selection: 'NOT_VERIFIED', accountOpening: 'NOT_VERIFIED', browserRendering: 'NOT_VERIFIED' };
  if (!Array.isArray(payload?.stocks) || payload.stocks.some(row => !row || typeof row !== 'object') ||
      !meta || typeof meta !== 'object' || Array.isArray(meta)) return { ...base, code: 'SCREEN_RESPONSE_INCOMPLETE' };
  const quote = ['live', 'stale-verified', 'incomplete', 'unavailable'].includes(meta.quoteFeedStatus) ? meta.quoteFeedStatus : 'UNKNOWN';
  const fundamentals = ['healthy', 'degraded', 'unavailable'].includes(meta.fundamentalFeedStatus) ? meta.fundamentalFeedStatus : 'UNKNOWN';
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
  const code = meta.clientSnapshotFallback || quote === 'stale-verified' ? 'SCREEN_SNAPSHOT_STALE' :
    quote !== 'live' || meta.quoteCoverageAdequate !== true ? 'SCREEN_QUOTE_VERIFICATION_INCOMPLETE' :
    fundamentals === 'unavailable' ? 'SCREEN_FUNDAMENTAL_FEED_UNAVAILABLE' :
    fundamentals === 'degraded' ? 'SCREEN_FUNDAMENTAL_COVERAGE_DEGRADED' :
    fundamentals === 'UNKNOWN' ? 'SCREEN_FUNDAMENTAL_STATUS_UNKNOWN' :
    payload.stocks.length === 0 ? 'SCREEN_EMPTY_WITH_HEALTHY_FEEDS' : 'SCREEN_FEEDS_HEALTHY';
  const date = meta.productionPolicy?.sourceSessionDate;
  return { ...base, code, quoteFeed: quote, fundamentalFeed: fundamentals,
    sourceSessionDate: typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    clientRowCount: payload.stocks.length, sourceRowCount: count(meta.returned),
    broadBuyCount: count(meta.buys), broadStrongBuyCount: count(meta.strongBuys) };
}
function screenOperationalLog(report, write) {
  const context = requests.getStore(), commit = process.env.VERCEL_GIT_COMMIT_SHA;
  write('C1_SCREEN_OPERATIONAL', JSON.stringify({ request: context?.id || null,
    commit: /^[a-f0-9]{7,40}$/.test(commit || '') ? commit : 'local', ...report }));
}
export function top5ObserveScreenResponse(payload, write = (...args) => console.info(...args)) {
  try { screenOperationalLog(top5ScreenOperationalStatus(payload), write); }
  catch { /* A diagnostic/logger failure cannot alter the response or retry. */ }
  return payload;
}
export function top5ObserveScreenFailure(error, write = (...args) => console.warn(...args)) {
  try { screenOperationalLog({ contract: 'c1-screen-operational-status-v1', boundary: 'BROAD_SCREEN_RESPONSE',
    code: isTop5Deadline(error) ? 'SCREEN_REQUEST_TIMEOUT' : 'SCREEN_REQUEST_FAILED',
    executable: false, c1Selection: 'NOT_VERIFIED', accountOpening: 'NOT_VERIFIED', browserRendering: 'NOT_VERIFIED' }, write); }
  catch { /* Never log the raw error, URL, request body or stack as a fallback. */ }
}

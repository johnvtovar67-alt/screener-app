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

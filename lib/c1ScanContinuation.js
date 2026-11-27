// Read-only bounded continuation. It retains one caller-owned publication
// frame, never repeats a financial POST, and never equates an unfinished scan
// with an empty eligible universe. A stalled or expired scan stays incomplete.
export async function continueC1ReadOnlyScan({initial, next, scanOf, isCurrent = () => true,
  now = () => Date.now(), budgetMs = 90000} = {}) {
  const deadline = now() + budgetMs;
  const expired = Symbol('scan deadline');
  let result = initial, lastIncomplete = initial;
  let identity = null, total = null, completed = -1, passes = 0;
  let retriedRegression = false, pendingDeadline, timer;
  try {
    while (isCurrent()) {
      const scan = scanOf(result);
      if (!scan) return identity === null ? result : lastIncomplete;
      const count = scan.completed ?? scan.scanned;
      if (typeof scan.complete !== 'boolean' || typeof scan.sourceIdentity !== 'string' || !scan.sourceIdentity ||
          !Number.isSafeInteger(scan.total) || scan.total < 0 ||
          !Number.isSafeInteger(count) || count < 0 || count > scan.total) return lastIncomplete;
      if (identity !== null && (scan.sourceIdentity !== identity || scan.total !== total))
        throw new Error('The accepted scan source changed during verification. Refresh the complete account review.');
      if (scan.complete) {
        if (count !== scan.total) throw new Error('The scan complete receipt has incomplete progress.');
        return result;
      }
      if (count === completed) return result;
      if (count < completed) {
        // One ordinary continuation can rejoin a worker with more evidence.
        // Keep the best single receipt and never combine workers' evidence.
        if (retriedRegression) return lastIncomplete;
        retriedRegression = true;
      } else {
        identity = scan.sourceIdentity;
        completed = count;
        total = scan.total;
        lastIncomplete = result;
      }
      if (now() >= deadline || !isCurrent()) return lastIncomplete;
      // Protect the whole wait, including headers and body on the final pass.
      // The transport may be shared with another frame and retains its own limit.
      pendingDeadline ||= new Promise(resolve => {
        timer = setTimeout(() => resolve(expired), Math.max(0, deadline - now()));
      });
      result = await Promise.race([next({scan, pass: ++passes, isCurrent, deadline}), pendingDeadline]);
      if (result === expired || now() >= deadline || !isCurrent()) return lastIncomplete;
    }
    return lastIncomplete;
  } finally {
    clearTimeout(timer);
  }
}

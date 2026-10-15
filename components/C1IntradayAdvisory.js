import {useEffect, useMemo, useRef, useState} from 'react';
import {buildC1IntradayAdvisory, c1IntradayTargets, c1IntradayRequestSymbols} from '../lib/c1IntradayAdvisory';
import {easternMarketClock, marketSessionCloseMinutes} from '../lib/marketSession';

const finite = value => typeof value === 'number' && Number.isFinite(value);
const percent = value => finite(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(2)}%` : 'Unavailable';
const dollars = value => finite(value) ? `$${value.toFixed(2)}` : 'Unavailable';
const responseLabel = status => ({live: 'Provider response', 'fresh-memory': 'Cached response',
  inflight: 'Shared provider response', 'stale-fallback': 'Cached fallback after a failed refresh',
  'stale-cooldown': 'Cached fallback during a retry cooldown'}[status] || 'Response status unavailable');
const timestamp = value => {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short',
  }).format(date) : 'Unavailable';
};

// A presentation boundary: this component has no account save, decision update,
// execution callback, storage access, or connection to the existing quote rows.
export function C1IntradayAdvisoryView({advisory, busy = false, error = '', onRefresh, disabled = false}) {
  const rows = advisory?.rows || [];
  const observed = Boolean(advisory?.receivedAt);
  return <section className="card intradayAdvisory" aria-label="Intraday advisory">
    <div className="advisoryHeader">
      <div><h2>Intraday intelligence</h2><p className="advisorySub">Provisional observations · manual refresh</p></div>
      <button type="button" onClick={onRefresh} disabled={disabled || busy || !rows.length}>
        {busy ? 'Checking observations…' : 'Refresh intraday observations'}
      </button>
    </div>
    <p className="advisoryHelp">Price context for recorded Swing holdings and the daily candidate queue. Official C1 rankings, decisions and stops remain authoritative.</p>
    {advisory?.sourceSessionDate && <p className="advisorySub">Daily reference: {advisory.sourceSessionDate}{advisory.baselineStatus !== 'current' ? ' · reference comparison unavailable or stale' : ''}.</p>}
    {observed && <p className="advisorySub">Quotes received {timestamp(advisory.receivedAt)} · {responseLabel(advisory.cacheStatus)} · {advisory.market?.isOpen ? 'Regular session open' : 'Regular session closed; observations are historical references'}.</p>}
    {error && <p role="alert" className="advisoryError">{error}</p>}
    {!rows.length ? <p role="status">Load the recorded C1 account analysis to identify Swing holdings and daily candidates.</p>
      : !observed ? <p role="status">{error ? 'Current observations are unavailable.' : `${rows.length} ${rows.length === 1 ? 'stock' : 'stocks'} ready to check. No intraday quotes are fetched until you refresh.`}</p>
      : <div className="advisoryGrid">{rows.map(row => <article key={row.symbol} className="advisoryRow">
        <div className="observationHeading"><h3>{row.symbol} <small>{row.role}</small></h3><span className={`freshness ${row.freshness}`} title={row.freshnessReason}>{row.freshness ? row.freshness[0].toUpperCase() + row.freshness.slice(1) : 'Unavailable'}</span></div>
        <p className="advisorySub">Provider observation: {row.providerAt ? <time dateTime={row.providerAt}>{timestamp(row.providerAt)}</time> : 'Unavailable'}</p>
        {row.freshness !== 'fresh' && <p className="advisorySub">{row.freshnessReason}</p>}
        <dl><div><dt>Observed price</dt><dd>{dollars(row.price)}</dd></div><div><dt>Overnight gap</dt><dd>{percent(row.gapPct)}</dd></div><div><dt>Since open</dt><dd>{percent(row.openToNowPct)}</dd></div><div><dt>From prior close</dt><dd>{percent(row.dayChangePct)}</dd></div></dl>
        <p className="dailyContext">Daily C1: {[row.dailyEvidenceLabel, Number.isSafeInteger(row.researchRank) ? `rank #${row.researchRank}` : null].filter(Boolean).join(' · ') || 'Evidence unavailable'} · {row.sourceSessionDate || 'Date unavailable'}.</p>
        <p className="observation"><b>{row.label}</b>{row.observation ? ` — ${row.observation}` : ''}</p>
        <p className="advisorySub">{(row.relative || []).map(relative => finite(relative.openToNowPp)
          ? `${relative.benchmark} ${relative.openToNowPp >= 0 ? '+' : ''}${relative.openToNowPp.toFixed(2)} pp since open`
          : `${relative.benchmark}: comparison unavailable`).join(' · ') || 'Benchmark comparisons unavailable'}</p>
        {(row.stops || []).length > 0 && <p className="stopContext">Recorded stops: {row.stops.map(stop => finite(stop.distancePct)
          ? `${dollars(stop.price)} (${Math.abs(stop.distancePct).toFixed(2)}% ${stop.distancePct >= 0 ? 'below' : 'above'} observed price)`
          : `${dollars(stop.price)} (distance unavailable)`).join(' · ')}.</p>}
        {row.limitations?.length > 0 && <details><summary>Observation limitations</summary><ul>{row.limitations.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></details>}
      </article>)}</div>}
    <p className="advisorySub">Strengthening or weakening describes movement since the open; a rebound can coexist with a negative overnight gap. The 1% movement and 3% stop-proximity bands are descriptive, not validated trading thresholds.</p>
    <p className="advisorySub">Freshness describes observation age; feed delay is not independently certified. No volume, VWAP or unvalidated bar indicators are used.</p>
    <style jsx>{`
      .intradayAdvisory{border:1px solid #cbd5e1}.advisoryHeader,.observationHeading{display:flex;justify-content:space-between;align-items:center;gap:14px}.advisoryHeader h2{margin:0}.advisorySub{color:#64748b;font-size:12px;line-height:1.5}.advisoryHelp{font-size:13px;line-height:1.5}.advisoryError{color:#b91c1c}.advisoryGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,330px),1fr));gap:12px}.advisoryRow{border:1px solid #e2e8f0;border-radius:10px;padding:14px;background:#fff}.observationHeading h3{margin:0;font-size:16px}.observationHeading small{display:block;font-size:11px;font-weight:400;color:#64748b;margin-top:3px}.freshness{border-radius:20px;padding:4px 9px;font-size:11px;font-weight:600;background:#e5e7eb;color:#374151}.freshness.fresh{background:#dbeafe;color:#1e40af}.freshness.delayed{background:#fef3c7;color:#92400e}.freshness.stale{background:#f1f5f9;color:#475569}.freshness.unavailable{background:#f1f5f9;color:#475569}dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:14px 0}dt{font-size:11px;color:#64748b}dd{font-size:14px;font-weight:600;margin:3px 0 0}.dailyContext,.stopContext,.observation{font-size:12px;line-height:1.5}.dailyContext{color:#475569}.observation{color:#0f172a}summary{font-size:11px;color:#64748b;cursor:pointer}li{font-size:11px;line-height:1.5;color:#64748b}button{white-space:normal}@media(max-width:600px){.advisoryHeader{align-items:flex-start;flex-direction:column}.advisoryHeader button{width:100%}.advisoryRow{padding:12px}}
    `}</style>
  </section>;
}

export default function C1IntradayAdvisory({decision, screenRows = [], portfolio, accountMatches = false, disabled = false}) {
  const targets = useMemo(() => c1IntradayTargets({decision, screenRows, portfolio, accountMatches}), [decision, screenRows, portfolio, accountMatches]);
  const requestSymbols = useMemo(() => {
    try { return c1IntradayRequestSymbols(targets); } catch { return []; }
  }, [targets]);
  const contextKey = JSON.stringify({decisionId: decision?.decisionId, revision: decision?.revision, sourceSessionDate: decision?.sourceSessionDate, current: decision?.current, accountMatches, targets});
  const latestContext = useRef(contextKey);
  latestContext.current = contextKey;
  const request = useRef(null);
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [clock, setClock] = useState(() => Date.now());
  const snapshot = saved?.contextKey === contextKey ? saved.snapshot : null;
  const advisory = useMemo(() => buildC1IntradayAdvisory({targets, quoteSnapshot: snapshot,
    sourceSessionDate: decision?.sourceSessionDate, baselineCurrent: decision?.current === true && accountMatches,
    now: new Date(clock)}), [targets, snapshot, decision?.sourceSessionDate, decision?.current, accountMatches, clock]);

  useEffect(() => {
    setSaved(null); setError(''); setBusy(false); setClock(Date.now());
    return () => { request.current?.controller.abort(); request.current = null; };
  }, [contextKey]);

  // Local aging only. No interval, provider polling, or automatic quote refresh.
  useEffect(() => {
    if (!snapshot) return;
    const now = Date.now(), deadlines = [];
    for (const row of advisory.rows) {
      // A relative observation expires when either input expires, even while
      // the stock itself remains fresh. These timers never fetch new quotes.
      for (const value of [row.providerAt, ...(row.relative || []).map(relative => relative.providerAt)]) {
        const at = Date.parse(value);
        if (Number.isFinite(at) && at <= now) deadlines.push(at + 120001, at + 900001);
      }
    }
    const market = easternMarketClock(new Date(now));
    if (advisory.market?.isOpen && market) deadlines.push(now + (marketSessionCloseMinutes(market.key) - market.minutes) * 60000 - market.second * 1000);
    const next = Math.min(...deadlines.filter(value => value > now));
    if (!Number.isFinite(next)) return;
    const timer = setTimeout(() => setClock(Date.now()), next - now + 1);
    return () => clearTimeout(timer);
  }, [snapshot, advisory, clock]);

  useEffect(() => {
    const age = () => setClock(Date.now());
    window.addEventListener('focus', age);
    document.addEventListener('visibilitychange', age);
    return () => { window.removeEventListener('focus', age); document.removeEventListener('visibilitychange', age); };
  }, []);

  async function refresh() {
    if (disabled || request.current || !requestSymbols.length) return;
    const controller = new AbortController(), pending = {controller, contextKey};
    request.current = pending;
    setBusy(true); setError('');
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch('/api/c1-intraday-advisory?' + new URLSearchParams({symbols: requestSymbols.join(',')}), {
        method: 'GET', cache: 'no-store', signal: controller.signal,
      });
      const data = await response.json();
      if (controller.signal.aborted || request.current !== pending || latestContext.current !== contextKey) return;
      if (!response.ok || data?.contract !== 'c1-intraday-quotes-v1' || !Array.isArray(data.quotes)) throw new Error('Unavailable');
      setSaved({contextKey, snapshot: data}); setClock(Date.now());
    } catch {
      if (request.current === pending && latestContext.current === contextKey) {
        setSaved(null); setClock(Date.now()); setError('Intraday quotes are unavailable. Please try again.');
      }
    } finally {
      clearTimeout(timer);
      if (request.current === pending && latestContext.current === contextKey) { request.current = null; setBusy(false); }
    }
  }
  const scopeError = targets.length && !requestSymbols.length ? 'The recorded symbol set exceeds the 32-symbol refresh limit. No partial comparisons were requested.' : '';
  return <C1IntradayAdvisoryView advisory={advisory} busy={busy} error={error || scopeError} onRefresh={refresh} disabled={disabled || !requestSymbols.length}/>;
}

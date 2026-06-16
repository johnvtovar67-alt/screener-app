// pages/index.js

import { useEffect, useMemo, useState } from "react";

const PORTFOLIO_KEY = "stock_screener_portfolio_v1";
const CASH_SYMBOLS = ["CASH", "SWVXX", "VMFXX", "SPAXX", "FDRXX", "MMF"];

const THEME_OPTIONS = [
  { key: "broad", name: "Broad Market" },
  { key: "btc", name: "BTC / Digital Assets" },
  { key: "ai_power", name: "AI Power & Energy" },
  { key: "cooling_water", name: "Cooling & Water" },
  { key: "nuclear", name: "Nuclear / Baseload" },
  { key: "quantum", name: "Quantum Computing" },
  { key: "ai_infra", name: "AI Infrastructure" },
];

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function percent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function number(value, digits = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function getSymbol(stock) {
  return String(stock?.symbol ?? stock?.ticker ?? "").toUpperCase();
}

function getName(stock) {
  return stock?.name ?? stock?.companyName ?? stock?.company ?? getSymbol(stock) ?? "—";
}

function isCashLikeSymbol(symbolOrStock) {
  const symbol = typeof symbolOrStock === "string" ? symbolOrStock.toUpperCase() : getSymbol(symbolOrStock);
  return CASH_SYMBOLS.includes(symbol);
}

function getRecommendation(stock) {
  return stock?.recommendation && typeof stock.recommendation === "object" ? stock.recommendation : {};
}

function normalizeActionLabel(value) {
  const label = String(value || "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
  if (["BUY", "BUY NOW", "BUY IMMEDIATELY", "STRONG BUY", "IMMEDIATE BUY"].includes(label)) return "Buy";
  if (["STARTER", "STARTER ONLY", "STARTER BUY", "SMALL STARTER", "BREAKOUT BUY", "BREAKOUT", "FRESH BREAKOUT", "BREAKOUT STARTER"].includes(label)) return "Starter";
  if (["WATCH", "WATCH FOR ENTRY", "WATCH CLOSELY", "NEAR MISS", "SETUP", "SETUP ONLY"].includes(label)) return "Watch";
  return "Avoid";
}

function nonOwnedAction(stock) {
  if (isCashLikeSymbol(stock)) return "Watch";
  const rec = getRecommendation(stock);
  return normalizeActionLabel(rec.displayLabel ?? rec.label ?? rec.recommendation ?? rec.tradeAction ?? stock?.displayLabel ?? stock?.label ?? stock?.recommendation ?? stock?.tradeAction ?? stock?.action);
}

function getScore(stock) {
  const n = Number(getRecommendation(stock)?.score ?? stock?.score ?? stock?.compositeScore ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
}

function getTrigger(stock) {
  const n = Number(getRecommendation(stock)?.triggerScore ?? stock?.triggerScore ?? stock?.technicalSnapshot?.triggerScore ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
}

function getMomentumScore(stock) {
  const n = Number(getRecommendation(stock)?.momentumScore ?? stock?.momentumScore ?? stock?.technicalSnapshot?.momentumScore ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
}

function getPrice(stock) {
  return Number(stock?.price ?? stock?.currentPrice ?? stock?.quote?.price ?? stock?.lastPrice);
}

function getChangePct(stock) {
  return Number(stock?.dayChangePct ?? stock?.changesPercentage ?? stock?.changePercent ?? stock?.percentChange);
}

function actionClass(action) {
  if (action === "Buy") return "green";
  if (action === "Starter") return "orange";
  if (action === "Watch") return "yellow";
  return "red";
}

function getReason(stock) {
  const rec = getRecommendation(stock);
  return rec.reason || rec.dominantReason || stock?.reason || stock?.dominantReason || "—";
}

function getEntryNote(stock) {
  const rec = getRecommendation(stock);
  return rec.entryNote || stock?.entryNote || "—";
}

function calculatePosition(position, livePrice) {
  const shares = Number(position?.shares ?? 0);
  const avgCost = Number(position?.avgCost ?? 0);
  const price = Number(livePrice ?? 0);
  const value = shares * price;
  const costBasis = shares * avgCost;
  const gainLoss = value - costBasis;
  const gainLossPct = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;
  return { shares, avgCost, price, value, costBasis, gainLoss, gainLossPct };
}

function rankStocks(a, b) {
  const rank = { Buy: 3, Starter: 2, Watch: 1, Avoid: 0 };
  const diff = (rank[nonOwnedAction(b)] ?? 0) - (rank[nonOwnedAction(a)] ?? 0);
  if (diff) return diff;
  const triggerDiff = getTrigger(b) - getTrigger(a);
  if (triggerDiff) return triggerDiff;
  return getScore(b) - getScore(a);
}

function loadPortfolio() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PORTFOLIO_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePortfolio(positions) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(positions));
}

export default function Home() {
  const [theme, setTheme] = useState("broad");
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [singleSymbol, setSingleSymbol] = useState("");
  const [singleStock, setSingleStock] = useState(null);
  const [portfolio, setPortfolio] = useState([]);
  const [newPosition, setNewPosition] = useState({ symbol: "", shares: "", avgCost: "" });

  useEffect(() => {
    setPortfolio(loadPortfolio());
  }, []);

  useEffect(() => {
    savePortfolio(portfolio);
  }, [portfolio]);

  async function runBroadScreen(nextTheme = theme) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/top5?theme=${encodeURIComponent(nextTheme)}&limit=50`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || data?.error || "Failed to run screener.");
      const rows = data?.stocks || data?.top || data?.results || [];
      setStocks(Array.isArray(rows) ? rows.sort(rankStocks) : []);
    } catch (err) {
      setError(err.message || "Failed to run screener.");
      setStocks([]);
    } finally {
      setLoading(false);
    }
  }

  async function runSingleSymbol(symbol = singleSymbol) {
    const clean = String(symbol || "").toUpperCase().trim();
    if (!clean) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api?symbol=${encodeURIComponent(clean)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || data?.error || `Failed to analyze ${clean}.`);
      setSingleStock(data.stock);
    } catch (err) {
      setError(err.message || `Failed to analyze ${clean}.`);
      setSingleStock(null);
    } finally {
      setLoading(false);
    }
  }

  function addPosition() {
    const symbol = String(newPosition.symbol || "").toUpperCase().trim();
    const shares = Number(newPosition.shares);
    const avgCost = Number(newPosition.avgCost);
    if (!symbol || !Number.isFinite(shares) || shares <= 0 || !Number.isFinite(avgCost) || avgCost < 0) return;
    setPortfolio((prev) => [...prev.filter((p) => String(p.symbol).toUpperCase() !== symbol), { symbol, shares, avgCost }]);
    setNewPosition({ symbol: "", shares: "", avgCost: "" });
  }

  function removePosition(symbol) {
    setPortfolio((prev) => prev.filter((p) => String(p.symbol).toUpperCase() !== String(symbol).toUpperCase()));
  }

  const portfolioRows = useMemo(() => {
    return portfolio.map((position) => {
      const live = stocks.find((stock) => getSymbol(stock) === String(position.symbol).toUpperCase()) || (getSymbol(singleStock) === String(position.symbol).toUpperCase() ? singleStock : null);
      const calc = calculatePosition(position, live ? getPrice(live) : position.avgCost);
      return { ...position, ...calc, live, action: live ? nonOwnedAction(live) : "Watch" };
    });
  }, [portfolio, stocks, singleStock]);

  const actionable = stocks.filter((stock) => ["Buy", "Starter"].includes(nonOwnedAction(stock)));
  const watch = stocks.filter((stock) => nonOwnedAction(stock) === "Watch");

  return (
    <main className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">Clean shared model</p>
          <h1>Stock Screener</h1>
          <p className="subtle">Broad screen and single-symbol checks now use the same four-action decision model: Buy, Starter, Watch, Avoid.</p>
        </div>
        <button className="primary" onClick={() => runBroadScreen()} disabled={loading}>{loading ? "Running…" : "Run Screen"}</button>
      </section>

      <section className="controls card">
        <label>
          Theme
          <select value={theme} onChange={(e) => { setTheme(e.target.value); runBroadScreen(e.target.value); }}>
            {THEME_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.name}</option>)}
          </select>
        </label>
        <label>
          Single symbol
          <div className="row">
            <input value={singleSymbol} onChange={(e) => setSingleSymbol(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") runSingleSymbol(); }} placeholder="MRNA, ANET, MSTR…" />
            <button onClick={() => runSingleSymbol()} disabled={loading}>Check</button>
          </div>
        </label>
      </section>

      {error ? <div className="error">{error}</div> : null}

      {singleStock ? <StockCard stock={singleStock} title="Single-symbol result" /> : null}

      <section className="grid2">
        <div className="card">
          <h2>Actionable</h2>
          <StockTable rows={actionable} empty="No Buy or Starter names from this run." />
        </div>
        <div className="card">
          <h2>Watch List</h2>
          <StockTable rows={watch} empty="No Watch names from this run." />
        </div>
      </section>

      <section className="card">
        <h2>All Results</h2>
        <StockTable rows={stocks} empty="Run a screen to load results." />
      </section>

      <section className="card">
        <h2>Portfolio Context</h2>
        <div className="portfolioAdd">
          <input placeholder="Symbol" value={newPosition.symbol} onChange={(e) => setNewPosition((p) => ({ ...p, symbol: e.target.value }))} />
          <input placeholder="Shares" value={newPosition.shares} onChange={(e) => setNewPosition((p) => ({ ...p, shares: e.target.value }))} />
          <input placeholder="Avg cost" value={newPosition.avgCost} onChange={(e) => setNewPosition((p) => ({ ...p, avgCost: e.target.value }))} />
          <button onClick={addPosition}>Add</button>
        </div>
        <table>
          <thead><tr><th>Symbol</th><th>Shares</th><th>Avg Cost</th><th>Price</th><th>Value</th><th>Gain/Loss</th><th>Model</th><th></th></tr></thead>
          <tbody>
            {portfolioRows.length ? portfolioRows.map((row) => (
              <tr key={row.symbol}>
                <td>{row.symbol}</td>
                <td>{number(row.shares, 2)}</td>
                <td>{money(row.avgCost)}</td>
                <td>{money(row.price)}</td>
                <td>{money(row.value)}</td>
                <td className={row.gainLoss >= 0 ? "positive" : "negative"}>{money(row.gainLoss)} ({percent(row.gainLossPct)})</td>
                <td><span className={`pill ${actionClass(row.action)}`}>{row.action}</span></td>
                <td><button className="ghost" onClick={() => removePosition(row.symbol)}>Remove</button></td>
              </tr>
            )) : <tr><td colSpan="8" className="empty">No positions saved.</td></tr>}
          </tbody>
        </table>
      </section>

      <style jsx>{`
        .page { max-width: 1280px; margin: 0 auto; padding: 28px; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #111827; }
        .hero { display: flex; justify-content: space-between; gap: 18px; align-items: center; margin-bottom: 18px; }
        .eyebrow { text-transform: uppercase; letter-spacing: .08em; font-size: 12px; color: #6b7280; margin: 0 0 6px; }
        h1 { font-size: 36px; margin: 0; }
        h2 { margin: 0 0 14px; font-size: 18px; }
        .subtle { color: #6b7280; margin: 8px 0 0; max-width: 760px; }
        .card { background: white; border: 1px solid #e5e7eb; border-radius: 16px; padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
        .controls { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        label { display: grid; gap: 6px; font-weight: 700; font-size: 13px; }
        input, select { width: 100%; border: 1px solid #d1d5db; border-radius: 10px; padding: 10px 12px; font-size: 14px; }
        button { border: 0; border-radius: 10px; padding: 10px 14px; font-weight: 800; cursor: pointer; background: #111827; color: white; }
        button:disabled { opacity: .55; cursor: not-allowed; }
        .primary { padding: 12px 18px; }
        .ghost { background: #f3f4f6; color: #111827; }
        .row { display: flex; gap: 8px; }
        .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { text-align: left; color: #6b7280; font-size: 12px; border-bottom: 1px solid #e5e7eb; padding: 9px 8px; }
        td { border-bottom: 1px solid #f3f4f6; padding: 10px 8px; vertical-align: top; }
        .pill { display: inline-flex; border-radius: 999px; padding: 4px 9px; font-size: 12px; font-weight: 800; }
        .green { background: #dcfce7; color: #166534; }
        .orange { background: #ffedd5; color: #9a3412; }
        .yellow { background: #fef9c3; color: #854d0e; }
        .red { background: #fee2e2; color: #991b1b; }
        .positive { color: #166534; }
        .negative { color: #991b1b; }
        .error { margin: 12px 0; border: 1px solid #fecaca; color: #991b1b; background: #fef2f2; border-radius: 12px; padding: 12px; }
        .empty { color: #6b7280; text-align: center; padding: 18px; }
        .portfolioAdd { display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 8px; margin-bottom: 14px; }
        .reason { color: #374151; max-width: 360px; }
        @media (max-width: 900px) { .hero, .controls, .grid2, .portfolioAdd { grid-template-columns: 1fr; display: grid; } .row { flex-direction: column; } }
      `}</style>
    </main>
  );
}

function StockCard({ stock, title }) {
  const action = nonOwnedAction(stock);
  return (
    <section className="card">
      <h2>{title}</h2>
      <table>
        <tbody>
          <tr><th>Symbol</th><td>{getSymbol(stock)} — {getName(stock)}</td></tr>
          <tr><th>Action</th><td><span className={`pill ${actionClass(action)}`}>{action}</span></td></tr>
          <tr><th>Price</th><td>{money(getPrice(stock))} ({percent(getChangePct(stock))})</td></tr>
          <tr><th>Score</th><td>{getScore(stock)} / Trigger {getTrigger(stock)} / Momentum {getMomentumScore(stock)}</td></tr>
          <tr><th>Why</th><td>{getReason(stock)}</td></tr>
          <tr><th>Entry</th><td>{getEntryNote(stock)}</td></tr>
        </tbody>
      </table>
    </section>
  );
}

function StockTable({ rows, empty }) {
  if (!rows.length) return <div className="empty">{empty}</div>;
  return (
    <table>
      <thead>
        <tr><th>Symbol</th><th>Action</th><th>Price</th><th>Score</th><th>Trigger</th><th>Momentum</th><th>Why</th><th>Entry</th></tr>
      </thead>
      <tbody>
        {rows.map((stock) => {
          const action = nonOwnedAction(stock);
          return (
            <tr key={getSymbol(stock)}>
              <td><strong>{getSymbol(stock)}</strong><br /><span className="subtle">{getName(stock)}</span></td>
              <td><span className={`pill ${actionClass(action)}`}>{action}</span></td>
              <td>{money(getPrice(stock))}<br /><span className={getChangePct(stock) >= 0 ? "positive" : "negative"}>{percent(getChangePct(stock))}</span></td>
              <td>{getScore(stock)}</td>
              <td>{getTrigger(stock)}</td>
              <td>{getMomentumScore(stock)}</td>
              <td className="reason">{getReason(stock)}</td>
              <td className="reason">{getEntryNote(stock)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

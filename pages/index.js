// pages/index.js

import { useEffect, useMemo, useState } from "react";
import { formatPct, formatPrice } from "../lib/formatters";

export default function HomePage() {

  // ===== EXISTING STATE =====
  const [rows, setRows] = useState([]);
  const [lookupSymbols, setLookupSymbols] = useState([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [isLoadingTop5, setIsLoadingTop5] = useState(true);
  const [isLookingUp, setIsLookingUp] = useState(false);

  // ===== PORTFOLIO =====
  const [portfolioSymbol, setPortfolioSymbol] = useState("");
  const [portfolioQty, setPortfolioQty] = useState("");
  const [portfolioCost, setPortfolioCost] = useState("");

  const [portfolioPositions, setPortfolioPositions] = useState([
    { symbol: "MSTR", qty: 100, cost: 140.39 },
    { symbol: "MARA", qty: 400, cost: 11.94 },
    { symbol: "BBAI", qty: 260, cost: 3.88 },
    { symbol: "SOUN", qty: 325, cost: 7.95 },
    { symbol: "HLIT", qty: 100, cost: 10.38 },
    { symbol: "BCRX", qty: 125, cost: 8.95 },
  ]);

  const [portfolioRows, setPortfolioRows] = useState([]);
  const [isAnalyzingPortfolio, setIsAnalyzingPortfolio] = useState(false);

  // ===== LOAD SCREENER =====
  async function loadTop5() {
    try {
      const res = await fetch("/api/top5");
      const data = await res.json();
      setRows(data.stocks || []);
    } catch (e) {
      setError("Failed to load");
    } finally {
      setIsLoadingTop5(false);
    }
  }

  // ===== LOOKUP =====
  async function handleLookup() {
    const symbol = query.trim().toUpperCase();
    if (!symbol) return;

    setIsLookingUp(true);

    try {
      const res = await fetch(`/api/lookup?symbol=${symbol}`);
      const data = await res.json();

      setRows((prev) => [data, ...prev.filter((r) => r.symbol !== data.symbol)]);
      setQuery("");
    } catch (e) {
      setError("Lookup failed");
    } finally {
      setIsLookingUp(false);
    }
  }

  // ===== ADD POSITION =====
  function addPortfolioPosition() {
    const symbol = portfolioSymbol.toUpperCase();
    const qty = Number(portfolioQty);
    const cost = Number(portfolioCost);

    if (!symbol || !qty) return;

    setPortfolioPositions((prev) => [
      ...prev.filter((p) => p.symbol !== symbol),
      { symbol, qty, cost }
    ]);

    setPortfolioSymbol("");
    setPortfolioQty("");
    setPortfolioCost("");
  }

  function removePortfolioPosition(symbol) {
    setPortfolioPositions((prev) =>
      prev.filter((p) => p.symbol !== symbol)
    );
  }

  // ===== 🧠 TRADER LOGIC (CORE UPGRADE) =====
  function getTraderAction(label, gainPct) {

    // STRONG BUY
    if (label === "STRONG BUY") {
      if (gainPct > 15) return "TRIM WINNER";
      return "ADD";
    }

    // BUY
    if (label === "BUY") {
      if (gainPct > 10) return "TRIM WINNER";
      return "ADD SMALL";
    }

    // WATCH
    if (label === "WATCH") {
      if (gainPct < -8) return "CUT LOSER";
      if (gainPct > 10) return "TRIM WINNER";
      return "HOLD";
    }

    // AVOID
    if (label === "AVOID") {
      if (gainPct < -5) return "CUT LOSER";
      if (gainPct > 8) return "TRIM WINNER";
      return "AVOID NEW";
    }

    return "HOLD";
  }

  function getWhy(label, gainPct) {
    if (label === "STRONG BUY") return "Momentum + setup aligned.";
    if (label === "BUY") return "Setup improving.";
    if (label === "WATCH") return "Neutral setup, wait for confirmation.";
    if (label === "AVOID") return "Weak setup / poor risk-reward.";
    return "";
  }

  // ===== ANALYZE PORTFOLIO =====
  async function analyzePortfolio() {

    setIsAnalyzingPortfolio(true);

    try {
      const results = [];

      for (const p of portfolioPositions) {

        const res = await fetch(`/api/lookup?symbol=${p.symbol}`);
        const data = await res.json();

        const price = data.price || 0;
        const value = price * p.qty;
        const costBasis = p.cost * p.qty;

        const gain = value - costBasis;
        const gainPct = costBasis ? (gain / costBasis) * 100 : 0;

        const label = data.recommendation?.label;

        results.push({
          ...data,
          qty: p.qty,
          value,
          gain,
          gainPct,
          action: getTraderAction(label, gainPct),
          why: getWhy(label, gainPct)
        });
      }

      setPortfolioRows(results);

    } catch (e) {
      setError("Portfolio failed");
    }

    setIsAnalyzingPortfolio(false);
  }

  useEffect(() => {
    loadTop5();
  }, []);

  // ===== UI =====
  return (
    <div style={{ padding: 20 }}>

      <h2>Portfolio</h2>

      <div>
        <input placeholder="Symbol" value={portfolioSymbol} onChange={e => setPortfolioSymbol(e.target.value)} />
        <input placeholder="Shares" value={portfolioQty} onChange={e => setPortfolioQty(e.target.value)} />
        <input placeholder="Cost" value={portfolioCost} onChange={e => setPortfolioCost(e.target.value)} />

        <button onClick={addPortfolioPosition}>Add</button>
        <button onClick={analyzePortfolio}>Analyze Portfolio</button>
      </div>

      <div>
        {portfolioPositions.map(p => (
          <div key={p.symbol}>
            {p.symbol} {p.qty} @ {p.cost}
            <button onClick={() => removePortfolioPosition(p.symbol)}>x</button>
          </div>
        ))}
      </div>

      <table>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Price</th>
            <th>Gain %</th>
            <th>Signal</th>
            <th>Action</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          {portfolioRows.map(r => (
            <tr key={r.symbol}>
              <td>{r.symbol}</td>
              <td>{formatPrice(r.price)}</td>
              <td>{r.gainPct.toFixed(1)}%</td>
              <td>{r.recommendation?.label}</td>
              <td><b>{r.action}</b></td>
              <td>{r.why}</td>
            </tr>
          ))}
        </tbody>
      </table>

    </div>
  );
}

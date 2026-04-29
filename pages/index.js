// pages/index.js

import { useEffect, useMemo, useState } from "react";
import { formatPct, formatPrice } from "../lib/formatters";

export default function HomePage() {
  const [rows, setRows] = useState([]);
  const [lookupSymbols, setLookupSymbols] = useState([]);
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [isLoadingTop5, setIsLoadingTop5] = useState(true);
  const [isLookingUp, setIsLookingUp] = useState(false);

  // 🔥 NEW: Portfolio
  const [portfolioInput, setPortfolioInput] = useState("");
  const [portfolio, setPortfolio] = useState([]);

  async function loadTop5() {
    setIsLoadingTop5(true);
    setError("");

    try {
      const response = await fetch("/api/top5");
      const data = await response.json();
      setRows(data.stocks || []);
    } catch (err) {
      setError("Failed to load screener");
    } finally {
      setIsLoadingTop5(false);
    }
  }

  async function handleLookup() {
    const symbol = query.trim().toUpperCase();
    if (!symbol) return;

    setIsLookingUp(true);

    try {
      const response = await fetch(`/api/lookup?symbol=${symbol}`);
      const data = await response.json();

      setRows((prev) => [data, ...prev]);
      setQuery("");
    } catch {
      setError("Lookup failed");
    } finally {
      setIsLookingUp(false);
    }
  }

  // 🔥 NEW: Portfolio loader
  async function loadPortfolio() {
    if (!portfolioInput) return;

    const items = portfolioInput.split(",");

    const results = [];

    for (const item of items) {
      const [symbolRaw, qtyRaw] = item.split(":");
      const symbol = symbolRaw?.trim().toUpperCase();
      const quantity = Number(qtyRaw || 0);

      if (!symbol) continue;

      try {
        const res = await fetch(`/api/lookup?symbol=${symbol}`);
        const data = await res.json();

        const value = (data.price || 0) * quantity;

        // 🔥 Action logic (simple + powerful)
        let action = "HOLD";

        if (data.recommendation?.label === "STRONG BUY") action = "ADD";
        else if (data.recommendation?.label === "BUY") action = "HOLD";
        else if (data.recommendation?.label === "WATCH") action = "TRIM";
        else if (data.recommendation?.label === "AVOID") action = "EXIT";

        results.push({
          ...data,
          quantity,
          value,
          action,
        });
      } catch {}
    }

    setPortfolio(results);
  }

  useEffect(() => {
    loadTop5();
  }, []);

  return (
    <main style={{ maxWidth: 1200, margin: "40px auto", fontFamily: "Arial" }}>
      <h1>🧠 Asymmetry Screener</h1>

      {/* 🔥 PORTFOLIO SECTION */}
      <div style={{ marginBottom: 30 }}>
        <h2>My Portfolio</h2>

        <input
          value={portfolioInput}
          onChange={(e) => setPortfolioInput(e.target.value)}
          placeholder="MSTR:100,MARA:400,BBAI:260"
          style={{ padding: 10, width: 400 }}
        />

        <button onClick={loadPortfolio} style={{ marginLeft: 10 }}>
          Analyze Portfolio
        </button>

        {portfolio.length > 0 && (
          <div style={{ marginTop: 20 }}>
            {portfolio.map((p) => (
              <div key={p.symbol} style={{ padding: 10, borderBottom: "1px solid #ddd" }}>
                <b>{p.symbol}</b> — {p.quantity} shares  
                <br />
                Price: {formatPrice(p.price)}  
                <br />
                Value: ${p.value.toFixed(0)}  
                <br />
                Signal: {p.recommendation?.label}  
                <br />
                <b>Action: {p.action}</b>  
                <br />
                {p.recommendation?.reason}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* EXISTING SCREENER */}
      <div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Lookup ticker"
        />

        <button onClick={handleLookup}>
          {isLookingUp ? "Loading..." : "Lookup"}
        </button>

        <button onClick={loadTop5}>
          {isLoadingTop5 ? "Loading..." : "Reload"}
        </button>
      </div>

      {rows.map((row) => (
        <div key={row.symbol} style={{ padding: 10 }}>
          {row.symbol} — {row.recommendation?.label}
        </div>
      ))}
    </main>
  );
}

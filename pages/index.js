// pages/index.js

import { useEffect, useMemo, useState } from "react";
import { formatPct, formatPrice } from "../lib/formatters";

export default function HomePage() {
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [under25Only, setUnder25Only] = useState(true);

  async function load() {
    setIsLoading(true);
    try {
      const res = await fetch("/api/top5");
      const data = await res.json();
      setRows(data.stocks || []);
    } catch (e) {
      setError("Failed to load");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleLookup() {
    if (!query) return;
    const res = await fetch(`/api/lookup?symbol=${query}`);
    const data = await res.json();
    setRows((prev) => [data, ...prev]);
    setQuery("");
  }

  // FILTER
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (under25Only && r.price >= 25) return false;
      return true;
    });
  }, [rows, under25Only]);

  // SORT BY TRUE SCORE
  const sorted = useMemo(() => {
    return [...filtered]
      .sort((a, b) => (b.recommendation?.score || 0) - (a.recommendation?.score || 0));
  }, [filtered]);

  // 🔥 TOP 10 OF THE DAY
  const top10 = sorted.slice(0, 10);

  return (
    <main style={{ maxWidth: 1200, margin: "40px auto", padding: 20 }}>
      <h1 style={{ fontSize: 32, fontWeight: 700 }}>🧠 Asymmetry Screener</h1>

      <div style={{ margin: "10px 0 20px", color: "#666" }}>
        High-conviction asymmetric setups
      </div>

      {/* INPUT */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Lookup ticker"
          style={{ padding: 10, flex: 1 }}
        />
        <button onClick={handleLookup}>Add</button>
        <button onClick={load}>Reload</button>
      </div>

      {/* FILTER */}
      <button onClick={() => setUnder25Only(!under25Only)}>
        Under $25: {under25Only ? "ON" : "OFF"}
      </button>

      {/* 🔥 TOP 10 STRIP */}
      <div style={{ marginTop: 30, marginBottom: 30 }}>
        <h2 style={{ fontSize: 20, marginBottom: 10 }}>🔥 Top 10 of the Day</h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
          {top10.map((r) => (
            <div
              key={r.symbol}
              style={{
                border: "1px solid #ddd",
                padding: 10,
                borderRadius: 10,
                background:
                  r.recommendation?.label === "STRONG BUY"
                    ? "#dcfce7"
                    : r.recommendation?.label === "BUY"
                    ? "#e0f2fe"
                    : "#fff",
              }}
            >
              <div style={{ fontWeight: 700 }}>{r.symbol}</div>
              <div>{formatPrice(r.price)}</div>
              <div style={{ fontSize: 12 }}>
                {r.recommendation?.label}
              </div>
              <div style={{ fontSize: 12, color: "#555" }}>
                Score: {r.recommendation?.score}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* TABLE */}
      <table width="100%" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#f5f5f5" }}>
            <th>Symbol</th>
            <th>Price</th>
            <th>Chg</th>
            <th>Signal</th>
            <th>Why</th>
          </tr>
        </thead>

        <tbody>
          {sorted.slice(0, 25).map((r) => (
            <tr key={r.symbol}>
              <td>{r.symbol}</td>
              <td>{formatPrice(r.price)}</td>
              <td>{formatPct(r.dayChangePct)}</td>
              <td>{r.recommendation?.label}</td>
              <td style={{ fontSize: 12 }}>{r.recommendation?.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

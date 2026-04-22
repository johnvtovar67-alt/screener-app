import { useEffect, useMemo, useState } from "react";
import {
  driverCardStyle,
  formatPct,
  formatPrice,
  scorePillStyle,
} from "../lib/formatters";

import {
  calcQualityScore,
  calcAsymmetryScore,
  getStage,
} from "../lib/scoring";

export default function HomePage() {
  const [rows, setRows] = useState([]);
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [isLoadingTop5, setIsLoadingTop5] = useState(true);
  const [isLookingUp, setIsLookingUp] = useState(false);

  const [under25Only, setUnder25Only] = useState(false);
  const [profitableOnly, setProfitableOnly] = useState(false);
  const [minScore, setMinScore] = useState(60);

  const [meta, setMeta] = useState({
    totalUniverse: 0,
    afterInstitutionalFilter: 0,
    afterRankingThreshold: 0,
  });

  async function loadTop5() {
    setIsLoadingTop5(true);
    setError("");

    try {
      const response = await fetch("/api/top5");
      const data = await response.json();

      if (!response.ok) throw new Error(data.error);

      setRows(data.stocks || []);
      setMeta(data.meta || {});

      if ((data.stocks || []).length) {
        setSelectedSymbol((prev) => prev || data.stocks[0].symbol);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoadingTop5(false);
    }
  }

  async function handleLookup() {
    const symbol = query.trim().toUpperCase();
    if (!symbol) return;

    setIsLookingUp(true);
    setError("");

    try {
      const response = await fetch(`/api/lookup?symbol=${symbol}`);
      const data = await response.json();

      if (!response.ok) throw new Error(data.error);

      setRows((prev) => {
        const exists = prev.some((r) => r.symbol === data.symbol);
        if (exists) {
          return prev.map((r) =>
            r.symbol === data.symbol ? data : r
          );
        }
        return [data, ...prev];
      });

      setSelectedSymbol(data.symbol);
      setQuery("");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLookingUp(false);
    }
  }

  useEffect(() => {
    loadTop5();
  }, []);

  /* =========================
     🔥 NEW SCORING LAYER
  ========================== */

  const enrichedRows = useMemo(() => {
    return rows.map((row) => {
      const qualityScore = calcQualityScore(row);
      const asymmetryScore = calcAsymmetryScore(row);
      const stage = getStage(row);

      return {
        ...row,
        qualityScore,
        asymmetryScore,
        stage,
      };
    });
  }, [rows]);

  /* =========================
     FILTERS
  ========================== */

  const filteredRows = useMemo(() => {
    return enrichedRows.filter((row) => {
      if (under25Only && (row.price ?? 0) >= 25) return false;
      if (profitableOnly && (row.operatingMarginPct ?? 0) <= 0) return false;

      if ((row.qualityScore ?? 0) < 45) return false;
      if ((row.asymmetryScore ?? 0) < minScore) return false;

      if (row.stage === "Broken") return false;

      return true;
    });
  }, [enrichedRows, under25Only, profitableOnly, minScore]);

  /* =========================
     🔥 NEW SORT (ASYMMETRY)
  ========================== */

  const sortedRows = useMemo(() => {
    return [...filteredRows]
      .sort((a, b) => (b.asymmetryScore ?? 0) - (a.asymmetryScore ?? 0))
      .slice(0, 5);
  }, [filteredRows]);

  const selectedRow =
    enrichedRows.find((r) => r.symbol === selectedSymbol) ||
    sortedRows[0];

  function actionPillStyle(color) {
    if (color === "green")
      return { background: "#dcfce7", color: "#166534" };
    if (color === "red")
      return { background: "#fee2e2", color: "#b91c1c" };
    return { background: "#fef3c7", color: "#92400e" };
  }

  return (
    <main style={{ maxWidth: 1200, margin: "40px auto" }}>
      <h1>🧠 Asymmetry Screener</h1>

      <div style={{ marginBottom: 20 }}>
        Under-the-radar + high upside setups
      </div>

      {/* SEARCH */}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Ticker..."
      />

      <button onClick={handleLookup}>
        {isLookingUp ? "..." : "Lookup"}
      </button>

      <button onClick={loadTop5}>Reload</button>

      {/* FILTERS */}
      <div style={{ marginTop: 10 }}>
        <button onClick={() => setUnder25Only((p) => !p)}>
          Under $25
        </button>

        <button onClick={() => setProfitableOnly((p) => !p)}>
          Profitable
        </button>

        Min Score:
        <select
          value={minScore}
          onChange={(e) => setMinScore(Number(e.target.value))}
        >
          <option value={60}>60+</option>
          <option value={70}>70+</option>
          <option value={80}>80+</option>
        </select>
      </div>

      {/* TABLE */}
      <table>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Price</th>
            <th>Asymmetry</th>
            <th>Quality</th>
            <th>Stage</th>
            <th>Action</th>
          </tr>
        </thead>

        <tbody>
          {sortedRows.map((row) => (
            <tr key={row.symbol}>
              <td>{row.symbol}</td>
              <td>{formatPrice(row.price)}</td>
              <td>{row.asymmetryScore}</td>
              <td>{row.qualityScore}</td>
              <td>{row.stage}</td>
              <td>
                <span style={actionPillStyle(row.actionColor)}>
                  {row.actionLabel}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

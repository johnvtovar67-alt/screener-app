// pages/index.js

import { useEffect, useMemo, useState } from "react";
import { formatPct, formatPrice } from "../lib/formatters";
import {
  calcQualityScore,
  calcAsymmetryScore,
  calcTriggerScore,
  getStage,
  buildTechnicalSnapshot,
  buildFundamentalSnapshot,
} from "../lib/scoring";

export default function HomePage() {
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [under25Only, setUnder25Only] = useState(true);
  const [meta, setMeta] = useState({ totalUniverse: 0 });

  async function loadUniverseAndQuotes() {
    setError("");

    try {
      // 1. get universe from your working API
      const res = await fetch("/api/universe");
      const data = await res.json();

      const symbols = data.universe.map((x) =>
        x.symbol.replace(".", "-")
      );

      // 2. fetch quotes DIRECTLY from browser (not Vercel)
      const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols
        .slice(0, 200)
        .join(",")}`;

      const quoteRes = await fetch(url);
      const quoteData = await quoteRes.json();

      const quotes = quoteData?.quoteResponse?.result || [];

      const processed = quotes.map((q) => {
        const symbol = q.symbol.replace("-", ".");

        const base = {
          symbol,
          name: q.longName || q.shortName || symbol,
          price: q.regularMarketPrice,
          dayChangePct: q.regularMarketChangePercent,
        };

        const qualityScore = calcQualityScore(base);
        const asymmetryScore = calcAsymmetryScore(base);
        const triggerScore = calcTriggerScore(base);

        let label = "AVOID";
        let reason = "Weak setup";

        if (triggerScore > 75) {
          label = "STRONG BUY";
          reason = "Momentum + asymmetry aligned";
        } else if (triggerScore > 60) {
          label = "BUY";
          reason = "Setup forming";
        } else if (triggerScore > 45) {
          label = "WATCH";
          reason = "Needs confirmation";
        }

        return {
          ...base,
          qualityScore,
          asymmetryScore,
          triggerScore,
          recommendation: { label, reason },
        };
      });

      setRows(processed);
      setMeta({ totalUniverse: data.universe.length });
    } catch (err) {
      setError("Quote load failed");
    }
  }

  useEffect(() => {
    loadUniverseAndQuotes();
  }, []);

  const filtered = useMemo(() => {
    return rows
      .filter((r) => !under25Only || r.price < 25)
      .sort((a, b) => b.triggerScore - a.triggerScore)
      .slice(0, 25);
  }, [rows, under25Only]);

  return (
    <main style={{ maxWidth: 1200, margin: "40px auto", padding: 20 }}>
      <h1>🧠 Asymmetry Screener</h1>

      <div style={{ marginBottom: 20 }}>
        Universe: {meta.totalUniverse} → Showing: {filtered.length}
      </div>

      {error && <div style={{ color: "red" }}>{error}</div>}

      <table style={{ width: "100%" }}>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Price</th>
            <th>Signal</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => (
            <tr key={r.symbol}>
              <td>{r.symbol}</td>
              <td>{formatPrice(r.price)}</td>
              <td>{r.recommendation.label}</td>
              <td>{r.recommendation.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

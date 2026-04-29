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
  const [under25Only, setUnder25Only] = useState(true);
  const [profitableOnly, setProfitableOnly] = useState(false);

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

  const [meta, setMeta] = useState({
    totalUniverse: 0,
    quoteSnapshots: 0,
    afterInstitutionalFilter: 0,
    afterRankingThreshold: 0,
  });

  async function loadTop5() {
    setIsLoadingTop5(true);
    setError("");

    try {
      const response = await fetch("/api/top5");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load opportunities");
      }

      setLookupSymbols([]);
      setRows(data.stocks || []);
      setMeta(
        data.meta || {
          totalUniverse: 0,
          quoteSnapshots: 0,
          afterInstitutionalFilter: 0,
          afterRankingThreshold: 0,
        }
      );
    } catch (err) {
      setError(err.message || "Failed to load opportunities");
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
      const response = await fetch(
        `/api/lookup?symbol=${encodeURIComponent(symbol)}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Lookup failed");
      }

      if (!data?.symbol) {
        throw new Error("Lookup returned no usable stock data.");
      }

      if ((data.price ?? 0) >= 25) {
        setUnder25Only(false);
      }

      setLookupSymbols((prev) => {
        const clean = prev.filter((x) => x !== data.symbol);
        return [data.symbol, ...clean].slice(0, 5);
      });

      setRows((prev) => {
        const exists = prev.some((row) => row.symbol === data.symbol);
        if (exists) {
          return prev.map((row) => (row.symbol === data.symbol ? data : row));
        }
        return [data, ...prev];
      });

      setSelectedSymbol(data.symbol);
      setQuery("");
    } catch (err) {
      setError(err.message || "Lookup failed");
    } finally {
      setIsLookingUp(false);
    }
  }

  function addPortfolioPosition() {
    const symbol = portfolioSymbol.trim().toUpperCase();
    const qty = Number(portfolioQty);
    const cost = Number(portfolioCost);

    if (!symbol || !qty || qty <= 0) {
      setError("Enter a symbol and quantity.");
      return;
    }

    setPortfolioPositions((prev) => {
      const without = prev.filter((p) => p.symbol !== symbol);
      return [...without, { symbol, qty, cost: cost || 0 }];
    });

    setPortfolioSymbol("");
    setPortfolioQty("");
    setPortfolioCost("");
    setError("");
  }

  function removePortfolioPosition(symbol) {
    setPortfolioPositions((prev) => prev.filter((p) => p.symbol !== symbol));
    setPortfolioRows((prev) => prev.filter((p) => p.symbol !== symbol));
  }

  function getSetupLabel(label) {
    if (label === "STRONG BUY") return "STRONG";
    if (label === "BUY") return "GOOD";
    if (label === "WATCH") return "NEUTRAL";
    return "WEAK";
  }

  function getPortfolioDecision(label, gainLossPct) {
    if (label === "STRONG BUY") {
      if (gainLossPct >= 18) {
        return { action: "TRIM", why: "Up strong — lock in some gains." };
      }
      return { action: "ADD", why: "Strong setup — keep pressing." };
    }

    if (label === "BUY") {
      if (gainLossPct >= 12) {
        return { action: "TRIM", why: "Good gain — don’t get greedy." };
      }
      return { action: "ADD", why: "Improving setup — add, but controlled." };
    }

    if (label === "WATCH") {
      if (gainLossPct <= -8) {
        return { action: "SELL", why: "Down and weak — cut it." };
      }
      if (gainLossPct >= 10) {
        return { action: "TRIM", why: "Up nicely — protect gains." };
      }
      return { action: "HOLD", why: "No edge right now." };
    }

    if (label === "AVOID") {
      if (gainLossPct <= -5) {
        return { action: "SELL", why: "Weak + losing — free capital." };
      }
      if (gainLossPct >= 8) {
        return { action: "TRIM", why: "Up, but weak signal — take some off." };
      }
      return { action: "HOLD", why: "Weak setup — don’t add." };
    }

    return { action: "HOLD", why: "No clear signal." };
  }

  async function analyzePortfolio() {
    setIsAnalyzingPortfolio(true);
    setError("");

    try {
      const results = [];

      for (const position of portfolioPositions) {
        const response = await fetch(
          `/api/lookup?symbol=${encodeURIComponent(position.symbol)}`
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || `Lookup failed for ${position.symbol}`);
        }

        const price = Number(data.price || 0);
        const qty = Number(position.qty || 0);
        const cost = Number(position.cost || 0);
        const value = price * qty;
        const costBasis = cost * qty;
        const gainLoss = costBasis ? value - costBasis : 0;
        const gainLossPct = costBasis ? (gainLoss / costBasis) * 100 : 0;
        const decision = getPortfolioDecision(
          data.recommendation?.label,
          gainLossPct
        );

        results.push({
          ...data,
          qty,
          cost,
          value,
          costBasis,
          gainLoss,
          gainLossPct,
          setupLabel: getSetupLabel(data.recommendation?.label),
          action: decision.action,
          portfolioWhy: decision.why,
        });
      }

      setPortfolioRows(results);
    } catch (err) {
      setError(err.message || "Portfolio analysis failed.");
    } finally {
      setIsAnalyzingPortfolio(false);
    }
  }

  useEffect(() => {
    loadTop5();
  }, []);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const isLookup = lookupSymbols.includes(row.symbol);

      if (!isLookup && under25Only && (row.price ?? 0) >= 25) return false;
      if (!isLookup && profitableOnly && (row.operatingMarginPct ?? 0) <= 0) {
        return false;
      }

      return true;
    });
  }, [rows, lookupSymbols, under25Only, profitableOnly]);

  const sortedRows = useMemo(() => {
    const actionRank = {
      "STRONG BUY": 4,
      BUY: 3,
      WATCH: 2,
      AVOID: 1,
    };

    return [...filteredRows]
      .sort((a, b) => {
        const aLookup = lookupSymbols.includes(a.symbol) ? 1 : 0;
        const bLookup = lookupSymbols.includes(b.symbol) ? 1 : 0;

        return (
          bLookup - aLookup ||
          (b.recommendation?.score ?? 0) - (a.recommendation?.score ?? 0) ||
          (actionRank[b.recommendation?.label] || 0) -
            (actionRank[a.recommendation?.label] || 0) ||
          (b.triggerScore ?? 0) - (a.triggerScore ?? 0) ||
          (b.asymmetryScore ?? 0) - (a.asymmetryScore ?? 0) ||
          (b.qualityScore ?? 0) - (a.qualityScore ?? 0)
        );
      })
      .slice(0, 25);
  }, [filteredRows, lookupSymbols]);

  const top10Rows = useMemo(() => sortedRows.slice(0, 10), [sortedRows]);

  useEffect(() => {
    if (!sortedRows.length) {
      setSelectedSymbol("");
      return;
    }

    const stillVisible = sortedRows.some((row) => row.symbol === selectedSymbol);
    if (!stillVisible) setSelectedSymbol(sortedRows[0].symbol);
  }, [sortedRows, selectedSymbol]);

  const selectedRow =
    sortedRows.find((row) => row.symbol === selectedSymbol) || sortedRows[0];

  function recommendationPillStyle(label) {
    if (label === "STRONG BUY") {
      return {
        background: "#dcfce7",
        color: "#166534",
        border: "1px solid #bbf7d0",
      };
    }
    if (label === "BUY") {
      return {
        background: "#e0f2fe",
        color: "#075985",
        border: "1px solid #bae6fd",
      };
    }
    if (label === "WATCH") {
      return {
        background: "#fef3c7",
        color: "#92400e",
        border: "1px solid #fde68a",
      };
    }
    return {
      background: "#fee2e2",
      color: "#b91c1c",
      border: "1px solid #fecaca",
    };
  }

  function actionPillStyle(action) {
    if (action === "ADD") {
      return {
        background: "#dcfce7",
        color: "#166534",
        border: "1px solid #bbf7d0",
      };
    }
    if (action === "HOLD") {
      return {
        background: "#fef3c7",
        color: "#92400e",
        border: "1px solid #fde68a",
      };
    }
    if (action === "TRIM") {
      return {
        background: "#ffedd5",
        color: "#9a3412",
        border: "1px solid #fed7aa",
      };
    }
    if (action === "SELL") {
      return {
        background: "#fee2e2",
        color: "#b91c1c",
        border: "1px solid #fecaca",
      };
    }
    return {
      background: "#f3f4f6",
      color: "#374151",
      border: "1px solid #e5e7eb",
    };
  }

  function filterButtonStyle(active) {
    return {
      padding: "10px 14px",
      borderRadius: 999,
      border: active ? "1px solid #0f766e" : "1px solid #d1d5db",
      background: active ? "#0f766e" : "#ffffff",
      color: active ? "#ffffff" : "#111827",
      fontSize: 14,
      cursor: "pointer",
    };
  }

  function yesNo(value) {
    if (value == null) return "—";
    return value ? "Yes" : "No";
  }

  function formatSignedPct(value) {
    if (value == null || Number.isNaN(value)) return "—";
    const sign = value > 0 ? "+" : "";
    return `${sign}${value.toFixed(1)}%`;
  }

  function formatBillions(value) {
    if (value == null || Number.isNaN(value)) return "—";
    return `$${(value / 1_000_000_000).toFixed(1)}B`;
  }

  function getEntryNote(row) {
    return (
      row?.recommendation?.entryNote ||
      row?.entryNote ||
      "Use price/volume confirmation."
    );
  }

  return (
    <main style={mainStyle}>
      <h1 style={titleStyle}>
        <span>🧠</span>
        Asymmetry Screener
      </h1>

      <div style={subtitleStyle}>
        Broad-market snap quote screen for under-the-radar, high-upside setups.
      </div>

      <div style={toolbarStyle}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleLookup();
          }}
          placeholder="Lookup ticker..."
          style={inputStyle}
        />

        <button
          onClick={handleLookup}
          disabled={isLookingUp}
          style={primaryButtonStyle}
        >
          {isLookingUp ? "Looking up..." : "Snap Quote + Score"}
        </button>

        <button
          onClick={loadTop5}
          disabled={isLoadingTop5}
          style={secondaryButtonStyle}
        >
          {isLoadingTop5 ? "Loading..." : "Reload Screener"}
        </button>
      </div>

      <div style={filterRowStyle}>
        <button
          onClick={() => setUnder25Only((prev) => !prev)}
          style={filterButtonStyle(under25Only)}
        >
          Under $25
        </button>

        <button
          onClick={() => setProfitableOnly((prev) => !prev)}
          style={filterButtonStyle(profitableOnly)}
        >
          Profitable Only
        </button>

        <div style={metaStyle}>
          Universe: {meta.totalUniverse} → Quotes: {meta.quoteSnapshots || 0} →
          Tradable: {meta.afterInstitutionalFilter} → Ranked:{" "}
          {meta.afterRankingThreshold} → Showing: {filteredRows.length}
        </div>
      </div>

      {error ? <div style={errorStyle}>{error}</div> : null}

      <div style={portfolioWrapStyle}>
        <div style={portfolioHeaderStyle}>💼 My Portfolio</div>

        <div style={portfolioInputRowStyle}>
          <input
            value={portfolioSymbol}
            onChange={(e) => setPortfolioSymbol(e.target.value)}
            placeholder="Symbol"
            style={smallInputStyle}
          />
          <input
            value={portfolioQty}
            onChange={(e) => setPortfolioQty(e.target.value)}
            placeholder="Shares"
            style={smallInputStyle}
          />
          <input
            value={portfolioCost}
            onChange={(e) => setPortfolioCost(e.target.value)}
            placeholder="Avg cost"
            style={smallInputStyle}
          />
          <button onClick={addPortfolioPosition} style={secondaryButtonStyle}>
            Add / Update
          </button>
          <button
            onClick={analyzePortfolio}
            disabled={isAnalyzingPortfolio}
            style={primaryButtonStyle}
          >
            {isAnalyzingPortfolio ? "Analyzing..." : "Analyze Portfolio"}
          </button>
        </div>

        <div style={miniPositionStyle}>
          {portfolioPositions.map((p) => (
            <span key={p.symbol} style={positionChipStyle}>
              {p.symbol}: {p.qty} @ {p.cost || "—"}
              <button
                onClick={() => removePortfolioPosition(p.symbol)}
                style={chipButtonStyle}
              >
                ×
              </button>
            </span>
          ))}
        </div>

        {portfolioRows.length ? (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead style={{ background: "#f9fafb" }}>
                <tr>
                  <th style={thStyle}>Symbol</th>
                  <th style={thStyleRight}>Shares</th>
                  <th style={thStyleRight}>Price</th>
                  <th style={thStyleRight}>Value</th>
                  <th style={thStyleRight}>Gain/Loss</th>
                  <th style={thStyle}>Setup</th>
                  <th style={thStyle}>Action</th>
                  <th style={thStyle}>Why</th>
                </tr>
              </thead>
              <tbody>
                {portfolioRows.map((row) => {
                  const setupPill = recommendationPillStyle(
                    row.recommendation?.label
                  );
                  const actionPill = actionPillStyle(row.action);

                  return (
                    <tr key={row.symbol}>
                      <td style={tdStyleBold}>{row.symbol}</td>
                      <td style={tdStyleRight}>{row.qty}</td>
                      <td style={tdStyleRight}>{formatPrice(row.price)}</td>
                      <td style={tdStyleRight}>${row.value.toFixed(0)}</td>
                      <td
                        style={{
                          ...tdStyleRight,
                          color: row.gainLoss >= 0 ? "#166534" : "#b91c1c",
                        }}
                      >
                        ${row.gainLoss.toFixed(0)} /{" "}
                        {row.gainLossPct.toFixed(1)}%
                      </td>
                      <td style={tdStyle}>
                        <span style={{ ...setupPill, ...pillBaseStyle }}>
                          {row.setupLabel}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ ...actionPill, ...actionPillBaseStyle }}>
                          {row.action}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ color: "#4b5563", fontSize: 13 }}>
                          {row.portfolioWhy || row.recommendation?.reason}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {top10Rows.length ? (
        <div style={top10WrapStyle}>
          <div style={top10TitleStyle}>🔥 Top 10 of the Day</div>

          <div style={top10GridStyle}>
            {top10Rows.map((row) => {
              const pill = recommendationPillStyle(row.recommendation?.label);

              return (
                <button
                  key={row.symbol}
                  onClick={() => setSelectedSymbol(row.symbol)}
                  style={top10CardStyle}
                >
                  <div style={top10SymbolStyle}>{row.symbol}</div>
                  <div style={top10PriceStyle}>{formatPrice(row.price)}</div>

                  <div style={{ marginTop: 8 }}>
                    <span style={{ ...pill, ...top10PillStyle }}>
                      {row.recommendation?.label}
                    </span>
                  </div>

                  <div style={top10ScoreStyle}>
                    Score: {row.recommendation?.score ?? "—"}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div style={tableWrapStyle}>
        <table style={tableStyle}>
          <thead style={{ background: "#f9fafb" }}>
            <tr>
              <th style={thStyle}>Symbol</th>
              <th style={thStyle}>Name</th>
              <th style={thStyleRight}>Price</th>
              <th style={thStyleRight}>Chg %</th>
              <th style={thStyle}>Signal</th>
              <th style={thStyle}>Why</th>
              <th style={thStyle}>Entry Note</th>
            </tr>
          </thead>

          <tbody>
            {sortedRows.map((row) => {
              const pill = recommendationPillStyle(row.recommendation?.label);
              const isSelected = selectedRow?.symbol === row.symbol;

              return (
                <tr
                  key={row.symbol}
                  onClick={() => setSelectedSymbol(row.symbol)}
                  style={{
                    cursor: "pointer",
                    background: isSelected ? "#f9fafb" : "#ffffff",
                  }}
                >
                  <td style={tdStyleBold}>{row.symbol}</td>
                  <td style={tdStyle}>{row.name || row.symbol}</td>
                  <td style={tdStyleRight}>{formatPrice(row.price)}</td>
                  <td
                    style={{
                      ...tdStyleRight,
                      color:
                        row.dayChangePct > 0
                          ? "#166534"
                          : row.dayChangePct < 0
                          ? "#b91c1c"
                          : "#111827",
                    }}
                  >
                    {formatPct(row.dayChangePct)}
                  </td>
                  <td style={tdStyle}>
                    <span style={{ ...pill, ...pillBaseStyle }}>
                      {row.recommendation?.label}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ color: "#4b5563", fontSize: 13 }}>
                      {row.recommendation?.reason}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ color: "#6b7280", fontSize: 13 }}>
                      {getEntryNote(row)}
                    </span>
                  </td>
                </tr>
              );
            })}

            {!sortedRows.length && !isLoadingTop5 ? (
              <tr>
                <td colSpan={7} style={emptyStyle}>
                  No stocks match your current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {selectedRow ? (
        <>
          <div style={{ marginBottom: 18 }}>
            <div style={selectedTitleStyle}>
              {selectedRow.symbol} — {selectedRow.name || selectedRow.symbol}
            </div>

            <div style={selectedSignalStyle}>
              Signal: {selectedRow.recommendation?.label}
            </div>
            <div style={selectedReasonStyle}>
              {selectedRow.recommendation?.reason}
            </div>
            <div style={selectedEntryStyle}>{getEntryNote(selectedRow)}</div>
          </div>

          <div style={gridStyle}>
            <div style={cardStyle}>
              <div style={cardTitleStyle}>Technical setup</div>
              <div style={metricGridStyle}>
                <Metric
                  label="Day change"
                  value={formatSignedPct(selectedRow.dayChangePct)}
                />
                <Metric
                  label="Relative volume"
                  value={
                    selectedRow.technicalSnapshot?.relativeVolume != null
                      ? `${selectedRow.technicalSnapshot.relativeVolume.toFixed(
                          2
                        )}x`
                      : "—"
                  }
                />
                <Metric
                  label="Above 20DMA"
                  value={yesNo(selectedRow.technicalSnapshot?.above20dma)}
                />
                <Metric
                  label="Above 50DMA"
                  value={yesNo(selectedRow.technicalSnapshot?.above50dma)}
                />
                <Metric
                  label="Above 200DMA"
                  value={yesNo(selectedRow.technicalSnapshot?.above200dma)}
                />
                <Metric
                  label="Pressure"
                  value={
                    selectedRow.technicalSnapshot?.pressure ||
                    selectedRow.recommendation?.pressure ||
                    "—"
                  }
                />
                <Metric
                  label="Fair value"
                  value={
                    selectedRow.technicalSnapshot?.fairValue ||
                    selectedRow.recommendation?.fairValue ||
                    "—"
                  }
                />
              </div>
            </div>

            <div style={cardStyle}>
              <div style={cardTitleStyle}>Fundamental / liquidity profile</div>
              <div style={metricGridStyle}>
                <Metric
                  label="Market cap"
                  value={formatBillions(
                    selectedRow.marketCap ??
                      selectedRow.fundamentalSnapshot?.marketCap
                  )}
                />
                <Metric
                  label="Avg volume"
                  value={
                    selectedRow.avgVolume != null
                      ? Math.round(selectedRow.avgVolume).toLocaleString()
                      : "—"
                  }
                />
                <Metric
                  label="EPS"
                  value={
                    selectedRow.fundamentalSnapshot?.eps ??
                    selectedRow.eps ??
                    "—"
                  }
                />
                <Metric
                  label="P/E"
                  value={
                    selectedRow.fundamentalSnapshot?.pe ??
                    selectedRow.pe ??
                    "—"
                  }
                />
              </div>
            </div>
          </div>

          <div style={engineNoteStyle}>
            Quant screens are running behind the scenes: pressure, fair value,
            quality, asymmetry, liquidity, valuation, momentum, and confirmation.
          </div>
        </>
      ) : null}
    </main>
  );
}

function Metric({ label, value }) {
  return (
    <div style={metricStyle}>
      <div style={metricLabelStyle}>{label}</div>
      <div style={metricValueStyle}>{value}</div>
    </div>
  );
}

const mainStyle = {
  maxWidth: 1280,
  margin: "32px auto",
  padding: "0 16px",
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

const titleStyle = {
  fontSize: 36,
  fontWeight: 700,
  marginBottom: 10,
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const subtitleStyle = { color: "#6b7280", fontSize: 14, marginBottom: 20 };

const toolbarStyle = {
  display: "flex",
  gap: 12,
  marginBottom: 14,
  alignItems: "center",
  flexWrap: "wrap",
};

const inputStyle = {
  flex: "1 1 280px",
  minWidth: 240,
  padding: "12px 14px",
  border: "1px solid #d1d5db",
  borderRadius: 10,
  fontSize: 16,
};

const smallInputStyle = {
  width: 120,
  padding: "10px 12px",
  border: "1px solid #d1d5db",
  borderRadius: 10,
  fontSize: 14,
};

const primaryButtonStyle = {
  padding: "12px 16px",
  borderRadius: 10,
  border: "1px solid #111827",
  background: "#111827",
  color: "#ffffff",
  fontSize: 14,
  cursor: "pointer",
};

const secondaryButtonStyle = {
  padding: "12px 16px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  background: "#ffffff",
  color: "#111827",
  fontSize: 14,
  cursor: "pointer",
};

const filterRowStyle = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 18,
  alignItems: "center",
};

const metaStyle = { fontSize: 13, color: "#6b7280", marginLeft: 4 };

const errorStyle = {
  marginBottom: 16,
  padding: "12px 14px",
  borderRadius: 10,
  background: "#fef2f2",
  color: "#b91c1c",
  border: "1px solid #fecaca",
};

const portfolioWrapStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 16,
  background: "#ffffff",
  marginBottom: 20,
};

const portfolioHeaderStyle = {
  fontSize: 18,
  fontWeight: 800,
  marginBottom: 12,
};

const portfolioInputRowStyle = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 12,
};

const miniPositionStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginBottom: 12,
};

const positionChipStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid #d1d5db",
  fontSize: 13,
};

const chipButtonStyle = {
  border: "none",
  background: "transparent",
  cursor: "pointer",
  fontWeight: 800,
  color: "#b91c1c",
};

const top10WrapStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 16,
  background: "#ffffff",
  marginBottom: 20,
};

const top10TitleStyle = {
  fontSize: 18,
  fontWeight: 800,
  marginBottom: 12,
};

const top10GridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
  gap: 12,
};

const top10CardStyle = {
  textAlign: "left",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 12,
  background: "#f9fafb",
  cursor: "pointer",
};

const top10SymbolStyle = { fontWeight: 800, fontSize: 16, color: "#111827" };
const top10PriceStyle = { fontSize: 14, marginTop: 2, color: "#111827" };

const top10PillStyle = {
  display: "inline-block",
  minWidth: 90,
  textAlign: "center",
  padding: "4px 8px",
  borderRadius: 999,
  fontWeight: 800,
  fontSize: 11,
  letterSpacing: 0.2,
};

const top10ScoreStyle = {
  fontSize: 12,
  color: "#6b7280",
  marginTop: 6,
};

const tableWrapStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  overflowX: "auto",
  background: "#ffffff",
  marginBottom: 24,
};

const tableStyle = {
  width: "100%",
  minWidth: 1040,
  borderCollapse: "collapse",
};

const thStyle = {
  textAlign: "left",
  padding: "14px 16px",
  fontSize: 13,
  color: "#6b7280",
  borderBottom: "1px solid #e5e7eb",
};

const thStyleRight = { ...thStyle, textAlign: "right" };

const tdStyle = {
  padding: "14px 16px",
  borderBottom: "1px solid #f3f4f6",
};

const tdStyleBold = { ...tdStyle, fontWeight: 700 };

const tdStyleRight = {
  ...tdStyle,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};

const pillBaseStyle = {
  display: "inline-block",
  minWidth: 120,
  textAlign: "center",
  padding: "6px 10px",
  borderRadius: 999,
  fontWeight: 800,
  fontSize: 12,
  letterSpacing: 0.2,
};

const actionPillBaseStyle = {
  display: "inline-block",
  minWidth: 82,
  textAlign: "center",
  padding: "6px 10px",
  borderRadius: 999,
  fontWeight: 900,
  fontSize: 12,
  letterSpacing: 0.2,
};

const emptyStyle = {
  padding: "20px 16px",
  textAlign: "center",
  color: "#6b7280",
};

const selectedTitleStyle = {
  fontSize: 24,
  fontWeight: 700,
  marginBottom: 6,
};

const selectedSignalStyle = {
  fontSize: 15,
  color: "#374151",
  marginBottom: 10,
  fontWeight: 700,
};

const selectedReasonStyle = {
  fontSize: 14,
  color: "#6b7280",
  marginBottom: 8,
};

const selectedEntryStyle = {
  fontSize: 14,
  color: "#111827",
  fontWeight: 600,
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 16,
  marginBottom: 16,
};

const cardStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 16,
  background: "#ffffff",
};

const cardTitleStyle = {
  fontSize: 16,
  fontWeight: 700,
  marginBottom: 12,
};

const metricGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const metricStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: "10px 12px",
  background: "#ffffff",
};

const metricLabelStyle = {
  fontSize: 12,
  color: "#6b7280",
  marginBottom: 4,
};

const metricValueStyle = {
  fontSize: 16,
  fontWeight: 700,
  color: "#111827",
};

const engineNoteStyle = {
  fontSize: 13,
  color: "#6b7280",
  marginTop: 8,
  marginBottom: 24,
};

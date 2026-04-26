// pages/index.js

import { useEffect, useMemo, useState } from "react";
import { formatPct, formatPrice } from "../lib/formatters";

export default function HomePage() {
  const [rows, setRows] = useState([]);
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [isLoadingTop5, setIsLoadingTop5] = useState(true);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [under25Only, setUnder25Only] = useState(true);
  const [profitableOnly, setProfitableOnly] = useState(false);

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

      // If user looks up MSTR or anything above $25, do not let the filter hide it.
      if ((data.price ?? 0) >= 25) {
        setUnder25Only(false);
      }

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

  useEffect(() => {
    loadTop5();
  }, []);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (under25Only && (row.price ?? 0) >= 25) return false;
      if (profitableOnly && (row.operatingMarginPct ?? 0) <= 0) return false;
      return true;
    });
  }, [rows, under25Only, profitableOnly]);

  const sortedRows = useMemo(() => {
    const actionRank = {
      "STRONG BUY": 4,
      BUY: 3,
      WATCH: 2,
      AVOID: 1,
    };

    return [...filteredRows]
      .sort((a, b) => {
        return (
          (b.recommendation?.score ?? 0) - (a.recommendation?.score ?? 0) ||
          (actionRank[b.recommendation?.label] || 0) -
            (actionRank[a.recommendation?.label] || 0) ||
          (b.triggerScore ?? 0) - (a.triggerScore ?? 0) ||
          (b.asymmetryScore ?? 0) - (a.asymmetryScore ?? 0) ||
          (b.qualityScore ?? 0) - (a.qualityScore ?? 0)
        );
      })
      .slice(0, 25);
  }, [filteredRows]);

  const top10Rows = useMemo(() => {
    return sortedRows.slice(0, 10);
  }, [sortedRows]);

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
          Universe: {meta.totalUniverse} → Quotes: {meta.quoteSnapshots || 0} → Tradable:{" "}
          {meta.afterInstitutionalFilter} → Ranked: {meta.afterRankingThreshold} → Showing:{" "}
          {filteredRows.length}
        </div>
      </div>

      {error ? <div style={errorStyle}>{error}</div> : null}

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
                <Metric label="Day change" value={formatSignedPct(selectedRow.dayChangePct)} />
                <Metric
                  label="Relative volume"
                  value={
                    selectedRow.technicalSnapshot?.relativeVolume != null
                      ? `${selectedRow.technicalSnapshot.relativeVolume.toFixed(2)}x`
                      : "—"
                  }
                />
                <Metric label="Above 20DMA" value={yesNo(selectedRow.technicalSnapshot?.above20dma)} />
                <Metric label="Above 50DMA" value={yesNo(selectedRow.technicalSnapshot?.above50dma)} />
                <Metric label="Above 200DMA" value={yesNo(selectedRow.technicalSnapshot?.above200dma)} />
                <Metric
                  label="RSI"
                  value={
                    selectedRow.technicalSnapshot?.rsi != null
                      ? selectedRow.technicalSnapshot.rsi.toFixed(1)
                      : "—"
                  }
                />
                <Metric
                  label="MACD"
                  value={
                    selectedRow.technicalSnapshot?.macd != null
                      ? selectedRow.technicalSnapshot.macd.toFixed(2)
                      : "—"
                  }
                />
                <Metric
                  label="MACD signal"
                  value={
                    selectedRow.technicalSnapshot?.macdSignal != null
                      ? selectedRow.technicalSnapshot.macdSignal.toFixed(2)
                      : "—"
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
                    selectedRow.marketCap ?? selectedRow.fundamentalSnapshot?.marketCap
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
                  label="Revenue growth"
                  value={
                    selectedRow.fundamentalSnapshot?.revenueGrowthPct != null
                      ? `${selectedRow.fundamentalSnapshot.revenueGrowthPct.toFixed(1)}%`
                      : "—"
                  }
                />
                <Metric
                  label="EPS growth"
                  value={
                    selectedRow.fundamentalSnapshot?.epsGrowthPct != null
                      ? `${selectedRow.fundamentalSnapshot.epsGrowthPct.toFixed(1)}%`
                      : "—"
                  }
                />
                <Metric
                  label="Operating margin"
                  value={
                    selectedRow.fundamentalSnapshot?.operatingMarginPct != null
                      ? `${selectedRow.fundamentalSnapshot.operatingMarginPct.toFixed(1)}%`
                      : "—"
                  }
                />
                <Metric
                  label="Institutional"
                  value={
                    selectedRow.fundamentalSnapshot?.institutionalScore != null
                      ? `${selectedRow.fundamentalSnapshot.institutionalScore}/100`
                      : "—"
                  }
                />
              </div>
            </div>
          </div>

          <div style={engineNoteStyle}>
            Quant screens are still running behind the scenes: quality, asymmetry,
            trigger, liquidity, valuation, momentum, and confirmation.
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

const subtitleStyle = {
  color: "#6b7280",
  fontSize: 14,
  marginBottom: 20,
};

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

const metaStyle = {
  fontSize: 13,
  color: "#6b7280",
  marginLeft: 4,
};

const errorStyle = {
  marginBottom: 16,
  padding: "12px 14px",
  borderRadius: 10,
  background: "#fef2f2",
  color: "#b91c1c",
  border: "1px solid #fecaca",
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

const top10SymbolStyle = {
  fontWeight: 800,
  fontSize: 16,
  color: "#111827",
};

const top10PriceStyle = {
  fontSize: 14,
  marginTop: 2,
  color: "#111827",
};

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

const thStyleRight = {
  ...thStyle,
  textAlign: "right",
};

const tdStyle = {
  padding: "14px 16px",
  borderBottom: "1px solid #f3f4f6",
};

const tdStyleBold = {
  ...tdStyle,
  fontWeight: 700,
};

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

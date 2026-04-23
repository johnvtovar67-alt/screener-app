import { useEffect, useMemo, useState } from "react";
import { formatPct, formatPrice } from "../lib/formatters";
import {
  calcQualityScore,
  calcAsymmetryScore,
  calcTriggerScore,
  getStage,
  getRecommendation,
  buildTechnicalSnapshot,
  buildFundamentalSnapshot,
} from "../lib/scoring";

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
        throw new Error(data.error || "Failed to load top opportunities");
      }

      setRows(data.stocks || []);
      setMeta(
        data.meta || {
          totalUniverse: 0,
          afterInstitutionalFilter: 0,
          afterRankingThreshold: 0,
        }
      );
    } catch (err) {
      setError(err.message || "Failed to load top opportunities");
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

  const enrichedRows = useMemo(() => {
    return rows.map((row) => {
      const qualityScore =
        row.qualityScore != null ? row.qualityScore : calcQualityScore(row);
      const asymmetryScore =
        row.asymmetryScore != null ? row.asymmetryScore : calcAsymmetryScore(row);
      const triggerScore =
        row.triggerScore != null ? row.triggerScore : calcTriggerScore(row);
      const stage = row.stage || getStage(row);
      const recommendation =
        row.recommendation ||
        getRecommendation({
          ...row,
          qualityScore,
          asymmetryScore,
          triggerScore,
          stage,
        });

      return {
        ...row,
        qualityScore,
        asymmetryScore,
        triggerScore,
        stage,
        recommendation,
        technicalSnapshot:
          row.technicalSnapshot || buildTechnicalSnapshot(row),
        fundamentalSnapshot:
          row.fundamentalSnapshot || buildFundamentalSnapshot(row),
      };
    });
  }, [rows]);

  const filteredRows = useMemo(() => {
    return enrichedRows.filter((row) => {
      if (under25Only && (row.price ?? 0) >= 25) return false;
      if (profitableOnly && (row.operatingMarginPct ?? 0) <= 0) return false;
      return true;
    });
  }, [enrichedRows, under25Only, profitableOnly]);

  const sortedRows = useMemo(() => {
    const list = [...filteredRows];
    list.sort((a, b) => {
      const triggerDiff = (b.triggerScore ?? 0) - (a.triggerScore ?? 0);
      if (triggerDiff !== 0) return triggerDiff;

      const asymmetryDiff = (b.asymmetryScore ?? 0) - (a.asymmetryScore ?? 0);
      if (asymmetryDiff !== 0) return asymmetryDiff;

      return (b.qualityScore ?? 0) - (a.qualityScore ?? 0);
    });
    return list.slice(0, 25);
  }, [filteredRows]);

  useEffect(() => {
    if (!sortedRows.length) {
      setSelectedSymbol("");
      return;
    }

    const currentStillVisible = sortedRows.some(
      (row) => row.symbol === selectedSymbol
    );

    if (!currentStillVisible) {
      setSelectedSymbol(sortedRows[0].symbol);
    }
  }, [sortedRows, selectedSymbol]);

  const selectedRow =
    sortedRows.find((row) => row.symbol === selectedSymbol) || sortedRows[0];

  function recommendationPillStyle(label) {
    if (label === "Buy Now") {
      return {
        background: "#dcfce7",
        color: "#166534",
        border: "1px solid #bbf7d0",
      };
    }
    if (label === "Buy on Breakout") {
      return {
        background: "#fef3c7",
        color: "#92400e",
        border: "1px solid #fde68a",
      };
    }
    if (label === "Watch") {
      return {
        background: "#f3f4f6",
        color: "#374151",
        border: "1px solid #d1d5db",
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

  return (
    <main
      style={{
        maxWidth: 1280,
        margin: "32px auto",
        padding: "0 16px",
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <h1
        style={{
          fontSize: 36,
          fontWeight: 700,
          marginBottom: 10,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span>🧠</span>
        Asymmetry Screener
      </h1>

      <div
        style={{
          color: "#6b7280",
          fontSize: 14,
          marginBottom: 20,
        }}
      >
        Under-the-radar + high upside setups with a quality floor.
      </div>

      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 14,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleLookup();
          }}
          placeholder="Lookup ticker..."
          style={{
            flex: "1 1 280px",
            minWidth: 240,
            padding: "12px 14px",
            border: "1px solid #d1d5db",
            borderRadius: 10,
            fontSize: 16,
          }}
        />

        <button
          onClick={handleLookup}
          disabled={isLookingUp}
          style={{
            padding: "12px 16px",
            borderRadius: 10,
            border: "1px solid #111827",
            background: "#111827",
            color: "#ffffff",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          {isLookingUp ? "Looking up..." : "Snap Quote + Score"}
        </button>

        <button
          onClick={loadTop5}
          disabled={isLoadingTop5}
          style={{
            padding: "12px 16px",
            borderRadius: 10,
            border: "1px solid #d1d5db",
            background: "#ffffff",
            color: "#111827",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          {isLoadingTop5 ? "Loading..." : "Reload Top 5"}
        </button>
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 18,
          alignItems: "center",
        }}
      >
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

        <div
          style={{
            fontSize: 13,
            color: "#6b7280",
            marginLeft: 4,
          }}
        >
          Universe: {meta.totalUniverse} → Gate: {meta.afterInstitutionalFilter} → Ranked: {meta.afterRankingThreshold} → Showing: {filteredRows.length}
        </div>
      </div>

      {error ? (
        <div
          style={{
            marginBottom: 16,
            padding: "12px 14px",
            borderRadius: 10,
            background: "#fef2f2",
            color: "#b91c1c",
            border: "1px solid #fecaca",
          }}
        >
          {error}
        </div>
      ) : null}

      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          overflowX: "auto",
          background: "#ffffff",
          marginBottom: 24,
        }}
      >
        <table
          style={{
            width: "100%",
            minWidth: 980,
            borderCollapse: "collapse",
          }}
        >
          <thead style={{ background: "#f9fafb" }}>
            <tr>
              <th style={thStyle}>Symbol</th>
              <th style={thStyle}>Name</th>
              <th style={thStyleRight}>Price</th>
              <th style={thStyleRight}>Chg %</th>
              <th style={thStyle}>Recommendation</th>
              <th style={thStyle}>Why</th>
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

                  <td style={tdStyle}>
                    <div style={{ fontWeight: 500 }}>{row.name || row.symbol}</div>
                  </td>

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
                    <span
                      style={{
                        ...pill,
                        display: "inline-block",
                        minWidth: 120,
                        textAlign: "center",
                        padding: "6px 10px",
                        borderRadius: 999,
                        fontWeight: 700,
                        fontSize: 13,
                      }}
                    >
                      {row.recommendation?.label}
                    </span>
                  </td>

                  <td style={tdStyle}>
                    <span style={{ color: "#6b7280", fontSize: 13 }}>
                      {row.recommendation?.reason}
                    </span>
                  </td>
                </tr>
              );
            })}

            {!sortedRows.length && !isLoadingTop5 ? (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    padding: "20px 16px",
                    textAlign: "center",
                    color: "#6b7280",
                  }}
                >
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
            <div
              style={{
                fontSize: 24,
                fontWeight: 700,
                marginBottom: 6,
              }}
            >
              {selectedRow.symbol} — {selectedRow.name || selectedRow.symbol}
            </div>

            <div
              style={{
                fontSize: 15,
                color: "#374151",
                marginBottom: 10,
                fontWeight: 600,
              }}
            >
              Recommendation: {selectedRow.recommendation?.label}
            </div>

            <div
              style={{
                fontSize: 14,
                color: "#6b7280",
                marginBottom: 8,
              }}
            >
              {selectedRow.recommendation?.reason}
            </div>

            <div
              style={{
                fontSize: 13,
                color: "#9ca3af",
              }}
            >
              Internal engine: trigger {selectedRow.triggerScore}/100, asymmetry {selectedRow.asymmetryScore}/100, quality {selectedRow.qualityScore}/100, stage {selectedRow.stage}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              marginBottom: 16,
            }}
          >
            <div style={cardStyle}>
              <div style={cardTitleStyle}>Technical setup</div>
              <div style={metricGridStyle}>
                <Metric label="1M momentum" value={formatSignedPct(selectedRow.technicalSnapshot?.oneMonthPct)} />
                <Metric label="3M momentum" value={formatSignedPct(selectedRow.technicalSnapshot?.threeMonthPct)} />
                <Metric label="Relative volume" value={selectedRow.technicalSnapshot?.relativeVolume != null ? `${selectedRow.technicalSnapshot.relativeVolume.toFixed(2)}x` : "—"} />
                <Metric label="Above 20DMA" value={yesNo(selectedRow.technicalSnapshot?.above20dma)} />
                <Metric label="Above 50DMA" value={yesNo(selectedRow.technicalSnapshot?.above50dma)} />
                <Metric label="Above 200DMA" value={yesNo(selectedRow.technicalSnapshot?.above200dma)} />
                <Metric label="% from 20DMA" value={formatSignedPct(selectedRow.technicalSnapshot?.pctFrom20dma)} />
                <Metric label="% from 50DMA" value={formatSignedPct(selectedRow.technicalSnapshot?.pctFrom50dma)} />
                <Metric label="% from 200DMA" value={formatSignedPct(selectedRow.technicalSnapshot?.pctFrom200dma)} />
                <Metric label="RSI" value={selectedRow.technicalSnapshot?.rsi != null ? selectedRow.technicalSnapshot.rsi.toFixed(1) : "—"} />
                <Metric label="MACD" value={selectedRow.technicalSnapshot?.macd != null ? selectedRow.technicalSnapshot.macd.toFixed(2) : "—"} />
                <Metric label="MACD signal" value={selectedRow.technicalSnapshot?.macdSignal != null ? selectedRow.technicalSnapshot.macdSignal.toFixed(2) : "—"} />
              </div>
            </div>

            <div style={cardStyle}>
              <div style={cardTitleStyle}>Fundamental profile</div>
              <div style={metricGridStyle}>
                <Metric label="Revenue growth" value={`${selectedRow.fundamentalSnapshot?.revenueGrowthPct?.toFixed?.(1) ?? "0.0"}%`} />
                <Metric label="EPS growth" value={`${selectedRow.fundamentalSnapshot?.epsGrowthPct?.toFixed?.(1) ?? "0.0"}%`} />
                <Metric label="Operating margin" value={`${selectedRow.fundamentalSnapshot?.operatingMarginPct?.toFixed?.(1) ?? "0.0"}%`} />
                <Metric label="Gross margin" value={selectedRow.fundamentalSnapshot?.grossMargin != null ? `${selectedRow.fundamentalSnapshot.grossMargin.toFixed(1)}%` : "—"} />
                <Metric label="Debt / equity" value={selectedRow.fundamentalSnapshot?.debtToEquity != null ? selectedRow.fundamentalSnapshot.debtToEquity.toFixed(2) : "—"} />
                <Metric label="Market cap" value={selectedRow.fundamentalSnapshot?.marketCap != null ? `$${Math.round(selectedRow.fundamentalSnapshot.marketCap / 1e9)}B` : "—"} />
                <Metric label="Institutional" value={selectedRow.fundamentalSnapshot?.institutionalScore != null ? `${selectedRow.fundamentalSnapshot.institutionalScore}/100` : "—"} />
                <Metric label="Bucket" value={selectedRow.bucket || "—"} />
              </div>
            </div>
          </div>
        </>
      ) : null}
    </main>
  );
}

function Metric({ label, value }) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        padding: "10px 12px",
        background: "#ffffff",
      }}
    >
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>{value}</div>
    </div>
  );
}

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

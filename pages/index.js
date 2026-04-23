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

      if ((data.stocks || []).length) {
        setSelectedSymbol((prev) => prev || data.stocks[0].symbol);
      }
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
      const stage = row.stage || getStage(row);

      let asymmetryColor = "yellow";
      if (asymmetryScore >= 80) asymmetryColor = "green";
      else if (asymmetryScore < 60) asymmetryColor = "red";

      return {
        ...row,
        qualityScore,
        asymmetryScore,
        asymmetryColor,
        stage,
      };
    });
  }, [rows]);

  const filteredRows = useMemo(() => {
    return enrichedRows.filter((row) => {
      if (under25Only && (row.price ?? 0) >= 25) return false;
      if (profitableOnly && (row.operatingMarginPct ?? 0) <= 0) return false;
      if ((row.asymmetryScore ?? 0) < minScore) return false;
      return true;
    });
  }, [enrichedRows, under25Only, profitableOnly, minScore]);

  const sortedRows = useMemo(() => {
    const list = [...filteredRows];
    list.sort((a, b) => (b.asymmetryScore ?? 0) - (a.asymmetryScore ?? 0));
    return list.slice(0, 25);
  }, [filteredRows]);

  const selectedRow =
    enrichedRows.find((row) => row.symbol === selectedSymbol) || sortedRows[0];

  function getInterestingText(row) {
    if (!row) return "";

    const reasons = [];

    if ((row.asymmetryScore ?? 0) >= 80)
      reasons.push("high asymmetry upside profile");
    if ((row.qualityScore ?? 0) >= 70) reasons.push("solid quality floor");
    if ((row.stage ?? "") === "Emerging") reasons.push("early breakout stage");
    if ((row.stage ?? "") === "Extended")
      reasons.push("strong momentum, but extended");
    if ((row.institutionalScore ?? 0) >= 75)
      reasons.push("institutional-quality profile");
    if ((row.sentimentScore ?? 0) >= 70) reasons.push("supportive sentiment");
    if ((row.oneMonthPct ?? 0) >= 10) reasons.push("strong recent momentum");
    if ((row.epsGrowthPct ?? 0) >= 20) reasons.push("strong EPS growth");

    if (!reasons.length) {
      return "Asymmetry setup with enough quality to stay investable.";
    }

    return reasons.slice(0, 2).join(" + ");
  }

  function actionPillStyle(color) {
    if (color === "green") {
      return {
        background: "#dcfce7",
        color: "#166534",
        border: "1px solid #bbf7d0",
      };
    }

    if (color === "red") {
      return {
        background: "#fee2e2",
        color: "#b91c1c",
        border: "1px solid #fecaca",
      };
    }

    return {
      background: "#fef3c7",
      color: "#92400e",
      border: "1px solid #fde68a",
    };
  }

  function stagePillStyle(stage) {
    if (stage === "Emerging") {
      return {
        background: "#dcfce7",
        color: "#166534",
        border: "1px solid #bbf7d0",
      };
    }

    if (stage === "Extended") {
      return {
        background: "#fef3c7",
        color: "#92400e",
        border: "1px solid #fde68a",
      };
    }

    if (stage === "Broken") {
      return {
        background: "#fee2e2",
        color: "#b91c1c",
        border: "1px solid #fecaca",
      };
    }

    return {
      background: "#e5e7eb",
      color: "#374151",
      border: "1px solid #d1d5db",
    };
  }

  function renderDriverSection(title, drivers) {
    return (
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          padding: 16,
          background: "#ffffff",
        }}
      >
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            marginBottom: 14,
          }}
        >
          {title}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          {drivers.map((driver) => {
            const colors = driverCardStyle(driver.color);

            return (
              <div
                key={`${title}-${driver.label}`}
                style={{
                  ...colors,
                  borderRadius: 12,
                  padding: 14,
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    color: "#6b7280",
                    marginBottom: 6,
                  }}
                >
                  {driver.label}
                </div>

                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    marginBottom: 6,
                    color:
                      driver.color === "green"
                        ? "#166534"
                        : driver.color === "red"
                        ? "#b91c1c"
                        : "#92400e",
                  }}
                >
                  {driver.display}
                </div>

                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    marginBottom: 4,
                  }}
                >
                  {driver.note}
                </div>

                <div
                  style={{
                    fontSize: 12,
                    color: "#6b7280",
                  }}
                >
                  Score: {driver.score}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
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

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 14,
            color: "#111827",
          }}
        >
          Min Score
          <select
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              background: "#ffffff",
              fontSize: 14,
            }}
          >
            <option value={40}>40+</option>
            <option value={50}>50+</option>
            <option value={60}>60+</option>
            <option value={70}>70+</option>
            <option value={80}>80+</option>
          </select>
        </label>

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
            minWidth: 1100,
            borderCollapse: "collapse",
          }}
        >
          <thead
            style={{
              background: "#f9fafb",
            }}
          >
            <tr>
              <th style={thStyle}>Symbol</th>
              <th style={thStyle}>Name</th>
              <th style={thStyleRight}>Price</th>
              <th style={thStyleRight}>Chg %</th>
              <th style={thStyleRight}>Asymmetry</th>
              <th style={thStyleRight}>Quality</th>
              <th style={thStyleCenter}>Stage</th>
              <th style={thStyleCenter}>Action</th>
            </tr>
          </thead>

          <tbody>
            {sortedRows.map((row) => {
              const asymmetryPill = scorePillStyle(row.asymmetryColor);
              const actionPill = actionPillStyle(row.actionColor);
              const stagePill = stagePillStyle(row.stage);
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
                    <div
                      style={{
                        fontSize: 12,
                        color: "#6b7280",
                        marginTop: 4,
                      }}
                    >
                      {getInterestingText(row)}
                    </div>
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

                  <td style={tdStyleRight}>
                    <span
                      style={{
                        ...asymmetryPill,
                        display: "inline-block",
                        minWidth: 52,
                        textAlign: "center",
                        padding: "6px 10px",
                        borderRadius: 999,
                        fontWeight: 700,
                        fontSize: 13,
                      }}
                    >
                      {row.asymmetryScore ?? "—"}
                    </span>
                  </td>

                  <td style={tdStyleRight}>{row.qualityScore ?? "—"}</td>

                  <td style={tdStyleCenter}>
                    <span
                      style={{
                        ...stagePill,
                        display: "inline-block",
                        minWidth: 74,
                        textAlign: "center",
                        padding: "6px 10px",
                        borderRadius: 999,
                        fontWeight: 700,
                        fontSize: 13,
                      }}
                    >
                      {row.stage}
                    </span>
                  </td>

                  <td style={tdStyleCenter}>
                    <span
                      style={{
                        ...actionPill,
                        display: "inline-block",
                        minWidth: 64,
                        textAlign: "center",
                        padding: "6px 10px",
                        borderRadius: 999,
                        fontWeight: 700,
                        fontSize: 13,
                      }}
                    >
                      {row.actionLabel}
                    </span>
                  </td>
                </tr>
              );
            })}

            {!sortedRows.length && !isLoadingTop5 ? (
              <tr>
                <td
                  colSpan={8}
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
          <div style={{ marginBottom: 14 }}>
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
                color: "#6b7280",
                fontSize: 14,
                marginBottom: 10,
              }}
            >
              Driver view showing what is helping or hurting the setup
            </div>

            <div
              style={{
                fontSize: 14,
                color: "#374151",
                marginBottom: 10,
                fontWeight: 500,
              }}
            >
              Why this is interesting: {getInterestingText(selectedRow)}
            </div>

            <div
              style={{
                fontSize: 14,
                color: "#111827",
                marginBottom: 10,
                fontWeight: 600,
              }}
            >
              Asymmetry: {selectedRow.asymmetryScore}/100 • Quality: {selectedRow.qualityScore}/100 • Stage: {selectedRow.stage}
            </div>

            <div
              style={{
                fontSize: 14,
                color:
                  selectedRow.actionColor === "green"
                    ? "#166534"
                    : selectedRow.actionColor === "red"
                    ? "#b91c1c"
                    : "#92400e",
                marginBottom: 20,
                fontWeight: 700,
              }}
            >
              Action: {selectedRow.actionLabel} — {selectedRow.actionReason}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: 16,
            }}
          >
            {renderDriverSection(
              "Technical",
              selectedRow.drivers?.technical || []
            )}
            {renderDriverSection(
              "Fundamental Floor",
              selectedRow.drivers?.fundamental || []
            )}
            {renderDriverSection(
              "Sentiment",
              selectedRow.drivers?.sentiment || []
            )}
          </div>
        </>
      ) : null}
    </main>
  );
}

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

const thStyleCenter = {
  ...thStyle,
  textAlign: "center",
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

const tdStyleCenter = {
  ...tdStyle,
  textAlign: "center",
};

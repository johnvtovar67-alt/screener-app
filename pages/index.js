import { useEffect, useMemo, useState } from "react";
import {
  driverCardStyle,
  formatPct,
  formatPrice,
  scorePillStyle,
} from "../lib/formatters";

export default function HomePage() {
  const [rows, setRows] = useState([]);
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [isLoadingTop5, setIsLoadingTop5] = useState(true);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [sortMode, setSortMode] = useState("composite");
  const [under25Only, setUnder25Only] = useState(false);
  const [profitableOnly, setProfitableOnly] = useState(false);
  const [minScore, setMinScore] = useState(60);

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

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (under25Only && (row.price ?? 0) >= 25) return false;
      if (profitableOnly && (row.operatingMarginPct ?? 0) <= 0) return false;
      if ((row.compositeScore ?? 0) < minScore) return false;
      return true;
    });
  }, [rows, under25Only, profitableOnly, minScore]);

  const sortedRows = useMemo(() => {
    const list = [...filteredRows];

    list.sort((a, b) => {
      if (sortMode === "technical") {
        return (b.technicalScore ?? 0) - (a.technicalScore ?? 0);
      }
      if (sortMode === "fundamental") {
        return (b.fundamentalScore ?? 0) - (a.fundamentalScore ?? 0);
      }
      if (sortMode === "action") {
        const rank = { Buy: 3, Watch: 2, Avoid: 1 };
        const actionDiff =
          (rank[b.actionLabel] ?? 0) - (rank[a.actionLabel] ?? 0);
        if (actionDiff !== 0) return actionDiff;
      }
      return (b.compositeScore ?? 0) - (a.compositeScore ?? 0);
    });

    return list.slice(0, 5);
  }, [filteredRows, sortMode]);

  const selectedRow =
    rows.find((row) => row.symbol === selectedSymbol) || sortedRows[0];

  function getInterestingText(row) {
    if (!row) return "";

    const reasons = [];

    if ((row.technicalScore ?? 0) >= 80) reasons.push("strong technical trend");
    if ((row.fundamentalScore ?? 0) >= 80)
      reasons.push("high-quality fundamentals");
    if ((row.sentimentScore ?? 0) >= 70) reasons.push("supportive sentiment");
    if ((row.valuationScore ?? 0) >= 75) reasons.push("attractive valuation");
    if ((row.oneMonthPct ?? 0) >= 10) reasons.push("strong recent momentum");
    if ((row.epsGrowthPct ?? 0) >= 20) reasons.push("strong EPS growth");

    if (!reasons.length) {
      return "Balanced setup with supportive technical and fundamental inputs.";
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

  function sortButtonStyle(active) {
    return {
      padding: "10px 14px",
      borderRadius: 999,
      border: active ? "1px solid #111827" : "1px solid #d1d5db",
      background: active ? "#111827" : "#ffffff",
      color: active ? "#ffffff" : "#111827",
      fontSize: 14,
      cursor: "pointer",
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
        Auto Quant Screener
      </h1>

      <div
        style={{
          color: "#6b7280",
          fontSize: 14,
          marginBottom: 20,
        }}
      >
        V1 Final: broader opportunity engine + stronger scoring + Buy / Watch /
        Avoid actions.
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
          marginBottom: 12,
        }}
      >
        <button
          onClick={() => setSortMode("composite")}
          style={sortButtonStyle(sortMode === "composite")}
        >
          Sort: Composite
        </button>

        <button
          onClick={() => setSortMode("technical")}
          style={sortButtonStyle(sortMode === "technical")}
        >
          Sort: Technical
        </button>

        <button
          onClick={() => setSortMode("fundamental")}
          style={sortButtonStyle(sortMode === "fundamental")}
        >
          Sort: Fundamental
        </button>

        <button
          onClick={() => setSortMode("action")}
          style={sortButtonStyle(sortMode === "action")}
        >
          Sort: Action
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
          Universe matches: {filteredRows.length}
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
            minWidth: 900,
            borderCollapse: "collapse",
          }}
        >
          <thead
            style={{
              background: "#f9fafb",
            }}
          >
            <tr>
              <th
                style={{
                  textAlign: "left",
                  padding: "14px 16px",
                  fontSize: 13,
                  color: "#6b7280",
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                Symbol
              </th>
              <th
                style={{
                  textAlign: "left",
                  padding: "14px 16px",
                  fontSize: 13,
                  color: "#6b7280",
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                Name
              </th>
              <th
                style={{
                  textAlign: "right",
                  padding: "14px 16px",
                  fontSize: 13,
                  color: "#6b7280",
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                Price
              </th>
              <th
                style={{
                  textAlign: "right",
                  padding: "14px 16px",
                  fontSize: 13,
                  color: "#6b7280",
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                Chg %
              </th>
              <th
                style={{
                  textAlign: "right",
                  padding: "14px 16px",
                  fontSize: 13,
                  color: "#6b7280",
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                Composite
              </th>
              <th
                style={{
                  textAlign: "center",
                  padding: "14px 16px",
                  fontSize: 13,
                  color: "#6b7280",
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                Action
              </th>
            </tr>
          </thead>

          <tbody>
            {sortedRows.map((row) => {
              const scorePill = scorePillStyle(row.compositeColor);
              const actionPill = actionPillStyle(row.actionColor);
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
                  <td
                    style={{
                      padding: "14px 16px",
                      borderBottom: "1px solid #f3f4f6",
                      fontWeight: 700,
                    }}
                  >
                    {row.symbol}
                  </td>

                  <td
                    style={{
                      padding: "14px 16px",
                      borderBottom: "1px solid #f3f4f6",
                    }}
                  >
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

                  <td
                    style={{
                      padding: "14px 16px",
                      borderBottom: "1px solid #f3f4f6",
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatPrice(row.price)}
                  </td>

                  <td
                    style={{
                      padding: "14px 16px",
                      borderBottom: "1px solid #f3f4f6",
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
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

                  <td
                    style={{
                      padding: "14px 16px",
                      borderBottom: "1px solid #f3f4f6",
                      textAlign: "right",
                    }}
                  >
                    <span
                      style={{
                        ...scorePill,
                        display: "inline-block",
                        minWidth: 52,
                        textAlign: "center",
                        padding: "6px 10px",
                        borderRadius: 999,
                        fontWeight: 700,
                        fontSize: 13,
                      }}
                    >
                      {row.compositeScore ?? "—"}
                    </span>
                  </td>

                  <td
                    style={{
                      padding: "14px 16px",
                      borderBottom: "1px solid #f3f4f6",
                      textAlign: "center",
                    }}
                  >
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
          <div
            style={{
              marginBottom: 14,
            }}
          >
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
              Driver view showing what is helping or hurting the composite score
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
              "Fundamental",
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

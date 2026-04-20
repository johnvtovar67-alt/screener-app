import { useEffect, useMemo, useState } from "react";

const STARTING_SYMBOLS = ["ASO", "CROX", "FIX", "GCT", "MSTR", "VIST", "SCHW"];

function formatPrice(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `$${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPct(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${Number(value).toFixed(2)}%`;
}

function scorePillStyle(color) {
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

function driverCardStyle(color) {
  if (color === "green") {
    return {
      background: "#f0fdf4",
      border: "1px solid #bbf7d0",
    };
  }

  if (color === "red") {
    return {
      background: "#fef2f2",
      border: "1px solid #fecaca",
    };
  }

  return {
    background: "#fffbeb",
    border: "1px solid #fde68a",
  };
}

export default function HomePage() {
  const [rows, setRows] = useState(
    STARTING_SYMBOLS.map((symbol) => ({
      symbol,
      name: "",
      price: null,
      dayChangePct: null,
      compositeScore: null,
      compositeColor: "yellow",
      drivers: {
        technical: [],
        fundamental: [],
        sentiment: [],
      },
    }))
  );
  const [selectedSymbol, setSelectedSymbol] = useState(STARTING_SYMBOLS[0]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("");

  async function fetchSymbol(symbol) {
    const response = await fetch(`/api/live?symbol=${encodeURIComponent(symbol)}`, {
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Failed for ${symbol}`);
    }

    return data;
  }

  async function refreshAll() {
    setIsRefreshing(true);
    setError("");

    try {
      const results = await Promise.allSettled(
        rows.map((row) => fetchSymbol(row.symbol))
      );

      const nextRows = rows.map((row, index) => {
        const result = results[index];

        if (result.status === "fulfilled") {
          return {
            symbol: result.value.symbol,
            name: result.value.name || result.value.symbol,
            price: result.value.price ?? null,
            dayChangePct: result.value.dayChangePct ?? null,
            compositeScore: result.value.compositeScore ?? null,
            compositeColor: result.value.compositeColor || "yellow",
            drivers: result.value.drivers || {
              technical: [],
              fundamental: [],
              sentiment: [],
            },
          };
        }

        return row;
      });

      setRows(nextRows);
      setLastUpdated(
        new Date().toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    } catch (err) {
      setError("Refresh failed");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleAddTicker() {
    setError("");

    const symbol = query.trim().toUpperCase();
    if (!symbol) return;

    try {
      const existing = rows.some((row) => row.symbol === symbol);

      if (existing) {
        setSelectedSymbol(symbol);
        setQuery("");
        return;
      }

      const data = await fetchSymbol(symbol);

      setRows((prev) => [
        {
          symbol: data.symbol,
          name: data.name || data.symbol,
          price: data.price ?? null,
          dayChangePct: data.dayChangePct ?? null,
          compositeScore: data.compositeScore ?? null,
          compositeColor: data.compositeColor || "yellow",
          drivers: data.drivers || {
            technical: [],
            fundamental: [],
            sentiment: [],
          },
        },
        ...prev,
      ]);

      setSelectedSymbol(data.symbol);
      setQuery("");
      setLastUpdated(
        new Date().toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    } catch (err) {
      setError(err.message || "No match found");
    }
  }

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const aScore = a.compositeScore ?? -Infinity;
      const bScore = b.compositeScore ?? -Infinity;
      return bScore - aScore;
    });
  }, [rows]);

  const selectedRow =
    sortedRows.find((row) => row.symbol === selectedSymbol) || sortedRows[0];

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
          marginBottom: 20,
        }}
      >
        Auto Quant Screener
      </h1>

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
            if (e.key === "Enter") handleAddTicker();
          }}
          placeholder="Add ticker..."
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
          onClick={handleAddTicker}
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
          Add Ticker
        </button>

        <button
          onClick={refreshAll}
          disabled={isRefreshing}
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
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 18,
          color: "#6b7280",
          fontSize: 13,
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div>Manual refresh only to protect API credits</div>
        <div>Last updated: {lastUpdated || "—"}</div>
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
            minWidth: 760,
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
            </tr>
          </thead>

          <tbody>
            {sortedRows.map((row) => {
              const pill = scorePillStyle(row.compositeColor);
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
                    {row.name || row.symbol}
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
                        ...pill,
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedRow ? (
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
              marginBottom: 20,
            }}
          >
            Driver view showing what is helping or hurting the composite score
          </div>
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 16,
        }}
      >
        {selectedRow ? renderDriverSection("Technical", selectedRow.drivers?.technical || []) : null}
        {selectedRow ? renderDriverSection("Fundamental", selectedRow.drivers?.fundamental || []) : null}
        {selectedRow ? renderDriverSection("Sentiment", selectedRow.drivers?.sentiment || []) : null}
      </div>
    </main>
  );
}

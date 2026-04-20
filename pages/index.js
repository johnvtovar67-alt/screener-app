import { useEffect, useMemo, useRef, useState } from "react";

const STARTING_SYMBOLS = ["ASO", "CROX", "FIX", "GCT", "MSTR", "VIST", "SCHW"];

const AUTO_REFRESH_MS = 5 * 60 * 1000;
const MARKET_TIMEZONE = "America/New_York";

function getEasternParts() {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date());
  const map = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }

  return {
    weekday: map.weekday,
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

function isMarketOpenNow() {
  const { weekday, hour, minute } = getEasternParts();

  if (weekday === "Sat" || weekday === "Sun") {
    return false;
  }

  const totalMinutes = hour * 60 + minute;
  const openMinutes = 9 * 60 + 30;
  const closeMinutes = 16 * 60;

  return totalMinutes >= openMinutes && totalMinutes < closeMinutes;
}

function formatTimestamp(date = new Date()) {
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

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

function formatRatio(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${Number(value).toFixed(2)}x`;
}

function formatScore(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return String(Math.round(value));
}

function scoreColor(score) {
  if (score === null || score === undefined || Number.isNaN(score)) {
    return "#6b7280";
  }
  if (score >= 75) return "#166534";
  if (score >= 60) return "#1d4ed8";
  if (score >= 45) return "#92400e";
  return "#b91c1c";
}

function pctColor(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "#111827";
  }
  if (value > 0) return "#166534";
  if (value < 0) return "#b91c1c";
  return "#111827";
}

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState(
    STARTING_SYMBOLS.map((symbol) => ({
      symbol,
      name: "",
      exchange: "",
      price: null,
      analytics: {
        oneDayPct: null,
        oneMonthPct: null,
        threeMonthPct: null,
        vsSma20Pct: null,
        relativeVolume: null,
        volatility20: null,
        technicalScore: null,
        fundamentalScore: null,
        compositeScore: null,
      },
    }))
  );
  const [error, setError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("");
  const [marketStatus, setMarketStatus] = useState(isMarketOpenNow() ? "OPEN" : "CLOSED");
  const [sortKey, setSortKey] = useState("compositeScore");
  const [sortDir, setSortDir] = useState("desc");

  const lastRefreshRef = useRef(0);
  const refreshInFlightRef = useRef(false);

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

  async function refreshSymbols(symbolsToRefresh, options = {}) {
    const { force = false } = options;

    if (refreshInFlightRef.current) return;

    const marketOpen = isMarketOpenNow();
    setMarketStatus(marketOpen ? "OPEN" : "CLOSED");

    if (!force && !marketOpen) {
      return;
    }

    refreshInFlightRef.current = true;
    setIsRefreshing(true);
    setError("");

    try {
      const results = await Promise.allSettled(
        symbolsToRefresh.map((symbol) => fetchSymbol(symbol))
      );

      setRows((prev) => {
        const bySymbol = new Map(prev.map((row) => [row.symbol, row]));

        results.forEach((result, index) => {
          const symbol = symbolsToRefresh[index];

          if (result.status === "fulfilled") {
            const data = result.value;
            bySymbol.set(symbol, {
              symbol: data.symbol,
              name: data.name || data.symbol,
              exchange: data.exchange || "",
              price: data.price,
              analytics: {
                oneDayPct: data.analytics?.oneDayPct ?? null,
                oneMonthPct: data.analytics?.oneMonthPct ?? null,
                threeMonthPct: data.analytics?.threeMonthPct ?? null,
                vsSma20Pct: data.analytics?.vsSma20Pct ?? null,
                relativeVolume: data.analytics?.relativeVolume ?? null,
                volatility20: data.analytics?.volatility20 ?? null,
                technicalScore: data.analytics?.technicalScore ?? null,
                fundamentalScore: data.analytics?.fundamentalScore ?? null,
                compositeScore: data.analytics?.compositeScore ?? null,
              },
            });
          } else if (!bySymbol.has(symbol)) {
            bySymbol.set(symbol, {
              symbol,
              name: symbol,
              exchange: "",
              price: null,
              analytics: {},
            });
          }
        });

        return Array.from(bySymbol.values());
      });

      lastRefreshRef.current = Date.now();
      setLastUpdated(formatTimestamp());
    } catch (err) {
      setError("Refresh failed");
    } finally {
      refreshInFlightRef.current = false;
      setIsRefreshing(false);
    }
  }

  async function refreshAll(force = false) {
    const symbols = rows.map((row) => row.symbol);
    await refreshSymbols(symbols, { force });
  }

  async function handleSearch() {
    setError("");

    const symbol = query.trim().toUpperCase();
    if (!symbol) return;

    try {
      const exists = rows.some((row) => row.symbol === symbol);

      if (exists) {
        await refreshSymbols([symbol], { force: true });
      } else {
        const data = await fetchSymbol(symbol);

        setRows((prev) => [
          {
            symbol: data.symbol,
            name: data.name || data.symbol,
            exchange: data.exchange || "",
            price: data.price,
            analytics: {
              oneDayPct: data.analytics?.oneDayPct ?? null,
              oneMonthPct: data.analytics?.oneMonthPct ?? null,
              threeMonthPct: data.analytics?.threeMonthPct ?? null,
              vsSma20Pct: data.analytics?.vsSma20Pct ?? null,
              relativeVolume: data.analytics?.relativeVolume ?? null,
              volatility20: data.analytics?.volatility20 ?? null,
              technicalScore: data.analytics?.technicalScore ?? null,
              fundamentalScore: data.analytics?.fundamentalScore ?? null,
              compositeScore: data.analytics?.compositeScore ?? null,
            },
          },
          ...prev,
        ]);
        setLastUpdated(formatTimestamp());
      }

      setQuery("");
    } catch (err) {
      setError(err.message || "No match found");
    }
  }

  useEffect(() => {
    refreshAll(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const open = isMarketOpenNow();
      setMarketStatus(open ? "OPEN" : "CLOSED");

      if (!open) return;

      const now = Date.now();
      if (now - lastRefreshRef.current >= AUTO_REFRESH_MS) {
        refreshAll(false);
      }
    }, 60000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  function handleSort(nextKey) {
    if (sortKey === nextKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDir("desc");
  }

  const sortedRows = useMemo(() => {
    const list = [...rows];

    list.sort((a, b) => {
      const getValue = (row) => {
        switch (sortKey) {
          case "symbol":
            return row.symbol || "";
          case "name":
            return row.name || "";
          case "price":
            return row.price ?? -Infinity;
          case "oneDayPct":
            return row.analytics?.oneDayPct ?? -Infinity;
          case "oneMonthPct":
            return row.analytics?.oneMonthPct ?? -Infinity;
          case "threeMonthPct":
            return row.analytics?.threeMonthPct ?? -Infinity;
          case "vsSma20Pct":
            return row.analytics?.vsSma20Pct ?? -Infinity;
          case "relativeVolume":
            return row.analytics?.relativeVolume ?? -Infinity;
          case "technicalScore":
            return row.analytics?.technicalScore ?? -Infinity;
          case "compositeScore":
            return row.analytics?.compositeScore ?? -Infinity;
          default:
            return row.analytics?.compositeScore ?? -Infinity;
        }
      };

      const aVal = getValue(a);
      const bVal = getValue(b);

      if (typeof aVal === "string" || typeof bVal === "string") {
        const compare = String(aVal).localeCompare(String(bVal));
        return sortDir === "asc" ? compare : -compare;
      }

      const compare = (aVal ?? -Infinity) - (bVal ?? -Infinity);
      return sortDir === "asc" ? compare : -compare;
    });

    return list;
  }, [rows, sortKey, sortDir]);

  const statusColor = marketStatus === "OPEN" ? "#166534" : "#991b1b";

  return (
    <main
      style={{
        maxWidth: 1400,
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
          marginBottom: 8,
        }}
      >
        Auto Quant Screener
      </h1>

      <div
        style={{
          color: "#4b5563",
          fontSize: 14,
          marginBottom: 20,
        }}
      >
        Composite score is currently driven by technical factors: 1M momentum, 3M momentum,
        trend vs 20-day average, relative volume, and a volatility penalty.
      </div>

      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSearch();
          }}
          placeholder="Add ticker..."
          style={{
            flex: "1 1 320px",
            minWidth: 260,
            padding: "12px 14px",
            border: "1px solid #d1d5db",
            borderRadius: 10,
            fontSize: 16,
          }}
        />

        <button
          onClick={handleSearch}
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
          Add / Refresh Ticker
        </button>

        <button
          onClick={() => refreshAll(true)}
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
          {isRefreshing ? "Refreshing..." : "Refresh All"}
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
        <div>Auto-refresh every 5 minutes during market hours only</div>

        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div>
            Market:{" "}
            <span
              style={{
                fontWeight: 700,
                color: statusColor,
              }}
            >
              {marketStatus}
            </span>
          </div>
          <div>Last updated: {lastUpdated || "—"}</div>
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
        }}
      >
        <table
          style={{
            width: "100%",
            minWidth: 1200,
            borderCollapse: "collapse",
          }}
        >
          <thead
            style={{
              background: "#f9fafb",
            }}
          >
            <tr>
              {[
                ["symbol", "Ticker"],
                ["name", "Name"],
                ["price", "Price"],
                ["oneDayPct", "1D %"],
                ["oneMonthPct", "1M %"],
                ["threeMonthPct", "3M %"],
                ["vsSma20Pct", "Vs SMA20"],
                ["relativeVolume", "Rel Vol"],
                ["technicalScore", "Tech"],
                ["compositeScore", "Composite"],
              ].map(([key, label]) => (
                <th
                  key={key}
                  onClick={() => handleSort(key)}
                  style={{
                    textAlign: key === "price" || key.includes("Pct") || key.includes("Score") || key === "relativeVolume"
                      ? "right"
                      : "left",
                    padding: "14px 16px",
                    fontSize: 13,
                    color: "#6b7280",
                    borderBottom: "1px solid #e5e7eb",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {label}
                  {sortKey === key ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {sortedRows.map((row) => (
              <tr key={row.symbol}>
                <td
                  style={{
                    padding: "14px 16px",
                    borderBottom: "1px solid #f3f4f6",
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.symbol}
                </td>

                <td
                  style={{
                    padding: "14px 16px",
                    borderBottom: "1px solid #f3f4f6",
                    minWidth: 220,
                  }}
                >
                  <div style={{ fontWeight: 500 }}>{row.name || row.symbol}</div>
                  <div style={{ color: "#6b7280", fontSize: 12 }}>
                    {row.exchange || "—"}
                  </div>
                </td>

                <td
                  style={{
                    padding: "14px 16px",
                    borderBottom: "1px solid #f3f4f6",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatPrice(row.price)}
                </td>

                <td
                  style={{
                    padding: "14px 16px",
                    borderBottom: "1px solid #f3f4f6",
                    textAlign: "right",
                    color: pctColor(row.analytics?.oneDayPct),
                    fontVariantNumeric: "tabular-nums",
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatPct(row.analytics?.oneDayPct)}
                </td>

                <td
                  style={{
                    padding: "14px 16px",
                    borderBottom: "1px solid #f3f4f6",
                    textAlign: "right",
                    color: pctColor(row.analytics?.oneMonthPct),
                    fontVariantNumeric: "tabular-nums",
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatPct(row.analytics?.oneMonthPct)}
                </td>

                <td
                  style={{
                    padding: "14px 16px",
                    borderBottom: "1px solid #f3f4f6",
                    textAlign: "right",
                    color: pctColor(row.analytics?.threeMonthPct),
                    fontVariantNumeric: "tabular-nums",
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatPct(row.analytics?.threeMonthPct)}
                </td>

                <td
                  style={{
                    padding: "14px 16px",
                    borderBottom: "1px solid #f3f4f6",
                    textAlign: "right",
                    color: pctColor(row.analytics?.vsSma20Pct),
                    fontVariantNumeric: "tabular-nums",
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatPct(row.analytics?.vsSma20Pct)}
                </td>

                <td
                  style={{
                    padding: "14px 16px",
                    borderBottom: "1px solid #f3f4f6",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatRatio(row.analytics?.relativeVolume)}
                </td>

                <td
                  style={{
                    padding: "14px 16px",
                    borderBottom: "1px solid #f3f4f6",
                    textAlign: "right",
                    color: scoreColor(row.analytics?.technicalScore),
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatScore(row.analytics?.technicalScore)}
                </td>

                <td
                  style={{
                    padding: "14px 16px",
                    borderBottom: "1px solid #f3f4f6",
                    textAlign: "right",
                    color: scoreColor(row.analytics?.compositeScore),
                    fontWeight: 800,
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatScore(row.analytics?.compositeScore)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

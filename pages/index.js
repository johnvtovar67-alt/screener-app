import { useEffect, useMemo, useRef, useState } from "react";

const SYMBOL_NAMES = {
  AAPL: "Apple",
  ASO: "Academy Sports",
  CROX: "Crocs",
  FIX: "Comfort Systems",
  GCT: "GigaCloud",
  MSTR: "Strategy",
  MSFT: "Microsoft",
  NVDA: "NVIDIA",
  PLTR: "Palantir",
  QQQ: "Invesco QQQ Trust",
  SHOP: "Shopify",
  SPY: "SPDR S&P 500 ETF",
  TSLA: "Tesla",
  VIST: "Vista Energy",
};

const STARTING_ROWS = [
  { symbol: "ASO", name: "Academy Sports", price: null },
  { symbol: "CROX", name: "Crocs", price: null },
  { symbol: "FIX", name: "Comfort Systems", price: null },
  { symbol: "GCT", name: "GigaCloud", price: null },
  { symbol: "MSTR", name: "Strategy", price: null },
  { symbol: "VIST", name: "Vista Energy", price: null },
];

const AUTO_REFRESH_MS = 5 * 60 * 1000; // 5 minutes
const MARKET_TIMEZONE = "America/New_York";

function getEasternParts() {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
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
    second: Number(map.second),
  };
}

function isMarketOpenNow() {
  const { weekday, hour, minute } = getEasternParts();

  if (weekday === "Sat" || weekday === "Sun") {
    return false;
  }

  const totalMinutes = hour * 60 + minute;
  const openMinutes = 9 * 60 + 30; // 9:30 AM ET
  const closeMinutes = 16 * 60; // 4:00 PM ET

  return totalMinutes >= openMinutes && totalMinutes < closeMinutes;
}

function getMarketStatusLabel() {
  return isMarketOpenNow() ? "OPEN" : "CLOSED";
}

function formatTimestamp(date = new Date()) {
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState(STARTING_ROWS);
  const [error, setError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("");
  const [marketStatus, setMarketStatus] = useState(getMarketStatusLabel());

  const lastRefreshRef = useRef(0);
  const refreshInFlightRef = useRef(false);

  async function fetchPrice(symbol) {
    const response = await fetch(
      `/api/live?symbol=${encodeURIComponent(symbol)}`,
      { cache: "no-store" }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Failed for ${symbol}`);
    }

    return data;
  }

  async function refreshAll(force = false) {
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
      const currentRows = [...rows];

      const results = await Promise.allSettled(
        currentRows.map((row) => fetchPrice(row.symbol))
      );

      setRows((prev) =>
        prev.map((row, index) => {
          const result = results[index];

          if (result && result.status === "fulfilled") {
            return {
              ...row,
              price: result.value.price,
            };
          }

          return row;
        })
      );

      lastRefreshRef.current = Date.now();
      setLastUpdated(formatTimestamp());
    } catch (error) {
      setError("Refresh failed");
    } finally {
      refreshInFlightRef.current = false;
      setIsRefreshing(false);
    }
  }

  async function handleSearch() {
    setError("");

    const symbol = query.trim().toUpperCase();

    if (!symbol) return;

    try {
      const data = await fetchPrice(symbol);

      setRows((prev) => {
        const exists = prev.some((row) => row.symbol === data.symbol);

        if (exists) {
          return prev.map((row) =>
            row.symbol === data.symbol
              ? { ...row, price: data.price }
              : row
          );
        }

        return [
          {
            symbol: data.symbol,
            name: SYMBOL_NAMES[data.symbol] || "Added ticker",
            price: data.price,
          },
          ...prev,
        ];
      });

      setQuery("");
      setLastUpdated(formatTimestamp());
    } catch (error) {
      setError(error.message || "No match found");
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
      const enoughTimePassed =
        now - lastRefreshRef.current >= AUTO_REFRESH_MS;

      if (enoughTimePassed) {
        refreshAll(false);
      }
    }, 60000); // check every minute

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const statusColor = useMemo(() => {
    return marketStatus === "OPEN" ? "#166534" : "#991b1b";
  }, [marketStatus]);

  function formatPrice(price) {
    if (price === null || price === undefined || Number.isNaN(price)) {
      return "—";
    }

    return `$${Number(price).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  return (
    <main
      style={{
        maxWidth: 1100,
        margin: "40px auto",
        padding: "0 20px",
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <h1
        style={{
          fontSize: 40,
          fontWeight: 700,
          marginBottom: 24,
        }}
      >
        Auto Quant Screener
      </h1>

      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 10,
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
          placeholder="Search ticker..."
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
          Search
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
        <div>
          Auto-refresh every 5 minutes during market hours only
        </div>

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
          overflow: "hidden",
          background: "#ffffff",
        }}
      >
        <table
          style={{
            width: "100%",
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
                Ticker
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
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr key={row.symbol}>
                <td
                  style={{
                    padding: "14px 16px",
                    borderBottom: "1px solid #f3f4f6",
                    fontWeight: 600,
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
                  {row.name}
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

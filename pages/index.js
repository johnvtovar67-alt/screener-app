import { useEffect, useState } from "react";

const STARTING_ROWS = [
  { symbol: "ASO", name: "Academy Sports", price: null },
  { symbol: "CROX", name: "Crocs", price: null },
  { symbol: "FIX", name: "Comfort Systems", price: null },
  { symbol: "GCT", name: "GigaCloud", price: null },
  { symbol: "MSTR", name: "Strategy", price: null },
  { symbol: "VIST", name: "Vista Energy", price: null },
];

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState(STARTING_ROWS);
  const [error, setError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("");

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

  async function refreshAll() {
    setIsRefreshing(true);
    setError("");

    try {
      const results = await Promise.allSettled(
        rows.map((row) => fetchPrice(row.symbol))
      );

      setRows((prev) =>
        prev.map((row, index) => {
          const result = results[index];

          if (result.status === "fulfilled") {
            return {
              ...row,
              price: result.value.price,
            };
          }

          return row;
        })
      );

      setLastUpdated(
        new Date().toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    } catch (error) {
      setError("Refresh failed");
    } finally {
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
          { symbol: data.symbol, name: data.symbol, price: data.price },
          ...prev,
        ];
      });

      setQuery("");

      setLastUpdated(
        new Date().toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    } catch (error) {
      setError(error.message || "No match found");
    }
  }

  useEffect(() => {
    refreshAll();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      refreshAll();
    }, 15000);

    return () => clearInterval(interval);
  }, [rows.length]);

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
        <div>Live data refreshing every 15 seconds</div>
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

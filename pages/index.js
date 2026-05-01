import { useEffect, useMemo, useState } from "react";

const READINESS_ORDER = {
  "Trade Ready": 1,
  "Watch Closely": 2,
  "Setup Only": 3,
};

const ACTION_COLORS = {
  "Add / Buy": "#16a34a",
  "Hold": "#2563eb",
  "Hold / Add": "#16a34a",
  "Trim": "#d97706",
  "Exit / Avoid": "#dc2626",
  "Watch": "#d97706",
  "Setup Only": "#64748b",
  "Not analyzed": "#64748b",
};

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function money(value) {
  const n = safeNumber(value, null);
  if (n === null) return "—";
  return `$${n.toFixed(2)}`;
}

function percent(value) {
  const n = safeNumber(value, null);
  if (n === null) return "—";
  return `${n.toFixed(1)}%`;
}

function titleCaseLabel(value) {
  const raw =
    typeof value === "object" && value !== null ? value.label : value;

  const text = String(raw || "").trim().toUpperCase();

  if (text === "TRADE READY") return "Trade Ready";
  if (text === "WATCH CLOSELY") return "Watch Closely";
  if (text === "SETUP ONLY") return "Setup Only";
  if (text === "STRONG BUY") return "Strong Buy";
  if (text === "BUY") return "Buy";
  if (text === "WATCH") return "Watch";
  if (text === "AVOID") return "Avoid";

  return raw || "—";
}

function getSymbol(row) {
  return row?.symbol || row?.ticker || row?.profile?.symbol || "";
}

function getName(row) {
  return (
    row?.name ||
    row?.companyName ||
    row?.profile?.companyName ||
    row?.profile?.name ||
    getSymbol(row)
  );
}

function getPrice(row) {
  return (
    row?.price ??
    row?.quote?.price ??
    row?.quote?.c ??
    row?.technicalSnapshot?.price ??
    row?.profile?.price
  );
}

function getChange(row) {
  return (
    row?.changePercent ??
    row?.changesPercentage ??
    row?.quote?.changesPercentage ??
    row?.quote?.dp ??
    row?.technicalSnapshot?.changePercent ??
    row?.dayChangePct
  );
}

function getComposite(row) {
  return safeNumber(
    row?.compositeScore ??
      row?.score ??
      row?.overallScore ??
      row?.recommendation?.score,
    0
  );
}

function getHeat(row) {
  if (row?.heatScore !== undefined && row?.heatScore !== null) {
    return row.heatScore;
  }

  if (
    row?.technicalSnapshot?.heatScore !== undefined &&
    row?.technicalSnapshot?.heatScore !== null
  ) {
    return row.technicalSnapshot.heatScore;
  }

  if (
    row?.recommendation?.heatScore !== undefined &&
    row?.recommendation?.heatScore !== null
  ) {
    return row.recommendation.heatScore;
  }

  if (
    row?.tradeReadiness?.heatScore !== undefined &&
    row?.tradeReadiness?.heatScore !== null
  ) {
    return row.tradeReadiness.heatScore;
  }

  return 0;
}

function getHeatForDecision(row) {
  const heat = safeNumber(getHeat(row), 0);
  return heat <= 5 ? heat * 20 : heat;
}

function getReadiness(row) {
  return titleCaseLabel(
    row?.tradeReadiness?.label ||
      row?.tradeReadiness ||
      row?.recommendation?.tradeReadiness?.label ||
      row?.recommendation?.tradeReadiness ||
      row?.technicalSnapshot?.tradeReadiness?.label ||
      row?.technicalSnapshot?.tradeReadiness ||
      "Setup Only"
  );
}

function getRecommendation(row) {
  return titleCaseLabel(
    row?.rating ||
      row?.recommendation?.rating ||
      row?.recommendation?.label ||
      row?.action ||
      "Watch"
  );
}

function getPortfolioAction(row, owned = false) {
  const readiness = getReadiness(row);
  const composite = getComposite(row);
  const heat = getHeatForDecision(row);

  if (!owned) {
    if (readiness === "Trade Ready" && composite >= 70) return "Add / Buy";
    if (readiness === "Watch Closely") return "Watch";
    return "Setup Only";
  }

  if (composite < 45 || heat < 35) return "Exit / Avoid";
  if (composite < 58) return "Trim";
  if (readiness === "Trade Ready" && composite >= 70) return "Hold / Add";
  return "Hold";
}

function readinessBadgeColor(readiness) {
  if (readiness === "Trade Ready") return "#16a34a";
  if (readiness === "Watch Closely") return "#d97706";
  return "#64748b";
}

function sortIdeas(a, b) {
  const ar = READINESS_ORDER[getReadiness(a)] || 99;
  const br = READINESS_ORDER[getReadiness(b)] || 99;

  if (ar !== br) return ar - br;

  const heatDiff = getHeatForDecision(b) - getHeatForDecision(a);
  if (heatDiff !== 0) return heatDiff;

  return getComposite(b) - getComposite(a);
}

function extractRows(data) {
  if (Array.isArray(data)) return data;

  return (
    data?.stocks ||
    data?.results ||
    data?.ideas ||
    data?.top5 ||
    data?.top10 ||
    data?.data ||
    []
  );
}

export default function Home() {
  const [ideas, setIdeas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [error, setError] = useState("");

  const [symbolInput, setSymbolInput] = useState("");
  const [sharesInput, setSharesInput] = useState("");
  const [avgCostInput, setAvgCostInput] = useState("");

  const [snapInput, setSnapInput] = useState("");
  const [snapResult, setSnapResult] = useState(null);
  const [snapLoading, setSnapLoading] = useState(false);

  const [portfolio, setPortfolio] = useState([]);
  const [portfolioAnalysis, setPortfolioAnalysis] = useState([]);

  useEffect(() => {
    const saved = localStorage.getItem("stockScreenerPortfolio");

    if (saved) {
      try {
        setPortfolio(JSON.parse(saved));
      } catch {
        setPortfolio([]);
      }
    }

    loadTopIdeas();
  }, []);

  useEffect(() => {
    localStorage.setItem("stockScreenerPortfolio", JSON.stringify(portfolio));
  }, [portfolio]);

  async function loadTopIdeas() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/top5");
      const data = await res.json();
      const rows = extractRows(data);

      setIdeas(rows.sort(sortIdeas).slice(0, 10));
    } catch (err) {
      console.error(err);
      setError("Could not load Top 10 ideas.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchOneSymbol(symbol) {
    const clean = symbol.trim().toUpperCase();
    if (!clean) return null;

    const urls = [
      `/api?symbol=${encodeURIComponent(clean)}`,
      `/api?ticker=${encodeURIComponent(clean)}`,
      `/api/top5?symbol=${encodeURIComponent(clean)}`,
    ];

    for (const url of urls) {
      try {
        const res = await fetch(url);
        const data = await res.json();

        if (data?.error) continue;

        if (Array.isArray(data)) {
          const found = data.find(
            (x) => getSymbol(x).toUpperCase() === clean
          );
          if (found) return found;
        }

        if (data?.symbol || data?.ticker || data?.recommendation) return data;

        const rows = extractRows(data);

        const found = rows.find((x) => getSymbol(x).toUpperCase() === clean);
        if (found) return found;
      } catch {
        // Try next endpoint
      }
    }

    const foundExisting = ideas.find(
      (x) => getSymbol(x).toUpperCase() === clean
    );

    return foundExisting || null;
  }

  async function runSnapQuote() {
    const clean = snapInput.trim().toUpperCase();
    if (!clean) return;

    setSnapLoading(true);
    setSnapResult(null);

    try {
      const result = await fetchOneSymbol(clean);
      setSnapResult(result || { symbol: clean, error: true });
    } finally {
      setSnapLoading(false);
    }
  }

  function addPortfolioPosition() {
    const symbol = symbolInput.trim().toUpperCase();
    const shares = safeNumber(sharesInput, 0);
    const avgCost = safeNumber(avgCostInput, 0);

    if (!symbol || shares <= 0) return;

    setPortfolio((prev) => {
      const existing = prev.find((p) => p.symbol === symbol);

      if (existing) {
        const existingShares = safeNumber(existing.shares, 0);
        const existingCost = safeNumber(existing.avgCost, 0);
        const newTotalShares = existingShares + shares;

        const blendedCost =
          existingCost > 0 && avgCost > 0
            ? (existingShares * existingCost + shares * avgCost) /
              newTotalShares
            : avgCost > 0
            ? avgCost
            : existingCost;

        return prev.map((p) =>
          p.symbol === symbol
            ? {
                ...p,
                shares: newTotalShares,
                avgCost: blendedCost,
              }
            : p
        );
      }

      return [...prev, { symbol, shares, avgCost }];
    });

    setSymbolInput("");
    setSharesInput("");
    setAvgCostInput("");
  }

  function removePortfolioPosition(symbol) {
    setPortfolio((prev) => prev.filter((p) => p.symbol !== symbol));
    setPortfolioAnalysis((prev) =>
      prev.filter((p) => getSymbol(p).toUpperCase() !== symbol)
    );
  }

  async function analyzePortfolio() {
    if (portfolio.length === 0) return;

    setPortfolioLoading(true);

    try {
      const results = [];

      for (const position of portfolio) {
        const analysis = await fetchOneSymbol(position.symbol);

        if (analysis) {
          results.push({
            ...analysis,
            ownedShares: position.shares,
            avgCost: position.avgCost,
          });
        } else {
          results.push({
            symbol: position.symbol,
            ownedShares: position.shares,
            avgCost: position.avgCost,
            missing: true,
          });
        }
      }

      setPortfolioAnalysis(results.sort(sortIdeas));
    } finally {
      setPortfolioLoading(false);
    }
  }

  const top10 = useMemo(() => {
    return [...ideas].sort(sortIdeas).slice(0, 10);
  }, [ideas]);

  return (
    <main style={styles.page}>
      <section style={styles.header}>
        <div>
          <h1 style={styles.title}>Stock Screener</h1>
          <p style={styles.subtitle}>
            Top ideas ranked by trade readiness, heat score, and overall setup
            quality.
          </p>
        </div>

        <button onClick={loadTopIdeas} style={styles.primaryButton}>
          Refresh Top 10
        </button>
      </section>

      {error && <div style={styles.error}>{error}</div>}

      <section style={styles.card}>
        <div style={styles.sectionHeader}>
          <div>
            <h2 style={styles.sectionTitle}>Top 10 Ideas</h2>
            <p style={styles.sectionSub}>
              Trade Ready names are prioritized first.
            </p>
          </div>
        </div>

        {loading ? (
          <p style={styles.muted}>Loading ideas...</p>
        ) : top10.length === 0 ? (
          <p style={styles.muted}>No Top 10 ideas loaded yet.</p>
        ) : (
          <div style={styles.grid}>
            {top10.map((row, index) => {
              const symbol = getSymbol(row);
              const readiness = getReadiness(row);
              const heat = getHeat(row);
              const composite = getComposite(row);
              const action = getPortfolioAction(row, false);

              return (
                <div key={`${symbol}-${index}`} style={styles.ideaCard}>
                  <div style={styles.cardTop}>
                    <div>
                      <div style={styles.rank}>#{index + 1}</div>
                      <h3 style={styles.symbol}>{symbol}</h3>
                      <p style={styles.name}>{getName(row)}</p>
                    </div>

                    <span
                      style={{
                        ...styles.badge,
                        background: readinessBadgeColor(readiness),
                      }}
                    >
                      {readiness}
                    </span>
                  </div>

                  <div style={styles.metrics}>
                    <div>
                      <span style={styles.metricLabel}>Price</span>
                      <strong>{money(getPrice(row))}</strong>
                    </div>
                    <div>
                      <span style={styles.metricLabel}>Change</span>
                      <strong>{percent(getChange(row))}</strong>
                    </div>
                    <div>
                      <span style={styles.metricLabel}>Heat</span>
                      <strong>{heat}</strong>
                    </div>
                    <div>
                      <span style={styles.metricLabel}>Score</span>
                      <strong>{composite}</strong>
                    </div>
                  </div>

                  <div style={styles.bottomRow}>
                    <span style={styles.recommendation}>
                      {getRecommendation(row)}
                    </span>
                    <span style={styles.action}>{action}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section style={styles.card}>
        <h2 style={styles.sectionTitle}>Snap Quote + Score</h2>
        <p style={styles.sectionSub}>
          Enter a symbol to check its current setup.
        </p>

        <div style={styles.inputRow}>
          <input
            value={snapInput}
            onChange={(e) => setSnapInput(e.target.value.toUpperCase())}
            placeholder="Example: MARA"
            style={styles.input}
          />
          <button onClick={runSnapQuote} style={styles.primaryButton}>
            {snapLoading ? "Checking..." : "Analyze"}
          </button>
        </div>

        {snapResult && (
          <div style={styles.snapBox}>
            {snapResult.error ? (
              <p style={styles.muted}>
                No result found for {snapResult.symbol}.
              </p>
            ) : (
              <>
                <div style={styles.cardTop}>
                  <div>
                    <h3 style={styles.symbol}>{getSymbol(snapResult)}</h3>
                    <p style={styles.name}>{getName(snapResult)}</p>
                  </div>
                  <span
                    style={{
                      ...styles.badge,
                      background: readinessBadgeColor(getReadiness(snapResult)),
                    }}
                  >
                    {getReadiness(snapResult)}
                  </span>
                </div>

                <div style={styles.metrics}>
                  <div>
                    <span style={styles.metricLabel}>Price</span>
                    <strong>{money(getPrice(snapResult))}</strong>
                  </div>
                  <div>
                    <span style={styles.metricLabel}>Change</span>
                    <strong>{percent(getChange(snapResult))}</strong>
                  </div>
                  <div>
                    <span style={styles.metricLabel}>Heat</span>
                    <strong>{getHeat(snapResult)}</strong>
                  </div>
                  <div>
                    <span style={styles.metricLabel}>Score</span>
                    <strong>{getComposite(snapResult)}</strong>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      <section style={styles.card}>
        <div style={styles.sectionHeader}>
          <div>
            <h2 style={styles.sectionTitle}>Portfolio</h2>
            <p style={styles.sectionSub}>
              Add your symbol, shares, and average cost. Then analyze whether to
              hold, add, trim, or exit.
            </p>
          </div>

          <button onClick={analyzePortfolio} style={styles.primaryButton}>
            {portfolioLoading ? "Analyzing..." : "Analyze Portfolio"}
          </button>
        </div>

        <div style={styles.inputRow}>
          <input
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
            placeholder="Symbol"
            style={styles.input}
          />
          <input
            value={sharesInput}
            onChange={(e) => setSharesInput(e.target.value)}
            placeholder="Shares"
            type="number"
            style={styles.input}
          />
          <input
            value={avgCostInput}
            onChange={(e) => setAvgCostInput(e.target.value)}
            placeholder="Avg Cost"
            type="number"
            step="0.01"
            style={styles.input}
          />
          <button onClick={addPortfolioPosition} style={styles.secondaryButton}>
            Add Position
          </button>
        </div>

        {portfolio.length === 0 ? (
          <p style={styles.muted}>No portfolio positions added yet.</p>
        ) : (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Symbol</th>
                  <th style={styles.th}>Shares</th>
                  <th style={styles.th}>Avg Cost</th>
                  <th style={styles.th}>Price</th>
                  <th style={styles.th}>Value</th>
                  <th style={styles.th}>Gain/Loss</th>
                  <th style={styles.th}>Action</th>
                  <th style={styles.th}>Readiness</th>
                  <th style={styles.th}>Heat</th>
                  <th style={styles.th}>Score</th>
                  <th style={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {portfolio.map((position) => {
                  const analysis = portfolioAnalysis.find(
                    (x) =>
                      getSymbol(x).toUpperCase() ===
                      position.symbol.toUpperCase()
                  );

                  const price = analysis ? safeNumber(getPrice(analysis), 0) : 0;
                  const shares = safeNumber(position.shares, 0);
                  const avgCost = safeNumber(position.avgCost, 0);
                  const value = price > 0 ? shares * price : null;
                  const costBasis =
                    avgCost > 0 && shares > 0 ? shares * avgCost : null;
                  const gainLossPct =
                    value !== null && costBasis
                      ? ((value - costBasis) / costBasis) * 100
                      : null;

                  const action = analysis
                    ? getPortfolioAction(analysis, true)
                    : "Not analyzed";

                  return (
                    <tr key={position.symbol}>
                      <td style={styles.td}>
                        <strong>{position.symbol}</strong>
                      </td>
                      <td style={styles.td}>{shares}</td>
                      <td style={styles.td}>
                        {avgCost > 0 ? money(avgCost) : "—"}
                      </td>
                      <td style={styles.td}>
                        {analysis ? money(price) : "—"}
                      </td>
                      <td style={styles.td}>
                        {value !== null ? money(value) : "—"}
                      </td>
                      <td style={styles.td}>
                        {gainLossPct !== null ? percent(gainLossPct) : "—"}
                      </td>
                      <td style={styles.td}>
                        <span
                          style={{
                            ...styles.portfolioAction,
                            color: ACTION_COLORS[action] || "#334155",
                          }}
                        >
                          {action}
                        </span>
                      </td>
                      <td style={styles.td}>
                        {analysis ? getReadiness(analysis) : "—"}
                      </td>
                      <td style={styles.td}>
                        {analysis ? getHeat(analysis) : "—"}
                      </td>
                      <td style={styles.td}>
                        {analysis ? getComposite(analysis) : "—"}
                      </td>
                      <td style={styles.td}>
                        <button
                          onClick={() =>
                            removePortfolioPosition(position.symbol)
                          }
                          style={styles.removeButton}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

const styles = {
  page: {
    maxWidth: 1180,
    margin: "0 auto",
    padding: "28px 18px 60px",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    color: "#0f172a",
    background: "#f8fafc",
    minHeight: "100vh",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "center",
    marginBottom: 22,
  },
  title: {
    fontSize: 34,
    margin: 0,
    letterSpacing: "-0.03em",
  },
  subtitle: {
    margin: "6px 0 0",
    color: "#475569",
    fontSize: 15,
  },
  card: {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 18,
    padding: 20,
    marginBottom: 20,
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)",
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 22,
    margin: 0,
  },
  sectionSub: {
    margin: "5px 0 0",
    color: "#64748b",
    fontSize: 14,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(245px, 1fr))",
    gap: 14,
  },
  ideaCard: {
    border: "1px solid #e2e8f0",
    borderRadius: 16,
    padding: 16,
    background: "#ffffff",
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
  },
  rank: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: 700,
  },
  symbol: {
    fontSize: 24,
    margin: "2px 0",
    letterSpacing: "-0.03em",
  },
  name: {
    margin: 0,
    color: "#64748b",
    fontSize: 13,
    minHeight: 34,
  },
  badge: {
    color: "#fff",
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  metrics: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 8,
    marginTop: 16,
  },
  metricLabel: {
    display: "block",
    fontSize: 11,
    color: "#64748b",
    marginBottom: 3,
  },
  bottomRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    marginTop: 16,
    paddingTop: 14,
    borderTop: "1px solid #e2e8f0",
  },
  recommendation: {
    fontWeight: 800,
    color: "#0f172a",
  },
  action: {
    fontWeight: 800,
    color: "#16a34a",
  },
  primaryButton: {
    border: "none",
    background: "#0f172a",
    color: "#fff",
    padding: "11px 15px",
    borderRadius: 12,
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  secondaryButton: {
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    color: "#0f172a",
    padding: "11px 15px",
    borderRadius: 12,
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  removeButton: {
    border: "none",
    background: "#fee2e2",
    color: "#991b1b",
    padding: "7px 10px",
    borderRadius: 10,
    fontWeight: 700,
    cursor: "pointer",
  },
  inputRow: {
    display: "flex",
    gap: 10,
    margin: "16px 0",
    flexWrap: "wrap",
  },
  input: {
    border: "1px solid #cbd5e1",
    borderRadius: 12,
    padding: "11px 12px",
    fontSize: 15,
    minWidth: 140,
  },
  snapBox: {
    border: "1px solid #e2e8f0",
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
  },
  tableWrap: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 14,
  },
  th: {
    textAlign: "left",
    padding: "12px 10px",
    borderBottom: "1px solid #e2e8f0",
    color: "#64748b",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "13px 10px",
    borderBottom: "1px solid #e2e8f0",
    whiteSpace: "nowrap",
  },
  portfolioAction: {
    fontWeight: 900,
  },
  muted: {
    color: "#64748b",
  },
  error: {
    background: "#fee2e2",
    color: "#991b1b",
    border: "1px solid #fecaca",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    fontWeight: 700,
  },
};

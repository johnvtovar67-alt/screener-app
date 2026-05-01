import { useEffect, useMemo, useState } from "react";

const PORTFOLIO_KEY = "stock_screener_portfolio_v1";

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function percent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function number(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function clampScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeMomentum(value) {
  const n = Number(value);

  if (!Number.isFinite(n)) return "Building";
  if (n >= 70 || n >= 1.5) return "Strong";
  if (n >= 45 || n >= 0.5) return "Building";
  return "Weak";
}

function getScore(stock) {
  return clampScore(
    stock?.score ??
      stock?.compositeScore ??
      stock?.overallScore ??
      stock?.totalScore ??
      stock?.ratingScore ??
      0
  );
}

function getSymbol(stock) {
  return String(stock?.symbol ?? stock?.ticker ?? "").toUpperCase();
}

function getName(stock) {
  return stock?.name ?? stock?.companyName ?? stock?.company ?? "—";
}

function getPrice(stock) {
  return Number(
    stock?.price ??
      stock?.quote?.price ??
      stock?.regularMarketPrice ??
      stock?.currentPrice ??
      stock?.lastPrice
  );
}

function getChangePct(stock) {
  return Number(
    stock?.changesPercentage ??
      stock?.changePercent ??
      stock?.percentChange ??
      stock?.quote?.changesPercentage
  );
}

function getMomentumText(stock) {
  if (stock?.momentumText) return stock.momentumText;
  if (stock?.momentumLabel) return stock.momentumLabel;
  return normalizeMomentum(
    stock?.momentum ??
      stock?.momentumScore ??
      stock?.technicalScore ??
      stock?.technicalMomentum
  );
}

function tradeActionForStock(stock, owned = false) {
  const score = getScore(stock);
  const momentum = getMomentumText(stock);
  const changePct = getChangePct(stock);

  if (owned) {
    if (score >= 78 && momentum !== "Weak") return "Hold / Add";
    if (score >= 58) return "Hold";
    if (score >= 42) return "Trim";
    return "Exit / Avoid";
  }

  if (score >= 78 && momentum === "Strong") return "Buy Now";
  if (score >= 58) return "Watch for Entry";
  return "Avoid for Now";
}

function actionClass(action) {
  if (action === "Buy Now" || action === "Hold / Add") return "actionGreen";
  if (action === "Watch for Entry" || action === "Hold") return "actionYellow";
  if (action === "Trim") return "actionOrange";
  return "actionRed";
}

function scoreClass(score) {
  if (score >= 75) return "scoreGreen";
  if (score >= 55) return "scoreYellow";
  return "scoreRed";
}

function Card({ children, className = "" }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export default function Home() {
  const [stocks, setStocks] = useState([]);
  const [loadingTop, setLoadingTop] = useState(true);
  const [topError, setTopError] = useState("");

  const [symbol, setSymbol] = useState("");
  const [snapLoading, setSnapLoading] = useState(false);
  const [snapError, setSnapError] = useState("");
  const [snapStock, setSnapStock] = useState(null);

  const [portfolio, setPortfolio] = useState([]);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [portfolioResults, setPortfolioResults] = useState([]);

  const [newSymbol, setNewSymbol] = useState("");
  const [newShares, setNewShares] = useState("");
  const [newCost, setNewCost] = useState("");

  useEffect(() => {
    loadTopIdeas();
    loadPortfolio();
  }, []);

  async function loadTopIdeas() {
    setLoadingTop(true);
    setTopError("");

    try {
      const res = await fetch("/api/top5");
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.detail || data?.error || "Failed to load top ideas.");
      }

      const list = Array.isArray(data) ? data : data?.stocks || data?.results || data?.data || [];
      setStocks(list);
    } catch (err) {
      setTopError(err.message || "Failed to load top ideas.");
    } finally {
      setLoadingTop(false);
    }
  }

  function loadPortfolio() {
    try {
      const raw = window.localStorage.getItem(PORTFOLIO_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (Array.isArray(saved)) setPortfolio(saved);
    } catch {
      setPortfolio([]);
    }
  }

  function savePortfolio(next) {
    setPortfolio(next);
    window.localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(next));
  }

  function addPosition() {
    const cleanSymbol = newSymbol.trim().toUpperCase();
    const shares = Number(newShares);
    const avgCost = Number(newCost);

    if (!cleanSymbol || !Number.isFinite(shares) || shares <= 0 || !Number.isFinite(avgCost) || avgCost < 0) {
      alert("Please enter a symbol, shares, and average cost.");
      return;
    }

    const next = [...portfolio];
    const existingIndex = next.findIndex((p) => p.symbol === cleanSymbol);

    if (existingIndex >= 0) {
      next[existingIndex] = { symbol: cleanSymbol, shares, avgCost };
    } else {
      next.push({ symbol: cleanSymbol, shares, avgCost });
    }

    savePortfolio(next);
    setNewSymbol("");
    setNewShares("");
    setNewCost("");
  }

  function removePosition(symbolToRemove) {
    const next = portfolio.filter((p) => p.symbol !== symbolToRemove);
    savePortfolio(next);
    setPortfolioResults((prev) => prev.filter((p) => p.symbol !== symbolToRemove));
  }

  async function analyzeSymbol(e) {
    e?.preventDefault();

    const cleanSymbol = symbol.trim().toUpperCase();
    if (!cleanSymbol) return;

    setSnapLoading(true);
    setSnapError("");
    setSnapStock(null);

    try {
      const res = await fetch(`/api?symbol=${encodeURIComponent(cleanSymbol)}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.detail || data?.error || "Failed to analyze symbol.");
      }

      setSnapStock(data?.stock || data?.result || data);
    } catch (err) {
      setSnapError(err.message || "Failed to analyze symbol.");
    } finally {
      setSnapLoading(false);
    }
  }

  async function analyzePortfolio() {
    if (!portfolio.length) return;

    setPortfolioLoading(true);
    setPortfolioResults([]);

    try {
      const results = [];

      for (const position of portfolio) {
        try {
          const res = await fetch(`/api?symbol=${encodeURIComponent(position.symbol)}`);
          const data = await res.json();

          const stock = data?.stock || data?.result || data;
          const price = getPrice(stock);
          const value = Number.isFinite(price) ? price * Number(position.shares) : null;
          const costBasis = Number(position.avgCost) * Number(position.shares);
          const gainLoss = Number.isFinite(value) ? value - costBasis : null;
          const gainLossPct =
            Number.isFinite(value) && costBasis > 0 ? ((value - costBasis) / costBasis) * 100 : null;

          results.push({
            ...stock,
            symbol: position.symbol,
            shares: Number(position.shares),
            avgCost: Number(position.avgCost),
            currentPrice: price,
            value,
            gainLoss,
            gainLossPct,
          });
        } catch {
          results.push({
            symbol: position.symbol,
            shares: Number(position.shares),
            avgCost: Number(position.avgCost),
            error: "Could not analyze",
          });
        }
      }

      setPortfolioResults(results);
    } finally {
      setPortfolioLoading(false);
    }
  }

  const portfolioTotals = useMemo(() => {
    let value = 0;
    let cost = 0;

    for (const p of portfolioResults) {
      if (Number.isFinite(Number(p.value))) value += Number(p.value);
      if (Number.isFinite(Number(p.avgCost)) && Number.isFinite(Number(p.shares))) {
        cost += Number(p.avgCost) * Number(p.shares);
      }
    }

    return {
      value,
      gainLoss: value - cost,
      gainLossPct: cost > 0 ? ((value - cost) / cost) * 100 : null,
    };
  }, [portfolioResults]);

  return (
    <main className="page">
      <section className="hero">
        <div>
          <h1>Stock Screener</h1>
          <p>
            One clean decision label: <strong>Trade Action</strong>. Score and momentum support the decision.
          </p>
        </div>

        <button onClick={loadTopIdeas} className="button secondary">
          Refresh Ideas
        </button>
      </section>

      <section className="grid">
        <Card className="wide">
          <div className="sectionHeader">
            <div>
              <h2>Top Ideas</h2>
              <p>For stocks you do not currently own.</p>
            </div>
          </div>

          {loadingTop && <p className="muted">Loading top ideas...</p>}
          {topError && <p className="error">{topError}</p>}

          {!loadingTop && !topError && (
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Company</th>
                    <th>Price</th>
                    <th>Change</th>
                    <th>Score</th>
                    <th>Momentum</th>
                    <th>Trade Action</th>
                  </tr>
                </thead>
                <tbody>
                  {stocks.map((stock, idx) => {
                    const score = getScore(stock);
                    const action = tradeActionForStock(stock, false);

                    return (
                      <tr key={`${getSymbol(stock)}-${idx}`}>
                        <td className="symbol">{getSymbol(stock)}</td>
                        <td>{getName(stock)}</td>
                        <td>{money(getPrice(stock))}</td>
                        <td className={getChangePct(stock) >= 0 ? "positive" : "negative"}>
                          {percent(getChangePct(stock))}
                        </td>
                        <td>
                          <span className={`scorePill ${scoreClass(score)}`}>{score}</span>
                        </td>
                        <td>{getMomentumText(stock)}</td>
                        <td>
                          <span className={`actionPill ${actionClass(action)}`}>{action}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <h2>Snap Quote + Score</h2>
          <p className="muted">Check one stock without adding it to your portfolio.</p>

          <form onSubmit={analyzeSymbol} className="formRow">
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="Enter symbol"
            />
            <button className="button" disabled={snapLoading}>
              {snapLoading ? "Analyzing..." : "Analyze"}
            </button>
          </form>

          {snapError && <p className="error">{snapError}</p>}

          {snapStock && (
            <div className="snapBox">
              <div className="snapTop">
                <div>
                  <h3>{getSymbol(snapStock)}</h3>
                  <p>{getName(snapStock)}</p>
                </div>
                <span className={`actionPill ${actionClass(tradeActionForStock(snapStock, false))}`}>
                  {tradeActionForStock(snapStock, false)}
                </span>
              </div>

              <div className="metricGrid">
                <div>
                  <span>Price</span>
                  <strong>{money(getPrice(snapStock))}</strong>
                </div>
                <div>
                  <span>Change</span>
                  <strong className={getChangePct(snapStock) >= 0 ? "positive" : "negative"}>
                    {percent(getChangePct(snapStock))}
                  </strong>
                </div>
                <div>
                  <span>Score</span>
                  <strong>{getScore(snapStock)}</strong>
                </div>
                <div>
                  <span>Momentum</span>
                  <strong>{getMomentumText(snapStock)}</strong>
                </div>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <h2>Portfolio</h2>
          <p className="muted">For stocks you already own.</p>

          <div className="portfolioForm">
            <input
              value={newSymbol}
              onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
              placeholder="Symbol"
            />
            <input
              value={newShares}
              onChange={(e) => setNewShares(e.target.value)}
              placeholder="Shares"
              type="number"
              step="any"
            />
            <input
              value={newCost}
              onChange={(e) => setNewCost(e.target.value)}
              placeholder="Avg cost"
              type="number"
              step="any"
            />
            <button onClick={addPosition} className="button">
              Add / Update
            </button>
          </div>

          {portfolio.length > 0 && (
            <div className="miniList">
              {portfolio.map((p) => (
                <div className="miniPosition" key={p.symbol}>
                  <div>
                    <strong>{p.symbol}</strong>
                    <span>
                      {number(p.shares, 2)} shares @ {money(p.avgCost)}
                    </span>
                  </div>
                  <button onClick={() => removePosition(p.symbol)} className="linkButton">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={analyzePortfolio}
            disabled={!portfolio.length || portfolioLoading}
            className="button full"
          >
            {portfolioLoading ? "Analyzing Portfolio..." : "Analyze Portfolio"}
          </button>
        </Card>

        {portfolioResults.length > 0 && (
          <Card className="wide">
            <div className="sectionHeader">
              <div>
                <h2>Portfolio Analysis</h2>
                <p>Trade Action is based on ownership context.</p>
              </div>

              <div className="totals">
                <span>Total Value</span>
                <strong>{money(portfolioTotals.value)}</strong>
                <span className={portfolioTotals.gainLoss >= 0 ? "positive" : "negative"}>
                  {money(portfolioTotals.gainLoss)} / {percent(portfolioTotals.gainLossPct)}
                </span>
              </div>
            </div>

            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Shares</th>
                    <th>Avg Cost</th>
                    <th>Price</th>
                    <th>Value</th>
                    <th>Gain / Loss</th>
                    <th>Score</th>
                    <th>Momentum</th>
                    <th>Trade Action</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolioResults.map((stock) => {
                    const score = getScore(stock);
                    const action = stock.error ? "Exit / Avoid" : tradeActionForStock(stock, true);

                    return (
                      <tr key={stock.symbol}>
                        <td className="symbol">{stock.symbol}</td>
                        <td>{number(stock.shares, 2)}</td>
                        <td>{money(stock.avgCost)}</td>
                        <td>{stock.error ? "—" : money(stock.currentPrice)}</td>
                        <td>{stock.error ? "—" : money(stock.value)}</td>
                        <td className={stock.gainLoss >= 0 ? "positive" : "negative"}>
                          {stock.error ? "—" : `${money(stock.gainLoss)} / ${percent(stock.gainLossPct)}`}
                        </td>
                        <td>
                          <span className={`scorePill ${scoreClass(score)}`}>{score}</span>
                        </td>
                        <td>{stock.error ? "—" : getMomentumText(stock)}</td>
                        <td>
                          <span className={`actionPill ${actionClass(action)}`}>{action}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      <style jsx>{`
        .page {
          min-height: 100vh;
          background: #f6f7f9;
          color: #101828;
          padding: 28px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .hero {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          align-items: center;
          margin-bottom: 24px;
        }

        h1 {
          margin: 0;
          font-size: 34px;
          letter-spacing: -0.04em;
        }

        h2 {
          margin: 0 0 6px;
          font-size: 20px;
        }

        h3 {
          margin: 0;
          font-size: 24px;
        }

        p {
          margin: 0;
        }

        .muted {
          color: #667085;
          font-size: 14px;
        }

        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 18px;
        }

        .card {
          background: #ffffff;
          border: 1px solid #e4e7ec;
          border-radius: 18px;
          padding: 18px;
          box-shadow: 0 8px 24px rgba(16, 24, 40, 0.06);
        }

        .wide {
          grid-column: 1 / -1;
        }

        .sectionHeader {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
          margin-bottom: 16px;
        }

        .tableWrap {
          overflow-x: auto;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }

        th {
          text-align: left;
          color: #667085;
          font-weight: 600;
          padding: 10px;
          border-bottom: 1px solid #e4e7ec;
          white-space: nowrap;
        }

        td {
          padding: 12px 10px;
          border-bottom: 1px solid #f0f2f5;
          vertical-align: middle;
          white-space: nowrap;
        }

        .symbol {
          font-weight: 800;
          letter-spacing: 0.03em;
        }

        .button {
          background: #101828;
          color: white;
          border: 0;
          border-radius: 12px;
          padding: 11px 14px;
          font-weight: 700;
          cursor: pointer;
        }

        .button:hover {
          opacity: 0.92;
        }

        .button:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .button.secondary {
          background: white;
          color: #101828;
          border: 1px solid #d0d5dd;
        }

        .button.full {
          width: 100%;
          margin-top: 14px;
        }

        input {
          width: 100%;
          border: 1px solid #d0d5dd;
          border-radius: 12px;
          padding: 11px 12px;
          font-size: 15px;
          outline: none;
        }

        input:focus {
          border-color: #101828;
        }

        .formRow {
          display: flex;
          gap: 10px;
          margin-top: 14px;
        }

        .portfolioForm {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr auto;
          gap: 10px;
          margin-top: 14px;
        }

        .snapBox {
          margin-top: 16px;
          border: 1px solid #e4e7ec;
          border-radius: 16px;
          padding: 16px;
          background: #fcfcfd;
        }

        .snapTop {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
          margin-bottom: 14px;
        }

        .metricGrid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
        }

        .metricGrid div {
          background: white;
          border: 1px solid #eef0f3;
          border-radius: 14px;
          padding: 12px;
        }

        .metricGrid span {
          display: block;
          color: #667085;
          font-size: 12px;
          margin-bottom: 4px;
        }

        .metricGrid strong {
          font-size: 16px;
        }

        .scorePill,
        .actionPill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          padding: 6px 10px;
          font-weight: 800;
          font-size: 12px;
        }

        .scoreGreen,
        .actionGreen {
          background: #dcfae6;
          color: #067647;
        }

        .scoreYellow,
        .actionYellow {
          background: #fef7c3;
          color: #a15c07;
        }

        .scoreRed,
        .actionRed {
          background: #fee4e2;
          color: #b42318;
        }

        .actionOrange {
          background: #ffead5;
          color: #b54708;
        }

        .positive {
          color: #067647;
          font-weight: 700;
        }

        .negative {
          color: #b42318;
          font-weight: 700;
        }

        .error {
          color: #b42318;
          background: #fee4e2;
          border-radius: 12px;
          padding: 10px 12px;
          margin-top: 12px;
          font-size: 14px;
          font-weight: 600;
        }

        .miniList {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 14px;
        }

        .miniPosition {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
          border: 1px solid #eef0f3;
          border-radius: 14px;
          padding: 10px 12px;
          background: #fcfcfd;
        }

        .miniPosition span {
          display: block;
          color: #667085;
          font-size: 13px;
          margin-top: 2px;
        }

        .linkButton {
          background: none;
          border: none;
          color: #b42318;
          font-weight: 700;
          cursor: pointer;
        }

        .totals {
          text-align: right;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .totals span:first-child {
          color: #667085;
          font-size: 12px;
        }

        .totals strong {
          font-size: 20px;
        }

        @media (max-width: 900px) {
          .page {
            padding: 16px;
          }

          .hero {
            flex-direction: column;
            align-items: stretch;
          }

          .grid {
            grid-template-columns: 1fr;
          }

          .portfolioForm {
            grid-template-columns: 1fr;
          }

          .metricGrid {
            grid-template-columns: 1fr 1fr;
          }

          .sectionHeader {
            flex-direction: column;
          }

          .totals {
            text-align: left;
          }
        }
      `}</style>
    </main>
  );
}

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

function getSymbol(stock) {
  return String(stock?.symbol ?? stock?.ticker ?? "").toUpperCase();
}

function getName(stock) {
  return stock?.name ?? stock?.companyName ?? stock?.company ?? "—";
}

function getPrice(stock) {
  return Number(stock?.price ?? stock?.currentPrice ?? stock?.quote?.price ?? stock?.lastPrice);
}

function getChangePct(stock) {
  return Number(stock?.dayChangePct ?? stock?.changesPercentage ?? stock?.changePercent ?? stock?.percentChange);
}

function getScore(stock) {
  return clampScore(
    stock?.recommendation?.score ??
      stock?.score ??
      stock?.compositeScore ??
      stock?.overallScore ??
      stock?.totalScore ??
      stock?.ratingScore ??
      stock?.asymmetryScore ??
      0
  );
}

function getMomentumText(stock) {
  const stage = String(stock?.stage ?? "").toUpperCase();
  const oneMonth = Number(stock?.technicalSnapshot?.oneMonthPct ?? stock?.oneMonthPct);
  const pctFrom20 = Number(stock?.pctFrom20dma);
  const above50 = stock?.above50dma === true;
  const above200 = stock?.above200dma === true;

  if (stage.includes("STRONG")) return "Strong";
  if (Number.isFinite(oneMonth) && oneMonth >= 8) return "Strong";
  if (Number.isFinite(pctFrom20) && pctFrom20 >= 5 && above50) return "Strong";
  if (above50 && above200) return "Building";
  if (Number.isFinite(oneMonth) && oneMonth > 0) return "Building";
  return "Weak";
}

function getWhy(stock) {
  return (
    stock?.recommendation?.reason ??
    stock?.reason ??
    stock?.why ??
    "Constructive setup, but wait for stronger confirmation."
  );
}

function getEntryNote(stock) {
  return (
    stock?.recommendation?.entryNote ??
    stock?.entryNote ??
    stock?.note ??
    "Wait for stronger price or volume confirmation."
  );
}

function tradeActionForStock(stock, owned = false) {
  const label = stock?.recommendation?.label;
  const score = getScore(stock);
  const momentum = getMomentumText(stock);

  if (owned) {
    if (score >= 78 && momentum !== "Weak") return "Hold / Add";
    if (score >= 58) return "Hold";
    if (score >= 42) return "Trim";
    return "Exit / Avoid";
  }

  if (label === "STRONG BUY" && momentum === "Strong") return "Buy Now";
  if (label === "STRONG BUY") return "Watch for Entry";
  if (label === "BUY") return "Watch for Entry";
  if (label === "WATCH") return "Watch for Entry";
  return "Avoid for Now";
}

function actionClass(action) {
  if (action === "Buy Now" || action === "Hold / Add") return "green";
  if (action === "Watch for Entry" || action === "Hold") return "yellow";
  if (action === "Trim") return "orange";
  return "red";
}

function scoreClass(score) {
  if (score >= 75) return "green";
  if (score >= 55) return "yellow";
  return "red";
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

      if (!res.ok) throw new Error(data?.detail || data?.error || "Failed to load top ideas.");

      const list = Array.isArray(data) ? data : data?.stocks || data?.results || data?.data || [];
      setStocks(list.slice(0, 10));
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
      alert("Please enter symbol, shares, and average cost.");
      return;
    }

    const next = [...portfolio];
    const index = next.findIndex((p) => p.symbol === cleanSymbol);

    if (index >= 0) next[index] = { symbol: cleanSymbol, shares, avgCost };
    else next.push({ symbol: cleanSymbol, shares, avgCost });

    savePortfolio(next);
    setNewSymbol("");
    setNewShares("");
    setNewCost("");
  }

  function removePosition(symbolToRemove) {
    savePortfolio(portfolio.filter((p) => p.symbol !== symbolToRemove));
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

      if (!res.ok) throw new Error(data?.detail || data?.error || "Failed to analyze symbol.");

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
      <header className="header">
        <div>
          <h1>🧠 Asymmetry Screener</h1>
          <p>Broad-market screen for under-the-radar, high-upside setups.</p>
        </div>

        <button onClick={loadTopIdeas} className="button secondary">
          Reload Screener
        </button>
      </header>

      <section className="card">
        <div className="sectionTitle">
          <h2>🔥 Top 10 Ideas</h2>
          <p>Cards are the quick scan. Table adds the reason and entry note.</p>
        </div>

        {loadingTop && <p className="muted">Loading top ideas...</p>}
        {topError && <p className="error">{topError}</p>}

        {!loadingTop && !topError && (
          <>
            <div className="ideaGrid">
              {stocks.map((stock, idx) => {
                const score = getScore(stock);
                const action = tradeActionForStock(stock, false);

                return (
                  <div className="ideaCard" key={`${getSymbol(stock)}-card-${idx}`}>
                    <div className="ideaSymbol">{getSymbol(stock)}</div>
                    <div className="ideaPrice">{money(getPrice(stock))}</div>
                    <span className={`pill widePill ${actionClass(action)}`}>{action}</span>
                    <div className="ideaMeta">Score: {score}</div>
                    <div className="ideaMeta">Momentum: {getMomentumText(stock)}</div>
                  </div>
                );
              })}
            </div>

            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Name</th>
                    <th>Price</th>
                    <th>Chg %</th>
                    <th>Trade Action</th>
                    <th>Why</th>
                    <th>Entry Note</th>
                  </tr>
                </thead>
                <tbody>
                  {stocks.map((stock, idx) => {
                    const action = tradeActionForStock(stock, false);

                    return (
                      <tr key={`${getSymbol(stock)}-row-${idx}`}>
                        <td className="symbol">{getSymbol(stock)}</td>
                        <td>{getName(stock)}</td>
                        <td>{money(getPrice(stock))}</td>
                        <td className={getChangePct(stock) >= 0 ? "positive" : "negative"}>
                          {percent(getChangePct(stock))}
                        </td>
                        <td>
                          <span className={`pill ${actionClass(action)}`}>{action}</span>
                        </td>
                        <td className="textCell">{getWhy(stock)}</td>
                        <td className="textCell mutedText">{getEntryNote(stock)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="card">
        <h2>Snap Quote + Score</h2>
        <p className="muted">Uses the same non-owned logic: Buy Now, Watch for Entry, Avoid for Now.</p>

        <form onSubmit={analyzeSymbol} className="formRow">
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="Lookup ticker..."
          />
          <button className="button" disabled={snapLoading}>
            {snapLoading ? "Analyzing..." : "Snap Quote + Score"}
          </button>
        </form>

        {snapError && <p className="error">{snapError}</p>}

        {snapStock && (
          <div className="resultBox">
            <div className="resultTop">
              <div>
                <h3>{getSymbol(snapStock)}</h3>
                <p>{getName(snapStock)}</p>
              </div>

              <span className={`pill ${actionClass(tradeActionForStock(snapStock, false))}`}>
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
              <div>
                <span>Trade Action</span>
                <strong>{tradeActionForStock(snapStock, false)}</strong>
              </div>
            </div>

            <div className="snapNotes">
              <div>
                <span>Why</span>
                <p>{getWhy(snapStock)}</p>
              </div>
              <div>
                <span>Entry Note</span>
                <p>{getEntryNote(snapStock)}</p>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Portfolio Screener</h2>
        <p className="muted">Uses ownership logic: Hold / Add, Hold, Trim, Exit / Avoid.</p>

        <div className="portfolioForm">
          <input value={newSymbol} onChange={(e) => setNewSymbol(e.target.value.toUpperCase())} placeholder="Symbol" />
          <input value={newShares} onChange={(e) => setNewShares(e.target.value)} placeholder="Shares" type="number" step="any" />
          <input value={newCost} onChange={(e) => setNewCost(e.target.value)} placeholder="Avg cost" type="number" step="any" />
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

        <button onClick={analyzePortfolio} disabled={!portfolio.length || portfolioLoading} className="button full">
          {portfolioLoading ? "Analyzing Portfolio..." : "Analyze Portfolio"}
        </button>
      </section>

      {portfolioResults.length > 0 && (
        <section className="card">
          <div className="sectionHeader">
            <div>
              <h2>Portfolio Analysis</h2>
              <p>Trade Action is based on stocks you already own.</p>
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
                        <span className={`pill ${scoreClass(score)}`}>{score}</span>
                      </td>
                      <td>{stock.error ? "—" : getMomentumText(stock)}</td>
                      <td>
                        <span className={`pill ${actionClass(action)}`}>{action}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <style jsx>{`
        .page {
          min-height: 100vh;
          background: #f8fafc;
          color: #0f172a;
          padding: 28px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 18px;
          margin-bottom: 22px;
        }

        h1 {
          margin: 0;
          font-size: 34px;
          line-height: 1.05;
          letter-spacing: -0.04em;
        }

        h2 {
          margin: 0 0 5px;
          font-size: 20px;
        }

        h3 {
          margin: 0;
          font-size: 24px;
        }

        p {
          margin: 0;
        }

        .header p,
        .muted {
          color: #64748b;
          font-size: 14px;
        }

        .card {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 18px;
          margin-bottom: 20px;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04);
        }

        .sectionTitle {
          margin-bottom: 14px;
        }

        .sectionHeader {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
          margin-bottom: 14px;
        }

        .ideaGrid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(145px, 1fr));
          gap: 12px;
          margin-bottom: 18px;
        }

        .ideaCard {
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          background: white;
          padding: 12px;
        }

        .ideaSymbol {
          font-size: 17px;
          font-weight: 900;
          letter-spacing: 0.02em;
        }

        .ideaPrice {
          font-size: 15px;
          margin: 2px 0 8px;
        }

        .ideaMeta {
          color: #64748b;
          font-size: 12px;
          margin-top: 5px;
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
          color: #64748b;
          font-weight: 800;
          padding: 10px;
          border-bottom: 1px solid #e2e8f0;
          white-space: nowrap;
        }

        td {
          padding: 11px 10px;
          border-bottom: 1px solid #f1f5f9;
          vertical-align: top;
        }

        .symbol {
          font-weight: 900;
          letter-spacing: 0.03em;
          white-space: nowrap;
        }

        .textCell {
          max-width: 360px;
          white-space: normal;
          line-height: 1.35;
          color: #334155;
        }

        .mutedText {
          color: #64748b;
        }

        .button {
          background: #0f172a;
          color: white;
          border: 0;
          border-radius: 11px;
          padding: 11px 16px;
          font-weight: 800;
          cursor: pointer;
          white-space: nowrap;
        }

        .button.secondary {
          background: white;
          color: #0f172a;
          border: 1px solid #cbd5e1;
        }

        .button:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .button.full {
          width: 100%;
          margin-top: 14px;
        }

        input {
          width: 100%;
          border: 1px solid #cbd5e1;
          border-radius: 11px;
          padding: 11px 12px;
          font-size: 15px;
          outline: none;
          box-sizing: border-box;
        }

        .formRow {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 10px;
          margin-top: 14px;
        }

        .portfolioForm {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr auto;
          gap: 10px;
          margin-top: 14px;
          align-items: center;
        }

        .resultBox {
          margin-top: 16px;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 16px;
          background: #f8fafc;
        }

        .resultTop {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
          margin-bottom: 14px;
        }

        .metricGrid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 10px;
        }

        .metricGrid div,
        .snapNotes div {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 12px;
        }

        .metricGrid span,
        .snapNotes span {
          display: block;
          color: #64748b;
          font-size: 12px;
          margin-bottom: 4px;
          font-weight: 700;
        }

        .metricGrid strong {
          font-size: 15px;
        }

        .snapNotes {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 10px;
        }

        .snapNotes p {
          color: #334155;
          line-height: 1.35;
          font-size: 14px;
        }

        .pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          padding: 6px 12px;
          font-weight: 900;
          font-size: 12px;
          white-space: nowrap;
        }

        .widePill {
          width: 100%;
          box-sizing: border-box;
        }

        .green {
          background: #dcfce7;
          color: #166534;
          border: 1px solid #bbf7d0;
        }

        .yellow {
          background: #fef9c3;
          color: #854d0e;
          border: 1px solid #fde68a;
        }

        .orange {
          background: #ffedd5;
          color: #9a3412;
          border: 1px solid #fed7aa;
        }

        .red {
          background: #fee2e2;
          color: #991b1b;
          border: 1px solid #fecaca;
        }

        .positive {
          color: #047857;
          font-weight: 900;
          white-space: nowrap;
        }

        .negative {
          color: #b91c1c;
          font-weight: 900;
          white-space: nowrap;
        }

        .error {
          color: #991b1b;
          background: #fee2e2;
          border-radius: 12px;
          padding: 10px 12px;
          margin-top: 12px;
          font-size: 14px;
          font-weight: 700;
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
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 10px 12px;
          background: #f8fafc;
        }

        .miniPosition span {
          display: block;
          color: #64748b;
          font-size: 13px;
          margin-top: 2px;
        }

        .linkButton {
          background: none;
          border: none;
          color: #b91c1c;
          font-weight: 900;
          cursor: pointer;
        }

        .totals {
          text-align: right;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .totals span:first-child {
          color: #64748b;
          font-size: 12px;
        }

        .totals strong {
          font-size: 22px;
        }

        @media (max-width: 1100px) {
          .portfolioForm {
            grid-template-columns: 1fr 1fr;
          }

          .portfolioForm button {
            grid-column: span 2;
          }

          .metricGrid {
            grid-template-columns: repeat(2, 1fr);
          }

          .snapNotes {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 700px) {
          .page {
            padding: 14px;
          }

          .header {
            flex-direction: column;
          }

          .formRow {
            grid-template-columns: 1fr;
          }

          .portfolioForm {
            grid-template-columns: 1fr;
          }

          .portfolioForm button {
            grid-column: auto;
          }

          .metricGrid {
            grid-template-columns: 1fr;
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

import { useEffect, useMemo, useState } from "react";

const PORTFOLIO_KEY = "stock_screener_portfolio_v1";

const CASH_SYMBOLS = ["CASH", "SWVXX", "VMFXX", "SPAXX", "FDRXX", "MMF"];

const THEME_OPTIONS = [
  { key: "broad", name: "Broad Market" },
  { key: "btc", name: "BTC / Digital Assets" },
  { key: "ai_power", name: "AI Power & Energy" },
  { key: "cooling_water", name: "Cooling & Water" },
  { key: "nuclear", name: "Nuclear / Baseload" },
  { key: "quantum", name: "Quantum Computing" },
  { key: "ai_infra", name: "AI Infrastructure" },
];

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

function isCashLikeSymbol(symbolOrStock) {
  const symbol =
    typeof symbolOrStock === "string"
      ? symbolOrStock.toUpperCase()
      : getSymbol(symbolOrStock);

  return CASH_SYMBOLS.includes(symbol);
}

function getName(stock) {
  return stock?.name ?? stock?.companyName ?? stock?.company ?? "—";
}

function getPrice(stock) {
  return Number(
    stock?.price ??
      stock?.currentPrice ??
      stock?.quote?.price ??
      stock?.lastPrice
  );
}

function getChangePct(stock) {
  return Number(
    stock?.dayChangePct ??
      stock?.changesPercentage ??
      stock?.changePercent ??
      stock?.percentChange
  );
}

function getRecommendation(stock) {
  return stock?.recommendation ?? {};
}

function getScore(stock) {
  return clampScore(
    getRecommendation(stock)?.score ??
      stock?.score ??
      stock?.compositeScore ??
      stock?.overallScore ??
      0
  );
}

function getTrigger(stock) {
  return clampScore(
    getRecommendation(stock)?.triggerScore ??
      stock?.triggerScore ??
      stock?.technicalSnapshot?.triggerScore ??
      0
  );
}

function getMomentumScore(stock) {
  return clampScore(
    getRecommendation(stock)?.momentumScore ??
      stock?.momentumScore ??
      stock?.technicalSnapshot?.momentumScore ??
      0
  );
}

function getExpectationRisk(stock) {
  return clampScore(
    getRecommendation(stock)?.expectationRisk ??
      stock?.expectationRisk ??
      stock?.technicalSnapshot?.expectationRisk ??
      0
  );
}

function getExtensionRisk(stock) {
  return clampScore(
    getRecommendation(stock)?.extensionRisk ??
      stock?.extensionRisk ??
      stock?.technicalSnapshot?.extensionRisk ??
      0
  );
}

function getFreshBreakoutScore(stock) {
  return clampScore(
    getRecommendation(stock)?.freshBreakoutScore ??
      stock?.freshBreakoutScore ??
      stock?.technicalSnapshot?.freshBreakoutScore ??
      0
  );
}

function getMomentumText(stock) {
  if (isCashLikeSymbol(stock)) return "Cash";

  const rec = getRecommendation(stock);

  if (rec?.momentumLabel) return rec.momentumLabel;
  if (stock?.momentumLabel) return stock.momentumLabel;
  if (stock?.technicalSnapshot?.momentumLabel) {
    return stock.technicalSnapshot.momentumLabel;
  }

  const momentumScore = getMomentumScore(stock);

  if (momentumScore >= 75) return "Strong";
  if (momentumScore >= 55) return "Building";

  return "Weak";
}

function getContext(stock) {
  if (isCashLikeSymbol(stock)) return "Cash";

  return (
    getRecommendation(stock)?.context ??
    stock?.context ??
    stock?.technicalSnapshot?.context ??
    "Setup"
  );
}

function shortContext(stock) {
  const text = String(getContext(stock));
  const lower = text.toLowerCase();

  if (text.length <= 22) return text;
  if (lower.includes("fresh")) return "Fresh breakout";
  if (lower.includes("early")) return "Early breakout";
  if (lower.includes("extended")) return "Extended";
  if (lower.includes("trigger")) return "Strong trigger";
  if (lower.includes("momentum")) return "Building";
  if (lower.includes("binary")) return "Binary risk";
  if (lower.includes("lagging")) return "Lagging";
  if (lower.includes("trend")) return "Trend issue";
  if (lower.includes("clean")) return "Clean setup";
  if (lower.includes("constructive")) return "Constructive";

  return "Setup";
}

function getContextTone(stock) {
  if (isCashLikeSymbol(stock)) return "gray";

  const rec = getRecommendation(stock);

  if (rec?.contextTone) return rec.contextTone;

  const context = String(getContext(stock)).toLowerCase();
  const action = nonOwnedAction(stock);

  if (context.includes("binary")) return "yellow";

  if (
    context.includes("fails") ||
    context.includes("extended") ||
    context.includes("lagging") ||
    context.includes("not aligned") ||
    context.includes("risk")
  ) {
    return "red";
  }

  if (action === "Buy Now" || action === "Buy") return "green";
  if (action === "Watch for Entry") return "yellow";

  return "red";
}

function getConfidence(stock) {
  if (isCashLikeSymbol(stock)) return "High";

  return (
    getRecommendation(stock)?.confidence ??
    stock?.confidence ??
    stock?.technicalSnapshot?.confidence ??
    "Low"
  );
}

function getRisk(stock) {
  if (isCashLikeSymbol(stock)) return "Low";

  return (
    getRecommendation(stock)?.risk ??
    stock?.risk ??
    stock?.technicalSnapshot?.risk ??
    fallbackRisk(stock)
  );
}

function getWhy(stock) {
  return (
    getRecommendation(stock)?.reason ??
    stock?.reason ??
    stock?.why ??
    "No explanation returned."
  );
}

function getEntryNote(stock) {
  return (
    getRecommendation(stock)?.entryNote ??
    stock?.entryNote ??
    stock?.note ??
    "No entry note returned."
  );
}

function fallbackRisk(stock) {
  const expectationRisk = getExpectationRisk(stock);
  const extensionRisk = getExtensionRisk(stock);

  if (expectationRisk >= 60 || extensionRisk >= 60) return "High";
  if (expectationRisk >= 35 || extensionRisk >= 35) return "Medium";

  return "Low";
}

function confidenceClass(confidence) {
  const clean = String(confidence || "").toLowerCase();

  if (clean === "high") return "green";
  if (clean === "medium") return "yellow";

  return "red";
}

function riskClass(risk) {
  const clean = String(risk || "").toLowerCase();

  if (clean === "low") return "green";
  if (clean === "medium") return "yellow";

  return "red";
}

function calculatePosition(position, livePrice) {
  const shares = Number(position?.shares ?? 0);
  const avgCost = Number(position?.avgCost ?? 0);
  const price = Number(livePrice ?? 0);

  const value = shares * price;
  const costBasis = shares * avgCost;
  const gainLoss = value - costBasis;
  const gainLossPct = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;

  return {
    shares,
    avgCost,
    price,
    value,
    costBasis,
    gainLoss,
    gainLossPct,
  };
}

function nonOwnedAction(stock) {
  if (isCashLikeSymbol(stock)) return "Cash / Hold";

  const rec = getRecommendation(stock);
  const label = String(rec?.displayLabel ?? rec?.label ?? "").toUpperCase();

  if (label === "BUY NOW") return "Buy Now";
  if (label === "BUY") return "Buy";
  if (label === "WATCH FOR ENTRY") return "Watch for Entry";
  if (label === "AVOID FOR NOW") return "Avoid for Now";

  return "Avoid for Now";
}

function portfolioAction(stock) {
  if (isCashLikeSymbol(stock)) return "Cash / Hold";

  const score = getScore(stock);
  const trigger = getTrigger(stock);
  const momentum = getMomentumText(stock);
  const expectationRisk = getExpectationRisk(stock);
  const extensionRisk = getExtensionRisk(stock);
  const freshBreakoutScore = getFreshBreakoutScore(stock);
  const gainLossPct = Number(stock?.gainLossPct);
  const buyAction = nonOwnedAction(stock);

  const hasGainPct = Number.isFinite(gainLossPct);

  const largeGain = hasGainPct && gainLossPct >= 25;
  const solidGain = hasGainPct && gainLossPct >= 10;
  const meaningfulLoss = hasGainPct && gainLossPct <= -8;
  const deepLoss = hasGainPct && gainLossPct <= -15;

  const trendStrong =
    trigger >= 80 &&
    momentum !== "Weak" &&
    score >= 65 &&
    expectationRisk <= 55;

  const trendWeak = momentum === "Weak" || trigger < 65 || score < 60;

  const trendFailing =
    momentum === "Weak" && trigger < 65 && score < 60;

  const stretchedRisk = expectationRisk >= 60 || extensionRisk >= 65;

  const extendedWinner = solidGain && extensionRisk >= 55 && momentum !== "Weak";

  if (largeGain && trendFailing) return "Hold — Watch Closely";
  if (solidGain && trendFailing) return "Trim / Watch Closely";
  if (deepLoss && trendFailing) return "Exit — Trend Failure";
  if (meaningfulLoss && trendFailing) return "Exit — Trend Failure";

  if (largeGain && stretchedRisk) return "Trim Into Strength";
  if (extendedWinner) return "Hold but Extended";

  if (
    buyAction === "Buy Now" &&
    trendStrong &&
    freshBreakoutScore >= 70 &&
    !largeGain
  ) {
    return "Hold / Add";
  }

  if (buyAction === "Buy Now" && trendStrong) return "Hold Trend";

  if (
    trigger >= 85 &&
    momentum === "Strong" &&
    expectationRisk <= 45 &&
    extensionRisk <= 45
  ) {
    return "Hold / Add";
  }

  if (
    meaningfulLoss &&
    trigger >= 80 &&
    momentum !== "Weak" &&
    expectationRisk <= 50
  ) {
    return "Hold — Prove It";
  }

  if (trigger >= 75 && momentum !== "Weak" && score >= 60) {
    return "Hold Trend";
  }

  if (largeGain && trendWeak) return "Hold — Watch Closely";
  if (solidGain && trendWeak) return "Trim / Watch Closely";

  if (momentum === "Weak" || score < 58) return "Trim / Watch Closely";

  return "Hold Trend";
}

function displayAction(stock, owned = false) {
  if (owned) return portfolioAction(stock);

  return nonOwnedAction(stock);
}

function actionClass(action) {
  if (action === "Cash / Hold") return "gray";

  if (action === "Buy Now" || action === "Buy" || action === "Hold / Add") {
    return "green";
  }

  if (action === "Hold Trend") return "green";

  if (
    action === "Watch for Entry" ||
    action === "Hold" ||
    action === "Hold — Prove It" ||
    action === "Hold but Extended" ||
    action === "Hold — Watch Closely"
  ) {
    return "yellow";
  }

  if (action === "Trim Into Strength" || action === "Trim / Watch Closely") {
    return "orange";
  }

  return "red";
}

export default function Home() {
  const [stocks, setStocks] = useState([]);
  const [loadingTop, setLoadingTop] = useState(true);
  const [topError, setTopError] = useState("");
  const [selectedTheme, setSelectedTheme] = useState("broad");
  const [themeMeta, setThemeMeta] = useState(null);

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
    loadTopIdeas(selectedTheme);
    loadPortfolio();
  }, []);

  async function loadTopIdeas(theme = selectedTheme) {
    setLoadingTop(true);
    setTopError("");

    try {
      const res = await fetch(`/api/top5?theme=${encodeURIComponent(theme)}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data?.detail || data?.error || "Failed to load top ideas."
        );
      }

      const list = Array.isArray(data)
        ? data
        : data?.stocks || data?.results || data?.data || [];

      setStocks(list.slice(0, 10));
      setThemeMeta(data?.selectedTheme || null);
    } catch (err) {
      setTopError(err.message || "Failed to load top ideas.");
    } finally {
      setLoadingTop(false);
    }
  }

  function changeTheme(nextTheme) {
    setSelectedTheme(nextTheme);
    loadTopIdeas(nextTheme);
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

  async function exportPortfolio() {
    try {
      const json = JSON.stringify(portfolio, null, 2);

      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(json);
        alert(
          "Portfolio copied. Paste it into Import Portfolio on another device."
        );
      } else {
        window.prompt("Copy this portfolio data:", json);
      }
    } catch {
      alert("Could not export portfolio.");
    }
  }

  function importPortfolio() {
    const raw = window.prompt("Paste exported portfolio JSON:");

    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);

      if (!Array.isArray(parsed)) {
        throw new Error("Invalid portfolio.");
      }

      const cleaned = parsed
        .map((p) => ({
          symbol: String(p?.symbol || "").trim().toUpperCase(),
          shares: Number(p?.shares),
          avgCost: Number(p?.avgCost),
        }))
        .filter(
          (p) =>
            p.symbol &&
            Number.isFinite(p.shares) &&
            p.shares > 0 &&
            Number.isFinite(p.avgCost) &&
            p.avgCost >= 0
        );

      if (!cleaned.length) {
        throw new Error("No valid positions.");
      }

      savePortfolio(cleaned);
      setPortfolioResults([]);
      alert("Portfolio imported successfully.");
    } catch {
      alert("Invalid portfolio data.");
    }
  }

  function addPosition() {
    const cleanSymbol = newSymbol.trim().toUpperCase();
    const shares = Number(newShares);
    const avgCost = Number(newCost);

    if (
      !cleanSymbol ||
      !Number.isFinite(shares) ||
      shares <= 0 ||
      !Number.isFinite(avgCost) ||
      avgCost < 0
    ) {
      alert("Please enter symbol, shares, and cost per share.");
      return;
    }

    const next = [...portfolio];
    const index = next.findIndex((p) => p.symbol === cleanSymbol);

    if (index >= 0) {
      next[index] = {
        symbol: cleanSymbol,
        shares,
        avgCost,
      };
    } else {
      next.push({
        symbol: cleanSymbol,
        shares,
        avgCost,
      });
    }

    savePortfolio(next);
    setNewSymbol("");
    setNewShares("");
    setNewCost("");
  }

  function removePosition(symbolToRemove) {
    savePortfolio(portfolio.filter((p) => p.symbol !== symbolToRemove));
    setPortfolioResults((prev) =>
      prev.filter((p) => p.symbol !== symbolToRemove)
    );
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
        throw new Error(
          data?.detail || data?.error || "Failed to analyze symbol."
        );
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
          if (isCashLikeSymbol(position.symbol)) {
            const calculated = calculatePosition(position, position.avgCost || 1);

            results.push({
              symbol: position.symbol,
              name: "Cash / Money Market",
              shares: calculated.shares,
              avgCost: calculated.avgCost,
              currentPrice: calculated.price,
              value: calculated.value,
              costBasis: calculated.costBasis,
              gainLoss: calculated.gainLoss,
              gainLossPct: calculated.gainLossPct,
              isCash: true,
            });

            continue;
          }

          const res = await fetch(
            `/api?symbol=${encodeURIComponent(position.symbol)}`
          );

          const data = await res.json();

          if (!res.ok) {
            throw new Error(data?.detail || data?.error || "Could not analyze");
          }

          const stock = data?.stock || data?.result || data;
          const livePrice = getPrice(stock);
          const calculated = calculatePosition(position, livePrice);

          results.push({
            ...stock,
            symbol: position.symbol,
            shares: calculated.shares,
            avgCost: calculated.avgCost,
            currentPrice: calculated.price,
            value: calculated.value,
            costBasis: calculated.costBasis,
            gainLoss: calculated.gainLoss,
            gainLossPct: calculated.gainLossPct,
          });
        } catch {
          const calculated = calculatePosition(position, 0);

          results.push({
            symbol: position.symbol,
            shares: calculated.shares,
            avgCost: calculated.avgCost,
            currentPrice: null,
            value: null,
            costBasis: calculated.costBasis,
            gainLoss: null,
            gainLossPct: null,
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
    let totalValue = 0;
    let totalCost = 0;

    for (const p of portfolioResults) {
      const value = Number(p.value);
      const costBasis = Number(p.costBasis);

      if (Number.isFinite(value)) totalValue += value;
      if (Number.isFinite(costBasis)) totalCost += costBasis;
    }

    const totalGainLoss = totalValue - totalCost;
    const totalGainLossPct =
      totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0;

    return {
      value: totalValue,
      costBasis: totalCost,
      gainLoss: totalGainLoss,
      gainLossPct: totalGainLossPct,
    };
  }, [portfolioResults]);

  const selectedThemeName =
    THEME_OPTIONS.find((theme) => theme.key === selectedTheme)?.name ||
    "Broad Market";

  return (
    <main className="page">
      <header className="header">
        <div>
          <h1>🧠 Asymmetry Screener</h1>
          <p>
            Institutional-style scoring with action labels for entries,
            watchlist ideas, and portfolio decisions.
          </p>
        </div>

        <button
          onClick={() => loadTopIdeas(selectedTheme)}
          className="button secondary"
        >
          Reload Screener
        </button>
      </header>

      <section className="card themeCard">
        <div className="sectionHeader">
          <div>
            <h2>Theme Focus</h2>
            <p className="muted">
              Use Broad Market for discovery, or select a focused macro theme.
            </p>
          </div>

          <select
            value={selectedTheme}
            onChange={(e) => changeTheme(e.target.value)}
            className="themeSelect"
          >
            {THEME_OPTIONS.map((theme) => (
              <option key={theme.key} value={theme.key}>
                {theme.name}
              </option>
            ))}
          </select>
        </div>

        <div className="themeSummary">
          <div>
            <span>Current Mode</span>
            <strong>{themeMeta?.name || selectedThemeName}</strong>
          </div>

          <div>
            <span>Purpose</span>
            <p>
              {themeMeta?.description ||
                "Full broad-market screen using your standard asymmetric setup rules."}
            </p>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="sectionTitle">
          <h2>🔥 Top 10 Ideas</h2>
          <p>
            {selectedTheme === "broad"
              ? "Broad-market discovery mode."
              : `Theme sub-screener: ${selectedThemeName}. Same discipline, narrower universe.`}
          </p>
        </div>

        {loadingTop && <p className="muted">Loading top ideas...</p>}
        {topError && <p className="error">{topError}</p>}

        {!loadingTop && !topError && (
          <>
            <div className="ideaGrid">
              {stocks.map((stock, idx) => {
                const action = displayAction(stock, false);
                const confidence = getConfidence(stock);
                const risk = getRisk(stock);

                return (
                  <div
                    className="ideaCard"
                    key={`${getSymbol(stock)}-card-${idx}`}
                  >
                    <div className="ideaTop">
                      <div>
                        <div className="ideaSymbol">{getSymbol(stock)}</div>
                        <div className="ideaPrice">{money(getPrice(stock))}</div>
                      </div>

                      <span className={`pill actionPill ${actionClass(action)}`}>
                        {action}
                      </span>
                    </div>

                    <div className="cardField">
                      <span>Context</span>
                      <strong className={`contextPill ${getContextTone(stock)}`}>
                        {shortContext(stock)}
                      </strong>
                    </div>

                    <div className="cardSplit">
                      <div>
                        <span>Confidence</span>
                        <strong
                          className={`miniMetric ${confidenceClass(confidence)}`}
                        >
                          {confidence}
                        </strong>
                      </div>

                      <div>
                        <span>Risk</span>
                        <strong className={`miniMetric ${riskClass(risk)}`}>
                          {risk}
                        </strong>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th className="stickyCol">Symbol</th>
                    <th>Name</th>
                    <th>Price</th>
                    <th>Chg %</th>
                    <th>Action</th>
                    <th>Context</th>
                    <th>Confidence</th>
                    <th>Risk</th>
                    <th>Why</th>
                    <th>Entry Note</th>
                  </tr>
                </thead>

                <tbody>
                  {stocks.map((stock, idx) => {
                    const action = displayAction(stock, false);
                    const confidence = getConfidence(stock);
                    const risk = getRisk(stock);

                    return (
                      <tr key={`${getSymbol(stock)}-row-${idx}`}>
                        <td className="symbol stickyCol">{getSymbol(stock)}</td>
                        <td>{getName(stock)}</td>
                        <td>{money(getPrice(stock))}</td>
                        <td
                          className={
                            getChangePct(stock) >= 0 ? "positive" : "negative"
                          }
                        >
                          {percent(getChangePct(stock))}
                        </td>
                        <td>
                          <span className={`pill ${actionClass(action)}`}>
                            {action}
                          </span>
                        </td>
                        <td>
                          <span className={`pill ${getContextTone(stock)}`}>
                            {getContext(stock)}
                          </span>
                        </td>
                        <td>
                          <span className={`pill ${confidenceClass(confidence)}`}>
                            {confidence}
                          </span>
                        </td>
                        <td>
                          <span className={`pill ${riskClass(risk)}`}>
                            {risk}
                          </span>
                        </td>
                        <td className="textCell">{getWhy(stock)}</td>
                        <td className="textCell mutedText">
                          {getEntryNote(stock)}
                        </td>
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
        <p className="muted">
          Uses non-owned logic: Buy Now, Buy, Watch for Entry, Avoid for Now.
        </p>

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

              <span
                className={`pill ${actionClass(displayAction(snapStock, false))}`}
              >
                {displayAction(snapStock, false)}
              </span>
            </div>

            <div className="metricGrid">
              <div>
                <span>Price</span>
                <strong>{money(getPrice(snapStock))}</strong>
              </div>

              <div>
                <span>Change</span>
                <strong
                  className={
                    getChangePct(snapStock) >= 0 ? "positive" : "negative"
                  }
                >
                  {percent(getChangePct(snapStock))}
                </strong>
              </div>

              <div>
                <span>Context</span>
                <strong className={`boxedValue ${getContextTone(snapStock)}`}>
                  {getContext(snapStock)}
                </strong>
              </div>

              <div>
                <span>Confidence</span>
                <strong
                  className={`boxedValue ${confidenceClass(
                    getConfidence(snapStock)
                  )}`}
                >
                  {getConfidence(snapStock)}
                </strong>
              </div>

              <div>
                <span>Risk</span>
                <strong className={`boxedValue ${riskClass(getRisk(snapStock))}`}>
                  {getRisk(snapStock)}
                </strong>
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
        <p className="muted">
          Uses ownership logic: Hold / Add, Hold Trend, Trim, Cash / Hold, or
          Exit.
        </p>

        <div className="portfolioTools">
          <button onClick={exportPortfolio} className="button secondary">
            Export Portfolio
          </button>

          <button onClick={importPortfolio} className="button secondary">
            Import Portfolio
          </button>
        </div>

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
            placeholder="Cost/share"
            type="number"
            step="any"
          />

          <button onClick={addPosition} className="button">
            Add / Update
          </button>
        </div>

        {portfolio.length > 0 && (
          <div className="positionChips">
            {portfolio.map((p) => (
              <div className="positionChip" key={p.symbol}>
                <span>
                  <strong>{p.symbol}</strong> · {number(p.shares, 2)} @{" "}
                  {money(p.avgCost)}
                </span>

                <button
                  onClick={() => removePosition(p.symbol)}
                  className="chipRemove"
                  aria-label={`Remove ${p.symbol}`}
                >
                  ×
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
              <span
                className={
                  portfolioTotals.gainLoss >= 0 ? "positive" : "negative"
                }
              >
                {money(portfolioTotals.gainLoss)} /{" "}
                {percent(portfolioTotals.gainLossPct)}
              </span>
            </div>
          </div>

          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th className="stickyCol">Symbol</th>
                  <th>Shares</th>
                  <th>Cost/share</th>
                  <th>Price</th>
                  <th>Value</th>
                  <th>Cost Basis</th>
                  <th>Gain / Loss</th>
                  <th>Action</th>
                  <th>Context</th>
                  <th>Confidence</th>
                  <th>Risk</th>
                </tr>
              </thead>

              <tbody>
                {portfolioResults.map((stock) => {
                  const action = stock.error
                    ? "Exit — Trend Failure"
                    : displayAction(stock, true);

                  const confidence = getConfidence(stock);
                  const risk = getRisk(stock);

                  return (
                    <tr key={stock.symbol}>
                      <td className="symbol stickyCol">{stock.symbol}</td>
                      <td>{number(stock.shares, 2)}</td>
                      <td>{money(stock.avgCost)}</td>
                      <td>{stock.error ? "—" : money(stock.currentPrice)}</td>
                      <td>{stock.error ? "—" : money(stock.value)}</td>
                      <td>{money(stock.costBasis)}</td>
                      <td
                        className={
                          stock.gainLoss >= 0 ? "positive" : "negative"
                        }
                      >
                        {stock.error
                          ? "—"
                          : `${money(stock.gainLoss)} / ${percent(
                              stock.gainLossPct
                            )}`}
                      </td>
                      <td>
                        <span className={`pill ${actionClass(action)}`}>
                          {action}
                        </span>
                      </td>
                      <td>
                        <span className={`pill ${getContextTone(stock)}`}>
                          {isCashLikeSymbol(stock)
                            ? "Cash position"
                            : getContext(stock)}
                        </span>
                      </td>
                      <td>
                        <span className={`pill ${confidenceClass(confidence)}`}>
                          {confidence}
                        </span>
                      </td>
                      <td>
                        <span className={`pill ${riskClass(risk)}`}>
                          {risk}
                        </span>
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

        .themeCard {
          border-color: #cbd5e1;
        }

        .themeSelect {
          border: 1px solid #cbd5e1;
          border-radius: 11px;
          padding: 11px 12px;
          font-size: 15px;
          font-weight: 800;
          background: white;
          min-width: 245px;
        }

        .themeSummary {
          display: grid;
          grid-template-columns: 260px 1fr;
          gap: 12px;
          margin-top: 14px;
        }

        .themeSummary div {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 12px;
        }

        .themeSummary span {
          display: block;
          color: #64748b;
          font-size: 12px;
          font-weight: 800;
          margin-bottom: 4px;
        }

        .themeSummary strong {
          font-size: 16px;
        }

        .themeSummary p {
          color: #334155;
          font-size: 14px;
        }

        .card > p,
        .sectionTitle p {
          color: #64748b;
          font-size: 14px;
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
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 18px;
        }

        .ideaCard {
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          background: white;
          padding: 13px;
          min-width: 0;
          overflow: hidden;
        }

        .ideaTop {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 10px;
        }

        .ideaSymbol {
          font-size: 20px;
          font-weight: 900;
          letter-spacing: 0.02em;
        }

        .ideaPrice {
          font-size: 15px;
          margin-top: 2px;
        }

        .actionPill {
          font-size: 12px;
          padding: 5px 9px;
          max-width: 96px;
          white-space: normal;
          line-height: 1.08;
          text-align: center;
        }

        .cardField {
          border-top: 1px solid #f1f5f9;
          padding-top: 9px;
          margin-top: 8px;
        }

        .cardField span,
        .cardSplit span {
          display: block;
          color: #64748b;
          font-size: 12px;
          font-weight: 800;
          margin-bottom: 4px;
        }

        .contextPill {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 5px 10px;
          font-size: 12px;
          font-weight: 900;
          line-height: 1.15;
          max-width: 100%;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .cardSplit {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-top: 12px;
        }

        .miniMetric {
          display: inline-flex;
          border-radius: 999px;
          padding: 4px 9px;
          font-size: 12px;
          font-weight: 900;
          white-space: nowrap;
        }

        .tableWrap {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          position: relative;
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
          background: white;
        }

        td {
          padding: 11px 10px;
          border-bottom: 1px solid #f1f5f9;
          vertical-align: top;
          background: white;
        }

        .stickyCol {
          position: sticky;
          left: 0;
          z-index: 3;
          background: white;
          box-shadow: 8px 0 10px rgba(15, 23, 42, 0.04);
        }

        th.stickyCol {
          z-index: 4;
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
        }

        .formRow {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 10px;
          margin-top: 14px;
        }

        .portfolioTools {
          display: flex;
          gap: 10px;
          margin: 14px 0;
          flex-wrap: wrap;
        }

        .portfolioForm {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr auto;
          gap: 10px;
          margin-top: 14px;
        }

        .positionChips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 14px;
        }

        .positionChip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 999px;
          padding: 7px 10px;
          font-size: 13px;
        }

        .chipRemove {
          border: 0;
          background: #e2e8f0;
          border-radius: 999px;
          width: 22px;
          height: 22px;
          cursor: pointer;
          font-weight: 900;
          color: #334155;
        }

        .pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          padding: 5px 10px;
          font-size: 12px;
          font-weight: 900;
          white-space: nowrap;
        }

        .green {
          background: #dcfce7;
          color: #166534;
        }

        .yellow {
          background: #fef9c3;
          color: #854d0e;
        }

        .orange {
          background: #ffedd5;
          color: #9a3412;
        }

        .red {
          background: #fee2e2;
          color: #991b1b;
        }

        .gray {
          background: #e2e8f0;
          color: #334155;
        }

        .positive {
          color: #15803d;
          font-weight: 800;
        }

        .negative {
          color: #b91c1c;
          font-weight: 800;
        }

        .error {
          color: #b91c1c;
          font-weight: 800;
          margin-top: 10px;
        }

        .resultBox {
          margin-top: 16px;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 14px;
          background: #f8fafc;
        }

        .resultTop {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 14px;
        }

        .resultTop p {
          color: #64748b;
          font-size: 14px;
          margin-top: 3px;
        }

        .metricGrid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 10px;
        }

        .metricGrid div {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 10px;
        }

        .metricGrid span {
          display: block;
          color: #64748b;
          font-size: 12px;
          font-weight: 800;
          margin-bottom: 5px;
        }

        .metricGrid strong {
          font-size: 15px;
        }

        .boxedValue {
          display: inline-flex;
          border-radius: 999px;
          padding: 5px 10px;
          font-size: 12px !important;
          font-weight: 900;
        }

        .snapNotes {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 12px;
        }

        .snapNotes div {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 12px;
        }

        .snapNotes span {
          display: block;
          color: #64748b;
          font-size: 12px;
          font-weight: 900;
          margin-bottom: 5px;
        }

        .snapNotes p {
          color: #334155;
          line-height: 1.35;
          font-size: 14px;
        }

        .totals {
          min-width: 180px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 10px;
          text-align: right;
        }

        .totals span {
          display: block;
          font-size: 12px;
          color: #64748b;
          font-weight: 800;
        }

        .totals strong {
          display: block;
          font-size: 18px;
          margin: 3px 0;
        }

        @media (max-width: 1100px) {
          .ideaGrid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .metricGrid {
            grid-template-columns: repeat(2, 1fr);
          }

          .themeSummary {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 760px) {
          .page {
            padding: 18px;
          }

          .header,
          .sectionHeader {
            flex-direction: column;
          }

          .ideaGrid {
            grid-template-columns: 1fr;
          }

          .formRow,
          .portfolioForm {
            grid-template-columns: 1fr;
          }

          .snapNotes {
            grid-template-columns: 1fr;
          }

          .themeSelect {
            min-width: 100%;
          }
        }
      `}</style>
    </main>
  );
}

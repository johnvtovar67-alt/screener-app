import { useEffect, useMemo, useState } from "react";

const PORTFOLIO_KEY = "stock_screener_portfolio_v1";

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
  return clampScore(stock?.recommendation?.score ?? stock?.score ?? stock?.compositeScore ?? stock?.overallScore ?? 0);
}

function getTrigger(stock) {
  return clampScore(stock?.recommendation?.triggerScore ?? stock?.triggerScore ?? stock?.technicalSnapshot?.triggerScore ?? 0);
}

function getExpectationRisk(stock) {
  return clampScore(
    stock?.recommendation?.expectationRisk ??
      stock?.expectationRisk ??
      stock?.technicalSnapshot?.expectationRisk ??
      0
  );
}

function getExtensionRisk(stock) {
  return clampScore(
    stock?.recommendation?.extensionRisk ??
      stock?.extensionRisk ??
      stock?.technicalSnapshot?.extensionRisk ??
      0
  );
}

function getFreshBreakoutScore(stock) {
  return clampScore(
    stock?.recommendation?.freshBreakoutScore ??
      stock?.freshBreakoutScore ??
      stock?.technicalSnapshot?.freshBreakoutScore ??
      0
  );
}

function getThemeMaturity(stock) {
  return (
    stock?.recommendation?.themeMaturity ??
    stock?.themeMaturity ??
    stock?.technicalSnapshot?.themeMaturity ??
    "Neutral"
  );
}

function getSetupGrade(stock) {
  return (
    stock?.recommendation?.setupGrade ??
    stock?.setupGrade ??
    stock?.technicalSnapshot?.setupGrade ??
    "C"
  );
}

function getMomentumText(stock) {
  return (
    stock?.recommendation?.momentumLabel ??
    stock?.momentumLabel ??
    stock?.technicalSnapshot?.momentumLabel ??
    (() => {
      const momentumScore = Number(stock?.momentumScore ?? stock?.technicalSnapshot?.momentumScore);

      if (Number.isFinite(momentumScore)) {
        if (momentumScore >= 75) return "Strong";
        if (momentumScore >= 55) return "Building";
        return "Weak";
      }

      return "Weak";
    })()
  );
}

function getScoreTone(stock) {
  const tone = stock?.recommendation?.scoreTone;
  if (tone) return tone;
  const score = getScore(stock);
  if (score >= 75) return "green";
  if (score >= 60) return "yellow";
  return "red";
}

function getTriggerTone(stock) {
  const tone = stock?.recommendation?.triggerTone;
  if (tone) return tone;
  const trigger = getTrigger(stock);
  if (trigger >= 80) return "green";
  if (trigger >= 65) return "yellow";
  return "red";
}

function getMomentumTone(stock) {
  const tone = stock?.recommendation?.momentumTone;
  if (tone) return tone;
  const momentum = getMomentumText(stock);
  if (momentum === "Strong") return "green";
  if (momentum === "Building") return "yellow";
  return "red";
}

function getExpectationTone(stock) {
  const tone = stock?.recommendation?.expectationTone;
  if (tone) return tone;
  const risk = getExpectationRisk(stock);
  if (risk <= 25) return "green";
  if (risk <= 45) return "yellow";
  return "red";
}

function getSetupTone(stock) {
  const tone = stock?.recommendation?.setupTone;
  if (tone) return tone;
  const grade = getSetupGrade(stock);
  if (grade === "A") return "green";
  if (grade === "B" || grade === "B-") return "yellow";
  return "red";
}

function getWhy(stock) {
  return stock?.recommendation?.reason ?? stock?.reason ?? stock?.why ?? "Constructive setup, but wait for stronger confirmation.";
}

function getEntryNote(stock) {
  return stock?.recommendation?.entryNote ?? stock?.entryNote ?? stock?.note ?? "Wait for stronger price or volume confirmation.";
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

function tradeActionForStock(stock, owned = false) {
  const label = String(stock?.recommendation?.label ?? "").toUpperCase();
  const score = getScore(stock);
  const trigger = getTrigger(stock);
  const momentum = getMomentumText(stock);
  const expectationRisk = getExpectationRisk(stock);
  const extensionRisk = getExtensionRisk(stock);
  const freshBreakoutScore = getFreshBreakoutScore(stock);
  const gainLossPct = Number(stock?.gainLossPct);

  if (owned) {
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

    const trendFailing =
      momentum === "Weak" &&
      trigger < 65 &&
      score < 60;

    const extendedWinner =
      solidGain &&
      extensionRisk >= 55 &&
      momentum !== "Weak";

    const stretchedRisk =
      expectationRisk >= 60 ||
      extensionRisk >= 65;

    if (deepLoss && trendFailing) {
      return "Exit — Trend Failure";
    }

    if (trendFailing) {
      return "Exit — Trend Failure";
    }

    if (largeGain && stretchedRisk) {
      return "Trim Into Strength";
    }

    if (extendedWinner) {
      return "Hold but Extended";
    }

    if (label === "BUY NOW" && trendStrong && freshBreakoutScore >= 70 && !largeGain) {
      return "Hold / Add";
    }

    if (label === "BUY NOW" && trendStrong) {
      return "Hold Trend";
    }

    if (trigger >= 85 && momentum === "Strong" && expectationRisk <= 45 && extensionRisk <= 45) {
      return "Hold / Add";
    }

    if (meaningfulLoss && trigger >= 80 && momentum !== "Weak" && expectationRisk <= 50) {
      return "Hold — Prove It";
    }

    if (trigger >= 75 && momentum !== "Weak" && score >= 60) {
      return "Hold Trend";
    }

    if (momentum === "Weak" || score < 58) {
      return "Trim / Watch Closely";
    }

    return "Hold Trend";
  }

  if (expectationRisk >= 60 || extensionRisk >= 65) return "Avoid for Now";
  if (label === "BUY NOW") return "Buy Now";
  if (label === "WATCH FOR ENTRY") return "Watch for Entry";
  if (label === "WATCH") return "Watch";
  return "Avoid for Now";
}

function displayAction(stock, owned = false) {
  const action = tradeActionForStock(stock, owned);

  if (!owned && action === "Buy Now") {
    const dayMove = Number(getChangePct(stock));
    const expectationRisk = getExpectationRisk(stock);
    const extensionRisk = getExtensionRisk(stock);

    if ((Number.isFinite(dayMove) && dayMove >= 12) || expectationRisk >= 50 || extensionRisk >= 55) {
      return "Buy Now — Extended";
    }
  }

  return action;
}

function actionClass(action) {
  if (action === "Buy Now" || action === "Hold / Add") return "green";
  if (action === "Hold Trend") return "green";
  if (action === "Buy Now — Extended") return "redExtended";
  if (action === "Watch for Entry" || action === "Hold" || action === "Hold — Prove It") return "yellow";
  if (action === "Hold but Extended") return "yellow";
  if (action === "Trim Into Strength" || action === "Trim / Watch Closely") return "orange";
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

      if (!res.ok) throw new Error(data?.detail || data?.error || "Failed to load top ideas.");

      const list = Array.isArray(data) ? data : data?.stocks || data?.results || data?.data || [];
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
        alert("Portfolio copied. Paste it into Import Portfolio on another device.");
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
        .filter((p) => p.symbol && Number.isFinite(p.shares) && p.shares > 0 && Number.isFinite(p.avgCost) && p.avgCost >= 0);

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

    if (!cleanSymbol || !Number.isFinite(shares) || shares <= 0 || !Number.isFinite(avgCost) || avgCost < 0) {
      alert("Please enter symbol, shares, and cost per share.");
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

          if (!res.ok) throw new Error(data?.detail || data?.error || "Could not analyze");

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
    const totalGainLossPct = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0;

    return {
      value: totalValue,
      costBasis: totalCost,
      gainLoss: totalGainLoss,
      gainLossPct: totalGainLossPct,
    };
  }, [portfolioResults]);

  const selectedThemeName =
    THEME_OPTIONS.find((theme) => theme.key === selectedTheme)?.name || "Broad Market";

  return (
    <main className="page">
      <header className="header">
        <div>
          <h1>🧠 Asymmetry Screener</h1>
          <p>Broad-market screen plus theme-aware sub-screeners for disciplined entries.</p>
        </div>

        <button onClick={() => loadTopIdeas(selectedTheme)} className="button secondary">
          Reload Screener
        </button>
      </header>

      <section className="card themeCard">
        <div className="sectionHeader">
          <div>
            <h2>Theme Focus</h2>
            <p className="muted">
              Keep Broad Market for discovery, or select a macro theme to rank only that watchlist.
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
            <p>{themeMeta?.description || "Full broad-market screen using your standard asymmetric setup rules."}</p>
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
                const score = getScore(stock);
                const trigger = getTrigger(stock);
                const momentum = getMomentumText(stock);
                const expectationRisk = getExpectationRisk(stock);
                const setupGrade = getSetupGrade(stock);
                const action = displayAction(stock, false);

                return (
                  <div className="ideaCard" key={`${getSymbol(stock)}-card-${idx}`}>
                    <div className="ideaSymbol">{getSymbol(stock)}</div>
                    <div className="ideaPrice">{money(getPrice(stock))}</div>
                    <span className={`pill widePill ${actionClass(action)}`}>{action}</span>

                    <div className="miniMetricRow">
                      <span>Score</span>
                      <strong className={`miniMetric ${getScoreTone(stock)}`}>{score}</strong>
                    </div>

                    <div className="miniMetricRow">
                      <span>Trigger</span>
                      <strong className={`miniMetric ${getTriggerTone(stock)}`}>{trigger}</strong>
                    </div>

                    <div className="miniMetricRow">
                      <span>Momentum</span>
                      <strong className={`miniMetric ${getMomentumTone(stock)}`}>{momentum}</strong>
                    </div>

                    <div className="miniMetricRow">
                      <span>Expect Risk</span>
                      <strong className={`miniMetric ${getExpectationTone(stock)}`}>{expectationRisk}</strong>
                    </div>

                    <div className="miniMetricRow">
                      <span>Setup</span>
                      <strong className={`miniMetric ${getSetupTone(stock)}`}>{setupGrade}</strong>
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
                    <th>Score</th>
                    <th>Trigger</th>
                    <th>Momentum</th>
                    <th>Expectation Risk</th>
                    <th>Theme Maturity</th>
                    <th>Setup</th>
                    <th>Trade Action</th>
                    <th>Why</th>
                    <th>Entry Note</th>
                  </tr>
                </thead>
                <tbody>
                  {stocks.map((stock, idx) => {
                    const action = displayAction(stock, false);

                    return (
                      <tr key={`${getSymbol(stock)}-row-${idx}`}>
                        <td className="symbol stickyCol">{getSymbol(stock)}</td>
                        <td>{getName(stock)}</td>
                        <td>{money(getPrice(stock))}</td>
                        <td className={getChangePct(stock) >= 0 ? "positive" : "negative"}>
                          {percent(getChangePct(stock))}
                        </td>
                        <td>
                          <span className={`pill ${getScoreTone(stock)}`}>{getScore(stock)}</span>
                        </td>
                        <td>
                          <span className={`pill ${getTriggerTone(stock)}`}>{getTrigger(stock)}</span>
                        </td>
                        <td>
                          <span className={`pill ${getMomentumTone(stock)}`}>{getMomentumText(stock)}</span>
                        </td>
                        <td>
                          <span className={`pill ${getExpectationTone(stock)}`}>{getExpectationRisk(stock)}</span>
                        </td>
                        <td>
                          <span className={`pill ${getExpectationTone(stock)}`}>{getThemeMaturity(stock)}</span>
                        </td>
                        <td>
                          <span className={`pill ${getSetupTone(stock)}`}>{getSetupGrade(stock)}</span>
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
          <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="Lookup ticker..." />
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

              <span className={`pill ${actionClass(displayAction(snapStock, false))}`}>
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
                <strong className={getChangePct(snapStock) >= 0 ? "positive" : "negative"}>
                  {percent(getChangePct(snapStock))}
                </strong>
              </div>
              <div>
                <span>Score</span>
                <strong className={`boxedValue ${getScoreTone(snapStock)}`}>{getScore(snapStock)}</strong>
              </div>
              <div>
                <span>Trigger</span>
                <strong className={`boxedValue ${getTriggerTone(snapStock)}`}>{getTrigger(snapStock)}</strong>
              </div>
              <div>
                <span>Momentum</span>
                <strong className={`boxedValue ${getMomentumTone(snapStock)}`}>{getMomentumText(snapStock)}</strong>
              </div>
              <div>
                <span>Expectation Risk</span>
                <strong className={`boxedValue ${getExpectationTone(snapStock)}`}>{getExpectationRisk(snapStock)}</strong>
              </div>
              <div>
                <span>Setup</span>
                <strong className={`boxedValue ${getSetupTone(snapStock)}`}>{getSetupGrade(snapStock)}</strong>
              </div>
            </div>

            <div className="snapNotes">
              <div>
                <span>Theme Maturity</span>
                <p>{getThemeMaturity(snapStock)}</p>
              </div>
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
          Uses ownership logic: Hold Trend, Hold / Add, Hold but Extended, Trim Into Strength, Exit — Trend Failure.
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
          <input value={newSymbol} onChange={(e) => setNewSymbol(e.target.value.toUpperCase())} placeholder="Symbol" />
          <input value={newShares} onChange={(e) => setNewShares(e.target.value)} placeholder="Shares" type="number" step="any" />
          <input value={newCost} onChange={(e) => setNewCost(e.target.value)} placeholder="Cost/share" type="number" step="any" />
          <button onClick={addPosition} className="button">
            Add / Update
          </button>
        </div>

        {portfolio.length > 0 && (
          <div className="positionChips">
            {portfolio.map((p) => (
              <div className="positionChip" key={p.symbol}>
                <span>
                  <strong>{p.symbol}</strong> · {number(p.shares, 2)} @ {money(p.avgCost)}
                </span>
                <button onClick={() => removePosition(p.symbol)} className="chipRemove" aria-label={`Remove ${p.symbol}`}>
                  ×
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
                  <th className="stickyCol">Symbol</th>
                  <th>Shares</th>
                  <th>Cost/share</th>
                  <th>Price</th>
                  <th>Value</th>
                  <th>Cost Basis</th>
                  <th>Gain / Loss</th>
                  <th>Score</th>
                  <th>Trigger</th>
                  <th>Momentum</th>
                  <th>Expectation Risk</th>
                  <th>Setup</th>
                  <th>Trade Action</th>
                </tr>
              </thead>
              <tbody>
                {portfolioResults.map((stock) => {
                  const action = stock.error ? "Exit — Trend Failure" : displayAction(stock, true);

                  return (
                    <tr key={stock.symbol}>
                      <td className="symbol stickyCol">{stock.symbol}</td>
                      <td>{number(stock.shares, 2)}</td>
                      <td>{money(stock.avgCost)}</td>
                      <td>{stock.error ? "—" : money(stock.currentPrice)}</td>
                      <td>{stock.error ? "—" : money(stock.value)}</td>
                      <td>{money(stock.costBasis)}</td>
                      <td className={stock.gainLoss >= 0 ? "positive" : "negative"}>
                        {stock.error ? "—" : `${money(stock.gainLoss)} / ${percent(stock.gainLossPct)}`}
                      </td>
                      <td>
                        <span className={`pill ${getScoreTone(stock)}`}>{getScore(stock)}</span>
                      </td>
                      <td>
                        <span className={`pill ${getTriggerTone(stock)}`}>{getTrigger(stock)}</span>
                      </td>
                      <td>
                        <span className={`pill ${getMomentumTone(stock)}`}>{getMomentumText(stock)}</span>
                      </td>
                      <td>
                        <span className={`pill ${getExpectationTone(stock)}`}>{getExpectationRisk(stock)}</span>
                      </td>
                      <td>
                        <span className={`pill ${getSetupTone(stock)}`}>{getSetupGrade(stock)}</span>
                      </td>
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
          grid-template-columns: repeat(10, minmax(135px, 1fr));
          gap: 10px;
          margin-bottom: 18px;
          overflow-x: auto;
          padding-bottom: 4px;
        }

        .ideaCard {
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          background: white;
          padding: 10px;
          min-width: 135px;
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

        .miniMetricRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          color: #64748b;
          font-size: 12px;
          margin-top: 6px;
        }

        .miniMetric {
          border-radius: 999px;
          padding: 2px 7px;
          font-size: 11px;
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
          outline: none;
          box-sizing: border-box;
        }

        .formRow {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 10px;
          margin-top: 14px;
        }

        .portfolioTools {
          display: flex;
          flex-wrap: wrap;
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
          grid-template-columns: repeat(4, 1fr);
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

        .boxedValue {
          display: inline-flex;
          width: fit-content;
          border-radius: 999px;
          padding: 5px 10px;
          font-size: 13px;
          font-weight: 900;
        }

        .snapNotes {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
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

        .redExtended {
          background: linear-gradient(135deg, #dcfce7 0%, #fee2e2 100%);
          color: #7f1d1d;
          border: 1px solid #fecaca;
        }

        .gray {
          background: #f1f5f9;
          color: #475569;
          border: 1px solid #cbd5e1;
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
          border: 1px solid #e2e8f0;
          border-radius: 999px;
          padding: 7px 9px 7px 12px;
          background: #f8fafc;
          font-size: 13px;
          color: #334155;
          white-space: nowrap;
        }

        .positionChip strong {
          color: #0f172a;
          letter-spacing: 0.03em;
        }

        .chipRemove {
          width: 20px;
          height: 20px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 999px;
          background: #e2e8f0;
          color: #991b1b;
          font-size: 15px;
          font-weight: 900;
          line-height: 1;
          cursor: pointer;
          padding: 0;
        }

        .chipRemove:hover {
          background: #fecaca;
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

          .themeSummary {
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

          .sectionHeader {
            flex-direction: column;
          }

          .themeSelect {
            width: 100%;
            min-width: 0;
          }

          .formRow {
            grid-template-columns: 1fr;
          }

          .portfolioTools {
            display: grid;
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

          .totals {
            text-align: left;
          }

          table {
            min-width: 1200px;
          }
        }
      `}</style>
    </main>
  );
}

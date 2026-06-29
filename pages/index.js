// pages/index.js

import { useEffect, useMemo, useState } from "react";

const PORTFOLIO_KEY = "stock_screener_portfolio_v1";

const CASH_SYMBOLS = ["CASH", "SWVXX", "VMFXX", "SPAXX", "FDRXX", "MMF"];

const THEME_OPTIONS = [
  { key: "ai_compute", name: "AI Compute & Platforms" },
  { key: "ai_networking", name: "AI Networking" },
  { key: "cybersecurity", name: "Cybersecurity" },
  { key: "power", name: "Power & Electrification" },
  { key: "digital_infra", name: "Digital Infrastructure" },
  { key: "nuclear", name: "Nuclear / Baseload" },
  { key: "btc", name: "BTC / Digital Assets" },
  { key: "defense", name: "Defense & National Security" },
  { key: "space", name: "Space & Satellites" },
  { key: "drones", name: "Autonomy & Drones" },
  { key: "robotics", name: "Robotics & Automation" },
  { key: "industrial_software", name: "Industrial Software" },
  { key: "quantum", name: "Quantum Computing" },
  { key: "biotech", name: "Platform Biotech" },
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

function signedNumber(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}`;
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

function getNetChange(stock) {
  const direct = Number(
    stock?.change ??
      stock?.dayChange ??
      stock?.priceChange ??
      stock?.regularMarketChange ??
      stock?.quote?.change
  );

  if (Number.isFinite(direct)) return direct;

  const price = getPrice(stock);
  const pct = getChangePct(stock);

  if (Number.isFinite(price) && Number.isFinite(pct) && pct !== -100) {
    const previousClose = price / (1 + pct / 100);
    return price - previousClose;
  }

  return null;
}

function priceChangeText(stock) {
  const change = getNetChange(stock);
  const pct = getChangePct(stock);

  if (Number.isFinite(change) && Number.isFinite(pct)) {
    return `${signedNumber(change)} (${percent(pct)})`;
  }

  if (Number.isFinite(change)) return signedNumber(change);
  if (Number.isFinite(pct)) return `(${percent(pct)})`;
  return "—";
}

function priceChangeClass(stock) {
  const change = getNetChange(stock);
  const pct = getChangePct(stock);
  const n = Number.isFinite(change) ? change : pct;
  return Number(n) >= 0 ? "positive" : "negative";
}

function getRecommendation(stock) {
  const rec = stock?.recommendation;
  if (rec && typeof rec === "object") return rec;
  return {};
}

function normalizeActionLabel(value) {
  const label = String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

  if (["BUY", "BUY NOW", "BUY IMMEDIATELY", "STRONG BUY"].includes(label)) return "Buy";
  if (["STARTER", "STARTER ONLY", "STARTER BUY", "BREAKOUT", "BREAKOUT BUY", "BREAKOUT STARTER"].includes(label)) return "Starter";
  if (["WATCH", "WATCH FOR ENTRY", "WATCH CLOSELY", "NEAR MISS", "SETUP", "SETUP ONLY"].includes(label)) return "Watch";
  if (["AVOID", "AVOID FOR NOW", "EXIT / AVOID", "EXIT"].includes(label)) return "Avoid";
  return "Avoid";
}

function nonOwnedAction(stock) {
  if (isCashLikeSymbol(stock)) return "Cash";

  const rec = getRecommendation(stock);

  return normalizeActionLabel(
    rec?.displayLabel ??
      rec?.label ??
      rec?.recommendation ??
      rec?.tradeAction ??
      stock?.displayLabel ??
      stock?.label ??
      stock?.recommendation ??
      stock?.action
  );
}

function isCashLikeSymbol(symbolOrStock) {
  const symbol =
    typeof symbolOrStock === "string" ? symbolOrStock.toUpperCase() : getSymbol(symbolOrStock);

  return CASH_SYMBOLS.includes(symbol);
}

function getScore(stock) {
  return clampScore(getRecommendation(stock)?.score ?? stock?.score ?? stock?.compositeScore ?? stock?.overallScore ?? 0);
}

function getTrigger(stock) {
  return clampScore(getRecommendation(stock)?.triggerScore ?? stock?.triggerScore ?? stock?.technicalSnapshot?.triggerScore ?? 0);
}

function getMomentumScore(stock) {
  return clampScore(getRecommendation(stock)?.momentumScore ?? stock?.momentumScore ?? stock?.technicalSnapshot?.momentumScore ?? 0);
}

function getExpectationRisk(stock) {
  return clampScore(
    getRecommendation(stock)?.expectationRisk ??
      getRecommendation(stock)?.riskScore ??
      stock?.expectationRisk ??
      stock?.riskScore ??
      stock?.technicalSnapshot?.expectationRisk ??
      stock?.technicalSnapshot?.riskScore ??
      0
  );
}

function getConviction(stock) {
  return stock?.convictionGrade || "B";
}

function getTheme(stock) {
  return stock?.primaryTheme || stock?.theme || "Other";
}

function getCatalyst(stock) {
  return stock?.catalyst || "Setup";
}

function getDecisionClock(stock) {
  return stock?.decisionClock || "1–3 Months";
}

function getDominantReason(stock) {
  const rec = getRecommendation(stock);
  const direct = cleanSentence(
    rec?.dominantReason ??
      stock?.dominantReason ??
      rec?.blockedReason ??
      stock?.blockedReason
  );

  if (direct) return direct;

  const action = nonOwnedAction(stock);

  if (action === "Buy") return "Confirmed setup; normal sizing allowed.";
  if (action === "Starter") return "Setup is improving; starter only.";
  if (action === "Watch") return "Setup is close, but not ready for fresh capital yet.";

  return "Setup is not strong enough for new capital yet.";
}

function getActionSummary(stock) {
  const rec = getRecommendation(stock);
  const direct = cleanSentence(rec?.actionSummary ?? stock?.actionSummary ?? stock?.summary);
  if (direct) return direct;

  const action = nonOwnedAction(stock);

  if (action === "Buy") return "Confirmed setup; normal sizing allowed.";
  if (action === "Starter") return `${getCatalyst(stock)} setup; starter only.`;
  if (action === "Watch") return getDominantReason(stock);
  return `Avoid for now. ${getDominantReason(stock)}`;
}

function getTriggerNeeded(stock) {
  const rec = getRecommendation(stock);
  const direct = cleanSentence(stock?.triggerNeeded || rec?.entryNote || stock?.entryNote);
  if (direct) return direct;

  const price = getPrice(stock);
  const action = nonOwnedAction(stock);

  if (action === "Buy") return "Immediate. Use normal sizing with a defined invalidation level.";
  if (action === "Starter") return "Start small. Add only after strength holds or volume confirms.";
  if (action === "Watch" && Number.isFinite(price)) {
    return `Watch for a break above ${money(price * 1.03)} or a constructive pullback to support.`;
  }
  return "Avoid until the setup materially improves.";
}

function cleanSentence(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/\s+\./g, ".")
    .trim();
}

function actionClass(action) {
  if (action === "Cash") return "gray";
  if (action === "Buy" || action === "Hold / Add") return "green";
  if (action === "Starter" || action === "Trim") return "orange";
  if (action === "Watch" || action === "Hold") return "yellow";
  return "red";
}

function rankActionable(a, b) {
  const rank = { Buy: 3, Starter: 2, Watch: 1, Avoid: 0, Cash: 0 };
  const actionRankA = rank[nonOwnedAction(a)] ?? 0;
  const actionRankB = rank[nonOwnedAction(b)] ?? 0;

  if (actionRankB !== actionRankA) return actionRankB - actionRankA;

  const gradeRank = { "A+": 6, A: 5, "A-": 4, "B+": 3, B: 2, C: 1 };
  const gradeA = gradeRank[getConviction(a)] ?? 0;
  const gradeB = gradeRank[getConviction(b)] ?? 0;

  if (gradeB !== gradeA) return gradeB - gradeA;

  const triggerB = getTrigger(b);
  const triggerA = getTrigger(a);

  if (triggerB !== triggerA) return triggerB - triggerA;

  return getScore(b) - getScore(a);
}

function rankNearMiss(a, b) {
  const actionDiff = rankActionable(a, b);
  if (actionDiff !== 0) return actionDiff;

  const momentumA = getMomentumScore(a);
  const momentumB = getMomentumScore(b);

  if (momentumB !== momentumA) return momentumB - momentumA;

  return getScore(b) - getScore(a);
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

function portfolioAction(stock) {
  if (isCashLikeSymbol(stock)) return "Cash";

  const buyAction = nonOwnedAction(stock);
  const score = getScore(stock);
  const trigger = getTrigger(stock);
  const momentum = getMomentumScore(stock);
  const risk = getExpectationRisk(stock);
  const gainLossPct = Number(stock?.gainLossPct);

  const deepLoss = Number.isFinite(gainLossPct) && gainLossPct <= -20;
  const bigGain = Number.isFinite(gainLossPct) && gainLossPct >= 35;

  if (deepLoss && score < 48 && trigger < 50) return "Review / Reduce";
  if (bigGain && risk >= 78 && momentum < 55) return "Trim";
  if (buyAction === "Buy" && score >= 72 && risk <= 74) return "Hold / Add";
  if (buyAction === "Starter" && trigger >= 60) return "Hold";
  if (buyAction === "Watch" && score >= 52) return "Hold";

  return "Hold";
}

function portfolioHealth(stock) {
  if (isCashLikeSymbol(stock)) return "Cash";

  const score = getScore(stock);
  const trigger = getTrigger(stock);
  const momentum = getMomentumScore(stock);
  const risk = getExpectationRisk(stock);

  const health = score * 0.38 + trigger * 0.24 + momentum * 0.22 + (100 - risk) * 0.16;

  if (health >= 84) return "A+";
  if (health >= 78) return "A";
  if (health >= 72) return "A-";
  if (health >= 64) return "B+";
  if (health >= 56) return "B";
  return "C";
}

function portfolioRisk(stock) {
  if (isCashLikeSymbol(stock)) return "Low";

  const risk = getExpectationRisk(stock);
  const beta = Number(stock?.beta);
  const gainLossPct = Number(stock?.gainLossPct);

  if (risk >= 78 || beta >= 2 || gainLossPct <= -20) return "High";
  if (risk >= 62 || beta >= 1.35) return "Medium";
  return "Low";
}

function portfolioNextDecision(stock) {
  if (isCashLikeSymbol(stock)) return "Hold cash / dry powder.";

  const action = portfolioAction(stock);
  const nonOwned = nonOwnedAction(stock);
  const price = getPrice(stock);
  const support = Number.isFinite(price) ? money(price * 0.96) : "support";
  const breakout = Number.isFinite(price) ? money(price * 1.04) : "breakout";

  if (action === "Hold / Add") return `Add only on a clean pullback near ${support} or renewed strength above ${breakout}.`;
  if (action === "Trim") return "Protect gains; trim only if momentum fades or risk remains elevated.";
  if (action === "Review / Reduce") return "Review thesis. Reduce if the stock cannot reclaim trend support.";
  if (nonOwned === "Buy") return "Thesis healthy. Add selectively; do not chase oversized.";
  if (nonOwned === "Starter") return "Hold. Add only after the starter setup confirms.";
  if (nonOwned === "Watch") return "Hold existing shares; wait for better confirmation before adding.";
  return "Hold only if thesis is still intact.";
}

function portfolioThesis(stock) {
  const theme = getTheme(stock);
  if (theme === "BTC / Digital Assets") return "Bitcoin exposure";
  if (theme === "AI Compute & Platforms") return "AI compute/platform";
  if (theme === "AI Networking") return "AI networking";
  if (theme === "Cybersecurity") return "Cybersecurity/data";
  if (theme === "Power & Electrification") return "Power/electrification";
  if (theme === "Defense & National Security") return "Defense/security";
  if (theme === "Space & Satellites") return "Space/satellite";
  if (theme === "Autonomy & Drones") return "Autonomy/drones";
  return theme;
}

async function mapWithClientConcurrency(items = [], concurrency = 5, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;

      try {
        results[index] = { ok: true, value: await mapper(items[index], index) };
      } catch (error) {
        results[index] = {
          ok: false,
          symbol: getSymbol(items[index]) || String(items[index]?.symbol || ""),
          error: error?.message || String(error),
        };
      }
    }
  }

  const workerCount = Math.min(concurrency, Math.max(items.length, 1));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function OpportunityCard({ stock }) {
  const action = nonOwnedAction(stock);

  return (
    <article className={`ideaCard ${actionClass(action)}`}>
      <div className="ideaTop">
        <div>
          <h3>{getSymbol(stock)}</h3>
          <p>{getName(stock)}</p>
        </div>

        <span className={`actionPill ${actionClass(action)}`}>{action}</span>
      </div>

      <div className="badgeRow">
        <span className="themeBadge">{getTheme(stock)}</span>
        <span className="convictionBadge">Conviction {getConviction(stock)}</span>
        <span className="catalystBadge">{getCatalyst(stock)}</span>
      </div>

      <div className="priceRow">
        <strong>{money(getPrice(stock))}</strong>
        <span className={priceChangeClass(stock)}>{priceChangeText(stock)}</span>
      </div>

      <p className="reasonBox">{getActionSummary(stock)}</p>

      <div className="miniMeta">
        <span>Decision Clock</span>
        <strong>{getDecisionClock(stock)}</strong>
      </div>
    </article>
  );
}

function OnDeckTable({ rows }) {
  return (
    <section className="card">
      <div className="sectionTitle">
        <div>
          <h2>🟡 On Deck</h2>
          <p>Closest candidates. Good companies, but timing is not fully there yet.</p>
        </div>
      </div>

      {!rows.length ? (
        <p className="muted">No on-deck names right now.</p>
      ) : (
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Theme</th>
                <th>Conviction</th>
                <th>Catalyst</th>
                <th>Price</th>
                <th>Net Change</th>
                <th>Status</th>
                <th>What Is Missing</th>
                <th>Trigger Needed</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((stock) => (
                <tr key={getSymbol(stock)}>
                  <td className="symbol">{getSymbol(stock)}</td>
                  <td>{getTheme(stock)}</td>
                  <td>
                    <span className="smallBadge">{getConviction(stock)}</span>
                  </td>
                  <td>{getCatalyst(stock)}</td>
                  <td>{money(getPrice(stock))}</td>
                  <td className={priceChangeClass(stock)}>{priceChangeText(stock)}</td>
                  <td>
                    <span className="pill yellow">Setup</span>
                  </td>
                  <td>{getDominantReason(stock)}</td>
                  <td>{getTriggerNeeded(stock)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState("opportunities");
  const [stocks, setStocks] = useState([]);
  const [themeStocks, setThemeStocks] = useState([]);
  const [themeLeadership, setThemeLeadership] = useState([]);
  const [themeMeta, setThemeMeta] = useState(null);
  const [screenerMeta, setScreenerMeta] = useState(null);
  const [selectedTheme, setSelectedTheme] = useState("ai_compute");
  const [loadingTop, setLoadingTop] = useState(false);
  const [topError, setTopError] = useState("");
  const [refreshWarning, setRefreshWarning] = useState("");

  const [portfolio, setPortfolio] = useState([]);
  const [portfolioResults, setPortfolioResults] = useState([]);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [newSymbol, setNewSymbol] = useState("");
  const [newShares, setNewShares] = useState("");
  const [newCost, setNewCost] = useState("");

  const [symbol, setSymbol] = useState("");
  const [snapStock, setSnapStock] = useState(null);
  const [snapLoading, setSnapLoading] = useState(false);
  const [snapError, setSnapError] = useState("");

  useEffect(() => {
    loadPortfolio();
    loadTopIdeas("opportunities");
  }, []);

  const buyIdeas = useMemo(() => {
    return stocks.filter((stock) => nonOwnedAction(stock) === "Buy").sort(rankActionable);
  }, [stocks]);

  const starterIdeas = useMemo(() => {
    return stocks.filter((stock) => nonOwnedAction(stock) === "Starter").sort(rankActionable).slice(0, 8);
  }, [stocks]);

  const onDeck = useMemo(() => {
    return stocks.filter((stock) => nonOwnedAction(stock) === "Watch").sort(rankNearMiss).slice(0, 8);
  }, [stocks]);

  const themeBuyIdeas = useMemo(() => {
    return themeStocks.filter((stock) => nonOwnedAction(stock) === "Buy").sort(rankActionable);
  }, [themeStocks]);

  const themeStarterIdeas = useMemo(() => {
    return themeStocks.filter((stock) => nonOwnedAction(stock) === "Starter").sort(rankActionable).slice(0, 8);
  }, [themeStocks]);

  const themeOnDeck = useMemo(() => {
    return themeStocks.filter((stock) => nonOwnedAction(stock) === "Watch").sort(rankNearMiss).slice(0, 8);
  }, [themeStocks]);

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
    THEME_OPTIONS.find((theme) => theme.key === selectedTheme)?.name || "Theme";

  async function loadTopIdeas(theme = "opportunities") {
    setLoadingTop(true);
    setTopError("");
    setRefreshWarning("");

    try {
      const res = await fetch(`/api/top5?theme=${encodeURIComponent(theme)}`, {
        cache: "no-store",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.detail || data?.error || "Failed to load trade screen.");
      }

      const list = Array.isArray(data?.stocks) ? data.stocks : [];

      if (theme === "opportunities") {
        setStocks(list);
        setThemeLeadership(data?.themeLeadership || []);
      } else {
        setThemeStocks(list);
      }

      setThemeMeta(data?.selectedTheme || null);
      setScreenerMeta(data?.meta || null);
    } catch (err) {
      const message = err.message || "Failed to load trade screen.";

      if (theme === "opportunities" && stocks.length > 0) {
        setRefreshWarning(`Quote refresh failed — showing last successful screen. ${message}`);
      } else {
        setTopError(message);
        setScreenerMeta(null);
      }
    } finally {
      setLoadingTop(false);
    }
  }

  async function changeTheme(nextTheme) {
    setSelectedTheme(nextTheme);
    await loadTopIdeas(nextTheme);
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
      if (!Array.isArray(parsed)) throw new Error("Invalid portfolio.");

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

      if (!cleaned.length) throw new Error("No valid positions.");

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

    if (index >= 0) {
      next[index] = { symbol: cleanSymbol, shares, avgCost };
    } else {
      next.push({ symbol: cleanSymbol, shares, avgCost });
    }

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
      const res = await fetch(`/api?symbol=${encodeURIComponent(cleanSymbol)}`, {
        cache: "no-store",
      });
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
      const results = await mapWithClientConcurrency(portfolio, 4, async (position) => {
        if (isCashLikeSymbol(position.symbol)) {
          const calculated = calculatePosition(position, position.avgCost || 1);

          return {
            symbol: position.symbol,
            name: "Cash / Money Market",
            shares: calculated.shares,
            avgCost: calculated.avgCost,
            currentPrice: calculated.price,
            price: calculated.price,
            value: calculated.value,
            costBasis: calculated.costBasis,
            gainLoss: calculated.gainLoss,
            gainLossPct: calculated.gainLossPct,
            primaryTheme: "Cash",
            theme: "Cash",
            isCash: true,
          };
        }

        const res = await fetch(`/api?symbol=${encodeURIComponent(position.symbol)}`, {
          cache: "no-store",
        });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.detail || data?.error || `Failed to analyze ${position.symbol}.`);
        }

        const stock = data?.stock || data?.result || data;
        const livePrice = getPrice(stock);
        const calculated = calculatePosition(position, livePrice);

        return {
          ...stock,
          shares: calculated.shares,
          avgCost: calculated.avgCost,
          currentPrice: calculated.price,
          price: calculated.price,
          value: calculated.value,
          costBasis: calculated.costBasis,
          gainLoss: calculated.gainLoss,
          gainLossPct: calculated.gainLossPct,
        };
      });

      const rows = results.map((r) => {
        if (r.ok) return r.value;
        return {
          symbol: r.symbol,
          name: r.symbol,
          error: r.error,
        };
      });

      setPortfolioResults(rows);
    } finally {
      setPortfolioLoading(false);
    }
  }

  function renderLeadershipRibbon() {
    if (!themeLeadership.length) return null;

    return (
      <section className="leadershipRibbon">
        <div>
          <span>Today's Leadership</span>
          <strong>Theme Rotation Snapshot</strong>
        </div>

        <div className="leadershipItems">
          {themeLeadership.slice(0, 5).map((theme) => (
            <span key={theme.theme} className="leadershipPill">
              {theme.theme} <strong>{theme.averageStrength}</strong>
            </span>
          ))}
        </div>
      </section>
    );
  }

  return (
    <main className="page">
      <header className="header">
        <div>
          <h1>🧠 Investment Operating System</h1>
          <p>Fresh-capital ideas, portfolio decisions, thesis research, and single-symbol checks.</p>
        </div>

        <button onClick={() => loadTopIdeas(activeTab === "themes" ? selectedTheme : "opportunities")} className="button secondary">
          {loadingTop ? "Refreshing..." : "Reload"}
        </button>
      </header>

      <nav className="tabs">
        <button className={activeTab === "opportunities" ? "active" : ""} onClick={() => setActiveTab("opportunities")}>
          Opportunities
        </button>
        <button className={activeTab === "portfolio" ? "active" : ""} onClick={() => setActiveTab("portfolio")}>
          My Portfolio
        </button>
        <button
          className={activeTab === "themes" ? "active" : ""}
          onClick={() => {
            setActiveTab("themes");
            if (!themeStocks.length) loadTopIdeas(selectedTheme);
          }}
        >
          Themes
        </button>
        <button className={activeTab === "single" ? "active" : ""} onClick={() => setActiveTab("single")}>
          Single Symbol
        </button>
      </nav>

      {refreshWarning && <p className="warning">{refreshWarning}</p>}
      {topError && <p className="error">{topError}</p>}

      {activeTab === "opportunities" && (
        <>
          <section className="card modeCard">
            <div className="themeSummary">
              <div>
                <span>Current Mode</span>
                <strong>Best Opportunities</strong>
              </div>

              <div>
                <span>Purpose</span>
                <p>Fresh-capital screen. Theme labels explain context; they do not change the score.</p>
              </div>
            </div>
          </section>

          {renderLeadershipRibbon()}

          <section className="card actionCard">
            <div className="sectionTitle compactSectionTitle">
              <h2>🔥 Opportunities</h2>
              <p>Fresh money only. Buy = normal size. Starter = tactical size. Watch = wait.</p>
            </div>

            {loadingTop && stocks.length === 0 && <p className="muted">Loading opportunities...</p>}

            {buyIdeas.length > 0 && (
              <>
                <h3 className="bucketTitle">Buy</h3>
                <div className="ideaGrid">
                  {buyIdeas.map((stock) => (
                    <OpportunityCard key={getSymbol(stock)} stock={stock} />
                  ))}
                </div>
              </>
            )}

            {starterIdeas.length > 0 && (
              <>
                <h3 className="bucketTitle divider">Starter</h3>
                <div className="ideaGrid">
                  {starterIdeas.map((stock) => (
                    <OpportunityCard key={getSymbol(stock)} stock={stock} />
                  ))}
                </div>
              </>
            )}

            {!buyIdeas.length && !starterIdeas.length && !loadingTop && (
              <p className="muted">No actionable fresh-capital ideas right now. Check On Deck or be patient.</p>
            )}
          </section>

          <OnDeckTable rows={onDeck} />
        </>
      )}

      {activeTab === "portfolio" && (
        <>
          <section className="card">
            <div className="sectionTitle">
              <div>
                <h2>💼 My Portfolio</h2>
                <p>Designed for owned positions: thesis health, add/hold/trim decisions, and next action.</p>
              </div>

              <div className="buttonRow">
                <button onClick={exportPortfolio} className="button secondary">Export</button>
                <button onClick={importPortfolio} className="button secondary">Import</button>
                <button onClick={analyzePortfolio} disabled={!portfolio.length || portfolioLoading} className="button">
                  {portfolioLoading ? "Analyzing..." : "Analyze Portfolio"}
                </button>
              </div>
            </div>

            <div className="inputGrid">
              <input value={newSymbol} onChange={(e) => setNewSymbol(e.target.value)} placeholder="Symbol" />
              <input value={newShares} onChange={(e) => setNewShares(e.target.value)} placeholder="Shares" />
              <input value={newCost} onChange={(e) => setNewCost(e.target.value)} placeholder="Avg cost" />
              <button onClick={addPosition} className="button">Add / Update</button>
            </div>

            {portfolio.length > 0 && (
              <div className="positionChips">
                {portfolio.map((p) => (
                  <span key={p.symbol} className="positionChip">
                    <strong>{p.symbol}</strong> {number(p.shares, 2)} @ {money(p.avgCost)}
                    <button onClick={() => removePosition(p.symbol)} aria-label={`Remove ${p.symbol}`}>×</button>
                  </span>
                ))}
              </div>
            )}
          </section>

          {portfolioResults.length > 0 && (
            <section className="card">
              <div className="sectionTitle">
                <div>
                  <h2>Portfolio Decisions</h2>
                  <p>This is not a fresh-capital screen. It evaluates whether the owned thesis is still healthy.</p>
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
                      <th>Thesis</th>
                      <th>Action</th>
                      <th>Health</th>
                      <th>Risk</th>
                      <th>Price</th>
                      <th>Gain / Loss</th>
                      <th>Next Decision</th>
                    </tr>
                  </thead>

                  <tbody>
                    {portfolioResults.map((stock) => {
                      const action = stock.error ? "Review / Reduce" : portfolioAction(stock);
                      return (
                        <tr key={getSymbol(stock)}>
                          <td>
                            <strong>{getSymbol(stock)}</strong>
                            <div className="mutedSmall">{getName(stock)}</div>
                          </td>
                          <td>{stock.error ? "Data unavailable" : portfolioThesis(stock)}</td>
                          <td>
                            <span className={`pill ${actionClass(action)}`}>{action}</span>
                          </td>
                          <td>
                            <span className="smallBadge">{stock.error ? "—" : portfolioHealth(stock)}</span>
                          </td>
                          <td>{stock.error ? "—" : portfolioRisk(stock)}</td>
                          <td>
                            {stock.error ? (
                              "—"
                            ) : (
                              <div className="priceStack">
                                <strong>{money(getPrice(stock))}</strong>
                                <span className={priceChangeClass(stock)}>{priceChangeText(stock)}</span>
                              </div>
                            )}
                          </td>
                          <td className={stock.gainLoss >= 0 ? "positive" : "negative"}>
                            {stock.error ? "—" : `${money(stock.gainLoss)} / ${percent(stock.gainLossPct)}`}
                          </td>
                          <td>{stock.error ? stock.error : portfolioNextDecision(stock)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {activeTab === "themes" && (
        <>
          <section className="card modeCard">
            <div className="sectionTitle">
              <div>
                <h2>🔎 Thesis Research</h2>
                <p>Use this only when you want to research a specific secular theme.</p>
              </div>

              <select value={selectedTheme} onChange={(e) => changeTheme(e.target.value)} className="themeSelect">
                {THEME_OPTIONS.map((theme) => (
                  <option key={theme.key} value={theme.key}>{theme.name}</option>
                ))}
              </select>
            </div>

            <div className="themeSummary">
              <div>
                <span>Theme</span>
                <strong>{themeMeta?.name || selectedThemeName}</strong>
              </div>

              <div>
                <span>Purpose</span>
                <p>{themeMeta?.description || "Focused research list using the same scoring model."}</p>
              </div>
            </div>
          </section>

          <section className="card actionCard">
            <div className="sectionTitle compactSectionTitle">
              <h2>{selectedThemeName}</h2>
              <p>Same scoring model, narrower thesis universe.</p>
            </div>

            {themeBuyIdeas.length > 0 && (
              <>
                <h3 className="bucketTitle">Buy</h3>
                <div className="ideaGrid">
                  {themeBuyIdeas.map((stock) => (
                    <OpportunityCard key={getSymbol(stock)} stock={stock} />
                  ))}
                </div>
              </>
            )}

            {themeStarterIdeas.length > 0 && (
              <>
                <h3 className="bucketTitle divider">Starter</h3>
                <div className="ideaGrid">
                  {themeStarterIdeas.map((stock) => (
                    <OpportunityCard key={getSymbol(stock)} stock={stock} />
                  ))}
                </div>
              </>
            )}

            {!themeBuyIdeas.length && !themeStarterIdeas.length && !loadingTop && (
              <p className="muted">No actionable names in this theme right now.</p>
            )}
          </section>

          <OnDeckTable rows={themeOnDeck} />
        </>
      )}

      {activeTab === "single" && (
        <section className="card">
          <div className="sectionTitle">
            <div>
              <h2>🎯 Single Symbol</h2>
              <p>Fast answer for one stock using the same scoring engine.</p>
            </div>
          </div>

          <form onSubmit={analyzeSymbol} className="singleForm">
            <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="MSTR, ANET, CRWD..." />
            <button type="submit" className="button" disabled={snapLoading}>
              {snapLoading ? "Checking..." : "Check"}
            </button>
          </form>

          {snapError && <p className="error">{snapError}</p>}

          {snapStock && (
            <div className="singleResult">
              <OpportunityCard stock={snapStock} />

              <div className="singleDetails">
                <div>
                  <span>Score</span>
                  <strong>{getScore(snapStock)}</strong>
                </div>
                <div>
                  <span>Trigger</span>
                  <strong>{getTrigger(snapStock)}</strong>
                </div>
                <div>
                  <span>Momentum</span>
                  <strong>{getMomentumScore(snapStock)}</strong>
                </div>
                <div>
                  <span>Decision</span>
                  <strong>{getTriggerNeeded(snapStock)}</strong>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      <style jsx global>{`
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

        h1, h2, h3, p {
          margin: 0;
        }

        h1 {
          font-size: 34px;
          letter-spacing: -0.04em;
          line-height: 1;
        }

        .header p, .sectionTitle p, .themeSummary p {
          color: #53657f;
          margin-top: 6px;
        }

        .button {
          border: 0;
          border-radius: 12px;
          background: #0f172a;
          color: white;
          font-weight: 800;
          padding: 12px 18px;
          cursor: pointer;
        }

        .button.secondary {
          background: white;
          color: #0f172a;
          border: 1px solid #cbd5e1;
        }

        .button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .tabs {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-bottom: 22px;
        }

        .tabs button {
          border: 1px solid #cbd5e1;
          background: white;
          border-radius: 16px;
          padding: 16px;
          font-weight: 900;
          color: #0f172a;
          cursor: pointer;
        }

        .tabs button.active {
          background: #0f172a;
          color: white;
          border-color: #0ea5e9;
          box-shadow: 0 0 0 2px #0ea5e9 inset;
        }

        .card {
          background: white;
          border: 1px solid #cbd5e1;
          border-radius: 18px;
          padding: 18px;
          margin-bottom: 18px;
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.04);
        }

        .sectionTitle {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          margin-bottom: 16px;
        }

        .compactSectionTitle {
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 14px;
        }

        .themeSummary {
          display: grid;
          grid-template-columns: 260px 1fr;
          gap: 14px;
        }

        .themeSummary > div {
          background: #f8fafc;
          border: 1px solid #dbe5f1;
          border-radius: 14px;
          padding: 14px;
        }

        .themeSummary span, .miniMeta span, .singleDetails span, .totals span {
          display: block;
          color: #64748b;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.02em;
        }

        .themeSummary strong {
          display: block;
          margin-top: 4px;
          font-size: 18px;
        }

        .leadershipRibbon {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          background: #0f172a;
          color: white;
          border-radius: 18px;
          padding: 16px 18px;
          margin-bottom: 18px;
        }

        .leadershipRibbon span {
          color: #cbd5e1;
          font-size: 13px;
          font-weight: 800;
        }

        .leadershipRibbon strong {
          display: block;
          margin-top: 4px;
        }

        .leadershipItems {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .leadershipPill {
          background: rgba(255,255,255,0.1);
          color: white !important;
          border: 1px solid rgba(255,255,255,0.18);
          border-radius: 999px;
          padding: 8px 10px;
        }

        .leadershipPill strong {
          display: inline;
          margin-left: 6px;
          color: #fbbf24;
        }

        .bucketTitle {
          margin: 6px 0 12px;
          font-size: 20px;
        }

        .bucketTitle.divider {
          border-top: 1px solid #e2e8f0;
          padding-top: 16px;
          margin-top: 22px;
        }

        .ideaGrid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
          gap: 12px;
        }

        .ideaCard {
          border: 1px solid #dbe5f1;
          border-radius: 16px;
          padding: 14px;
          background: #fff;
        }

        .ideaCard.orange {
          border-color: #fed7aa;
          background: #fffaf4;
        }

        .ideaCard.green {
          border-color: #bbf7d0;
          background: #fbfffc;
        }

        .ideaTop {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 10px;
        }

        .ideaTop h3 {
          font-size: 24px;
          letter-spacing: -0.04em;
        }

        .ideaTop p {
          color: #64748b;
          font-size: 14px;
        }

        .actionPill, .pill, .smallBadge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          padding: 6px 12px;
          font-weight: 900;
          font-size: 13px;
          white-space: nowrap;
        }

        .green {
          background: #dcfce7;
          color: #166534;
        }

        .orange {
          background: #ffedd5;
          color: #9a3412;
        }

        .yellow {
          background: #fef9c3;
          color: #854d0e;
        }

        .red {
          background: #fee2e2;
          color: #991b1b;
        }

        .gray {
          background: #e5e7eb;
          color: #374151;
        }

        .badgeRow {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin: 10px 0;
        }

        .themeBadge, .convictionBadge, .catalystBadge {
          border-radius: 999px;
          padding: 5px 8px;
          font-size: 12px;
          font-weight: 900;
        }

        .themeBadge {
          background: #eff6ff;
          color: #1d4ed8;
        }

        .convictionBadge {
          background: #f8fafc;
          color: #0f172a;
          border: 1px solid #dbe5f1;
        }

        .catalystBadge {
          background: #fef3c7;
          color: #92400e;
        }

        .priceRow {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
          font-size: 18px;
          padding: 8px 0;
        }

        .positive {
          color: #15803d;
          font-weight: 900;
        }

        .negative {
          color: #b91c1c;
          font-weight: 900;
        }

        .reasonBox {
          border: 1px solid #dbe5f1;
          background: #f8fafc;
          border-radius: 12px;
          padding: 10px;
          color: #334155;
          font-size: 14px;
          line-height: 1.35;
          min-height: 48px;
        }

        .miniMeta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 10px;
          color: #334155;
        }

        .tableWrap {
          overflow-x: auto;
        }

        table {
          width: 100%;
          border-collapse: collapse;
        }

        th, td {
          text-align: left;
          padding: 12px;
          border-bottom: 1px solid #e2e8f0;
          vertical-align: top;
        }

        th {
          color: #64748b;
          font-size: 13px;
          font-weight: 900;
        }

        .symbol {
          font-weight: 900;
          letter-spacing: 0.02em;
        }

        .muted {
          color: #64748b;
        }

        .mutedSmall {
          color: #64748b;
          font-size: 12px;
          margin-top: 3px;
        }

        .warning, .error {
          border-radius: 12px;
          padding: 12px 14px;
          margin-bottom: 16px;
          font-weight: 800;
        }

        .warning {
          background: #fef3c7;
          color: #92400e;
        }

        .error {
          background: #fee2e2;
          color: #991b1b;
        }

        .buttonRow {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .inputGrid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr auto;
          gap: 10px;
          margin-bottom: 14px;
        }

        input, select {
          border: 1px solid #cbd5e1;
          border-radius: 12px;
          padding: 12px 14px;
          font-size: 15px;
          background: white;
          color: #0f172a;
        }

        .themeSelect {
          min-width: 280px;
          font-weight: 800;
        }

        .positionChips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .positionChip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: #f8fafc;
          border: 1px solid #dbe5f1;
          border-radius: 999px;
          padding: 8px 10px;
          color: #334155;
        }

        .positionChip button {
          border: 0;
          background: #e2e8f0;
          border-radius: 999px;
          cursor: pointer;
          color: #0f172a;
          font-weight: 900;
          width: 22px;
          height: 22px;
        }

        .totals {
          text-align: right;
          background: #f8fafc;
          border: 1px solid #dbe5f1;
          border-radius: 14px;
          padding: 10px 12px;
          min-width: 180px;
        }

        .priceStack {
          display: grid;
          gap: 4px;
        }

        .singleForm {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 10px;
          margin-bottom: 16px;
        }

        .singleResult {
          display: grid;
          grid-template-columns: minmax(260px, 340px) 1fr;
          gap: 14px;
          align-items: start;
        }

        .singleDetails {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .singleDetails > div {
          background: #f8fafc;
          border: 1px solid #dbe5f1;
          border-radius: 14px;
          padding: 14px;
        }

        .singleDetails strong {
          display: block;
          margin-top: 6px;
          font-size: 20px;
        }

        @media (max-width: 850px) {
          .page {
            padding: 16px;
          }

          .header, .sectionTitle, .leadershipRibbon {
            flex-direction: column;
            align-items: stretch;
          }

          .tabs {
            grid-template-columns: 1fr 1fr;
          }

          .themeSummary, .inputGrid, .singleResult, .singleDetails {
            grid-template-columns: 1fr;
          }

          .leadershipItems {
            justify-content: flex-start;
          }
        }

        /* Final UI polish: style child components globally so cards do not render as raw text. */
        .actionCard { overflow: hidden; }

        .ideaGrid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 12px;
        }

        .ideaCard {
          display: flex;
          flex-direction: column;
          gap: 10px;
          border: 1px solid #dbe5f1;
          border-radius: 16px;
          padding: 14px;
          background: #ffffff;
          box-shadow: 0 8px 20px rgba(15, 23, 42, 0.04);
          min-height: 205px;
        }

        .ideaCard.green {
          border-color: #bbf7d0;
          background: linear-gradient(180deg, #ffffff 0%, #f7fffa 100%);
        }

        .ideaCard.orange {
          border-color: #fed7aa;
          background: linear-gradient(180deg, #ffffff 0%, #fff8ed 100%);
        }

        .ideaTop {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 9px;
        }

        .ideaTop h3 {
          font-size: 22px;
          line-height: 1;
          letter-spacing: -0.04em;
        }

        .ideaTop p {
          color: #64748b;
          font-size: 13px;
          margin-top: 4px;
          line-height: 1.15;
        }

        .badgeRow {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin: 0;
        }

        .themeBadge,
        .convictionBadge,
        .catalystBadge {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 5px 8px;
          font-size: 11px;
          font-weight: 900;
          line-height: 1;
          white-space: nowrap;
        }

        .themeBadge { background: #eff6ff; color: #1d4ed8; }
        .convictionBadge { background: #f8fafc; color: #0f172a; border: 1px solid #dbe5f1; }
        .catalystBadge { background: #fef3c7; color: #92400e; }

        .priceRow {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          font-size: 17px;
          margin-top: auto;
        }

        .reasonBox {
          border: 1px solid #dbe5f1;
          background: #f8fafc;
          border-radius: 12px;
          padding: 10px;
          color: #334155;
          font-size: 13px;
          line-height: 1.35;
          min-height: 54px;
        }

        .miniMeta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-top: 0;
          padding-top: 2px;
        }

        .miniMeta span {
          color: #64748b;
          font-size: 12px;
          font-weight: 900;
        }

        .miniMeta strong {
          background: #eef2ff;
          color: #3730a3;
          border-radius: 999px;
          padding: 5px 8px;
          font-size: 12px;
          white-space: nowrap;
        }

        .leadershipRibbon {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          background: #0f172a;
          color: white;
          border-radius: 18px;
          padding: 16px 18px;
          margin-bottom: 18px;
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.10);
        }

        .leadershipRibbon span {
          color: #cbd5e1;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.02em;
        }

        .leadershipRibbon strong {
          display: block;
          margin-top: 4px;
        }

        .leadershipItems {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .leadershipPill {
          background: rgba(255,255,255,0.10);
          color: white !important;
          border: 1px solid rgba(255,255,255,0.18);
          border-radius: 999px;
          padding: 8px 10px;
          font-size: 12px;
          font-weight: 900;
        }

        .leadershipPill strong {
          display: inline;
          margin-left: 6px;
          color: #fbbf24;
        }

      `}</style>
    </main>
  );
}

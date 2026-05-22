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
      getRecommendation(stock)?.riskScore ??
      stock?.expectationRisk ??
      stock?.riskScore ??
      stock?.technicalSnapshot?.expectationRisk ??
      stock?.technicalSnapshot?.riskScore ??
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

  if (rec?.momentum) return rec.momentum;
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

function cleanSentence(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/\s+\./g, ".")
    .trim();
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

  if (action === "Buy Now") return "Setup confirmed.";
  if (action === "Starter Only") return "Early entry only; not fully confirmed.";
  if (action === "Watch") return "Setup improving; wait for confirmation.";

  return "Setup is not strong enough.";
}

function getActionSummary(stock) {
  const rec = getRecommendation(stock);

  const direct = cleanSentence(
    rec?.actionSummary ?? stock?.actionSummary ?? stock?.summary
  );

  if (direct) return direct;

  const action = nonOwnedAction(stock);
  const dominantReason = getDominantReason(stock);

  if (action === "Buy Now") {
    return "Actionable now. Setup, trend, confirmation, tradability, and risk are aligned.";
  }

  if (action === "Starter Only") {
    return "Small starter only. Use reduced size. Add only if the setup confirms.";
  }

  if (action === "Watch") {
    return dominantReason;
  }

  return `Avoid for now. ${dominantReason}`;
}

function getActionWhy(stock) {
  const rec = getRecommendation(stock);
  const direct = cleanSentence(stock?.actionWhy || rec?.reason || stock?.reason);

  if (direct) return direct;

  return getActionSummary(stock);
}

function getTriggerNeeded(stock) {
  const rec = getRecommendation(stock);
  const direct = cleanSentence(
    stock?.triggerNeeded || rec?.entryNote || stock?.entryNote
  );

  if (direct) return direct;

  const action = nonOwnedAction(stock);

  if (action === "Buy Now") {
    return "Buyable now under normal sizing. Use a defined invalidation level and do not chase oversized.";
  }

  if (action === "Starter Only") {
    return "Starter only. Use 25% to 33% normal size. Add only after confirmation.";
  }

  if (action === "Watch") {
    return "Buy only after a clean breakout with strength.";
  }

  return "Avoid. Wait for the setup to reset or materially improve.";
}

function extractDollarPrice(text) {
  const match = String(text || "").match(/\$[\d,]+(?:\.\d{1,2})?/);
  return match ? match[0] : "";
}

function getStatusLabel(stock, owned = false) {
  const action = displayAction(stock, owned);

  if (action === "Buy Now") return "Buy Now";
  if (action === "Starter Only") return "Starter";
  if (action === "Watch") return "Setup";
  if (action === "Avoid") return "Avoid";
  if (action === "Add") return "Add";
  if (action === "Hold") return "Hold";
  if (action === "Trim") return "Trim";
  if (action === "Exit") return "Exit";
  if (action === "Cash") return "Cash";

  return action || "Setup";
}

function getShortReason(stock) {
  const action = nonOwnedAction(stock);
  const reason = getDominantReason(stock);
  const lower = reason.toLowerCase();
  const price = extractDollarPrice(reason);

  if (action === "Starter Only") {
    return "Early entry only; not fully confirmed.";
  }

  if (lower.includes("actual trading volume is thin")) {
    return "Liquidity is thin.";
  }

  if (lower.includes("extended") || lower.includes("do not chase")) {
    return "Extended; do not chase.";
  }

  if (lower.includes("risk elevated")) {
    return "Risk is elevated.";
  }

  if (lower.includes("below the 50-day")) {
    return price
      ? `Needs to reclaim the 50-day near ${price}.`
      : "Needs to reclaim the 50-day.";
  }

  if (lower.includes("200-day")) {
    return price
      ? `Trend structure needs to improve near ${price}.`
      : "Trend structure needs to improve.";
  }

  if (lower.includes("holding near support")) {
    return "Holding support, but no upside trigger yet.";
  }

  if (
    lower.includes("trigger confirmation") ||
    lower.includes("breakout confirmation") ||
    lower.includes("clears")
  ) {
    return "No clean breakout yet.";
  }

  if (lower.includes("price action is not confirming")) {
    return "Price action is not confirming yet.";
  }

  if (lower.includes("volume data") || lower.includes("liquidity")) {
    return "Confirm real-time liquidity.";
  }

  return reason;
}

function shortContext(stock) {
  if (isCashLikeSymbol(stock)) return "Cash";

  const action = nonOwnedAction(stock);
  const reason = getDominantReason(stock);
  const lower = reason.toLowerCase();

  if (action === "Buy Now") return "Buy Now";
  if (action === "Starter Only") return "Starter only";
  if (lower.includes("extended")) return "Extended";
  if (lower.includes("breakout")) return "Needs breakout";
  if (lower.includes("trigger confirmation")) return "Needs trigger";
  if (lower.includes("50-day")) return "Trend issue";
  if (lower.includes("200-day")) return "Trend issue";
  if (lower.includes("risk")) return "Risk elevated";
  if (lower.includes("support")) return "Holding support";
  if (lower.includes("not confirming")) return "No confirmation";
  if (lower.includes("liquidity")) return "Check liquidity";
  if (lower.includes("volume")) return "Data caution";

  return "Setup";
}

function getContextTone(stock) {
  if (isCashLikeSymbol(stock)) return "gray";

  const action = nonOwnedAction(stock);
  const context = String(getDominantReason(stock)).toLowerCase();

  if (action === "Buy Now") return "green";
  if (action === "Starter Only") return "orange";

  if (
    context.includes("fails") ||
    context.includes("extended") ||
    context.includes("lagging") ||
    context.includes("not aligned") ||
    context.includes("risk") ||
    context.includes("resistance") ||
    context.includes("fading") ||
    context.includes("binary") ||
    context.includes("do not chase") ||
    context.includes("below 50")
  ) {
    return action === "Watch" ? "yellow" : "red";
  }

  if (
    context.includes("improving") ||
    context.includes("building") ||
    context.includes("support") ||
    context.includes("trigger") ||
    context.includes("confirmation") ||
    context.includes("quote-only") ||
    context.includes("volume data incomplete") ||
    context.includes("breakout") ||
    context.includes("liquidity")
  ) {
    return "yellow";
  }

  if (action === "Watch") return "yellow";

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
  if (isCashLikeSymbol(stock)) return "Cash";

  const rec = getRecommendation(stock);
  const label = String(
    rec?.displayLabel ??
      rec?.label ??
      rec?.recommendation ??
      rec?.tradeAction ??
      stock?.displayLabel ??
      stock?.label ??
      stock?.recommendation ??
      ""
  ).toUpperCase();

  if (label === "BUY NOW") return "Buy Now";
  if (label === "STARTER ONLY" || label === "STARTER") return "Starter Only";

  if (
    label === "WATCH" ||
    label === "WATCH FOR ENTRY" ||
    label === "NEAR MISS" ||
    label === "SETUP"
  ) {
    return "Watch";
  }

  return "Avoid";
}

function isActionableTrade(stock) {
  const action = nonOwnedAction(stock);

  return action === "Buy Now" || action === "Starter Only";
}

function isNearMiss(stock) {
  return nonOwnedAction(stock) === "Watch";
}

function portfolioAction(stock) {
  if (isCashLikeSymbol(stock)) return "Cash";

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
    trigger >= 72 &&
    momentum !== "Weak" &&
    score >= 62 &&
    expectationRisk <= 60;

  const trendWeak =
    momentum === "Weak" ||
    trigger < 58 ||
    score < 55;

  const trendFailing =
    momentum === "Weak" &&
    trigger < 55 &&
    score < 52;

  const stretchedRisk =
    expectationRisk >= 68 ||
    extensionRisk >= 72;

  const extendedWinner =
    solidGain &&
    extensionRisk >= 60 &&
    momentum !== "Weak";

  if (deepLoss && trendFailing) return "Exit";
  if (meaningfulLoss && trendFailing) return "Exit";

  if (largeGain && stretchedRisk) return "Trim";
  if (extendedWinner) return "Trim";
  if (solidGain && trendFailing) return "Trim";

  if (
    buyAction === "Buy Now" &&
    trendStrong &&
    !largeGain
  ) {
    return "Hold / Add";
  }

  if (
    buyAction === "Starter Only" &&
    trendStrong &&
    expectationRisk <= 62 &&
    !largeGain
  ) {
    return "Hold / Add";
  }

  if (
    trigger >= 75 &&
    momentum !== "Weak" &&
    score >= 60 &&
    expectationRisk <= 60 &&
    extensionRisk <= 62 &&
    !largeGain
  ) {
    return "Hold / Add";
  }

  if (trendWeak && solidGain) return "Trim";

  if (momentum === "Weak" && score < 55) {
    return "Trim";
  }

  return "Hold";
}

  if (
    buyAction === "Starter Only" &&
    trendStrong &&
    !largeGain &&
    expectationRisk <= 55
  ) {
    return "Hold";
  }

  if (
    trigger >= 85 &&
    momentum === "Strong" &&
    expectationRisk <= 45 &&
    extensionRisk <= 45 &&
    !largeGain
  ) {
    return "Add";
  }

  if (momentum === "Weak" || score < 58) return "Trim";

  return "Hold";
}

function displayAction(stock, owned = false) {
  if (owned) return portfolioAction(stock);

  return nonOwnedAction(stock);
}

function actionClass(action) {
  if (action === "Cash") return "gray";
  if (action === "Buy Now" || action === "Add") return "green";
  if (action === "Starter Only" || action === "Trim") return "orange";
  if (action === "Watch" || action === "Hold") return "yellow";

  return "red";
}

function rankActionable(a, b) {
  const actionA = nonOwnedAction(a);
  const actionB = nonOwnedAction(b);

  if (actionA === "Buy Now" && actionB !== "Buy Now") return -1;
  if (actionB === "Buy Now" && actionA !== "Buy Now") return 1;

  const triggerA = getTrigger(a);
  const triggerB = getTrigger(b);

  if (triggerB !== triggerA) return triggerB - triggerA;

  return getScore(b) - getScore(a);
}

function rankNearMiss(a, b) {
  const triggerA = getTrigger(a);
  const triggerB = getTrigger(b);

  if (triggerB !== triggerA) return triggerB - triggerA;

  const momentumA = getMomentumScore(a);
  const momentumB = getMomentumScore(b);

  if (momentumB !== momentumA) return momentumB - momentumA;

  const scoreA = getScore(a);
  const scoreB = getScore(b);

  return scoreB - scoreA;
}

export default function Home() {
  const [stocks, setStocks] = useState([]);
  const [loadingTop, setLoadingTop] = useState(true);
  const [topError, setTopError] = useState("");
  const [refreshWarning, setRefreshWarning] = useState("");
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
    setRefreshWarning("");

    try {
      const res = await fetch(`/api/top5?theme=${encodeURIComponent(theme)}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data?.detail || data?.error || "Failed to load trade screen."
        );
      }

      const list = Array.isArray(data)
        ? data
        : data?.stocks || data?.results || data?.data || [];

      if (!Array.isArray(list) || list.length === 0) {
        throw new Error("Quote refresh returned no usable stocks.");
      }

      setStocks(list.slice(0, 10));
      setThemeMeta(data?.selectedTheme || null);
    } catch (err) {
      const message = err.message || "Failed to load trade screen.";

      if (stocks.length > 0) {
        setRefreshWarning(
          `Quote refresh failed — showing last successful screen. ${message}`
        );
      } else {
        setTopError(message);
      }
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

  const actionableTrades = useMemo(() => {
    return stocks.filter(isActionableTrade).sort(rankActionable);
  }, [stocks]);

  const buyNowTrades = useMemo(() => {
    return actionableTrades.filter(
      (stock) => nonOwnedAction(stock) === "Buy Now"
    );
  }, [actionableTrades]);

  const starterTrades = useMemo(() => {
    return actionableTrades.filter(
      (stock) => nonOwnedAction(stock) === "Starter Only"
    );
  }, [actionableTrades]);

  const nearMisses = useMemo(() => {
    return stocks.filter(isNearMiss).sort(rankNearMiss).slice(0, 5);
  }, [stocks]);

  const avoidList = useMemo(() => {
    return stocks
      .filter((stock) => nonOwnedAction(stock) === "Avoid")
      .slice(0, 5);
  }, [stocks]);

  const closestSetups = useMemo(() => {
    if (nearMisses.length > 0) return [];

    return stocks
      .filter((stock) => nonOwnedAction(stock) === "Avoid")
      .sort(rankNearMiss)
      .slice(0, 5);
  }, [stocks, nearMisses.length]);

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
          <h1>🧠 Trade Action Screener</h1>
          <p>
            Shows full Buy Now trades first, then smaller Starter Only setups.
          </p>
        </div>

        <button
          onClick={() => loadTopIdeas(selectedTheme)}
          className="button secondary"
        >
          {loadingTop ? "Refreshing..." : "Reload Screener"}
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
            <span>Discipline</span>
            <p>
              Buy Now means normal-size trade. Starter Only means small tactical
              position before full confirmation.
            </p>
          </div>
        </div>
      </section>

      {refreshWarning && <p className="warning">{refreshWarning}</p>}

      <section className="card actionCard">
        <div className="sectionTitle">
          <h2>🔥 Actionable Trades</h2>
          <p>
            Buy Now is full-size eligible. Starter Only is small-size only.
          </p>
        </div>

        {loadingTop && stocks.length === 0 && (
          <p className="muted">Loading trade screen...</p>
        )}

        {topError && <p className="error">{topError}</p>}

        {!loadingTop && !topError && actionableTrades.length === 0 && (
          <div className="noTradeBox">
            <h3>No actionable trades right now.</h3>
            <p>
              No Buy Now or Starter Only setups cleared the screen. Stay
              patient. Cash is a valid position.
            </p>
          </div>
        )}

        {buyNowTrades.length > 0 && (
          <>
            <div className="subSectionTitle">
              <h3>Buy Now</h3>
              <p>Normal-size trade allowed with defined risk.</p>
            </div>

            <div className="tradeGrid">
              {buyNowTrades.map((stock, idx) => {
                const action = displayAction(stock, false);

                return (
                  <div
                    className="tradeCard"
                    key={`${getSymbol(stock)}-buy-${idx}`}
                  >
                    <div className="tradeTop">
                      <div>
                        <div className="tradeSymbol">{getSymbol(stock)}</div>
                        <div className="tradeName">{getName(stock)}</div>
                      </div>

                      <span className={`pill largePill ${actionClass(action)}`}>
                        {action}
                      </span>
                    </div>

                    <div className="tradePriceRow">
                      <span>{money(getPrice(stock))}</span>
                      <strong className={priceChangeClass(stock)}>
                        {priceChangeText(stock)}
                      </strong>
                    </div>

                    <div className="tradeMetrics">
                      <div>
                        <span>Status</span>
                        <strong className={`miniMetric ${getContextTone(stock)}`}>
                          {getStatusLabel(stock)}
                        </strong>
                      </div>
                    </div>

                    <div className="tradeNotes">
                      <div>
                        <span>Why Actionable</span>
                        <p>{getShortReason(stock)}</p>
                      </div>

                      <div>
                        <span>Trade Instruction</span>
                        <p>{getTriggerNeeded(stock)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {starterTrades.length > 0 && (
          <>
            <div className="subSectionTitle starterTitle">
              <h3>Starter Only</h3>
              <p>
                Small tactical entry only. Use 25% to 33% normal size and add
                only if it confirms.
              </p>
            </div>

            <div className="tradeGrid">
              {starterTrades.map((stock, idx) => {
                const action = displayAction(stock, false);

                return (
                  <div
                    className="tradeCard starterCard"
                    key={`${getSymbol(stock)}-starter-${idx}`}
                  >
                    <div className="tradeTop">
                      <div>
                        <div className="tradeSymbol">{getSymbol(stock)}</div>
                        <div className="tradeName">{getName(stock)}</div>
                      </div>

                      <span className={`pill largePill ${actionClass(action)}`}>
                        {action}
                      </span>
                    </div>

                    <div className="tradePriceRow">
                      <span>{money(getPrice(stock))}</span>
                      <strong className={priceChangeClass(stock)}>
                        {priceChangeText(stock)}
                      </strong>
                    </div>

                    <div className="tradeMetrics">
                      <div>
                        <span>Status</span>
                        <strong className={`miniMetric ${getContextTone(stock)}`}>
                          {getStatusLabel(stock)}
                        </strong>
                      </div>
                    </div>

                    <div className="tradeNotes">
                      <div>
                        <span>Why Actionable</span>
                        <p>{getShortReason(stock)}</p>
                      </div>

                      <div>
                        <span>Trade Instruction</span>
                        <p>{getTriggerNeeded(stock)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {nearMisses.length > 0 && (
        <section className="card compactCard">
          <div className="sectionTitle">
            <h2>⚠️ Near Misses</h2>
            <p>
              Not trades yet. These are the closest candidates and what is
              missing.
            </p>
          </div>

          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th className="stickyCol">Symbol</th>
                  <th>Price</th>
                  <th>Net Change</th>
                  <th>Status</th>
                  <th>What Is Missing</th>
                  <th>Trigger Needed</th>
                </tr>
              </thead>

              <tbody>
                {nearMisses.map((stock, idx) => {
                  return (
                    <tr key={`${getSymbol(stock)}-near-${idx}`}>
                      <td className="symbol stickyCol">{getSymbol(stock)}</td>
                      <td>
                        <strong>{money(getPrice(stock))}</strong>
                      </td>
                      <td className={priceChangeClass(stock)}>
                        {priceChangeText(stock)}
                      </td>
                      <td>
                        <span className={`pill ${getContextTone(stock)}`}>
                          {getStatusLabel(stock)}
                        </span>
                      </td>
                      <td className="textCell">{getShortReason(stock)}</td>
                      <td className="textCell mutedText">
                        {getTriggerNeeded(stock)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {nearMisses.length === 0 && closestSetups.length > 0 && (
        <section className="card compactCard">
          <div className="sectionTitle">
            <h2>🔎 Closest Setups — Not Ready</h2>
            <p>
              No true near misses qualified, but these are the closest rejected
              names.
            </p>
          </div>

          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th className="stickyCol">Symbol</th>
                  <th>Price</th>
                  <th>Net Change</th>
                  <th>Status</th>
                  <th>Why Not Ready</th>
                  <th>Trigger / Fix Needed</th>
                </tr>
              </thead>

              <tbody>
                {closestSetups.map((stock, idx) => {
                  return (
                    <tr key={`${getSymbol(stock)}-closest-${idx}`}>
                      <td className="symbol stickyCol">{getSymbol(stock)}</td>
                      <td>
                        <strong>{money(getPrice(stock))}</strong>
                      </td>
                      <td className={priceChangeClass(stock)}>
                        {priceChangeText(stock)}
                      </td>
                      <td>
                        <span className={`pill ${getContextTone(stock)}`}>
                          {getStatusLabel(stock)}
                        </span>
                      </td>
                      <td className="textCell">{getShortReason(stock)}</td>
                      <td className="textCell mutedText">
                        {getTriggerNeeded(stock)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {avoidList.length > 0 && (
        <section className="card compactCard">
          <div className="sectionTitle">
            <h2>🚫 Avoid / Not Ready</h2>
            <p>Names rejected by the action screen.</p>
          </div>

          <div className="avoidChips">
            {avoidList.map((stock) => (
              <div className="avoidChip" key={getSymbol(stock)}>
                <strong>{getSymbol(stock)}</strong>
                <span>{shortContext(stock)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <h2>Single Symbol Action Check</h2>
        <p className="muted">
          Use this when you want to check one ticker directly with deeper symbol
          analysis.
        </p>

        <form onSubmit={analyzeSymbol} className="formRow">
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="Lookup ticker..."
          />

          <button className="button" disabled={snapLoading}>
            {snapLoading ? "Analyzing..." : "Check Action"}
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
                className={`pill largePill ${actionClass(
                  displayAction(snapStock, false)
                )}`}
              >
                {displayAction(snapStock, false)}
              </span>
            </div>

            <div className="metricGrid">
              <div>
                <span>Price</span>
                <strong>{money(getPrice(snapStock))}</strong>
                <small className={priceChangeClass(snapStock)}>
                  {priceChangeText(snapStock)}
                </small>
              </div>

              <div>
                <span>Status</span>
                <strong className={`boxedValue ${getContextTone(snapStock)}`}>
                  {getStatusLabel(snapStock)}
                </strong>
              </div>

              <div>
                <span>Instruction</span>
                <strong className="boxedValue gray">
                  {getTriggerNeeded(snapStock)}
                </strong>
              </div>
            </div>

            <div className="snapNotes">
              <div>
                <span>What Is Missing</span>
                <p>{getShortReason(snapStock)}</p>
              </div>

              <div>
                <span>Action Read</span>
                <p>{getActionWhy(snapStock)}</p>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Portfolio Screener</h2>
        <p className="muted">
          Uses ownership logic: Add, Hold, Trim, Exit, or Cash.
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
                </tr>
              </thead>

              <tbody>
                {portfolioResults.map((stock) => {
                  const action = stock.error ? "Exit" : displayAction(stock, true);

                  return (
                    <tr key={stock.symbol}>
                      <td className="symbol stickyCol">{stock.symbol}</td>
                      <td>{number(stock.shares, 2)}</td>
                      <td>{money(stock.avgCost)}</td>
                      <td>
                        {stock.error ? (
                          "—"
                        ) : (
                          <div className="priceStack">
                            <strong>{money(stock.currentPrice)}</strong>
                            <span className={priceChangeClass(stock)}>
                              {priceChangeText(stock)}
                            </span>
                          </div>
                        )}
                      </td>
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
                            : shortContext(stock)}
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

        .actionCard {
          border-color: #cbd5e1;
        }

        .compactCard {
          padding-top: 16px;
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

        .subSectionTitle {
          margin: 8px 0 12px;
        }

        .subSectionTitle h3 {
          font-size: 18px;
          margin-bottom: 2px;
        }

        .subSectionTitle p {
          color: #64748b;
          font-size: 13px;
        }

        .starterTitle {
          margin-top: 20px;
          border-top: 1px solid #e2e8f0;
          padding-top: 16px;
        }

        .sectionHeader {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
          margin-bottom: 14px;
        }

        .warning {
          background: #fef3c7;
          color: #92400e;
          border: 1px solid #facc15;
          border-radius: 12px;
          padding: 10px 12px;
          margin: -6px 0 18px;
          font-size: 14px;
          font-weight: 800;
        }

        .noTradeBox {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 18px;
        }

        .noTradeBox h3 {
          font-size: 22px;
          margin-bottom: 6px;
        }

        .noTradeBox p {
          color: #475569;
          line-height: 1.4;
        }

        .tradeGrid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }

        .tradeCard {
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          background: white;
          padding: 16px;
          min-width: 0;
          overflow: hidden;
        }

        .starterCard {
          border-color: #fed7aa;
          background: #fffaf3;
        }

        .tradeTop {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 10px;
          margin-bottom: 12px;
        }

        .tradeSymbol {
          font-size: 26px;
          font-weight: 950;
          letter-spacing: 0.02em;
        }

        .tradeName {
          color: #64748b;
          font-size: 13px;
          margin-top: 2px;
        }

        .priceStack {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .priceStack span,
        small {
          font-size: 12px;
          font-weight: 700;
        }

        .tradePriceRow {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-top: 1px solid #f1f5f9;
          border-bottom: 1px solid #f1f5f9;
          padding: 10px 0;
          margin-bottom: 12px;
        }

        .tradePriceRow span {
          font-size: 18px;
          font-weight: 800;
        }

        .tradeMetrics {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-bottom: 12px;
        }

        .tradeMetrics span {
          display: block;
          color: #64748b;
          font-size: 11px;
          font-weight: 900;
          margin-bottom: 4px;
        }

        .tradeNotes {
          display: grid;
          gap: 8px;
        }

        .tradeNotes div {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 10px;
        }

        .starterCard .tradeNotes div {
          background: white;
          border-color: #fed7aa;
        }

        .tradeNotes span {
          display: block;
          color: #64748b;
          font-size: 11px;
          font-weight: 900;
          margin-bottom: 4px;
        }

        .tradeNotes p {
          color: #334155;
          font-size: 13px;
          line-height: 1.35;
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
          max-width: 540px;
          white-space: normal;
          line-height: 1.35;
          color: #334155;
        }

        .mutedText {
          color: #64748b;
        }

        .avoidChips {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .avoidChip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 13px;
        }

        .avoidChip span {
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

        .largePill {
          font-size: 14px;
          padding: 7px 13px;
        }

        .miniMetric {
          display: inline-flex;
          border-radius: 999px;
          padding: 4px 9px;
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
          grid-template-columns: repeat(3, 1fr);
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
          white-space: normal;
          line-height: 1.35;
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

        @media (max-width: 1200px) {
          .tradeGrid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .metricGrid {
            grid-template-columns: repeat(3, 1fr);
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

          .tradeGrid {
            grid-template-columns: 1fr;
          }

          .tradeMetrics {
            grid-template-columns: 1fr;
          }

          .formRow,
          .portfolioForm {
            grid-template-columns: 1fr;
          }

          .snapNotes {
            grid-template-columns: 1fr;
          }

          .metricGrid {
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

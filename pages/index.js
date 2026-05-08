// pages/index.js

import { useEffect, useMemo, useState } from "react";

const PORTFOLIO_KEY = "stock_screener_portfolio_v1";

function money(value) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return "—";
  }

  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function percent(value) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return "—";
  }

  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function number(value, digits = 2) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return "—";
  }

  return n.toFixed(digits);
}

function clampScore(value) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(100, Math.round(n))
  );
}

function getSymbol(stock) {
  return String(
    stock?.symbol ??
      stock?.ticker ??
      ""
  ).toUpperCase();
}

function getName(stock) {
  return (
    stock?.name ??
    stock?.companyName ??
    stock?.company ??
    "—"
  );
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

function getScore(stock) {
  return clampScore(
    stock?.recommendation?.score ??
      stock?.score ??
      0
  );
}

function getTrigger(stock) {
  return clampScore(
    stock?.recommendation
      ?.triggerScore ??
      stock?.triggerScore ??
      0
  );
}

function getMomentumText(stock) {
  const momentum =
    Number(
      stock?.momentumScore
    );

  if (momentum >= 80) {
    return "Strong";
  }

  if (momentum >= 60) {
    return "Building";
  }

  return "Weak";
}

function getWhy(stock) {
  return (
    stock?.recommendation
      ?.reason ??
    "No analysis available."
  );
}

function getEntryNote(stock) {
  return (
    stock?.recommendation
      ?.entryNote ??
    "Wait for better confirmation."
  );
}

function calculatePosition(
  position,
  livePrice
) {
  const shares = Number(
    position?.shares ?? 0
  );

  const avgCost = Number(
    position?.avgCost ?? 0
  );

  const price = Number(
    livePrice ?? 0
  );

  const value =
    shares * price;

  const costBasis =
    shares * avgCost;

  const gainLoss =
    value - costBasis;

  const gainLossPct =
    costBasis > 0
      ? (gainLoss /
          costBasis) *
        100
      : 0;

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

function tradeActionForStock(
  stock,
  owned = false
) {
  const label =
    stock?.recommendation
      ?.label;

  const score =
    getScore(stock);

  const trigger =
    getTrigger(stock);

  if (owned) {
    if (
      score >= 90 &&
      trigger >= 85
    ) {
      return "Add";
    }

    if (score >= 75) {
      return "Hold";
    }

    if (score >= 55) {
      return "Trim";
    }

    return "Exit";
  }

  if (label === "BUY NOW") {
    return "Buy Now";
  }

  if (
    label ===
    "WATCH FOR ENTRY"
  ) {
    return "Watch for Entry";
  }

  if (label === "WATCH") {
    return "Watch";
  }

  return "Avoid";
}

function actionClass(action) {
  if (
    action === "Buy Now" ||
    action === "Add"
  ) {
    return "green";
  }

  if (
    action === "Watch for Entry" ||
    action === "Hold"
  ) {
    return "yellow";
  }

  if (
    action === "Trim" ||
    action === "Watch"
  ) {
    return "orange";
  }

  return "red";
}

function scoreClass(score) {
  if (score >= 85) {
    return "green";
  }

  if (score >= 65) {
    return "yellow";
  }

  return "red";
}

export default function Home() {
  const [stocks, setStocks] =
    useState([]);

  const [loadingTop, setLoadingTop] =
    useState(true);

  const [topError, setTopError] =
    useState("");

  const [symbol, setSymbol] =
    useState("");

  const [snapLoading, setSnapLoading] =
    useState(false);

  const [snapError, setSnapError] =
    useState("");

  const [snapStock, setSnapStock] =
    useState(null);

  const [portfolio, setPortfolio] =
    useState([]);

  const [
    portfolioLoading,
    setPortfolioLoading,
  ] = useState(false);

  const [
    portfolioResults,
    setPortfolioResults,
  ] = useState([]);

  const [newSymbol, setNewSymbol] =
    useState("");

  const [newShares, setNewShares] =
    useState("");

  const [newCost, setNewCost] =
    useState("");

  useEffect(() => {
    loadTopIdeas();
    loadPortfolio();
  }, []);

  async function loadTopIdeas() {
    setLoadingTop(true);

    setTopError("");

    try {
      const res =
        await fetch("/api/top5");

      const data =
        await res.json();

      if (!res.ok) {
        throw new Error(
          data?.detail ||
            data?.error ||
            "Failed to load top ideas."
        );
      }

      const list =
        Array.isArray(data)
          ? data
          : data?.stocks ||
            data?.results ||
            data?.data ||
            [];

      setStocks(
        list.slice(0, 10)
      );
    } catch (err) {
      setTopError(
        err.message ||
          "Failed to load top ideas."
      );
    } finally {
      setLoadingTop(false);
    }
  }

  function loadPortfolio() {
    try {
      const raw =
        window.localStorage.getItem(
          PORTFOLIO_KEY
        );

      if (!raw) {
        return;
      }

      const saved =
        JSON.parse(raw);

      if (Array.isArray(saved)) {
        setPortfolio(saved);
      }
    } catch {
      setPortfolio([]);
    }
  }

  function savePortfolio(next) {
    setPortfolio(next);

    window.localStorage.setItem(
      PORTFOLIO_KEY,
      JSON.stringify(next)
    );
  }

  function addPosition() {
    const cleanSymbol =
      newSymbol
        .trim()
        .toUpperCase();

    const shares =
      Number(newShares);

    const avgCost =
      Number(newCost);

    if (
      !cleanSymbol ||
      !Number.isFinite(shares) ||
      shares <= 0 ||
      !Number.isFinite(avgCost) ||
      avgCost < 0
    ) {
      alert(
        "Please enter symbol, shares, and cost/share."
      );

      return;
    }

    const next = [...portfolio];

    const index =
      next.findIndex(
        (p) =>
          p.symbol ===
          cleanSymbol
      );

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

  function removePosition(
    symbolToRemove
  ) {
    savePortfolio(
      portfolio.filter(
        (p) =>
          p.symbol !==
          symbolToRemove
      )
    );

    setPortfolioResults(
      (prev) =>
        prev.filter(
          (p) =>
            p.symbol !==
            symbolToRemove
        )
    );
  }

  async function analyzeSymbol(
    e
  ) {
    e?.preventDefault();

    const cleanSymbol =
      symbol
        .trim()
        .toUpperCase();

    if (!cleanSymbol) {
      return;
    }

    setSnapLoading(true);

    setSnapError("");

    setSnapStock(null);

    try {
      const res =
        await fetch(
          `/api?symbol=${encodeURIComponent(
            cleanSymbol
          )}`
        );

      const data =
        await res.json();

      if (!res.ok) {
        throw new Error(
          data?.detail ||
            data?.error ||
            "Failed to analyze symbol."
        );
      }

      setSnapStock(
        data?.stock ||
          data?.result ||
          data
      );
    } catch (err) {
      setSnapError(
        err.message ||
          "Failed to analyze symbol."
      );
    } finally {
      setSnapLoading(false);
    }
  }

  async function analyzePortfolio() {
    if (!portfolio.length) {
      return;
    }

    setPortfolioLoading(true);

    setPortfolioResults([]);

    try {
      const results = [];

      for (const position of portfolio) {
        try {
          const res =
            await fetch(
              `/api?symbol=${encodeURIComponent(
                position.symbol
              )}`
            );

          const data =
            await res.json();

          const stock =
            data?.stock ||
            data?.result ||
            data;

          const livePrice =
            getPrice(stock);

          const calculated =
            calculatePosition(
              position,
              livePrice
            );

          results.push({
            ...stock,

            symbol:
              position.symbol,

            shares:
              calculated.shares,

            avgCost:
              calculated.avgCost,

            currentPrice:
              calculated.price,

            value:
              calculated.value,

            costBasis:
              calculated.costBasis,

            gainLoss:
              calculated.gainLoss,

            gainLossPct:
              calculated.gainLossPct,
          });
        } catch {
          const calculated =
            calculatePosition(
              position,
              0
            );

          results.push({
            symbol:
              position.symbol,

            shares:
              calculated.shares,

            avgCost:
              calculated.avgCost,

            currentPrice:
              null,

            value:
              null,

            costBasis:
              calculated.costBasis,

            gainLoss:
              null,

            gainLossPct:
              null,

            error:
              "Could not analyze",
          });
        }
      }

      setPortfolioResults(
        results
      );
    } finally {
      setPortfolioLoading(false);
    }
  }

  const portfolioTotals =
    useMemo(() => {
      let totalValue = 0;

      let totalCost = 0;

      for (const p of portfolioResults) {
        const value =
          Number(p.value);

        const costBasis =
          Number(p.costBasis);

        if (
          Number.isFinite(value)
        ) {
          totalValue += value;
        }

        if (
          Number.isFinite(
            costBasis
          )
        ) {
          totalCost += costBasis;
        }
      }

      const totalGainLoss =
        totalValue -
        totalCost;

      const totalGainLossPct =
        totalCost > 0
          ? (totalGainLoss /
              totalCost) *
            100
          : 0;

      return {
        value: totalValue,
        costBasis: totalCost,
        gainLoss: totalGainLoss,
        gainLossPct:
          totalGainLossPct,
      };
    }, [portfolioResults]);

  return (
    <main className="page">
      <header className="header">
        <div>
          <h1>
            🧠 Asymmetry Screener
          </h1>

          <p>
            Institutional-grade
            trade engine for
            actionable setups.
          </p>
        </div>

        <button
          onClick={
            loadTopIdeas
          }
          className="button secondary"
        >
          Reload Screener
        </button>
      </header>

      <section className="card">
        <div className="sectionTitle">
          <h2>
            🔥 Top 10 Ideas
          </h2>

          <p>
            Focused on
            institutional-quality
            setups with timing
            confirmation.
          </p>
        </div>

        {loadingTop && (
          <p className="muted">
            Loading top ideas...
          </p>
        )}

        {topError && (
          <p className="error">
            {topError}
          </p>
        )}

        {!loadingTop &&
          !topError && (
            <>
              <div className="ideaGrid">
                {stocks.map(
                  (
                    stock,
                    idx
                  ) => {
                    const score =
                      getScore(
                        stock
                      );

                    const action =
                      tradeActionForStock(
                        stock,
                        false
                      );

                    return (
                      <div
                        className="ideaCard"
                        key={`${getSymbol(
                          stock
                        )}-card-${idx}`}
                      >
                        <div className="ideaSymbol">
                          {getSymbol(
                            stock
                          )}
                        </div>

                        <div className="ideaPrice">
                          {money(
                            getPrice(
                              stock
                            )
                          )}
                        </div>

                        <span
                          className={`pill widePill ${actionClass(
                            action
                          )}`}
                        >
                          {action}
                        </span>

                        <div className="ideaMeta">
                          Score:{" "}
                          {score}
                        </div>

                        <div className="ideaMeta">
                          Trigger:{" "}
                          {getTrigger(
                            stock
                          )}
                        </div>

                        <div className="ideaMeta">
                          Momentum:{" "}
                          {getMomentumText(
                            stock
                          )}
                        </div>
                      </div>
                    );
                  }
                )}
              </div>

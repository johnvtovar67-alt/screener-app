// pages/index.js

import { useEffect, useMemo, useState } from "react";
import { formatPct, formatPrice } from "../lib/formatters";

export default function HomePage() {
  const [rows, setRows] = useState([]);
  const [lookupSymbols, setLookupSymbols] = useState([]);
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [isLoadingTop5, setIsLoadingTop5] = useState(true);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [under25Only, setUnder25Only] = useState(true);
  const [profitableOnly, setProfitableOnly] = useState(false);
  const [tradeReadyOnly, setTradeReadyOnly] = useState(false);

  const [portfolioSymbol, setPortfolioSymbol] = useState("");
  const [portfolioQty, setPortfolioQty] = useState("");
  const [portfolioCost, setPortfolioCost] = useState("");
  const [portfolioPositions, setPortfolioPositions] = useState([
    { symbol: "MSTR", qty: 100, cost: 140.39 },
    { symbol: "MARA", qty: 400, cost: 11.94 },
    { symbol: "BBAI", qty: 260, cost: 3.88 },
    { symbol: "SOUN", qty: 325, cost: 7.95 },
    { symbol: "BCRX", qty: 125, cost: 8.95 },
  ]);

  const [portfolioRows, setPortfolioRows] = useState([]);
  const [isAnalyzingPortfolio, setIsAnalyzingPortfolio] = useState(false);

  const [meta, setMeta] = useState({
    totalUniverse: 0,
    quoteSnapshots: 0,
    afterInstitutionalFilter: 0,
    afterRankingThreshold: 0,
  });

  async function loadTop5() {
    setIsLoadingTop5(true);
    setError("");

    try {
      const response = await fetch("/api/top5");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load opportunities");
      }

      setLookupSymbols([]);
      setRows(data.stocks || []);
      setMeta(
        data.meta || {
          totalUniverse: 0,
          quoteSnapshots: 0,
          afterInstitutionalFilter: 0,
          afterRankingThreshold: 0,
        }
      );
    } catch (err) {
      setError(err.message || "Failed to load opportunities");
    } finally {
      setIsLoadingTop5(false);
    }
  }

  async function handleLookup() {
    const symbol = query.trim().toUpperCase();
    if (!symbol) return;

    setIsLookingUp(true);
    setError("");

    try {
      const response = await fetch(
        `/api/lookup?symbol=${encodeURIComponent(symbol)}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Lookup failed");
      }

      if (!data?.symbol) {
        throw new Error("Lookup returned no usable stock data.");
      }

      if ((data.price ?? 0) >= 25) {
        setUnder25Only(false);
      }

      setLookupSymbols((prev) => {
        const clean = prev.filter((x) => x !== data.symbol);
        return [data.symbol, ...clean].slice(0, 5);
      });

      setRows((prev) => {
        const exists = prev.some((row) => row.symbol === data.symbol);
        if (exists) {
          return prev.map((row) => (row.symbol === data.symbol ? data : row));
        }
        return [data, ...prev];
      });

      setSelectedSymbol(data.symbol);
      setQuery("");
    } catch (err) {
      setError(err.message || "Lookup failed");
    } finally {
      setIsLookingUp(false);
    }
  }

  function addPortfolioPosition() {
    const symbol = portfolioSymbol.trim().toUpperCase();
    const qty = Number(portfolioQty);
    const cost = Number(portfolioCost);

    if (!symbol || !qty || qty <= 0) {
      setError("Enter a symbol and quantity.");
      return;
    }

    setPortfolioPositions((prev) => {
      const without = prev.filter((p) => p.symbol !== symbol);
      return [...without, { symbol, qty, cost: cost || 0 }];
    });

    setPortfolioSymbol("");
    setPortfolioQty("");
    setPortfolioCost("");
    setError("");
  }

  function removePortfolioPosition(symbol) {
    setPortfolioPositions((prev) => prev.filter((p) => p.symbol !== symbol));
    setPortfolioRows((prev) => prev.filter((p) => p.symbol !== symbol));
  }

  function getSetupLabel(label) {
    if (label === "STRONG BUY") return "STRONG";
    if (label === "BUY") return "GOOD";
    if (label === "WATCH") return "NEUTRAL";
    return "WEAK";
  }

  function getPortfolioDecision(row, gainLossPct) {
    const label = row.recommendation?.label;
    const readiness = row.tradeReadiness?.label;

    if (readiness === "TRADE READY") {
      if (gainLossPct >= 15) {
        return { action: "TRIM", why: "Trade ready, but up strong. Lock some." };
      }
      return { action: "ADD", why: "Trade-ready setup with active trigger." };
    }

    if (label === "STRONG BUY") {
      if (gainLossPct >= 18) {
        return { action: "TRIM", why: "Up strong. Lock in some gains." };
      }
      return { action: "HOLD", why: "Strong setup, but wait for trigger." };
    }

    if (label === "BUY") {
      if (gainLossPct >= 12) {
        return { action: "TRIM", why: "Good gain. Don’t get greedy." };
      }
      return { action: "HOLD", why: "Improving setup. Needs confirmation." };
    }

    if (label === "WATCH") {
      if (gainLossPct <= -8) {
        return { action: "SELL", why: "Down and weak. Cut it." };
      }
      if (gainLossPct >= 10) {
        return { action: "TRIM", why: "Up nicely. Protect gains." };
      }
      return { action: "HOLD", why: "No edge right now." };
    }

    if (label === "AVOID") {
      if (gainLossPct <= -5) {
        return { action: "SELL", why: "Weak and losing. Free capital." };
      }
      if (gainLossPct >= 8) {
        return { action: "TRIM", why: "Up, but weak signal. Take some off." };
      }
      return { action: "HOLD", why: "Weak setup. Don’t add." };
    }

    return { action: "HOLD", why: "No clear signal." };
  }

  async function analyzePortfolio() {
    setIsAnalyzingPortfolio(true);
    setError("");

    try {
      const results = [];

      for (const position of portfolioPositions) {
        const response = await fetch(
          `/api/lookup?symbol=${encodeURIComponent(position.symbol)}`
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || `Lookup failed for ${position.symbol}`);
        }

        const price = Number(data.price || 0);
        const qty = Number(position.qty || 0);
        const cost = Number(position.cost || 0);
        const value = price * qty;
        const costBasis = cost * qty;
        const gainLoss = costBasis ? value - costBasis : 0;
        const gainLossPct = costBasis ? (gainLoss / costBasis) * 100 : 0;
        const decision = getPortfolioDecision(data, gainLossPct);

        results.push({
          ...data,
          qty,
          cost,
          value,
          costBasis,
          gainLoss,
          gainLossPct,
          setupLabel: getSetupLabel(data.recommendation?.label),
          action: decision.action,
          portfolioWhy: decision.why,
        });
      }

      setPortfolioRows(results);
    } catch (err) {
      setError(err.message || "Portfolio analysis failed.");
    } finally {
      setIsAnalyzingPortfolio(false);
    }
  }

  useEffect(() => {
    loadTop5();
  }, []);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const isLookup = lookupSymbols.includes(row.symbol);

      if (!isLookup && under25Only && (row.price ?? 0) >= 25) return false;
      if (!isLookup && profitableOnly && (row.operatingMarginPct ?? 0) <= 0) return false;
      if (!isLookup && tradeReadyOnly && row.tradeReadiness?.label !== "TRADE READY") return false;

      return true;
    });
  }, [rows, lookupSymbols, under25Only, profitableOnly, tradeReadyOnly]);

  const sortedRows = useMemo(() => {
    const actionRank = {
      "STRONG BUY": 4,
      BUY: 3,
      WATCH: 2,
      AVOID: 1,
    };

    const readinessRank = {
      "TRADE READY": 3,
      "WATCH CLOSELY": 2,
      "SETUP ONLY": 1,
    };

    return [...filteredRows]
      .sort((a, b) => {
        const aLookup = lookupSymbols.includes(a.symbol) ? 1 : 0;
        const bLookup = lookupSymbols.includes(b.symbol) ? 1 : 0;

        return (
          bLookup - aLookup ||
          (readinessRank[b.tradeReadiness?.label] || 0) -
            (readinessRank[a.tradeReadiness?.label] || 0) ||
          (b.recommendation?.score ?? 0) - (a.recommendation?.score ?? 0) ||
          (actionRank[b.recommendation?.label] || 0) -
            (actionRank[a.recommendation?.label] || 0) ||
          (b.heatScore ?? 0) - (a.heatScore ?? 0) ||
          (b.triggerScore ?? 0) - (a.triggerScore ?? 0) ||
          (b.asymmetryScore ?? 0) - (a.asymmetryScore ?? 0) ||
          (b.qualityScore ?? 0) - (a.qualityScore ?? 0)
        );
      })
      .slice(0, 25);
  }, [filteredRows, lookupSymbols]);

  const top10Rows = useMemo(() => sortedRows.slice(0, 10), [sortedRows]);

  useEffect(() => {
    if (!sortedRows.length) {
      setSelectedSymbol("");
      return;
    }

    const stillVisible = sortedRows.some((row) => row.symbol === selectedSymbol);
    if (!stillVisible) setSelectedSymbol(sortedRows[0].symbol);
  }, [sortedRows, selectedSymbol]);

  const selectedRow =
    sortedRows.find((row) => row.symbol === selectedSymbol) || sortedRows[0];

  function recommendationPillStyle(label) {
    if (label === "STRONG BUY") {
      return {
        background: "#dcfce7",
        color: "#166534",
        border: "1px solid #bbf7d0",
      };
    }
    if (label === "BUY") {
      return {
        background: "#e0f2fe",
        color: "#075985",
        border: "1px solid #bae6fd",
      };
    }
    if (label === "WATCH") {
      return {
        background: "#fef3c7",
        color: "#92400e",
        border: "1px solid #fde68a",
      };
    }
    return {
      background: "#fee2e2",
      color: "#b91c1c",
      border: "1px solid #fecaca",
    };
  }

  function readinessPillStyle(label) {
    if (label === "TRADE READY") {
      return {
        background: "#111827",
        color: "#ffffff",
        border: "1px solid #111827",
      };
    }
    if (label === "WATCH CLOSELY") {
      return {
        background: "#fef3c7",
        color: "#92400e",
        border: "1px solid #fde68a",
      };
    }
    return {
      background: "#f3f4f6",
      color: "#374151",
      border: "1px solid #e5e7eb",
    };
  }

  function actionPillStyle(action) {
    if (action === "ADD") {
      return {
        background: "#dcfce7",
        color: "#166534",
        border: "1px solid #bbf7d0",
      };
    }
    if (action === "HOLD") {
      return {
        background: "#fef3c7",
        color: "#92400e",
        border: "1px solid #fde68a",
      };
    }
    if (action === "TRIM") {
      return {
        background: "#ffedd5",
        color: "#9a3412",
        border: "1px solid #fed

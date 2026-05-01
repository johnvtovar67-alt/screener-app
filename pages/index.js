import { useEffect, useState } from "react";

export default function Home() {
  const [ideas, setIdeas] = useState([]);
  const [symbol, setSymbol] = useState("");
  const [snap, setSnap] = useState(null);
  const [portfolio, setPortfolio] = useState([]);
  const [analysis, setAnalysis] = useState([]);

  // Load top ideas
  async function loadIdeas() {
    const res = await fetch("/api/top5");
    const data = await res.json();
    setIdeas(data.stocks || []);
  }

  useEffect(() => {
    loadIdeas();
  }, []);

  // Snap quote
  async function handleSnap() {
    if (!symbol) return;

    const res = await fetch(`/api?symbol=${symbol}`);
    const data = await res.json();
    setSnap(data);
  }

  // Portfolio add
  function addToPortfolio(e) {
    e.preventDefault();
    const form = e.target;

    const newItem = {
      symbol: form.symbol.value.toUpperCase(),
      shares: Number(form.shares.value),
      cost: Number(form.cost.value),
    };

    setPortfolio([...portfolio, newItem]);

    form.reset();
  }

  // Portfolio analyze
  async function analyzePortfolio() {
    if (!portfolio.length) return;

    const symbols = portfolio.map((p) => p.symbol).join(",");
    const res = await fetch(`/api?symbols=${symbols}`);
    const data = await res.json();

    setAnalysis(data.stocks || []);
  }

  // 🔥 FIXED — always uses recommendation first
  function getEntryNote(stock) {
    return (
      stock?.recommendation?.entryNote ??
      stock?.entryNote ??
      "Wait for stronger price or volume confirmation."
    );
  }

  function getWhy(stock) {
    return (
      stock?.recommendation?.reason ??
      stock?.reason ??
      ""
    );
  }

  function getAction(stock) {
    return stock?.recommendation?.label || "—";
  }

  return (
    <div style={{ padding: 20, fontFamily: "Arial" }}>
      <h1>🔥 Top 10 Ideas</h1>
      <p>Cards are the quick scan. Table adds the reason and entry note.</p>

      {/* 🔹 CARDS */}
      <div style={{ display: "flex", gap: 12, overflowX: "auto" }}>
        {ideas.map((s) => (
          <div
            key={s.symbol}
            style={{
              border: "1px solid #ddd",
              borderRadius: 10,
              padding: 10,
              minWidth: 150,
            }}
          >
            <b>{s.symbol}</b>
            <div>${s.price?.toFixed(2)}</div>

            <div
              style={{
                marginTop: 6,
                padding: "4px 8px",
                borderRadius: 20,
                display: "inline-block",
                background:
                  getAction(s) === "STRONG BUY"
                    ? "#c6f6d5"
                    : getAction(s) === "BUY"
                    ? "#fef3c7"
                    : "#fee2e2",
              }}
            >
              {getAction(s) === "STRONG BUY"
                ? "Buy Now"
                : getAction(s) === "BUY"
                ? "Watch for Entry"
                : "Avoid"}
            </div>

            <div style={{ fontSize: 12, marginTop: 6 }}>
              Score: {s.recommendation?.score}
            </div>
          </div>
        ))}
      </div>

      {/* 🔹 TABLE */}
      <table width="100%" style={{ marginTop: 20 }}>
        <thead>
          <tr>
            <th align="left">Symbol</th>
            <th align="left">Name</th>
            <th>Price</th>
            <th>Chg %</th>
            <th>Trade Action</th>
            <th align="left">Why</th>
            <th align="left">Entry Note</th>
          </tr>
        </thead>
        <tbody>
          {ideas.map((s) => (
            <tr key={s.symbol}>
              <td>{s.symbol}</td>
              <td>{s.name}</td>
              <td align="center">${s.price?.toFixed(2)}</td>
              <td align="center">{s.dayChangePct?.toFixed(2)}%</td>
              <td align="center">
                {getAction(s) === "STRONG BUY"
                  ? "Buy Now"
                  : getAction(s) === "BUY"
                  ? "Watch for Entry"
                  : "Avoid"}
              </td>
              <td>{getWhy(s)}</td>
              <td>{getEntryNote(s)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 🔹 SNAP */}
      <h2 style={{ marginTop: 40 }}>Snap Quote + Score</h2>
      <input
        placeholder="Enter symbol"
        value={symbol}
        onChange={(e) => setSymbol(e.target.value)}
      />
      <button onClick={handleSnap}>Analyze</button>

      {snap && (
        <div style={{ marginTop: 10 }}>
          <h3>{snap.symbol}</h3>
          <div>Price: ${snap.price}</div>
          <div>Score: {snap.recommendation?.score}</div>
          <div>
            Action:{" "}
            {snap.recommendation?.label === "STRONG BUY"
              ? "Buy Now"
              : snap.recommendation?.label === "BUY"
              ? "Watch for Entry"
              : "Avoid"}
          </div>
          <div>Why: {snap.recommendation?.reason}</div>
          <div>Entry: {snap.recommendation?.entryNote}</div>
        </div>
      )}

      {/* 🔹 PORTFOLIO */}
      <h2 style={{ marginTop: 40 }}>Portfolio</h2>

      <form onSubmit={addToPortfolio}>
        <input name="symbol" placeholder="Symbol" />
        <input name="shares" placeholder="Shares" />
        <input name="cost" placeholder="Avg Cost" />
        <button>Add</button>
      </form>

      <button onClick={analyzePortfolio} style={{ marginTop: 10 }}>
        Analyze Portfolio
      </button>

      {analysis.length > 0 && (
        <table width="100%" style={{ marginTop: 20 }}>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Score</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {analysis.map((s) => (
              <tr key={s.symbol}>
                <td>{s.symbol}</td>
                <td>{s.recommendation?.score}</td>
                <td>
                  {s.recommendation?.label === "STRONG BUY"
                    ? "Hold / Add"
                    : s.recommendation?.label === "BUY"
                    ? "Hold"
                    : s.recommendation?.label === "WATCH"
                    ? "Trim"
                    : "Exit / Avoid"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

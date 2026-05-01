import { useEffect, useMemo, useState } from "react";

const READINESS_ORDER = {
"Trade Ready": 1,
"Watch Closely": 2,
"Setup Only": 3,
};

function safeNumber(value, fallback = 0) {
const n = Number(value);
return Number.isFinite(n) ? n : fallback;
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
return row?.price ?? row?.quote?.price ?? row?.profile?.price;
}

function getComposite(row) {
return safeNumber(
row?.compositeScore ?? row?.recommendation?.score,
0
);
}

function getHeat(row) {
return safeNumber(
row?.heatScore ?? row?.technicalSnapshot?.heatScore,
0
);
}

function getReadiness(row) {
return (
row?.tradeReadiness ||
row?.recommendation?.tradeReadiness ||
"Setup Only"
);
}

function sortIdeas(a, b) {
const ar = READINESS_ORDER[getReadiness(a)] || 99;
const br = READINESS_ORDER[getReadiness(b)] || 99;

if (ar !== br) return ar - br;

return getComposite(b) - getComposite(a);
}

export default function Home() {
const [ideas, setIdeas] = useState([]);
const [loading, setLoading] = useState(false);
const [snapInput, setSnapInput] = useState("");
const [snapResult, setSnapResult] = useState(null);

useEffect(() => {
loadTopIdeas();
}, []);

async function loadTopIdeas() {
setLoading(true);

```
try {
  const res = await fetch("/api/top5");
  const data = await res.json();

  const rows =
    data?.stocks ||   // ✅ FIX
    data?.results ||
    [];

  setIdeas(rows.sort(sortIdeas).slice(0, 10));
} catch (err) {
  console.error(err);
} finally {
  setLoading(false);
}
```

}

async function runSnapQuote() {
const clean = snapInput.trim().toUpperCase();
if (!clean) return;

```
try {
  const res = await fetch(`/api?symbol=${clean}`); // ✅ FIX
  const data = await res.json();

  setSnapResult(data);
} catch {
  setSnapResult({ error: true });
}
```

}

const top10 = useMemo(() => {
return [...ideas].sort(sortIdeas);
}, [ideas]);

return (
<main style={{ padding: 20 }}> <h1>Stock Screener</h1>

```
  <h2>Top 10 Ideas</h2>

  {loading ? (
    <p>Loading...</p>
  ) : (
    top10.map((row, i) => (
      <div key={i} style={{ marginBottom: 12 }}>
        <strong>{getSymbol(row)}</strong> — {getName(row)} | 
        Heat: {getHeat(row)} | 
        Score: {getComposite(row)} | 
        {getReadiness(row)}
      </div>
    ))
  )}

  <h2>Snap Quote</h2>

  <input
    value={snapInput}
    onChange={(e) => setSnapInput(e.target.value)}
    placeholder="MARA"
  />
  <button onClick={runSnapQuote}>Analyze</button>

  {snapResult && (
    <div style={{ marginTop: 10 }}>
      {snapResult.error ? (
        <p>No data</p>
      ) : (
        <div>
          <strong>{snapResult.symbol}</strong> | 
          Heat: {snapResult.heatScore} | 
          Score: {snapResult.compositeScore} | 
          {snapResult.tradeReadiness}
        </div>
      )}
    </div>
  )}
</main>
```

);
}

'use client';

import { useEffect, useMemo, useState } from 'react';

const seedUniverse = [
  { ticker: 'GCT', name: 'GigaCloud', price: 31.4 },
  { ticker: 'ASO', name: 'Academy Sports', price: 56.2 },
  { ticker: 'CROX', name: 'Crocs', price: 124.8 },
  { ticker: 'FIX', name: 'Comfort Systems', price: 391.5 },
  { ticker: 'VIST', name: 'Vista Energy', price: 52.6 },
  { ticker: 'MSTR', name: 'Strategy', price: 168.0 },
];

export default function Home() {
  const [liveQuotes, setLiveQuotes] = useState({});
  const [query, setQuery] = useState('');

  useEffect(() => {
    async function loadLiveQuotes() {
      try {
        const res = await fetch('/api/live');
        const data = await res.json();
        setLiveQuotes(data.quotes || {});
      } catch (e) {
        console.error('Live quote load failed', e);
      }
    }

    loadLiveQuotes();
  }, []);

  const stocks = useMemo(() => {
    return seedUniverse
      .map((s) => {
        const live = liveQuotes[s.ticker] || {};
        return {
          ...s,
          price: live.price ?? s.price,
        };
      })
      .filter(
        (s) =>
          s.ticker.toLowerCase().includes(query.toLowerCase()) ||
          s.name.toLowerCase().includes(query.toLowerCase())
      );
  }, [query, liveQuotes]);

  return (
    <main style={{ padding: 40, fontFamily: 'Arial, sans-serif' }}>
      <h1>🧠 Auto Quant Screener</h1>

      <input
        placeholder="Search ticker..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{
          padding: 10,
          width: '100%',
          marginBottom: 20,
          fontSize: 16,
        }}
      />

      <table width="100%" cellPadding="10">
        <thead>
          <tr>
            <th align="left">Ticker</th>
            <th align="left">Name</th>
            <th align="right">Price</th>
          </tr>
        </thead>
        <tbody>
          {stocks.map((s) => (
            <tr key={s.ticker}>
              <td>{s.ticker}</td>
              <td>{s.name}</td>
              <td align="right">${s.price?.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

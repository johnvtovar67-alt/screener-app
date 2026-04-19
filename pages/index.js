import { useMemo, useState } from 'react';

const AUTO_WEIGHTS = {
  value: 22,
  quality: 28,
  growth: 15,
  breakout: 20,
  risk: 10,
  sentiment: 5,
};

const seedUniverse = [
  { ticker: 'GCT', name: 'GigaCloud', price: 31.4, marketCapB: 0.9, pe: 6.8, roic: 19, revGrowth: 31, rs6m: 64, breakoutDistance: 3, quality: 80, sentiment: 62 },
  { ticker: 'ASO', name: 'Academy Sports', price: 56.2, marketCapB: 3.7, pe: 8.1, roic: 18, revGrowth: 5, rs6m: 72, breakoutDistance: 7, quality: 75, sentiment: 58 },
  { ticker: 'CROX', name: 'Crocs', price: 124.8, marketCapB: 7.1, pe: 9.6, roic: 22, revGrowth: 7, rs6m: 70, breakoutDistance: 6, quality: 78, sentiment: 38 },
  { ticker: 'FIX', name: 'Comfort Systems', price: 391.5, marketCapB: 14.2, pe: 26.8, roic: 28, revGrowth: 18, rs6m: 92, breakoutDistance: 2, quality: 90, sentiment: 66 },
  { ticker: 'VIST', name: 'Vista Energy', price: 52.6, marketCapB: 4.8, pe: 7.5, roic: 17, revGrowth: 15, rs6m: 71, breakoutDistance: 6, quality: 76, sentiment: 61 },
  { ticker: 'MSTR', name: 'Strategy', price: 168.0, marketCapB: 36.0, pe: 0, roic: 6, revGrowth: 11, rs6m: 98, breakoutDistance: 2, quality: 58, sentiment: 83 },
];

function getColor(score) {
  if (score >= 80) return '#15803d';
  if (score >= 65) return '#2563eb';
  if (score >= 50) return '#ca8a04';
  return '#dc2626';
}

function getSoftBg(score) {
  if (score >= 80) return '#f0fdf4';
  if (score >= 65) return '#eff6ff';
  if (score >= 50) return '#fefce8';
  return '#fef2f2';
}

function getActionLabel(score) {
  if (score >= 80) return 'BUY';
  if (score >= 65) return 'WATCH';
  if (score >= 50) return 'MAYBE';
  return 'PASS';
}

function scoreStock(s) {
  const value = s.pe > 0 ? Math.max(15, 100 - s.pe * 2) : 35;
  const quality = s.quality;
  const growth = Math.min(100, s.revGrowth * 2 + 20);
  const breakout = (s.rs6m + (100 - s.breakoutDistance * 10)) / 2;
  const risk = s.roic > 10 ? 80 : 45;
  const sentiment = s.sentiment ?? 50;

  const composite =
    (
      value * AUTO_WEIGHTS.value +
      quality * AUTO_WEIGHTS.quality +
      growth * AUTO_WEIGHTS.growth +
      breakout * AUTO_WEIGHTS.breakout +
      risk * AUTO_WEIGHTS.risk +
      sentiment * AUTO_WEIGHTS.sentiment
    ) / 100;

  return { composite, value, quality, growth, breakout, risk, sentiment };
}

function getTradePlan(stock) {
  const triggerPct = stock.breakoutDistance / 100;
  const entry = stock.price * (1 + triggerPct);
  const stop = entry * 0.92;
  const target1 = entry * 1.12;
  const target2 = entry * 1.22;

  return {
    entryLow: (entry * 0.99).toFixed(2),
    entryHigh: (entry * 1.01).toFixed(2),
    stop: stop.toFixed(2),
    target1: target1.toFixed(2),
    target2: target2.toFixed(2),
  };
}

function getDrivers(stock) {
  const fundamentals = [
    {
      label: 'P/E valuation',
      value: stock.pe === 0 ? 'N/M' : stock.pe.toFixed(1),
      detail:
        stock.pe > 0 && stock.pe <= 12
          ? 'cheap versus most growth names'
          : stock.pe > 0 && stock.pe <= 25
          ? 'reasonable but not screaming cheap'
          : 'rich or not meaningful on earnings',
      score: stock.scores.value,
    },
    {
      label: 'ROIC',
      value: `${stock.roic}%`,
      detail:
        stock.roic >= 20
          ? 'strong capital efficiency'
          : stock.roic >= 10
          ? 'acceptable returns on capital'
          : 'weaker capital efficiency',
      score: stock.roic >= 20 ? 85 : stock.roic >= 10 ? 65 : 40,
    },
    {
      label: 'Revenue growth',
      value: `${stock.revGrowth}%`,
      detail:
        stock.revGrowth >= 15
          ? 'healthy topline expansion'
          : stock.revGrowth >= 5
          ? 'modest growth'
          : 'low growth profile',
      score: stock.scores.growth,
    },
    {
      label: 'Quality profile',
      value: `${stock.quality}`,
      detail:
        stock.quality >= 80
          ? 'high-quality operating profile'
          : stock.quality >= 65
          ? 'decent quality'
          : 'lower-quality profile is a drag',
      score: stock.scores.quality,
    },
    {
      label: 'Public sentiment',
      value: `${stock.sentiment}`,
      detail:
        stock.sentiment >= 70
          ? 'brand and crowd sentiment are supportive'
          : stock.sentiment >= 50
          ? 'sentiment is mixed or neutral'
          : 'public or brand sentiment is a headwind',
      score: stock.scores.sentiment,
    },
  ];

  const technicals = [
    {
      label: '6M relative strength',
      value: `${stock.rs6m}`,
      detail:
        stock.rs6m >= 85
          ? 'institutional momentum is clearly present'
          : stock.rs6m >= 65
          ? 'constructive but not elite'
          : 'momentum is not a major tailwind',
      score: stock.scores.breakout,
    },
    {
      label: 'Distance to breakout',
      value: `${stock.breakoutDistance}%`,
      detail:
        stock.breakoutDistance <= 3
          ? 'very close to trigger level'
          : stock.breakoutDistance <= 6
          ? 'within range but not immediate'
          : 'still needs more setup time',
      score: stock.breakoutDistance <= 3 ? 85 : stock.breakoutDistance <= 6 ? 65 : 40,
    },
  ];

  const topImpacts = [
    { label: 'Value', score: stock.scores.value, impact: (stock.scores.value * AUTO_WEIGHTS.value) / 100, group: 'Fundamental' },
    { label: 'Quality', score: stock.scores.quality, impact: (stock.scores.quality * AUTO_WEIGHTS.quality) / 100, group: 'Fundamental' },
    { label: 'Growth', score: stock.scores.growth, impact: (stock.scores.growth * AUTO_WEIGHTS.growth) / 100, group: 'Fundamental' },
    { label: 'Breakout', score: stock.scores.breakout, impact: (stock.scores.breakout * AUTO_WEIGHTS.breakout) / 100, group: 'Technical' },
    { label: 'Risk', score: stock.scores.risk, impact: (stock.scores.risk * AUTO_WEIGHTS.risk) / 100, group: 'Risk' },
    { label: 'Sentiment', score: stock.scores.sentiment, impact: (stock.scores.sentiment * AUTO_WEIGHTS.sentiment) / 100, group: 'Alternative' },
  ].sort((a, b) => b.impact - a.impact);

  return { fundamentals, technicals, topImpacts };
}

function metricCard(label, value, score, subtle) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 14,
        background: subtle || '#f8fafc',
        border: '1px solid #e5e7eb',
      }}
    >
      <div style={{ fontSize: 13, color: '#64748b' }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 24, fontWeight: 700, color: getColor(score) }}>{value}</div>
    </div>
  );
}

function shellCard(children) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 20,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}
    >
      {children}
    </div>
  );
}

export default function Home() {
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState('composite');
  const [selectedTicker, setSelectedTicker] = useState('GCT');

  const scored = useMemo(() => {
    const q = query.trim().toLowerCase();

    return seedUniverse
      .map((s) => ({ ...s, scores: scoreStock(s) }))
      .filter((s) => !q || s.ticker.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
      .sort((a, b) => b.scores[sortBy] - a.scores[sortBy]);
  }, [query, sortBy]);

  const selected = scored.find((s) => s.ticker === selectedTicker) || scored[0] || null;
  const tradePlan = selected ? getTradePlan(selected) : null;
  const drivers = selected ? getDrivers(selected) : null;

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#f8fafc',
        padding: 24,
        fontFamily: 'Arial, sans-serif',
        color: '#0f172a',
      }}
    >
      <div style={{ maxWidth: 1150, margin: '0 auto', display: 'grid', gap: 24 }}>
        {shellCard(
          <div style={{ padding: 24 }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>🧠 Auto Quant Screener</div>
            <div style={{ color: '#64748b', fontSize: 15 }}>
              One overall action score, clickable recommendations, sentiment, and entry / exit plan.
            </div>

            <div
              style={{
                marginTop: 20,
                padding: 16,
                borderRadius: 16,
                background: '#f1f5f9',
                display: 'flex',
                justifyContent: 'space-between',
                gap: 16,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div style={{ fontWeight: 700 }}>Mode</div>
                <div style={{ color: '#64748b', marginTop: 4 }}>Demo data for now. Live mode will come after data hookup.</div>
              </div>
              <div
                style={{
                  padding: '12px 18px',
                  borderRadius: 12,
                  border: '1px solid #d1d5db',
                  background: '#2563eb',
                  color: '#fff',
                  fontWeight: 700,
                }}
              >
                Demo mode
              </div>
            </div>

            <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 220px', gap: 16 }}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type ticker or company (example: MSTR or Crocs)"
                style={{
                  padding: '16px 18px',
                  borderRadius: 14,
                  border: '1px solid #cbd5e1',
                  fontSize: 16,
                  width: '100%',
                }}
              />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{
                  padding: '16px 18px',
                  borderRadius: 14,
                  border: '1px solid #cbd5e1',
                  fontSize: 16,
                  background: '#fff',
                }}
              >
                <option value="composite">Composite</option>
                <option value="breakout">Breakout</option>
                <option value="value">Value</option>
                <option value="quality">Quality</option>
              </select>
            </div>
          </div>
        )}

        {shellCard(
          <div style={{ padding: 24 }}>
            <div style={{ color: '#64748b', marginBottom: 16 }}>🖱️ Single-click any row below to load the full explanation and trade plan.</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e5e7eb', color: '#64748b', textAlign: 'left' }}>
                    <th style={{ padding: '12px 0' }}>Ticker</th>
                    <th style={{ padding: '12px 0' }}>Name</th>
                    <th style={{ padding: '12px 0', textAlign: 'right' }}>Price</th>
                    <th style={{ padding: '12px 0', textAlign: 'right' }}>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {scored.map((s) => (
                    <tr
                      key={s.ticker}
                      onClick={() => setSelectedTicker(s.ticker)}
                      style={{
                        cursor: 'pointer',
                        background: selected && selected.ticker === s.ticker ? '#dbeafe' : 'transparent',
                        borderTop: '1px solid #f1f5f9',
                      }}
                    >
                      <td style={{ padding: '14px 0', fontWeight: 700 }}>{s.ticker}</td>
                      <td style={{ padding: '14px 0' }}>{s.name}</td>
                      <td style={{ padding: '14px 0', textAlign: 'right' }}>${s.price.toFixed(2)}</td>
                      <td style={{ padding: '14px 0', textAlign: 'right', fontSize: 28, fontWeight: 800, color: getColor(s.scores.composite) }}>
                        {Math.round(s.scores.composite)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {selected && tradePlan && drivers && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <div
                style={{
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: 20,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    background: getSoftBg(selected.scores.composite),
                    padding: 24,
                    borderBottom: '1px solid #e5e7eb',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: '#64748b' }}>Primary action score</div>
                      <div style={{ fontSize: 56, fontWeight: 800, lineHeight: 1, marginTop: 8 }}>{Math.round(selected.scores.composite)}</div>
                      <div style={{ color: '#64748b', marginTop: 10 }}>This is the main take-action-or-not number.</div>
                    </div>
                    <div
                      style={{
                        alignSelf: 'center',
                        padding: '12px 16px',
                        borderRadius: 999,
                        background: '#fff',
                        border: '1px solid #d1d5db',
                        fontWeight: 700,
                      }}
                    >
                      {getActionLabel(selected.scores.composite)}
                    </div>
                  </div>
                </div>

                <div style={{ padding: 24 }}>
                  <div style={{ fontWeight: 800, marginBottom: 4 }}>{selected.ticker} Signal</div>
                  <div style={{ color: '#64748b', marginBottom: 18 }}>The selected row above is expanded here.</div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    {metricCard('Value', Math.round(selected.scores.value), selected.scores.value)}
                    {metricCard('Breakout', Math.round(selected.scores.breakout), selected.scores.breakout)}
                    {metricCard('Quality', Math.round(selected.scores.quality), selected.scores.quality)}
                    {metricCard('Growth', Math.round(selected.scores.growth), selected.scores.growth)}
                    {metricCard('Risk', Math.round(selected.scores.risk), selected.scores.risk)}
                    {metricCard('Sentiment', Math.round(selected.scores.sentiment), selected.scores.sentiment, '#fffbeb')}
                  </div>
                </div>
              </div>

              <div
                style={{
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: 20,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                }}
              >
                <div style={{ padding: 24 }}>
                  <div style={{ fontWeight: 800, marginBottom: 4 }}>📈 Entry / Exit Plan</div>
                  <div style={{ color: '#64748b', marginBottom: 18 }}>Prototype trade plan based on price and breakout distance.</div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {metricCard('Entry zone', `$${tradePlan.entryLow} - $${tradePlan.entryHigh}`, 85, '#f0fdf4')}
                    {metricCard('Stop', `$${tradePlan.stop}`, 25, '#fef2f2')}
                    {metricCard('Target 1', `$${tradePlan.target1}`, 70, '#eff6ff')}
                    {metricCard('Target 2', `$${tradePlan.target2}`, 70, '#eff6ff')}
                  </div>

                  <div style={{ color: '#64748b', marginTop: 16, fontSize: 14 }}>
                    Entry is set just above the modeled breakout level. Stop is about 8% below entry. Targets are scaled at roughly 12% and 22% above entry.
                  </div>
                </div>
              </div>
            </div>

            {shellCard(
              <div style={{ padding: 24 }}>
                <div style={{ fontWeight: 800, marginBottom: 4 }}>Why this recommendation scored well</div>
                <div style={{ color: '#64748b', marginBottom: 20 }}>The biggest fundamental and technical inputs driving the composite score.</div>

                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Biggest score drivers</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
                    {drivers.topImpacts.map((item) => (
                      <div
                        key={item.label}
                        style={{
                          padding: 14,
                          borderRadius: 14,
                          background: '#f8fafc',
                          border: '1px solid #e5e7eb',
                        }}
                      >
                        <div style={{ fontWeight: 700 }}>{item.label}</div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: getColor(item.score), marginTop: 4 }}>
                          {Math.round(item.score)}
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
                          Weighted impact: {item.impact.toFixed(1)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Fundamentals behind the call</div>
                    <div style={{ display: 'grid', gap: 12 }}>
                      {drivers.fundamentals.map((item) => (
                        <div
                          key={item.label}
                          style={{
                            padding: 16,
                            borderRadius: 14,
                            background: getSoftBg(item.score),
                            border: '1px solid #e5e7eb',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                            <div style={{ fontWeight: 700 }}>{item.label}</div>
                            <div style={{ fontWeight: 800, fontSize: 20 }}>{item.value}</div>
                          </div>
                          <div style={{ marginTop: 8, color: '#475569', fontSize: 14 }}>{item.detail}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Technicals behind the call</div>
                    <div style={{ display: 'grid', gap: 12 }}>
                      {drivers.technicals.map((item) => (
                        <div
                          key={item.label}
                          style={{
                            padding: 16,
                            borderRadius: 14,
                            background: getSoftBg(item.score),
                            border: '1px solid #e5e7eb',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                            <div style={{ fontWeight: 700 }}>{item.label}</div>
                            <div style={{ fontWeight: 800, fontSize: 20 }}>{item.value}</div>
                          </div>
                          <div style={{ marginTop: 8, color: '#475569', fontSize: 14 }}>{item.detail}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

import { useState } from 'react';

const UNIVERSES = ['nasdaq', 'sp500'];

export default function C1MomentumLossResearchRunner() {
  const [universeIndex, setUniverseIndex] = useState(0);
  const [status, setStatus] = useState('Running NASDAQ comparison…');
  const [results, setResults] = useState({});
  const universe = UNIVERSES[universeIndex];

  function captureResult(event) {
    try {
      const text = event.currentTarget.contentDocument?.body?.innerText || '';
      if (!text.trim()) return;
      const payload = JSON.parse(text);
      if (payload.status !== 'complete') {
        throw new Error(payload.error || `${universe} did not complete`);
      }
      setResults((current) => ({ ...current, [universe]: payload }));
      const nextIndex = universeIndex + 1;
      if (nextIndex < UNIVERSES.length) {
        setUniverseIndex(nextIndex);
        setStatus(`Running ${UNIVERSES[nextIndex].toUpperCase()} comparison…`);
      } else {
        setStatus('Complete');
      }
    } catch (error) {
      setStatus(`Failed: ${error.message}`);
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', margin: '2rem', maxWidth: 1200 }}>
      <h1>C1 momentum-loss research runner</h1>
      <p><strong>Status:</strong> {status}</p>
      <p>Preview-only. This page does not write account data or change production policy.</p>
      {status !== 'Complete' && !status.startsWith('Failed:') && (
        <iframe
          key={universe}
          src={`/api/research/c1-momentum-loss-experiment?universe=${universe}`}
          onLoad={captureResult}
          title={`${universe} research calculation`}
          style={{ width: '100%', minHeight: 80, border: '1px solid #cbd5e1' }}
        />
      )}
      {Object.entries(results).map(([universe, result]) => (
        <section key={universe}>
          <h2>{universe.toUpperCase()}</h2>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </section>
      ))}
    </main>
  );
}

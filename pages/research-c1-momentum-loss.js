import { useEffect, useState } from 'react';

const UNIVERSES = ['nasdaq', 'sp500'];

export default function C1MomentumLossResearchRunner() {
  const [status, setStatus] = useState('Starting research run…');
  const [results, setResults] = useState({});

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const next = {};
      for (const universe of UNIVERSES) {
        if (cancelled) return;
        setStatus(`Running ${universe.toUpperCase()} comparison…`);
        const response = await fetch(
          `/api/research/c1-momentum-loss-experiment?universe=${universe}`,
          { cache: 'no-store' },
        );
        const text = await response.text();
        let payload;
        try {
          payload = JSON.parse(text);
        } catch {
          throw new Error(`${universe} returned HTTP ${response.status}: ${text.slice(0, 400)}`);
        }
        if (!response.ok) {
          throw new Error(`${universe} returned HTTP ${response.status}: ${JSON.stringify(payload)}`);
        }
        next[universe] = payload;
        if (!cancelled) setResults({ ...next });
      }
      if (!cancelled) setStatus('Complete');
    }

    run().catch((error) => {
      if (!cancelled) setStatus(`Failed: ${error.message}`);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', margin: '2rem', maxWidth: 1200 }}>
      <h1>C1 momentum-loss research runner</h1>
      <p><strong>Status:</strong> {status}</p>
      <p>Preview-only. This page does not write account data or change production policy.</p>
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

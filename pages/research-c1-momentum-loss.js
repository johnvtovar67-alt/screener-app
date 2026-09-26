import { useEffect, useState } from 'react';

const TASKS = [
  { universe: 'nasdaq', mode: 'downside-grid' },
  { universe: 'sp500', mode: 'downside-grid' },
  { universe: 'nasdaq', mode: 'upside-grid' },
  { universe: 'sp500', mode: 'upside-grid' },
];
const taskLabel = ({ universe, mode }) =>
  `${universe.toUpperCase()} ${mode === 'downside-grid' ? 'loss-exit' : 'upside-exit'} grid`;

export default function C1MomentumLossResearchRunner() {
  const [taskIndex, setTaskIndex] = useState(0);
  const [status, setStatus] = useState(`Running ${taskLabel(TASKS[0])}…`);
  const [results, setResults] = useState({});
  const task = TASKS[taskIndex];
  const { universe, mode } = task;
  const resultKey = `${universe}-${mode}`;

  useEffect(() => {
    function captureResult(event) {
      if (event.origin !== window.location.origin) return;
      const message = event.data;
      if (message?.type !== 'c1-momentum-loss-result') return;
      const payload = message.payload;
      if (
        payload?.universe !== universe ||
        payload?.mode !== mode ||
        payload?.status !== 'complete'
      ) return;
      setResults((current) => ({ ...current, [resultKey]: payload }));
      const nextIndex = taskIndex + 1;
      if (nextIndex < TASKS.length) {
        setTaskIndex(nextIndex);
        setStatus(`Running ${taskLabel(TASKS[nextIndex])}…`);
      } else {
        setStatus('Complete');
      }
    }
    window.addEventListener('message', captureResult);
    return () => window.removeEventListener('message', captureResult);
  }, [mode, resultKey, taskIndex, universe]);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', margin: '2rem', maxWidth: 1200 }}>
      <h1>C1 momentum-loss research runner</h1>
      <p><strong>Status:</strong> {status}</p>
      <p>Preview-only. This page does not write account data or change production policy.</p>
      {status !== 'Complete' && !status.startsWith('Failed:') && (
        <iframe
          key={resultKey}
          src={`/api/research/c1-momentum-loss-experiment?universe=${universe}&mode=${mode}&format=frame`}
          title={`${resultKey} research calculation`}
          style={{ width: '100%', minHeight: 80, border: '1px solid #cbd5e1' }}
        />
      )}
      {Object.entries(results).map(([key, result]) => (
        <section key={key}>
          <h2>{key.toUpperCase()}</h2>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </section>
      ))}
    </main>
  );
}

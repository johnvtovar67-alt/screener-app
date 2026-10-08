// One complete regression suite for local verification, builds and CI.
// Each script runs in its own process so clocks and globals cannot leak.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const tools = path.join(root, 'tools');
const logDirectory = path.join(root, 'work', 'regressions');
const regressions = fs.readdirSync(tools).filter(file =>
  file.endsWith('-regression.cjs') || file === 'regression-check.cjs'
).sort();
const scripts = [...regressions, 'recommended-trade-simulation.cjs'];
fs.mkdirSync(logDirectory, { recursive: true });

const results = [];
console.log(`Running ${regressions.length} regression scripts and the trade simulation.`);
for (const script of scripts) {
  const started = Date.now();
  console.log(`RUN tools/${script}`);
  const child = spawnSync(process.execPath, [path.join(tools, script)], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const output = [child.stdout, child.stderr, child.error?.stack].filter(Boolean).join('\n');
  fs.writeFileSync(path.join(logDirectory, script + '.log'), output);
  const result = { script, passed: child.status === 0 && !child.error,
    exitCode: child.status, signal: child.signal, durationMs: Date.now() - started };
  results.push(result);
  console.log(`${result.passed ? 'PASS' : 'FAIL'} tools/${script} (${result.durationMs} ms)`);
  if (!result.passed && output) process.stderr.write(output.endsWith('\n') ? output : output + '\n');
}

const failed = results.filter(result => !result.passed);
fs.writeFileSync(path.join(logDirectory, 'results.json'), JSON.stringify({
  passed: results.length - failed.length, failed: failed.length, results,
}, null, 2) + '\n');
console.log(`Regression suite: ${results.length - failed.length}/${results.length} passed; ${failed.length} failed.`);
console.log(`Complete per-script output: ${path.relative(root, logDirectory)}/`);
if (failed.length) {
  console.error('Failed scripts:\n' + failed.map(result => '  tools/' + result.script).join('\n'));
  process.exitCode = 1;
}

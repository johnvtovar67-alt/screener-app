#!/usr/bin/env python3
"""Verify saved historical output arithmetic; does not rerun a strategy."""
import base64
import gzip
import hashlib
import json
from pathlib import Path

from research_paths import work_root, source_root
ROOT = work_root()
REPO = source_root()
report = {}
for universe in ('sp500', 'nasdaq'):
    source = REPO / 'tools' / 'fixtures' / f'c1-{universe}-accounting.json.gz.base64'
    raw = gzip.decompress(base64.b64decode(source.read_bytes()))
    runs = json.loads(raw)
    decoded = ROOT / 'data' / f'{universe}-accounting.json'
    assert json.loads(decoded.read_bytes()) == runs
    checks = []
    for run in runs:
        cash, positions, consumed = 100000.0, {}, 0
        cash_error = equity_error = 0.0
        for point in run['curve']:
            while consumed < len(run['trades']) and run['trades'][consumed]['date'] <= point['date']:
                trade = run['trades'][consumed]
                delta = trade['shares'] * (1 if trade['side'] == 'buy' else -1)
                cash -= delta * trade['price']
                symbol = trade['symbol']
                positions[symbol] = positions.get(symbol, 0) + delta
                if abs(positions[symbol]) < 1e-8:
                    del positions[symbol]
                consumed += 1
            assert not (set(positions) - set(point['marks']))
            assert len(positions) == point['positions']
            equity = cash + sum(quantity * point['marks'][symbol] for symbol, quantity in positions.items())
            cash_error = max(cash_error, abs(cash - point['cash']))
            equity_error = max(equity_error, abs(equity - point['equity']))
        assert consumed == len(run['trades'])
        assert cash_error < 0.0051 and equity_error < 0.0051
        checks.append(dict(sleeve=run['id'], fills=consumed, checkpoints=len(run['curve']),
                           max_cash_error_dollars=cash_error, max_equity_error_dollars=equity_error,
                           passed=True))
    report[universe] = dict(source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
                            decoded_source_sha256=hashlib.sha256(raw).hexdigest(), checks=checks)
(ROOT / 'input-accounting-check.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'purpose': 'saved accounting arithmetic, not market authenticity or strategy evidence',
                  'passed': True, 'checkpoints': sum(c['checkpoints'] for r in report.values() for c in r['checks'])}))

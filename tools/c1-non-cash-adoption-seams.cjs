// Non-trading balance admission at the accepted close. Trading-policy bodies
// remain unchanged; actual cash/fill histories and original seeds are retained.
module.exports=[
 ["import {validateC1AccountSeed,c1SeedPosition} from './c1AccountSeed';", "import {validateC1AccountSeed,c1SeedPosition} from './c1AccountSeed';\nimport {c1NonCashPerformanceCurve} from './c1NonCashAdoption';"],
 ['    for (const [symbol, position] of positions) {\n      const row = prices.get(symbol);\n      if (row?.close > 0)',
  "    let nonCashFlow=0;\n    for(const event of actualReplay?.nonCashHoldings(session.date)||[]){\n      const p=event.position,stock=p.stock;\n      if(positions.has(p.symbol))throw new Error('Non-cash adoption duplicates existing ownership');\n      positions.set(p.symbol,{...c1SeedPosition(p,sessionIndex,session.date,prices.get(p.symbol).close),issuer:issuerOf(stock),sector:sectorOf(stock),factor:factorOf(stock)});\n      portfolioHighWatermark+=event.value;nonCashFlow+=event.value;\n    }\n    for (const [symbol, position] of positions) {\n      const row = prices.get(symbol);\n      if (row?.close > 0)"],
 ['      curve.push({\n        date: session.date,\n        equity: round(equity, 2),\n        cash: round(cash, 2),\n        positions: positions.size,',
  '      curve.push({\n        date: session.date,\n        equity: round(equity, 2),\n        ...(nonCashFlow?{nonCashFlow}:{}),\n        cash: round(cash, 2),\n        positions: positions.size,'],
 ['  const benchmarkCurve = benchmarkCurves[primaryBenchmarkSymbol] || [];\n  const metrics = metricsFromCurve(\n    curve,', '  const benchmarkCurve = benchmarkCurves[primaryBenchmarkSymbol] || [];\n  const metrics = metricsFromCurve(\n    c1NonCashPerformanceCurve(curve),']
];

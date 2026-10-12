// Deliberately artificial inputs for software mechanics only.
const path = require('node:path');
const { SOURCE_ROOT } = require('./options-loader.cjs');
const { createResearchModuleLoader } = require(path.join(SOURCE_ROOT, 'tools/research-module-loader.cjs'));
const calendar = createResearchModuleLoader(SOURCE_ROOT).load('lib/marketSession.js');
function marketDates(length) {
  const dates = [];
  for (let time = Date.parse('2026-03-02T12:00:00Z'); dates.length < length; time += 86400000) {
    const date = new Date(time).toISOString().slice(0, 10);
    if (calendar.isUsMarketSessionDay(date)) dates.push(date);
  }
  return dates;
}
function syntheticDataset({ length = 3, count = 18, sameSector = false, price = 100, adv = () => 1e9, liquidityPass = () => true, bar = () => ({}) } = {}) {
  return {
    metadata: { schema: 'screener-pit-v1', syntheticMechanicsOnly: true },
    sessions: marketDates(length).map((date, day) => {
      const symbols = Array.from({ length: count }, (_, index) => 'T' + String(index).padStart(2, '0'));
      const prices = [...symbols, 'SPY', 'QQQ'].map((symbol, index) => {
        const p = typeof price === 'function' ? price(index, day) : price;
        return { symbol, open: p, high: p * 1.001, low: p * .999, close: p, volume: 1e7, adjusted: true, ...bar(symbol, day, p) };
      });
      const signals = symbols.map((symbol, index) => ({
        symbol, price: prices[index].close, sector: sameSector ? 'Shared' : 'Sector' + index,
        action: 'Buy', entryTiming: { available: true, liquidityPass: liquidityPass(index, day), averageDollarVolume20: adv(index, day) },
        researchFactors: { momentumPercentile: 100 - index, volatility60Pct: 20 },
      }));
      return { date, decisionAt: date + 'T21:30:00.000Z', prices, signals, positionSignals: signals, universeSymbols: symbols, corporateActions: [] };
    }),
  };
}
// Retains the original replay regression's demanding rank/stop/risk fixture.
function sourceRegressionFixture(length = 48) {
  const symbols = ['AAA', 'BBB', 'CCC', ...Array.from({ length: 10 }, (_, index) => 'P' + index), 'MSTR', 'SCHW'];
  return { metadata: { schema: 'screener-pit-v1', syntheticMechanicsOnly: true }, sessions: marketDates(length).map((date, day) => {
    const prices = [...symbols, 'SPY', 'QQQ'].map((symbol, index) => {
      const base = symbol === 'AAA' ? 300.3 : symbol === 'BBB' ? 10 : symbol === 'CCC' ? 110 : 80 + index;
      const mark = base * (day < 35 ? 1 : .8) * (symbol === 'AAA' && day >= 4 ? 1.15 : 1);
      return { symbol, open: mark, high: mark * 1.001, low: mark * (symbol === 'P2' && day === 25 ? .8 : .999), close: mark, adjusted: true };
    });
    const signals = symbols.map((symbol, index) => ({ symbol, price: prices[index].close,
      sector: index < 2 ? 'A' : index === 2 ? 'B' : 'Sector' + index,
      cik: index >= 3 && index <= 4 ? '77' : String(index + 100), action: 'Strong Buy',
      entryTiming: { available: true, liquidityPass: true, averageDollarVolume20: 1e9, strongPass: true },
      researchFactors: { momentumPercentile: symbol === 'SCHW' ? 101 : symbol === 'MSTR' ? 102 : symbol === 'AAA' ? (day >= 7 ? 93 : 100) : symbol === 'BBB' ? (day >= 12 ? 1 : 99) : symbol === 'CCC' ? (day >= 4 ? 96.15 : 98) : 97 - index / 10, volatility60Pct: 20 },
      riskPlan: { invalidationPrice: prices[index].close * .5 },
    }));
    return { date, decisionAt: date + 'T21:30:00.000Z', prices, signals, positionSignals: signals, universeSymbols: symbols, corporateActions: [] };
  }) };
}
module.exports = { marketDates, syntheticDataset, sourceRegressionFixture };

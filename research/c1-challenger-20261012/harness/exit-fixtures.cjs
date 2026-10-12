'use strict';

// Invented offline sessions and normalized model opening balances only.
function datesFrom(calendar, start = '2026-09-01', length = 8) {
  const dates = [];
  for (let time = Date.parse(start + 'T12:00:00Z'); dates.length < length; time += 86400000) {
    const date = new Date(time).toISOString().slice(0, 10);
    if (calendar.isUsMarketSessionDay(date)) dates.push(date);
  }
  return dates;
}
function openedAtAge(calendar, asOf, age) {
  for (let time = Date.parse(asOf + 'T12:00:00Z'); ; time -= 86400000) {
    const date = new Date(time).toISOString().slice(0, 10);
    if (calendar.isUsMarketSessionDay(date) && calendar.marketSessionDistance(date, asOf) === age) return date;
  }
}
function holdingFixture(calendar, {
  ranks = [7, 7, 7, 7], age = 30, gainPct = 0, marks = null,
  count = 20, bars = () => ({}), removalDay = null, heldFraction = 1,
} = {}) {
  const dates = datesFrom(calendar, '2026-09-01', ranks.length);
  const peers = Array.from({ length: count }, (_, index) => 'Q' + String(index + 1).padStart(2, '0'));
  const symbols = [...peers, 'HELD'];
  const priceAt = day => marks ? marks[day] : 100 * (1 + gainPct / 100);
  const sessions = dates.map((date, day) => {
    const prices = [...symbols, 'SPY', 'QQQ'].map(symbol => {
      const price = symbol === 'HELD' ? priceAt(day) : 100;
      return { symbol, open: price, high: price, low: price, close: price, adjusted: true,
        ...bars(symbol, day, price) };
    });
    const priceBySymbol = new Map(prices.map(row => [row.symbol, row.close]));
    const signals = symbols.map((symbol, index) => ({
      symbol, sector: 'Sector' + index, cik: String(100 + index), companyName: symbol,
      action: 'Buy', price: priceBySymbol.get(symbol),
      entryTiming: { available: true, liquidityPass: true, averageDollarVolume20: 1e9 },
      researchFactors: {
        momentumPercentile: symbol === 'HELD' ? 100 - ranks[day] * 3 + 1.5 : 100 - (index + 1) * 3,
        volatility60Pct: 20,
      },
    }));
    return { date, decisionAt: date + 'T21:00:00.000Z', prices, signals,
      positionSignals: signals, universeSymbols: removalDay === day ? peers : symbols,
      corporateActions: removalDay === day ? [{ type: 'universe-removal', symbol: 'HELD' }] : [] };
  });
  const shares = 100000 * heldFraction / priceAt(0);
  const heldIndex = symbols.indexOf('HELD');
  const seed = {
    contract: 'c1-prospective-account-seed-v1', sleeve: 'base', asOfSession: dates[0],
    prospectiveAdoptionConfirmed: true, cash: 100000 * (1 - heldFraction), highWater: 100000, remainingCooldownSessions: 0,
    positions: [{ symbol: 'HELD', role: 'Swing', shares, entryPrice: 100,
      openedAt: openedAtAge(calendar, dates[0], age), inheritedRiskOnly: false,
      sector: 'Sector' + heldIndex, issuer: String(100 + heldIndex),
      stock: { symbol: 'HELD', sector: 'Sector' + heldIndex, cik: String(100 + heldIndex) } }],
  };
  return { dataset: { metadata: { schema: 'screener-pit-v1', syntheticMechanicsOnly: true }, sessions }, seed, dates };
}
function allCashParityFixture(calendar, length = 48) {
  const dates = datesFrom(calendar, '2026-03-02', length);
  const symbols = ['AAA', 'BBB', 'CCC', ...Array.from({ length: 10 }, (_, index) => 'P' + index), 'MSTR', 'SCHW'];
  return { metadata: { schema: 'screener-pit-v1', syntheticMechanicsOnly: true }, sessions: dates.map((date, day) => {
    const prices = [...symbols, 'SPY', 'QQQ'].map((symbol, index) => {
      const base = symbol === 'AAA' ? 300.3 : symbol === 'BBB' ? 10 : symbol === 'CCC' ? 110 : 80 + index;
      const mark = base * (day < 35 ? 1 : .8) * (symbol === 'AAA' && day >= 4 ? 1.15 : 1);
      return { symbol, open: mark, high: mark * 1.001,
        low: mark * (symbol === 'P2' && day === 25 ? .8 : .999), close: mark, adjusted: true };
    });
    const signals = symbols.map((symbol, index) => ({
      symbol, price: prices[index].close, sector: index < 2 ? 'A' : index === 2 ? 'B' : 'Sector' + index,
      cik: index >= 3 && index <= 4 ? '77' : String(index + 100), action: 'Strong Buy',
      entryTiming: { available: true, liquidityPass: true, averageDollarVolume20: 1e9, strongPass: true },
      researchFactors: {
        momentumPercentile: symbol === 'SCHW' ? 101 : symbol === 'MSTR' ? 102 :
          symbol === 'AAA' ? (day >= 7 ? 93 : 100) : symbol === 'BBB' ? (day >= 12 ? 1 : 99) :
          symbol === 'CCC' ? (day >= 4 ? 96.15 : 98) : 97 - index / 10,
        volatility60Pct: 20,
      }, riskPlan: { invalidationPrice: prices[index].close * .5 },
    }));
    return { date, decisionAt: date + 'T21:00:00.000Z', prices, signals, positionSignals: signals,
      universeSymbols: symbols, corporateActions: [] };
  }) };
}
module.exports = { datesFrom, openedAtAge, holdingFixture, allCashParityFixture };

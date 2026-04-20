export default async function handler(req, res) {
  try {
    const symbols = ['GCT', 'ASO', 'CROX', 'FIX', 'VIST', 'MSTR'];
    const joined = symbols.join(',');

    const url = `https://financialmodelingprep.com/stable/quote?symbol=${joined}&apikey=${process.env.FMP_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    const map = {};
    for (const item of data || []) {
      map[item.symbol] = {
        price: item.price,
        change: item.change,
        changesPercentage: item.changesPercentage,
        volume: item.volume,
        dayLow: item.dayLow,
        dayHigh: item.dayHigh,
        yearLow: item.yearLow,
        yearHigh: item.yearHigh,
      };
    }

    res.status(200).json({ quotes: map });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load live quotes' });
  }
}

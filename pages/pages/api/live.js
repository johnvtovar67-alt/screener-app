export default async function handler(req, res) {
  try {
    const symbols = ['GCT','ASO','CROX','FIX','VIST','MSTR'];
    const joined = symbols.join(',');

    const url = `https://financialmodelingprep.com/stable/quote?symbol=${joined}&apikey=${process.env.FMP_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    const map = {};
    for (const item of data || []) {
      map[item.symbol] = { price: item.price };
    }

    res.status(200).json({ quotes: map });
  } catch (e) {
    res.status(500).json({ error: 'failed' });
  }
}

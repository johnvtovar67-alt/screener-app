export default async function handler(req, res) {
  try {
    const symbols =
      req.query.symbols?.split(',').map((s) => s.trim().toUpperCase()) || [
        'GCT',
        'ASO',
        'CROX',
        'FIX',
        'VIST',
        'MSTR',
      ]

    const joined = symbols.join(',')
    const apiKey = process.env.FMP_API_KEY

    if (!apiKey) {
      return res.status(500).json({ error: 'Missing FMP_API_KEY' })
    }

    const url = `https://financialmodelingprep.com/stable/quote?symbol=${joined}&apikey=${apiKey}`

    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Upstream request failed',
      })
    }

    const data = await response.json()

    const map = {}
    for (const item of data || []) {
      map[item.symbol] = {
        price: item.price,
        change: item.change,
        changesPercentage: item.changesPercentage,
        volume: item.volume,
        marketCap: item.marketCap,
      }
    }

    return res.status(200).json({
      quotes: map,
      updatedAt: Date.now(),
    })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'failed' })
  }
}

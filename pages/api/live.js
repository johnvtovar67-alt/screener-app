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

    const url = `https://financialmodelingprep.com/stable/batch-quote?symbols=${joined}&apikey=${apiKey}`

    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })

    const text = await response.text()

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Upstream request failed',
        status: response.status,
        body: text,
      })
    }

    let data
    try {
      data = JSON.parse(text)
    } catch (e) {
      return res.status(500).json({
        error: 'Invalid JSON from upstream',
        body: text,
      })
    }

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
    return res.status(500).json({
      error: 'failed',
      message: e?.message || 'Unknown error',
    })
  }
}

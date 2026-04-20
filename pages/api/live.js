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

    const apiKey = process.env.TWELVE_DATA_API_KEY

   if (!apiKey) {
  return res.status(500).json({
    error: 'Missing TWELVE_DATA_API_KEY',
    projectCheck: 'new-code-is-live',
  })
}
    const results = await Promise.all(
      symbols.map(async (symbol) => {
        const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(
          symbol
        )}&apikey=${apiKey}`

        const response = await fetch(url, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        })

        const text = await response.text()

        if (!response.ok) {
          return {
            symbol,
            error: `HTTP ${response.status}`,
            raw: text,
          }
        }

        let data
        try {
          data = JSON.parse(text)
        } catch {
          return {
            symbol,
            error: 'Invalid JSON',
            raw: text,
          }
        }

        if (data.status === 'error') {
          return {
            symbol,
            error: data.message || 'Vendor error',
          }
        }

        return {
          symbol,
          price: data.close ? Number(data.close) : null,
          open: data.open ? Number(data.open) : null,
          high: data.high ? Number(data.high) : null,
          low: data.low ? Number(data.low) : null,
          prevClose: data.previous_close ? Number(data.previous_close) : null,
          change: data.change ? Number(data.change) : null,
          percentChange: data.percent_change ? Number(data.percent_change) : null,
          volume: data.volume ? Number(data.volume) : null,
        }
      })
    )

    const quotes = {}
    for (const item of results) {
      quotes[item.symbol] = item
    }

    return res.status(200).json({
      quotes,
      updatedAt: Date.now(),
    })
  } catch (e) {
    return res.status(500).json({
      error: 'failed',
      message: e?.message || 'Unknown error',
    })
  }
}

export default async function handler(req, res) {
  try {
    const symbols = ['GCT', 'ASO', 'CROX', 'FIX', 'VIST', 'MSTR']

    const apiKey = process.env.TWELVE_DATA_API_KEY

    if (!apiKey) {
      return res.status(500).json({ error: 'Missing TWELVE_DATA_API_KEY' })
    }

    const results = await Promise.all(
      symbols.map(async (symbol) => {
        const url = `https://api.twelvedata.com/quote?symbol=${symbol}&apikey=${apiKey}`

        const response = await fetch(url)
        const data = await response.json()

        if (data.status === 'error') {
          return { symbol, error: data.message }
        }

        return {
          symbol,
          price: Number(data.close),
          change: Number(data.change),
          percentChange: Number(data.percent_change),
        }
      })
    )

    const quotes = {}
    results.forEach((r) => {
      quotes[r.symbol] = r
    })

    return res.status(200).json({ quotes })
  } catch (e) {
    return res.status(500).json({ error: 'failed' })
  }
}

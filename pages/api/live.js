export default async function handler(req, res) {
  try {
    const symbols = ['GCT', 'ASO', 'CROX', 'FIX', 'VIST', 'MSTR']
    const joined = symbols.join(',')

    const apiKey = process.env.FMP_API_KEY

    if (!apiKey) {
      return res.status(500).json({ error: 'Missing FMP_API_KEY' })
    }

    const url = `https://financialmodelingprep.com/stable/quote?symbol=${joined}&apikey=${apiKey}`
    const response = await fetch(url)

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Upstream request failed' })
    }

    const data = await response.json()

    const map = {}
    for (const item of data || []) {
      map[item.symbol] = { price: item.price }
    }

    return res.status(200).json({ quotes: map })
  } catch (e) {
    return res.status(500).json({ error: 'failed' })
  }
}

export default async function handler(req, res) {
  const apiKey = process.env.TWELVE_DATA_API_KEY

  return res.status(200).json({
    debug: 'td-debug-3',
    hasKey: !!apiKey,
    keyLength: apiKey ? apiKey.length : 0,
    nodeEnv: process.env.NODE_ENV || null,
  })
}

export default async function handler(req, res) {
  const apiKey = process.env.TWELVE_DATA_API_KEY

  return res.status(200).json({
    debug: 'td-debug-2',
    hasKey: !!apiKey,
    nodeEnv: process.env.NODE_ENV || null,
  })
}

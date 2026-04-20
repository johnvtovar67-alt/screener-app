export default async function handler(req, res) {
  try {
    const rawSymbol = req.query.symbol || "";
    const symbol = String(rawSymbol).trim().toUpperCase();

    if (!symbol) {
      return res.status(400).json({ error: "Missing symbol" });
    }

    const apiKey = process.env.TWELVE_DATA_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "Missing TWELVE_DATA_API_KEY" });
    }

    const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(
      symbol
    )}&apikey=${apiKey}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || data.status === "error" || !data.price) {
      return res.status(404).json({
        error: data.message || "No match found",
        symbol,
        raw: data,
      });
    }

    return res.status(200).json({
      symbol,
      price: Number(data.price),
    });
  } catch (error) {
    return res.status(500).json({
      error: "Server error",
      details: String(error),
    });
  }
}

// src/lib/universe.ts

export type UniverseTicker = {
  symbol: string
  name: string
  exchange: "NASDAQ" | "NYSE/ARCA/AMEX/IEX/BATS/OTHER"
  assetType: "stock" | "unknown"
}

const NASDAQ_LISTED_URL = "https://www.nasdaqtrader.com/dynamic/symdir/nasdaqlisted.txt"
const OTHER_LISTED_URL = "https://www.nasdaqtrader.com/dynamic/symdir/otherlisted.txt"

function parsePipeDelimited(text: string): string[][] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("File Creation Time"))
    .map((line) => line.split("|"))
}

function looksLikeCommonStock(name: string): boolean {
  const n = name.toLowerCase()

  // Exclude obvious non-common-stock instruments
  const bannedPhrases = [
    "etf",
    "etn",
    "fund",
    "trust",
    "depositary",
    "depository",
    "adr",
    "american depositary share",
    "american depositary shares",
    "warrant",
    "rights",
    "rights ",
    " units",
    " unit",
    "preferred",
    "preference",
    "notes",
    "bond",
    "income shares",
    "rate notes",
    "senior notes",
    "debenture",
    "closed end fund",
    "ordinary shares beneficial interest",
    "beneficial interest",
    "nextshares",
    "portfolio",
    "shs",
    "shares of beneficial interest",
    "proshares",
    "ishares",
    "spdr",
    "direxion",
    "graniteshares",
    "yieldboost",
    "2x ",
    "3x ",
    "ultra ",
    "inverse ",
    "bull ",
    "bear ",
  ]

  if (bannedPhrases.some((p) => n.includes(p))) return false

  // Allow the names most likely to be regular equities
  const allowedPhrases = [
    "common stock",
    "class a common stock",
    "class b common stock",
    "class a ordinary shares",
    "class b ordinary shares",
    "ordinary shares",
    "common shares",
    "subordinate voting shares",
  ]

  return allowedPhrases.some((p) => n.includes(p))
}

function looksLikeBadSymbol(symbol: string): boolean {
  // Exclude many suffix-style symbols and weird symbols that usually are not plain common stock
  // Keep it conservative so we don't accidentally throw away legit tickers like BRK.B upstream if needed later
  if (!symbol) return true

  const s = symbol.trim()

  // Exclude symbols with 5th-letter suffixes often used for special situations on Nasdaq
  // This is intentionally light-touch because we are already filtering strongly on name.
  const bannedSuffixes = ["W", "R", "U", "P"]
  if (s.length >= 5 && bannedSuffixes.includes(s[s.length - 1])) return true

  return false
}

function normalizeNasdaqRows(rows: string[][]): UniverseTicker[] {
  if (rows.length < 2) return []

  const header = rows[0]
  const data = rows.slice(1)

  const symbolIdx = header.indexOf("Symbol")
  const nameIdx = header.indexOf("Security Name")
  const testIssueIdx = header.indexOf("Test Issue")
  const etfIdx = header.indexOf("ETF")

  return data
    .map((cols) => ({
      symbol: cols[symbolIdx]?.trim(),
      name: cols[nameIdx]?.trim(),
      testIssue: cols[testIssueIdx]?.trim(),
      etf: cols[etfIdx]?.trim(),
    }))
    .filter((x) => x.symbol && x.name)
    .filter((x) => x.testIssue !== "Y")
    .filter((x) => x.etf !== "Y")
    .filter((x) => !looksLikeBadSymbol(x.symbol))
    .filter((x) => looksLikeCommonStock(x.name))
    .map((x) => ({
      symbol: x.symbol,
      name: x.name,
      exchange: "NASDAQ" as const,
      assetType: "stock" as const,
    }))
}

function normalizeOtherRows(rows: string[][]): UniverseTicker[] {
  if (rows.length < 2) return []

  const header = rows[0]
  const data = rows.slice(1)

  const symbolIdx = header.indexOf("ACT Symbol")
  const nameIdx = header.indexOf("Security Name")
  const etfIdx = header.indexOf("ETF")
  const testIssueIdx = header.indexOf("Test Issue")

  return data
    .map((cols) => ({
      symbol: cols[symbolIdx]?.trim(),
      name: cols[nameIdx]?.trim(),
      etf: cols[etfIdx]?.trim(),
      testIssue: cols[testIssueIdx]?.trim(),
    }))
    .filter((x) => x.symbol && x.name)
    .filter((x) => x.testIssue !== "Y")
    .filter((x) => x.etf !== "Y")
    .filter((x) => !looksLikeBadSymbol(x.symbol))
    .filter((x) => looksLikeCommonStock(x.name))
    .map((x) => ({
      symbol: x.symbol,
      name: x.name,
      exchange: "NYSE/ARCA/AMEX/IEX/BATS/OTHER" as const,
      assetType: "stock" as const,
    }))
}

function dedupeUniverse(items: UniverseTicker[]): UniverseTicker[] {
  const map = new Map<string, UniverseTicker>()

  for (const item of items) {
    const key = item.symbol.toUpperCase()
    if (!map.has(key)) map.set(key, item)
  }

  return Array.from(map.values()).sort((a, b) => a.symbol.localeCompare(b.symbol))
}

export async function buildRawListedUniverse(): Promise<UniverseTicker[]> {
  const [nasdaqResp, otherResp] = await Promise.all([
    fetch(NASDAQ_LISTED_URL, { next: { revalidate: 60 * 60 * 24 } }),
    fetch(OTHER_LISTED_URL, { next: { revalidate: 60 * 60 * 24 } }),
  ])

  if (!nasdaqResp.ok) {
    throw new Error(`Failed to fetch nasdaqlisted.txt: ${nasdaqResp.status}`)
  }

  if (!otherResp.ok) {
    throw new Error(`Failed to fetch otherlisted.txt: ${otherResp.status}`)
  }

  const [nasdaqText, otherText] = await Promise.all([
    nasdaqResp.text(),
    otherResp.text(),
  ])

  const nasdaqRows = parsePipeDelimited(nasdaqText)
  const otherRows = parsePipeDelimited(otherText)

  const nasdaqUniverse = normalizeNasdaqRows(nasdaqRows)
  const otherUniverse = normalizeOtherRows(otherRows)

  return dedupeUniverse([...nasdaqUniverse, ...otherUniverse])
}

// src/lib/liquidity-filter.ts

export type MarketSnapshot = {
  symbol: string
  price?: number | null
  marketCap?: number | null
  avgVolume?: number | null
}

export type UniverseCandidate = {
  symbol: string
  name: string
  exchange: string
}

export type FilteredUniverseItem = UniverseCandidate & {
  price: number
  marketCap?: number | null
  avgVolume?: number | null
}

export type LiquidityRules = {
  minPrice: number
  minMarketCap: number
  minAvgVolume: number
  maxPrice?: number
}

function normalizeSymbol(symbol: string) {
  return String(symbol || "").replace("-", ".").toUpperCase()
}

export function applyLiquidityFilter(
  universe: UniverseCandidate[],
  snapshots: MarketSnapshot[],
  rules: LiquidityRules
): FilteredUniverseItem[] {
  const snapMap = new Map<string, MarketSnapshot>()

  for (const snap of snapshots) {
    snapMap.set(normalizeSymbol(snap.symbol), snap)
  }

  const out: FilteredUniverseItem[] = []

  for (const item of universe) {
    const key = normalizeSymbol(item.symbol)
    const snap = snapMap.get(key)

    if (!snap) continue

    const price = snap.price ?? null
    const marketCap = snap.marketCap ?? null
    const avgVolume = snap.avgVolume ?? null

    // Must have a valid price
    if (price == null || !Number.isFinite(price)) continue

    // Price rule
    if (price < rules.minPrice) continue
    if (rules.maxPrice != null && price > rules.maxPrice) continue

    // These are only applied when Yahoo gives us the data.
    // This prevents the entire screener from going to zero because of missing fields.
    if (
      marketCap != null &&
      Number.isFinite(marketCap) &&
      marketCap < rules.minMarketCap
    ) {
      continue
    }

    if (
      avgVolume != null &&
      Number.isFinite(avgVolume) &&
      avgVolume < rules.minAvgVolume
    ) {
      continue
    }

    out.push({
      ...item,
      price,
      marketCap,
      avgVolume,
    })
  }

  return out.sort((a, b) => {
    const av = a.avgVolume ?? 0
    const bv = b.avgVolume ?? 0
    return bv - av
  })
}

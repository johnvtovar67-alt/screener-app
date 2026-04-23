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
  marketCap: number
  avgVolume: number
}

export type LiquidityRules = {
  minPrice: number
  minMarketCap: number
  minAvgVolume: number
  maxPrice?: number
}

export const DEFAULT_LIQUIDITY_RULES: LiquidityRules = {
  minPrice: 5,
  minMarketCap: 300_000_000,
  minAvgVolume: 750_000,
  maxPrice: undefined, // leave off so you still catch quality higher-priced names
}

export function applyLiquidityFilter(
  universe: UniverseCandidate[],
  snapshots: MarketSnapshot[],
  rules: LiquidityRules = DEFAULT_LIQUIDITY_RULES
): FilteredUniverseItem[] {
  const snapMap = new Map<string, MarketSnapshot>(
    snapshots.map((s) => [s.symbol.toUpperCase(), s])
  )

  const out: FilteredUniverseItem[] = []

  for (const item of universe) {
    const snap = snapMap.get(item.symbol.toUpperCase())
    if (!snap) continue

    const price = snap.price ?? null
    const marketCap = snap.marketCap ?? null
    const avgVolume = snap.avgVolume ?? null

    if (
      price == null ||
      marketCap == null ||
      avgVolume == null ||
      !Number.isFinite(price) ||
      !Number.isFinite(marketCap) ||
      !Number.isFinite(avgVolume)
    ) {
      continue
    }

    if (price < rules.minPrice) continue
    if (rules.maxPrice != null && price > rules.maxPrice) continue
    if (marketCap < rules.minMarketCap) continue
    if (avgVolume < rules.minAvgVolume) continue

    out.push({
      ...item,
      price,
      marketCap,
      avgVolume,
    })
  }

  return out.sort((a, b) => b.avgVolume - a.avgVolume)
}

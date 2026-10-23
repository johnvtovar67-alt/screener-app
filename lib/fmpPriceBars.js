const asArray = value =>
  Array.isArray(value)
    ? value.filter(Boolean)
    : value && typeof value === 'object'
      ? [value]
      : [];

const number = (value, fallback = null) => {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

// Shared provider boundary for production and research. Keep this module free
// of Blob, research-runner, account and policy imports so a live price consumer
// does not pull the research monolith into its server function.
export function normalizeHistoricalBars(
  rows = [],
  { sourceAdjusted = false } = {},
) {
  return asArray(rows)
    .map(row => {
      const rawOpen = number(row.open);
      const rawHigh = number(row.high);
      const rawLow = number(row.low);
      const rawClose = number(row.close ?? row.price);
      const adjustedOpen = number(row.adjOpen ?? row.adjustedOpen);
      const adjustedHigh = number(row.adjHigh ?? row.adjustedHigh);
      const adjustedLow = number(row.adjLow ?? row.adjustedLow);
      const adjustedClose = number(row.adjClose ?? row.adjustedClose);
      const factor =
        !sourceAdjusted && rawClose > 0 && adjustedClose > 0
          ? adjustedClose / rawClose
          : 1;
      const adjusted = sourceAdjusted || adjustedClose > 0;
      return {
        date: String(row.date || '').slice(0, 10),
        open: sourceAdjusted
          ? (adjustedOpen ?? rawOpen)
          : rawOpen > 0
            ? rawOpen * factor
            : null,
        high: sourceAdjusted
          ? (adjustedHigh ?? rawHigh)
          : rawHigh > 0
            ? rawHigh * factor
            : null,
        low: sourceAdjusted
          ? (adjustedLow ?? rawLow)
          : rawLow > 0
            ? rawLow * factor
            : null,
        close: sourceAdjusted
          ? (adjustedClose ?? rawClose)
          : adjustedClose > 0
            ? adjustedClose
            : rawClose,
        volume: number(row.volume, 0),
        adjusted,
      };
    })
    .filter(
      row =>
        /^\d{4}-\d{2}-\d{2}$/.test(row.date) &&
        row.open > 0 &&
        row.high > 0 &&
        row.low > 0 &&
        row.close > 0,
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Analysis belongs to one entered ownership period, even when a symbol is repurchased.
function ownershipKey(row) {
  return JSON.stringify([String(row?.symbol || row?.ticker || '').toUpperCase(),
    row?.role === 'Core' ? 'Core' : 'Swing', Number(row?.shares || 0), Number(row?.avgCost || 0),
    String(row?.openedAt || '').slice(0, 10)]);
}

export function sameC1HoldingPeriod(left, right) {
  return ownershipKey(left) === ownershipKey(right);
}

export function currentC1HoldingRows(holdings, rows) {
  if (rows.length !== holdings.length) return [];
  const expected = holdings.map(ownershipKey).sort();
  const observed = rows.map(ownershipKey).sort();
  return expected.every((key, index) => key === observed[index]) ? rows : [];
}

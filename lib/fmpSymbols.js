// Provider spelling shared by quote and fundamental requests. This deliberately
// preserves the existing first-dot-only replacement and falsy-input behavior.
// It is not validation, a general canonicalizer or an account share-class map.
export function toFmpSymbol(value) {
  return String(value || '').replace('.', '-').toUpperCase().trim();
}

// Pure, client-safe title-casing for display purposes only — no server-only
// import, importable from server or client code alike (follows the same
// convention as lib/position-slug.ts). Never write the result back to a
// stored value; this exists purely to normalize how names are RENDERED and
// sent to third parties (e.g. GetStream), not what's persisted in the DB.
//
// Rule: lowercase the whole string, then uppercase the first letter of every
// run following start-of-string, whitespace, or a hyphen/apostrophe — so
// "john o'brien" becomes "John O'Brien" and "mary-jane smith" becomes
// "Mary-Jane Smith".
export function toTitleCase(value: string): string {
  return value.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_match, boundary, letter) => boundary + letter.toUpperCase())
}

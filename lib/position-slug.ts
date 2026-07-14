// Pure, client-safe slug derivation for position labels — no server-only
// imports, importable from client components, server actions, and Node CLIs
// alike (used by both actions/positions.ts and scripts/migrate-positions-table.ts).
//
// Rule: lowercase, replace every run of characters outside [a-z0-9] with a
// single underscore, then strip any leading/trailing underscore left behind.
// Idempotent: slugifyPosition(x) === slugifyPosition(slugifyPosition(x)) —
// an already-slug value (all lowercase, underscore-separated) round-trips
// unchanged.
export function slugifyPosition(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

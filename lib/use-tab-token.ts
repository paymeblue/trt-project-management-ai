// Client-safe utility for reading the current tab's bound access token, for
// Server Actions that need it passed as an explicit bound argument
// (RESEARCH.md Pattern 3) — Server Actions cannot see the Authorization
// header the fetch-wrapper attaches to Server Component/Route Handler
// requests. No 'server-only' guard here on purpose: this reads
// sessionStorage and must be importable from client components.
export function getTabToken(): string | null {
  if (typeof window === "undefined") return null
  return sessionStorage.getItem("tabAccessToken")
}

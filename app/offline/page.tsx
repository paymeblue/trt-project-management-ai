// Deliberately outside the (app) route group: this page must render for a
// signed-out or session-less request (the service worker serves it from
// cache when the network is unavailable, potentially before any auth
// context exists), and must never import a session/DB module — it is
// precached and therefore readable by any user of a shared tablet.
export const dynamic = 'force-static'

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center text-on-surface">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-container text-title-lg font-bold text-on-primary-container">
        TRT
      </div>
      <h1 className="text-title-lg font-title-lg font-bold text-primary">You&apos;re offline</h1>
      <p className="max-w-sm text-body-md text-on-surface-variant">
        Project data can&apos;t be loaded right now without a connection. Nothing you&apos;ve
        already entered was lost — reconnect and try again.
      </p>
    </main>
  )
}

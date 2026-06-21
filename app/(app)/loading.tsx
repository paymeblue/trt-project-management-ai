// Route-level skeleton shown while any (app) page streams in.
export default function AppLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl animate-pulse">
      <div className="mb-6">
        <div className="h-8 w-64 rounded-md bg-surface-container-high" />
        <div className="mt-2 h-4 w-80 rounded bg-surface-container" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-32 rounded-lg border border-outline-variant bg-surface-container-lowest p-4"
          >
            <div className="mb-4 h-6 w-6 rounded bg-surface-container-high" />
            <div className="mb-2 h-4 w-3/4 rounded bg-surface-container-high" />
            <div className="h-3 w-full rounded bg-surface-container" />
            <div className="mt-1 h-3 w-2/3 rounded bg-surface-container" />
          </div>
        ))}
      </div>
    </div>
  )
}

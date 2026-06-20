import type { ReactNode } from 'react'
import SignOutButton from './sign-out-button'

export type Tile = {
  title: string
  description: string
  href?: string
  status?: 'ready' | 'soon'
}

const ROLE_LABELS: Record<string, string> = {
  factory_pm: 'Factory PM',
  site_pm: 'Site PM',
  super_admin: 'Super Admin',
}

function TileCard({ tile }: { tile: Tile }) {
  const soon = tile.status !== 'ready'
  const inner = (
    <div
      className={`group flex h-full flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition ${
        tile.href ? 'hover:border-blue-400 hover:shadow-md' : ''
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-gray-900">{tile.title}</h3>
        {soon && (
          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
            Soon
          </span>
        )}
      </div>
      <p className="text-sm text-gray-500">{tile.description}</p>
    </div>
  )
  return tile.href ? (
    <a href={tile.href} className="block h-full">
      {inner}
    </a>
  ) : (
    inner
  )
}

/**
 * Shared role home screen: header with user + sign-out, a grid of navigation
 * tiles, and the floating Dave Aredo button placeholder.
 */
export default function DashboardShell({
  userName,
  role,
  tiles,
  children,
}: {
  userName: string
  role: string
  tiles: Tile[]
  children?: ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-gray-900">TRT&nbsp;PM</span>
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
              {ROLE_LABELS[role] ?? role}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-gray-600 sm:inline">{userName}</span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="mb-1 text-2xl font-bold text-gray-900">
          Welcome, {userName.split(' ')[0] || 'there'}
        </h1>
        <p className="mb-8 text-sm text-gray-500">
          {ROLE_LABELS[role] ?? role} home — pick where you want to go.
        </p>

        {children}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((t) => (
            <TileCard key={t.title} tile={t} />
          ))}
        </div>
      </main>

      {/* Dave Aredo floating button — fullscreen chat wired in a later phase */}
      <button
        type="button"
        aria-label="Open Dave Aredo assistant"
        title="Dave Aredo (coming soon)"
        className="fixed bottom-6 right-6 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-xl font-bold text-white shadow-lg hover:bg-blue-700"
      >
        DA
      </button>
    </div>
  )
}

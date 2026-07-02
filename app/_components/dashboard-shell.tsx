import Link from 'next/link'
import OpenChatButton from '@/app/_components/open-chat-button'
import { userRoleLabel } from '@/lib/workflow'

export type Tile = {
  title: string
  description: string
  href?: string
  status?: 'ready' | 'soon'
  icon?: string
}

function iconFor(title: string): string {
  const t = title.toLowerCase()
  if (t.includes('product readiness')) return 'inventory_2'
  if (t.includes('project')) return 'factory'
  if (t.includes('issue')) return 'assignment_late'
  if (t.includes('process')) return 'account_tree'
  if (t.includes('profile')) return 'person'
  if (t.includes('about')) return 'info'
  if (t.includes('email')) return 'mail'
  if (t.includes('user')) return 'group'
  if (t.includes('content')) return 'edit_note'
  if (t.includes('overview')) return 'monitoring'
  if (
    t.includes('checklist') ||
    t.includes('confirmation') ||
    t.includes('verification') ||
    t.includes('sorting') ||
    t.includes('change request') ||
    t.includes('close out') ||
    t.includes('readiness')
  )
    return 'fact_check'
  return 'widgets'
}

function TileCard({ tile }: { tile: Tile }) {
  const soon = tile.status !== 'ready'
  const icon = tile.icon ?? iconFor(tile.title)
  const body = (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest p-4 transition-shadow hover:shadow-[0_2px_8px_rgba(11,28,48,0.08)]">
      <div className="absolute left-0 top-0 h-1 w-full bg-primary-container opacity-80" />
      <div className="mb-3 mt-2 flex items-start justify-between">
        <span className="material-symbols-outlined text-primary">{icon}</span>
        {soon ? (
          <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-label-sm font-label-sm uppercase text-on-surface-variant">
            Soon
          </span>
        ) : (
          <span className="material-symbols-outlined text-on-surface-variant transition-transform group-hover:translate-x-1">
            arrow_forward
          </span>
        )}
      </div>
      <h3 className="mb-1 text-title-md font-title-md text-on-surface">{tile.title}</h3>
      <p className="text-body-md font-body-md text-on-surface-variant">{tile.description}</p>
    </div>
  )
  return tile.href ? (
    <Link href={tile.href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  )
}

export default function DashboardShell({
  userName,
  role,
  tiles,
  roleLabel,
}: {
  userName: string
  role: string
  tiles: Tile[]
  roleLabel?: string
}) {
  const label = roleLabel ?? userRoleLabel(role)
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-headline-lg font-headline-lg text-on-surface">
            Welcome, {userName.split(' ')[0] || 'there'}
          </h2>
          <p className="mt-1 text-body-lg font-body-lg text-on-surface-variant">
            {label} workspace — choose where to go.
          </p>
        </div>
        <OpenChatButton />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <TileCard key={t.title} tile={t} />
        ))}
      </div>
    </div>
  )
}

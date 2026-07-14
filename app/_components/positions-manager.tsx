'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { renamePositionAction } from '@/actions/positions'
import { slugifyPosition } from '@/lib/position-slug'
import type { PositionWithCounts } from '@/lib/positions'

// Admin Positions card (quick task 260714-bpq) — smallest viable surface on
// /admin/users, below the users table. Super admins get an inline rename per
// row (label input + Save, live-preview slug); Operations sees the list
// read-only (T-bpq-01: rename is super-admin only). Mirrors the existing
// client-action pattern in admin-users-table.tsx (useState/useRouter/
// useTransition, disabled-while-busy).
export default function PositionsManager({
  positions,
  canRename,
}: {
  positions: PositionWithCounts[]
  canRename: boolean
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-3">Label</th>
            <th className="px-4 py-3">Slug</th>
            <th className="px-4 py-3">Usage</th>
            {canRename && <th className="px-4 py-3 text-right">Rename</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {positions.map((p) => (
            <PositionRow key={p.slug} position={p} canRename={canRename} />
          ))}
          {positions.length === 0 && (
            <tr>
              <td colSpan={canRename ? 4 : 3} className="px-4 py-6 text-center text-xs text-gray-400">
                No positions yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function PositionRow({ position, canRename }: { position: PositionWithCounts; canRename: boolean }) {
  const router = useRouter()
  const [label, setLabel] = useState(position.label)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const previewSlug = slugifyPosition(label)
  const dirty = label.trim() !== position.label

  function save() {
    setMessage(null)
    startTransition(async () => {
      const res = await renamePositionAction({ slug: position.slug, newLabel: label })
      if (!res.ok) {
        setMessage({ kind: 'error', text: res.message })
        return
      }
      setMessage({ kind: 'success', text: `${res.userCount} user(s) and ${res.stepCount} step(s) updated` })
      router.refresh()
    })
  }

  return (
    <tr>
      <td className="px-4 py-3 font-medium text-gray-900">
        {canRename ? (
          <div>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={pending}
              className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm disabled:opacity-50"
            />
            {dirty && (
              <p className="mt-1 text-[11px] text-gray-400">
                new slug: <span className="font-mono">{previewSlug || '—'}</span>
              </p>
            )}
          </div>
        ) : (
          position.label
        )}
      </td>
      <td className="px-4 py-3 font-mono text-xs text-gray-500">{position.slug}</td>
      <td className="px-4 py-3 text-gray-600">
        {position.userCount} user{position.userCount === 1 ? '' : 's'}, {position.stepCount} step
        {position.stepCount === 1 ? '' : 's'}
      </td>
      {canRename && (
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={save}
              disabled={pending || !dirty}
              className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {pending ? 'Saving…' : 'Save'}
            </button>
          </div>
          {message && (
            <p className={`mt-1 text-right text-[11px] ${message.kind === 'success' ? 'text-green-600' : 'text-error'}`}>
              {message.text}
            </p>
          )}
        </td>
      )}
    </tr>
  )
}

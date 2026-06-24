'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateProcessImageAction, deleteProcessAction } from '@/actions/processes'
import { downscaleImage } from '@/lib/downscale-image'

export default function ProcessAdminControls({
  slug,
  title,
}: {
  slug: string
  title: string
}) {
  const router = useRouter()
  const [newTitle, setNewTitle] = useState(title)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function saveTitle() {
    if (newTitle.trim().length < 2 || newTitle.trim() === title) return
    setBusy(true)
    setError('')
    const res = await updateProcessImageAction({ slug, title: newTitle })
    setBusy(false)
    if (!res.ok) return setError(res.error ?? 'Could not rename.')
    router.refresh()
  }

  async function replaceImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const imageData = await downscaleImage(file, 1600, 0.85)
      const res = await updateProcessImageAction({ slug, imageData })
      if (!res.ok) setError(res.error ?? 'Could not replace image.')
      else router.refresh()
    } catch {
      setError('Could not read that image.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    const res = await deleteProcessAction(slug)
    setBusy(false)
    if (!res.ok) return setError(res.error ?? 'Could not delete.')
    router.push('/processes')
  }

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="mb-3 text-sm font-semibold text-gray-900">Manage process flow</p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-600">Title</label>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={saveTitle}
          disabled={busy}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
        >
          Rename
        </button>
        <label className="cursor-pointer rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
          Replace image
          <input type="file" accept="image/*" className="hidden" onChange={replaceImage} disabled={busy} />
        </label>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          disabled={busy}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
        >
          Delete
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-error">{error}</p>}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">Delete process flow?</h3>
            <p className="mt-2 text-sm text-gray-600">
              This permanently removes <span className="font-semibold">{title}</span>.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {busy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

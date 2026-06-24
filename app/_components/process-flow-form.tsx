'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createProcessImageAction } from '@/actions/processes'
import { downscaleImage } from '@/lib/downscale-image'

export default function ProcessFlowForm() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [imageData, setImageData] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError('')
    const file = e.target.files?.[0]
    if (!file) return
    try {
      // Keep flow charts legible but bounded in size.
      const data = await downscaleImage(file, 1600, 0.85)
      setImageData(data)
    } catch {
      setError('Could not read that image.')
    }
  }

  async function submit() {
    setError('')
    if (title.trim().length < 2) return setError('Please name the process flow.')
    if (!imageData) return setError('Please upload an image.')
    setBusy(true)
    const res = await createProcessImageAction({ title, imageData })
    setBusy(false)
    if (!res.ok) return setError(res.error ?? 'Could not add the process flow.')
    setTitle('')
    setImageData('')
    setOpen(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-6 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
      >
        <span className="material-symbols-outlined text-base">add</span>
        Add Process Flow
      </button>
    )
  }

  return (
    <div className="mb-6 space-y-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-900">Add Process Flow</h2>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Delivery & Installation Flow"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Process flow image</label>
        <input type="file" accept="image/*" onChange={onFile} className="block w-full text-sm" />
      </div>
      {imageData && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageData} alt="Preview" className="max-h-72 w-auto rounded-md border border-gray-200" />
      )}
      {error && <p className="text-sm text-error">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Save process flow'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setError('')
          }}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

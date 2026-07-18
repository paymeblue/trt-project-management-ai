'use client'

import { useRef, useState } from 'react'
import { addProductPdfAction } from '@/actions/product-readiness'
import { getTabToken } from '@/lib/use-tab-token'

export default function ProductPdfUpload() {
  const [filename, setFilename] = useState('')
  const [dataUrl, setDataUrl] = useState('')
  const [sizeBytes, setSizeBytes] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    if (file.type !== 'application/pdf') {
      setError('Please choose a PDF file.')
      return
    }
    if (file.size > 4_200_000) {
      setError('PDF is larger than ~4MB. Please pick a smaller file.')
      return
    }
    setSizeBytes(file.size)
    if (!filename) setFilename(file.name)
    const reader = new FileReader()
    reader.onload = () => setDataUrl(typeof reader.result === 'string' ? reader.result : '')
    reader.readAsDataURL(file)
  }

  async function submit() {
    setError('')
    if (!dataUrl) {
      setError('Choose a PDF first.')
      return
    }
    setBusy(true)
    const res = await addProductPdfAction(getTabToken(), { filename: filename.trim() || 'document.pdf', dataUrl, sizeBytes })
    setBusy(false)
    if (res.ok) {
      setFilename('')
      setDataUrl('')
      setSizeBytes(0)
      if (inputRef.current) inputRef.current.value = ''
    } else {
      setError(res.error ?? 'Upload failed.')
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[160px] flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-600">File name</label>
          <input
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            placeholder="e.g. Unit-A-spec.pdf"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>
        <div className="min-w-[160px] flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-600">PDF file</label>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            onChange={onFile}
            className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary"
          />
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
        >
          {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
          {busy ? 'Uploading…' : 'Upload PDF'}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-error">{error}</p>}
    </div>
  )
}

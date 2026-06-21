'use client'

import { useState } from 'react'

// Copy a shareable link to the current page (or a given path). Uses the native
// share sheet on mobile when available, otherwise copies to clipboard.
export default function ShareButton({ label = 'Share' }: { label?: string }) {
  const [copied, setCopied] = useState(false)

  async function share() {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    const nav = navigator as Navigator & { share?: (d: { url: string }) => Promise<void> }
    try {
      if (nav.share) {
        await nav.share({ url })
        return
      }
    } catch {
      /* user cancelled — fall through to copy */
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
    >
      <span className="material-symbols-outlined text-[18px]">{copied ? 'check' : 'ios_share'}</span>
      {copied ? 'Copied' : label}
    </button>
  )
}

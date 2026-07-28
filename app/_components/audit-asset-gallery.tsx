'use client'

import { useEffect, useState } from 'react'
import { imageAssetsOnly, type AuditAsset } from '@/lib/audit-assets'

type AuditAssetGalleryProps = {
  assets: AuditAsset[]
  thumbClassName?: string
}

// quick task 260728-lbx: only assets that already passed the isImageAsset
// gate (lib/audit-assets.ts) ever reach this component's interactive path —
// PDFs and any other non-image asset stay in the caller's existing
// non-clickable branches (filename text / PDF download link) and are never
// even rendered here.
export default function AuditAssetGallery({ assets, thumbClassName = 'h-24 w-24' }: AuditAssetGalleryProps) {
  const images = imageAssetsOnly(assets)
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const close = () => setOpenIndex(null)
  const showPrevNext = images.length > 1

  useEffect(() => {
    if (openIndex === null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowLeft' && showPrevNext) {
        setOpenIndex((i) => (i === null ? i : (i - 1 + images.length) % images.length))
      }
      if (e.key === 'ArrowRight' && showPrevNext) {
        setOpenIndex((i) => (i === null ? i : (i + 1) % images.length))
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [openIndex, images.length, showPrevNext])

  if (images.length === 0) return null

  const current = openIndex !== null ? images[openIndex] : null

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {images.map((asset, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setOpenIndex(i)}
            title={asset.context ? `${asset.label} — ${asset.context}` : asset.label}
            className="group relative rounded-md transition hover:opacity-90 hover:ring-2 hover:ring-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={asset.dataUrl}
              alt={asset.context ? `${asset.label} — ${asset.context}` : asset.label}
              // object-contain (not object-cover): object-cover centre-crops a
              // wide drawing or tall document to a meaningless coloured
              // square, which is exactly the reported bug. object-contain
              // shows the whole asset, letterboxed on the neutral bg-gray-50.
              className={`${thumbClassName} rounded-md border border-gray-200 bg-gray-50 object-contain`}
            />
          </button>
        ))}
      </div>

      {current && (
        <div
          className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black/80 p-4"
          onClick={close}
        >
          <div
            className="relative flex max-h-full max-w-full flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex w-full items-start justify-between gap-4 text-white">
              <div>
                <p className="text-sm font-bold">{current.label}</p>
                {current.context && <p className="text-xs text-white/70">{current.context}</p>}
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="rounded-full p-1 text-white/80 hover:bg-white/10 hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="relative flex items-center gap-3">
              {showPrevNext && (
                <button
                  type="button"
                  onClick={() => setOpenIndex((i) => (i === null ? i : (i - 1 + images.length) % images.length))}
                  aria-label="Previous"
                  className="rounded-full bg-black/40 p-2 text-white hover:bg-black/60"
                >
                  <span className="material-symbols-outlined">chevron_left</span>
                </button>
              )}

              {/* Rendering an <img src="data:image/..."> inside the app's own
                  document is safe because an <img> cannot execute script
                  regardless of payload — that is exactly why isImageAsset's
                  gate is sufficient. The original download-only affordance
                  existed because browsers BLOCK top-frame navigation to
                  data: URLs, and a data:text/html upload opened as a top-frame
                  navigation would execute as the app origin (T-bpp-03). This
                  lightbox never navigates the top frame to a data: URL — it
                  only ever sets an <img src> — so T-bpp-03 is preserved, not
                  relaxed. The download link below reuses the same <a
                  download> mechanism that already shipped. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={current.dataUrl}
                alt={current.label}
                className="max-h-[85vh] max-w-[90vw] rounded-md object-contain"
              />

              {showPrevNext && (
                <button
                  type="button"
                  onClick={() => setOpenIndex((i) => (i === null ? i : (i + 1) % images.length))}
                  aria-label="Next"
                  className="rounded-full bg-black/40 p-2 text-white hover:bg-black/60"
                >
                  <span className="material-symbols-outlined">chevron_right</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-4 text-xs text-white/80">
              <a href={current.dataUrl} download={current.downloadName ?? current.label} rel="noreferrer" className="underline hover:text-white">
                Download original
              </a>
              {showPrevNext && (
                <span>
                  {(openIndex ?? 0) + 1} of {images.length}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

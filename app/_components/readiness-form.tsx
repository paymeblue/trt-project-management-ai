'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import SignatureCanvas from 'react-signature-canvas'
import { submitReadinessAction, type ReadinessState } from '@/actions/readiness'
import { downscaleImage } from '@/lib/downscale-image'

const INITIAL: ReadinessState = { status: 'idle' }

const REQUIRED_PHOTOS = 2

type Tab = 'digital' | 'upload'

export default function ReadinessForm({
  projectId = null,
  expectedStepN = null,
  returnTo = null,
  initialProject = '',
}: {
  projectId?: string | null
  expectedStepN?: number | null
  returnTo?: string | null
  initialProject?: string
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('digital')
  const [state, dispatch, pending] = useActionState(submitReadinessAction, INITIAL)

  // Shared fields
  const [project, setProject] = useState(initialProject)
  const [unit, setUnit] = useState('')

  // Digital fields
  const [materialControl, setMaterialControl] = useState('')
  const [accessories, setAccessories] = useState('')
  const [upholstery, setUpholstery] = useState('')
  const [confirmedBy, setConfirmedBy] = useState('')
  const [signedDate, setSignedDate] = useState('')
  const sigRef = useRef<SignatureCanvas>(null)

  // Required photo evidence (2 images) — applies to both modes.
  const [photos, setPhotos] = useState<string[]>([])
  const [localError, setLocalError] = useState('')

  useEffect(() => {
    if (state.status === 'success' && state.advanced && returnTo) {
      const t = setTimeout(() => router.push(returnTo), 1200)
      return () => clearTimeout(t)
    }
  }, [state.status, state.advanced, returnTo, router])

  function clearSignature() {
    sigRef.current?.clear()
  }

  async function onPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    setLocalError('')
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    for (const file of files) {
      if (photos.length >= 6) break
      try {
        const data = await downscaleImage(file, 1280, 0.8)
        setPhotos((prev) => (prev.length >= 6 ? prev : [...prev, data]))
      } catch {
        setLocalError('Could not read one of the images. Please try another.')
      }
    }
  }

  const photosOk = photos.length >= REQUIRED_PHOTOS

  function submit() {
    setLocalError('')
    if (!photosOk) {
      setLocalError(`Please attach ${REQUIRED_PHOTOS} photos before submitting.`)
      return
    }
    if (tab === 'digital') {
      const sig = sigRef.current
      const signatureData = sig && !sig.isEmpty() ? sig.toDataURL('image/png') : ''
      dispatch({
        mode: 'digital',
        project,
        unit,
        materialControl,
        accessories,
        upholstery,
        confirmedBy,
        signedDate,
        signatureData,
        photos,
        projectId,
        expectedStepN,
      })
    } else {
      dispatch({ mode: 'upload', project, unit, photos, projectId, expectedStepN })
    }
  }

  if (state.status === 'success') {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center shadow-sm">
        <span className="material-symbols-outlined text-4xl text-green-600">check_circle</span>
        <p className="mt-2 text-base font-semibold text-gray-900">Readiness form submitted</p>
        <p className="mt-1 text-sm text-gray-500">
          {state.advanced
            ? 'This step is complete — the project moves to the next step. Returning to your projects…'
            : 'It’s recorded below in the submissions list.'}
        </p>
        {state.advanced && returnTo ? (
          <a href={returnTo} className="mt-4 inline-block text-sm font-semibold text-primary hover:underline">
            Back to projects
          </a>
        ) : (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            New form
          </button>
        )}
      </div>
    )
  }

  const inputCls =
    'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none'
  const labelCls = 'mb-1 block text-xs font-medium text-gray-600'

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {(['digital', 'upload'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 px-4 py-3 text-sm font-semibold transition ${
              tab === t
                ? 'border-b-2 border-primary text-primary'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {t === 'digital' ? 'Create Digital Version' : 'Upload'}
          </button>
        ))}
      </div>

      <div className="space-y-4 p-4 sm:p-6">
        {tab === 'digital' ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Project</label>
                <input value={project} onChange={(e) => setProject(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Unit</label>
                <input value={unit} onChange={(e) => setUnit(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Material / Quality control</label>
              <input value={materialControl} onChange={(e) => setMaterialControl(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Accessories</label>
              <input value={accessories} onChange={(e) => setAccessories(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Upholstery</label>
              <input value={upholstery} onChange={(e) => setUpholstery(e.target.value)} className={inputCls} />
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm text-gray-700">
                <span className="font-semibold">Confirmation statement.</span> I,{' '}
                <input
                  value={confirmedBy}
                  onChange={(e) => setConfirmedBy(e.target.value)}
                  placeholder="your name"
                  className="inline-block w-40 rounded border border-gray-300 px-2 py-0.5 text-sm focus:border-primary focus:outline-none"
                />{' '}
                confirm that the above-listed materials and accessories are complete and ready for
                review and check.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Signature</label>
                <div className="signature-pad overflow-hidden rounded-md border border-gray-300 bg-white">
                  <SignatureCanvas
                    ref={sigRef}
                    penColor="#1d1d1f"
                    canvasProps={{ className: 'h-40 w-full touch-none' }}
                  />
                </div>
                <button
                  type="button"
                  onClick={clearSignature}
                  className="mt-1 text-xs text-gray-500 hover:text-primary"
                >
                  Clear signature
                </button>
              </div>
              <div>
                <label className={labelCls}>Date</label>
                <input
                  type="date"
                  value={signedDate}
                  onChange={(e) => setSignedDate(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Project (optional)</label>
              <input value={project} onChange={(e) => setProject(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Unit (optional)</label>
              <input value={unit} onChange={(e) => setUnit(e.target.value)} className={inputCls} />
            </div>
          </div>
        )}

        {/* Required photo evidence — both modes. */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm font-semibold text-gray-900">
            Photos <span className="text-error">*</span>
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            Attach {REQUIRED_PHOTOS} photos of the signed form / materials to submit.
            {photosOk ? ' ✓ Done.' : ` ${Math.max(0, REQUIRED_PHOTOS - photos.length)} more needed.`}
          </p>

          {photos.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {photos.map((p, i) => (
                <div key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p} alt={`Photo ${i + 1}`} className="h-20 w-20 rounded-md border border-gray-200 object-cover" />
                  <button
                    type="button"
                    onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                    className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white"
                    title="Remove"
                  >
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          {photos.length < 6 && (
            <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-primary">
              <span className="material-symbols-outlined text-base">add_a_photo</span>
              Add photo
              <input type="file" accept="image/*" multiple className="hidden" onChange={onPhotos} />
            </label>
          )}
        </div>

        {(state.status === 'error' || localError) && (
          <p className="text-sm text-error">{localError || state.message}</p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={pending || !photosOk}
          title={!photosOk ? `Attach ${REQUIRED_PHOTOS} photos first` : undefined}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
        >
          {pending && (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          )}
          {pending ? 'Submitting…' : 'Submit readiness form'}
        </button>
      </div>
    </div>
  )
}

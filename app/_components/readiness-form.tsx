'use client'

import { useActionState, useRef, useState } from 'react'
import SignatureCanvas from 'react-signature-canvas'
import { submitReadinessAction, type ReadinessState } from '@/actions/readiness'

const INITIAL: ReadinessState = { status: 'idle' }

type Tab = 'digital' | 'upload'

export default function ReadinessForm() {
  const [tab, setTab] = useState<Tab>('digital')
  const [state, dispatch, pending] = useActionState(submitReadinessAction, INITIAL)

  // Digital fields
  const [project, setProject] = useState('')
  const [unit, setUnit] = useState('')
  const [materialControl, setMaterialControl] = useState('')
  const [accessories, setAccessories] = useState('')
  const [upholstery, setUpholstery] = useState('')
  const [confirmedBy, setConfirmedBy] = useState('')
  const [signedDate, setSignedDate] = useState('')
  const sigRef = useRef<SignatureCanvas>(null)

  // Upload fields
  const [uploadData, setUploadData] = useState('')
  const [uploadName, setUploadName] = useState('')
  const [localError, setLocalError] = useState('')

  function clearSignature() {
    sigRef.current?.clear()
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 4_000_000) {
      setLocalError('Image is larger than 4MB — please pick a smaller one.')
      return
    }
    setLocalError('')
    const reader = new FileReader()
    reader.onload = () => {
      setUploadData(typeof reader.result === 'string' ? reader.result : '')
      setUploadName(file.name)
    }
    reader.readAsDataURL(file)
  }

  function submit() {
    setLocalError('')
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
      })
    } else {
      dispatch({ mode: 'upload', project, unit, uploadData, uploadName })
    }
  }

  if (state.status === 'success') {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center shadow-sm">
        <span className="material-symbols-outlined text-4xl text-green-600">check_circle</span>
        <p className="mt-2 text-base font-semibold text-gray-900">Readiness form submitted</p>
        <p className="mt-1 text-sm text-gray-500">It’s recorded below in the submissions list.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
        >
          New form
        </button>
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
          <>
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
            <div>
              <label className={labelCls}>Photo / scan of the signed form</label>
              <input type="file" accept="image/*" onChange={onFile} className="block w-full text-sm" />
            </div>
            {uploadData && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={uploadData}
                alt="Readiness form preview"
                className="max-h-72 w-auto rounded-md border border-gray-200"
              />
            )}
          </>
        )}

        {(state.status === 'error' || localError) && (
          <p className="text-sm text-error">{localError || state.message}</p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={pending}
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

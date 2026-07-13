'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { submitYesNoUploadAction, completeStepAction } from '@/actions/workflow-graph'
import { downscaleImage } from '@/lib/downscale-image'

// Delay (ms) the success confirmation stays visible before redirecting, so
// the user has time to read it before the page navigates. Matches
// assignment-step.tsx's mechanism.
const REDIRECT_DELAY_MS = 1400

// Minimal renderer for the `yes_no_upload` fulfillment kind (WF-03): a
// yes/no control plus an OPTIONAL file upload. Correctness over polish —
// this proves the kind renders and submits through the plan 03 actions;
// styling/responsive work is Phases 18/19/21.
export default function YesNoUploadStep({
  projectId,
  stepDefId,
  redirectTo,
  completeOnSubmit = true,
}: {
  projectId: string
  stepDefId: string
  redirectTo?: string
  // v2.0 quick task 260713-rb2: when false, submit() records the answer/
  // upload but does NOT auto-complete the step (via completeStepAction) —
  // instead it router.refresh()es so the caller's server component can
  // reveal the next part of a multi-part wizard (e.g. the merged Invoice &
  // Delivery Timeline step's part 2). Default true preserves every existing
  // caller's behavior byte-for-byte.
  completeOnSubmit?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [answer, setAnswer] = useState<'yes' | 'no' | null>(null)
  const [uploadData, setUploadData] = useState<string | null>(null)
  const [uploadName, setUploadName] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current)
    }
  }, [])

  function scheduleRedirect() {
    if (!redirectTo) return
    redirectTimer.current = setTimeout(() => {
      router.push(redirectTo)
    }, REDIRECT_DELAY_MS)
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const data = await downscaleImage(file, 1280, 0.8)
      setUploadData(data)
      setUploadName(file.name)
    } catch {
      setMessage('Could not read that file. Please try another.')
      setOk(false)
    }
  }

  function submit() {
    if (!answer) {
      setMessage('Choose yes or no first.')
      setOk(false)
      return
    }
    setMessage(null)
    startTransition(async () => {
      const res = await submitYesNoUploadAction({
        projectId,
        stepDefId,
        answer,
        uploadData,
        uploadName,
      })
      if (!res.ok) {
        setMessage(res.message ?? 'Could not submit.')
        setOk(false)
        return
      }
      if (!completeOnSubmit) {
        setMessage('✓ Recorded.')
        setOk(true)
        router.refresh()
        return
      }
      const completeRes = await completeStepAction({ projectId, stepDefId })
      if (completeRes.ok) {
        setMessage(`✓ Step completed.${redirectTo ? ' Redirecting…' : ''}`)
        setOk(true)
        scheduleRedirect()
      } else {
        setMessage(completeRes.message ?? 'Could not complete step.')
        setOk(false)
      }
    })
  }

  function complete() {
    setMessage(null)
    startTransition(async () => {
      const res = await completeStepAction({ projectId, stepDefId })
      if (res.ok) {
        setMessage(`✓ Step completed.${redirectTo ? ' Redirecting…' : ''}`)
        setOk(true)
        scheduleRedirect()
      } else {
        setMessage(res.message ?? 'Could not complete step.')
        setOk(false)
      }
    })
  }

  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div>
        <p className="mb-2 text-sm font-semibold text-gray-900">Answer</p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => setAnswer('yes')}
            className={`rounded-md border px-4 py-2 text-sm font-semibold ${
              answer === 'yes'
                ? 'border-primary bg-primary text-white'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            Yes
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setAnswer('no')}
            className={`rounded-md border px-4 py-2 text-sm font-semibold ${
              answer === 'no'
                ? 'border-primary bg-primary text-white'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            No
          </button>
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-gray-600">Upload (optional)</p>
        <input type="file" accept="image/*,.pdf" onChange={onFile} disabled={pending} />
        {uploadName && <p className="mt-1 text-xs text-gray-500">Attached: {uploadName}</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
        >
          {pending ? 'Working…' : 'Submit'}
        </button>
        {completeOnSubmit && (
          <button
            type="button"
            disabled={pending}
            onClick={complete}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            Complete step
          </button>
        )}
      </div>

      {message && <p className={`text-sm ${ok ? 'text-green-700' : 'text-error'}`}>{message}</p>}
    </div>
  )
}

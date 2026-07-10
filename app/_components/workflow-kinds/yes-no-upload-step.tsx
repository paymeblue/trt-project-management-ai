'use client'

import { useState, useTransition } from 'react'
import { submitYesNoUploadAction, completeStepAction } from '@/actions/workflow-graph'
import { downscaleImage } from '@/lib/downscale-image'

// Minimal renderer for the `yes_no_upload` fulfillment kind (WF-03): a
// yes/no control plus an OPTIONAL file upload. Correctness over polish —
// this proves the kind renders and submits through the plan 03 actions;
// styling/responsive work is Phases 18/19/21.
export default function YesNoUploadStep({
  projectId,
  stepDefId,
}: {
  projectId: string
  stepDefId: string
}) {
  const [pending, startTransition] = useTransition()
  const [answer, setAnswer] = useState<'yes' | 'no' | null>(null)
  const [uploadData, setUploadData] = useState<string | null>(null)
  const [uploadName, setUploadName] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

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
    }
  }

  function submit() {
    if (!answer) {
      setMessage('Choose yes or no first.')
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
        return
      }
      const completeRes = await completeStepAction({ projectId, stepDefId })
      setMessage(completeRes.message ?? (completeRes.ok ? 'Step completed.' : 'Could not complete step.'))
    })
  }

  function complete() {
    setMessage(null)
    startTransition(async () => {
      const res = await completeStepAction({ projectId, stepDefId })
      setMessage(res.message ?? (res.ok ? 'Step completed.' : 'Could not complete step.'))
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
        <button
          type="button"
          disabled={pending}
          onClick={complete}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          Complete step
        </button>
      </div>

      {message && <p className="text-sm text-gray-700">{message}</p>}
    </div>
  )
}

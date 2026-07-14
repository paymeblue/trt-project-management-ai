'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  sendApprovalAction,
  approveAndCompleteApprovalAction,
  rejectApprovalAction,
} from '@/actions/workflow-graph'

// Delay (ms) the success confirmation stays visible before redirecting, so
// the user has time to read it before the page navigates. Matches
// assignment-step.tsx's mechanism.
const REDIRECT_DELAY_MS = 1400

type Drawing = { uploadData: string; uploadName: string | null } | null

// Phase-aware, plain-language, two-party approval UI (quick task 260714-iuj).
// Replaces the old bare three-button block (send / receive / generic
// complete), which let a receive-gate holder (e.g. the CPO on
// send_for_production) record THEMSELVES as the sender — the two-party
// engine rule then correctly rejected their own receive, deadlocking the
// step (nobody else held the CPO title). All eligibility props here are
// SERVER-RESOLVED and advisory only: every mutation still goes through
// authorizeStep server-side (see actions/workflow-graph.ts), so a tampered
// client can never bypass the real gate — it can only mis-render the UI.
export default function ApprovalStep({
  projectId,
  stepDefId,
  redirectTo,
  phase,
  senderEligible,
  receiverEligible,
  drawing,
  senderName,
  senderRoleLabel,
  receiverPositionLabel,
  receiverHolderCount,
}: {
  projectId: string
  stepDefId: string
  redirectTo?: string
  phase: 'send' | 'sent'
  senderEligible: boolean
  receiverEligible: boolean
  drawing: Drawing
  senderName: string | null
  senderRoleLabel: string
  receiverPositionLabel: string
  receiverHolderCount: number
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
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

  function send() {
    setMessage(null)
    startTransition(async () => {
      const res = await sendApprovalAction({ projectId, stepDefId })
      if (res.ok) {
        setMessage(`✓ Approved and sent to ${receiverPositionLabel}.${redirectTo ? ' Redirecting…' : ''}`)
        setOk(true)
        scheduleRedirect()
      } else {
        setMessage(res.message ?? 'Could not send.')
        setOk(false)
      }
    })
  }

  function approveAndComplete() {
    setMessage(null)
    startTransition(async () => {
      const res = await approveAndCompleteApprovalAction({ projectId, stepDefId })
      if (res.ok) {
        setMessage(`✓ Approved. Redirecting…`)
        setOk(true)
        scheduleRedirect()
      } else {
        setMessage(res.message ?? 'Could not approve.')
        setOk(false)
      }
    })
  }

  function reject() {
    setMessage(null)
    startTransition(async () => {
      const res = await rejectApprovalAction({ projectId, stepDefId })
      if (res.ok) {
        setMessage('Design sent back for revision.')
        setOk(true)
        router.refresh()
      } else {
        setMessage(res.message ?? 'Could not reject.')
        setOk(false)
      }
    })
  }

  const noHolderWarning =
    receiverHolderCount === 0 ? (
      <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
        No user currently holds the {receiverPositionLabel} title — they won&rsquo;t be notified.
      </p>
    ) : null

  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      {phase === 'send' ? (
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          1/2 — {senderRoleLabel}: approve design &amp; send to Factory
        </p>
      ) : receiverEligible ? (
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          2/2 — {receiverPositionLabel}: approve for production
        </p>
      ) : null}

      <DrawingPane drawing={drawing} />

      {phase === 'send' ? (
        <>
          {senderEligible ? (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={send}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
              >
                {pending ? 'Working…' : 'Approve design & send to Factory'}
              </button>
              {noHolderWarning}
            </>
          ) : receiverEligible ? (
            <p className="text-sm text-gray-600">
              You are the receiving party — {senderRoleLabel} sends this to you first.
            </p>
          ) : (
            <p className="text-sm text-gray-500">Waiting for {senderRoleLabel} to approve and send.</p>
          )}
        </>
      ) : (
        <>
          {receiverEligible ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={approveAndComplete}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
              >
                {pending ? 'Working…' : 'Approve & send to Factory'}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={reject}
                className="rounded-md border border-error px-4 py-2 text-sm font-semibold text-error hover:bg-error/5 disabled:opacity-60"
              >
                Reject design
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500">
                Sent — waiting on {receiverPositionLabel} (2/2)
                {senderName ? ` · sent by ${senderName}` : ''}
              </p>
              {noHolderWarning}
            </>
          )}
        </>
      )}

      {message && <p className={`text-sm ${ok ? 'text-green-700' : 'text-error'}`}>{message}</p>}
    </div>
  )
}

// Shown to BOTH parties, in every phase. Mirrors the audit page's UploadCell
// XSS rule (lib/project-audit.ts / app/(app)/admin/projects/[id]/audit/page.tsx):
// an <img> renders ONLY when uploadData starts with 'data:image/'; any other
// upload shows filename text only — never a clickable data: link.
function DrawingPane({ drawing }: { drawing: Drawing }) {
  if (drawing?.uploadData?.startsWith('data:image/')) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={drawing.uploadData}
        alt={drawing.uploadName ?? 'Design drawing'}
        className="max-h-80 w-full rounded-md border border-gray-200 object-contain"
      />
    )
  }
  if (drawing?.uploadName) {
    return <p className="text-sm text-gray-600">{drawing.uploadName}</p>
  }
  return <p className="text-sm text-gray-400">No drawing found on the design steps.</p>
}

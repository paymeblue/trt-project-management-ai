'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db'
import { readinessForms } from '@/db/schema'
import { verifySessionForAction } from '@/lib/dal'
import { advanceOrConfirmDualRole } from '@/actions/workflow'
import { getLiveWorkflowSteps, assigneeGatedRoles, getStepAssigneeGate } from '@/lib/workflow-graph'
import { findStep, canActOnGraphStep, type UserRole, type WorkflowRole } from '@/lib/workflow'

export type ReadinessInput = {
  mode: 'digital' | 'upload'
  project?: string
  unit?: string
  materialControl?: string
  accessories?: string
  upholstery?: string
  confirmedBy?: string
  signedDate?: string
  signatureData?: string
  // Required photo evidence (2+) — base64 data URLs.
  photos?: string[] | null
  // Set when launched from a project workflow step.
  projectId?: string | null
  expectedStepN?: number | null
}

const REQUIRED_PHOTOS = 2

export type ReadinessState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  advanced?: boolean
}

// ~6MB cap on any single data URL we persist (base64 of an image/signature).
const MAX_DATA_URL = 6_000_000

export async function submitReadinessAction(
  tabToken: string | null,
  _prev: ReadinessState,
  input: ReadinessInput,
): Promise<ReadinessState> {
  const { userId, role } = await verifySessionForAction(tabToken)

  const mode = input?.mode === 'upload' ? 'upload' : 'digital'

  // Both modes require 2 photos — the step cannot complete without them.
  const photos = (Array.isArray(input?.photos) ? input.photos : []).filter(
    (p) => typeof p === 'string' && p.startsWith('data:image/'),
  )
  if (photos.length < REQUIRED_PHOTOS)
    return { status: 'error', message: `Please attach ${REQUIRED_PHOTOS} photos before submitting.` }
  if (photos.some((p) => p.length > MAX_DATA_URL))
    return { status: 'error', message: 'One of the photos is too large. Please retake it.' }

  if (mode === 'digital') {
    if (!input.confirmedBy?.trim())
      return { status: 'error', message: 'Please enter your name in the confirmation statement.' }
    if (!input.signatureData)
      return { status: 'error', message: 'Please sign before submitting.' }
    if (input.signatureData.length > MAX_DATA_URL)
      return { status: 'error', message: 'Signature data too large.' }
  }

  // Step-linked submissions must be authorized against the live workflow graph
  // server-side — the client's step pairing is never trusted.
  if (input?.projectId && input?.expectedStepN) {
    const steps = await getLiveWorkflowSteps()
    const step = findStep(steps, Number(input.expectedStepN))
    if (!step || !canActOnGraphStep(step, role as UserRole)) {
      return { status: 'error', message: 'You are not authorized to submit this form for this step.' }
    }
    // Quick task 260716-h0i: real server-side enforcement — only the site_pm
    // assigned via ops_design_confirmation may act on this project's gated
    // steps. No-op for any other role/step (e.g. a factory_pm on their own
    // half of a dual-role step like materials_readiness).
    if (assigneeGatedRoles(step.key).includes(role as WorkflowRole)) {
      const gateUserId = await getStepAssigneeGate('live', String(input.projectId), step.key)
      if (gateUserId && gateUserId !== userId) {
        return {
          status: 'error',
          message: 'This step is assigned to a specific Site PM for this project.',
        }
      }
    }
  }

  try {
    await db.insert(readinessForms).values({
      createdBy: userId,
      mode,
      project: input.project?.trim() || null,
      unit: input.unit?.trim() || null,
      materialControl: input.materialControl?.trim() || null,
      accessories: input.accessories?.trim() || null,
      upholstery: input.upholstery?.trim() || null,
      confirmedBy: input.confirmedBy?.trim() || null,
      signedDate: input.signedDate?.trim() || null,
      signatureData: mode === 'digital' ? input.signatureData ?? null : null,
      photoData: photos,
    })
  } catch {
    return { status: 'error', message: 'Could not save the form. Please try again.' }
  }

  let advanced = false
  if (input?.projectId && input?.expectedStepN) {
    advanced = await advanceOrConfirmDualRole(tabToken, {
      projectId: String(input.projectId),
      expectedStepN: Number(input.expectedStepN),
    })
  }

  revalidatePath('/factory-pm/readiness')
  return { status: 'success', message: 'Readiness form submitted.', advanced }
}

'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db'
import { readinessForms } from '@/db/schema'
import { verifySession } from '@/lib/dal'

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
  uploadData?: string
  uploadName?: string
}

export type ReadinessState = {
  status: 'idle' | 'success' | 'error'
  message?: string
}

// ~6MB cap on any single data URL we persist (base64 of an image/signature).
const MAX_DATA_URL = 6_000_000

export async function submitReadinessAction(
  _prev: ReadinessState,
  input: ReadinessInput,
): Promise<ReadinessState> {
  const { userId } = await verifySession()

  const mode = input?.mode === 'upload' ? 'upload' : 'digital'

  if (mode === 'upload') {
    if (!input.uploadData) return { status: 'error', message: 'Please choose a file to upload.' }
    if (input.uploadData.length > MAX_DATA_URL)
      return { status: 'error', message: 'That file is too large (max ~4MB image).' }
  } else {
    if (!input.project?.trim())
      return { status: 'error', message: 'Project is required.' }
    if (!input.confirmedBy?.trim())
      return { status: 'error', message: 'Please enter your name in the confirmation statement.' }
    if (!input.signatureData)
      return { status: 'error', message: 'Please sign before submitting.' }
    if (input.signatureData.length > MAX_DATA_URL)
      return { status: 'error', message: 'Signature data too large.' }
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
      uploadData: mode === 'upload' ? input.uploadData ?? null : null,
      uploadName: mode === 'upload' ? input.uploadName ?? null : null,
    })
  } catch {
    return { status: 'error', message: 'Could not save the form. Please try again.' }
  }

  revalidatePath('/factory-pm/readiness')
  return { status: 'success', message: 'Readiness form submitted.' }
}

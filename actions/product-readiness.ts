'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db'
import { attachments } from '@/db/schema'
import { verifySessionForAction } from '@/lib/dal'

// Until S3 is configured, Product Readiness tracks file references (name + link)
// in the attachments table (s3Key holds the external URL, responseId stays null).
export async function addProductFileAction(tabToken: string | null, formData: FormData): Promise<void> {
  const { userId } = await verifySessionForAction(tabToken)
  const filename = String(formData.get('filename') ?? '').trim()
  const url = String(formData.get('url') ?? '').trim()
  if (!filename || !url) return
  await db.insert(attachments).values({ filename, s3Key: url, uploadedBy: userId })
  revalidatePath('/factory-pm/product-readiness')
}

const MAX_PDF = 6_000_000 // ~4.4MB PDF once base64-encoded

// Store the uploaded PDF as a base64 data URL in Postgres (s3Key holds it so the
// existing list link opens it directly). Swap to S3 presigned uploads later.
export async function addProductPdfAction(tabToken: string | null, input: {
  filename: string
  dataUrl: string
  sizeBytes?: number
}): Promise<{ ok: boolean; error?: string }> {
  const { userId } = await verifySessionForAction(tabToken)
  const filename = (input?.filename ?? '').trim()
  const dataUrl = input?.dataUrl ?? ''
  if (!filename) return { ok: false, error: 'Missing file name.' }
  if (!dataUrl.startsWith('data:application/pdf'))
    return { ok: false, error: 'Please choose a PDF file.' }
  if (dataUrl.length > MAX_PDF) return { ok: false, error: 'PDF too large (max ~4MB).' }

  await db.insert(attachments).values({
    filename,
    s3Key: dataUrl,
    mimeType: 'application/pdf',
    sizeBytes: input.sizeBytes ?? null,
    uploadedBy: userId,
  })
  revalidatePath('/factory-pm/product-readiness')
  return { ok: true }
}

'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db'
import { attachments } from '@/db/schema'
import { verifySession } from '@/lib/dal'

// Until S3 is configured, Product Readiness tracks file references (name + link)
// in the attachments table (s3Key holds the external URL, responseId stays null).
export async function addProductFileAction(formData: FormData): Promise<void> {
  const { userId } = await verifySession()
  const filename = String(formData.get('filename') ?? '').trim()
  const url = String(formData.get('url') ?? '').trim()
  if (!filename || !url) return
  await db.insert(attachments).values({ filename, s3Key: url, uploadedBy: userId })
  revalidatePath('/factory-pm/product-readiness')
}

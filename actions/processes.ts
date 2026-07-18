'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { processes } from '@/db/schema'
import { verifySessionForAction, isAdminRole } from '@/lib/dal'

export type ProcessActionResult = { ok: boolean; slug?: string; error?: string }

const MAX_IMAGE = 3_000_000 // ~3MB data URL

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'process'
}

async function uniqueSlug(title: string): Promise<string> {
  const base = slugify(title)
  let slug = base
  for (let n = 2; ; n++) {
    const [exists] = await db
      .select({ id: processes.id })
      .from(processes)
      .where(eq(processes.slug, slug))
      .limit(1)
    if (!exists) break
    slug = `${base}-${n}`
  }
  return slug
}

/** Admin-only: add a process flow from an uploaded image. */
export async function createProcessImageAction(tabToken: string | null, input: {
  title: string
  imageData: string
}): Promise<ProcessActionResult> {
  const { userId, role } = await verifySessionForAction(tabToken)
  if (!isAdminRole(role)) return { ok: false, error: 'Only administrators can add process flows.' }

  const title = String(input?.title ?? '').trim()
  if (title.length < 2) return { ok: false, error: 'Please name the process flow.' }

  const imageData = String(input?.imageData ?? '')
  if (!imageData.startsWith('data:image/')) return { ok: false, error: 'Please upload an image.' }
  if (imageData.length > MAX_IMAGE) return { ok: false, error: 'Image is too large (max ~3MB).' }

  const slug = await uniqueSlug(title)
  await db.insert(processes).values({ title, slug, body: '', imageData, createdBy: userId })
  revalidatePath('/processes')
  return { ok: true, slug }
}

/** Admin-only: rename and/or replace the image of a process flow. */
export async function updateProcessImageAction(tabToken: string | null, input: {
  slug: string
  title?: string
  imageData?: string
}): Promise<ProcessActionResult> {
  const { role } = await verifySessionForAction(tabToken)
  if (!isAdminRole(role)) return { ok: false, error: 'Only administrators can update process flows.' }

  const slug = String(input?.slug ?? '').trim()
  if (!slug) return { ok: false, error: 'Missing process.' }

  const set: Record<string, unknown> = { updatedAt: new Date() }
  const title = String(input?.title ?? '').trim()
  if (title) set.title = title
  if (input?.imageData) {
    const img = String(input.imageData)
    if (!img.startsWith('data:image/')) return { ok: false, error: 'Invalid image.' }
    if (img.length > MAX_IMAGE) return { ok: false, error: 'Image is too large (max ~3MB).' }
    set.imageData = img
  }

  await db.update(processes).set(set).where(eq(processes.slug, slug))
  revalidatePath('/processes')
  revalidatePath(`/processes/${slug}`)
  return { ok: true, slug }
}

/** Admin-only: delete a process flow. */
export async function deleteProcessAction(tabToken: string | null, slug: string): Promise<ProcessActionResult> {
  const { role } = await verifySessionForAction(tabToken)
  if (!isAdminRole(role)) return { ok: false, error: 'Only administrators can delete process flows.' }

  const clean = String(slug).trim()
  if (!clean) return { ok: false, error: 'Missing process.' }

  await db.delete(processes).where(eq(processes.slug, clean))
  revalidatePath('/processes')
  return { ok: true }
}

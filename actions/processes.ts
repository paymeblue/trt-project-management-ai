'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { processes, type ProcessScene } from '@/db/schema'
import { verifySession } from '@/lib/dal'

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'process'
}

/** Create a new process from a drawing the user just made, naming it on save. */
export async function createProcessWithSceneAction(
  name: string,
  scene: ProcessScene,
): Promise<{ ok: boolean; slug?: string; error?: string }> {
  const { userId } = await verifySession()
  const title = (name ?? '').trim()
  if (!title) return { ok: false, error: 'Please name the process.' }
  if (!scene || !Array.isArray(scene.elements) || scene.elements.length === 0) {
    return { ok: false, error: 'Draw something first.' }
  }

  // Unique slug
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

  await db.insert(processes).values({ title, slug, body: '', diagram: scene, createdBy: userId })
  revalidatePath('/processes')
  return { ok: true, slug }
}

export async function createProcessAction(formData: FormData): Promise<void> {
  const { userId } = await verifySession()

  const title = String(formData.get('title') ?? '').trim()
  const slug = String(formData.get('slug') ?? '').trim()
  const body = String(formData.get('body') ?? '').trim()

  if (!title || !slug || !body) return

  await db.insert(processes).values({
    title,
    slug,
    body,
    createdBy: userId,
  })

  revalidatePath('/processes')
}

export async function updateProcessAction(formData: FormData): Promise<void> {
  await verifySession()

  const slug = String(formData.get('slug') ?? '').trim()
  const body = String(formData.get('body') ?? '').trim()

  if (!slug || !body) return

  await db
    .update(processes)
    .set({ body, updatedAt: new Date() })
    .where(eq(processes.slug, slug))

  revalidatePath(`/processes/${slug}`)
  revalidatePath('/processes')
}

/** Persist an Excalidraw scene for a process. Any authenticated PM (matches
 *  process creation, which is open to all roles). Stored in the `diagram` jsonb. */
export async function saveProcessSceneAction(
  slug: string,
  scene: { elements: unknown[]; files?: unknown },
): Promise<{ ok: boolean; error?: string }> {
  await verifySession()

  const clean = String(slug).trim()
  if (!clean) return { ok: false, error: 'Missing process.' }
  if (!scene || !Array.isArray(scene.elements)) {
    return { ok: false, error: 'Invalid drawing.' }
  }

  await db
    .update(processes)
    .set({ diagram: scene, updatedAt: new Date() })
    .where(eq(processes.slug, clean))

  revalidatePath(`/processes/${clean}`)
  return { ok: true }
}

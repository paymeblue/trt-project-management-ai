'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { staticContent } from '@/db/schema'
import { verifySessionForAction, isAdminRole } from '@/lib/dal'

export async function updateAboutAction(tabToken: string | null, formData: FormData): Promise<void> {
  const { userId, role } = await verifySessionForAction(tabToken)
  if (!isAdminRole(role)) return // Admins (Super Admin / Operations) edit only
  const body = String(formData.get('body') ?? '').trim()

  const [existing] = await db
    .select()
    .from(staticContent)
    .where(eq(staticContent.slug, 'about_trt'))
    .limit(1)

  if (existing) {
    await db
      .update(staticContent)
      .set({ body, updatedBy: userId, updatedAt: new Date() })
      .where(eq(staticContent.slug, 'about_trt'))
  } else {
    await db
      .insert(staticContent)
      .values({ slug: 'about_trt', title: 'About TRT', body, updatedBy: userId })
  }

  revalidatePath('/about')
}

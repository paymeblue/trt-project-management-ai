'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { staticContent } from '@/db/schema'
import { verifySessionForAction, isAdminRole } from '@/lib/dal'

export async function updateEmailFormatsAction(tabToken: string | null, formData: FormData): Promise<void> {
  const { userId, role } = await verifySessionForAction(tabToken)
  if (!isAdminRole(role)) return // Admins (Super Admin / Operations) edit only; PMs view
  const body = String(formData.get('body') ?? '').trim()

  const [existing] = await db
    .select()
    .from(staticContent)
    .where(eq(staticContent.slug, 'email_formats'))
    .limit(1)

  if (existing) {
    await db
      .update(staticContent)
      .set({ body, updatedBy: userId, updatedAt: new Date() })
      .where(eq(staticContent.slug, 'email_formats'))
  } else {
    await db
      .insert(staticContent)
      .values({ slug: 'email_formats', title: 'Email Formats', body, updatedBy: userId })
  }

  revalidatePath('/email-formats')
}

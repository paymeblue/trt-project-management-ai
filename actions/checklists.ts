'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { checklistTemplateItems, checklists, checklistResponses } from '@/db/schema'
import { verifySession } from '@/lib/dal'

type ResponseValue = 'yes' | 'no' | 'na'

export async function submitChecklistAction(formData: FormData): Promise<void> {
  const { userId } = await verifySession()
  const definitionId = String(formData.get('definitionId') ?? '')
  const slug = String(formData.get('slug') ?? '')
  if (!definitionId) return

  const items = await db
    .select()
    .from(checklistTemplateItems)
    .where(eq(checklistTemplateItems.definitionId, definitionId))

  const [created] = await db
    .insert(checklists)
    .values({ definitionId, createdBy: userId, status: 'submitted', submittedAt: new Date() })
    .returning({ id: checklists.id })

  for (const item of items) {
    const radio = formData.get(`item_${item.id}`)
    const text = formData.get(`text_${item.id}`)
    const notes = formData.get(`notes_${item.id}`)
    const value = radio ? (String(radio) as ResponseValue) : null
    await db.insert(checklistResponses).values({
      checklistId: created.id,
      templateItemId: item.id,
      value,
      textValue: text ? String(text) : null,
      notes: notes ? String(notes) : null,
    })
  }

  revalidatePath(`/checklists/${slug}`)
}

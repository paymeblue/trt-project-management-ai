'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { checklistTemplateItems, checklists, checklistResponses } from '@/db/schema'
import { verifySession } from '@/lib/dal'
import { advanceProjectStep } from '@/actions/workflow'

type ResponseValue = 'yes' | 'no' | 'na'

export type ChecklistAnswer = {
  value?: ResponseValue | null
  textValue?: string | null
  notes?: string | null
}

export type SubmitChecklistInput = {
  definitionId: string
  slug: string
  answers: Record<string, ChecklistAnswer>
  // Set when launched from a project workflow step — ties the checklist to the
  // project and auto-advances it on success.
  projectId?: string | null
  expectedStepN?: number | null
}

export type SubmitChecklistState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  // True when a project workflow step was advanced by this submission.
  advanced?: boolean
}

export async function submitChecklistAction(
  _prev: SubmitChecklistState,
  input: SubmitChecklistInput,
): Promise<SubmitChecklistState> {
  const { userId } = await verifySession()
  const definitionId = String(input?.definitionId ?? '')
  const slug = String(input?.slug ?? '')
  const answers = input?.answers ?? {}
  if (!definitionId) return { status: 'error', message: 'Missing checklist.' }

  const items = await db
    .select()
    .from(checklistTemplateItems)
    .where(eq(checklistTemplateItems.definitionId, definitionId))

  if (items.length === 0) return { status: 'error', message: 'This checklist has no items.' }

  const projectId = input?.projectId ? String(input.projectId) : null

  try {
    const [created] = await db
      .insert(checklists)
      .values({
        definitionId,
        projectId,
        createdBy: userId,
        status: 'submitted',
        submittedAt: new Date(),
      })
      .returning({ id: checklists.id })

    for (const item of items) {
      const a = answers[item.id] ?? {}
      const value = a.value === 'yes' || a.value === 'no' || a.value === 'na' ? a.value : null
      await db.insert(checklistResponses).values({
        checklistId: created.id,
        templateItemId: item.id,
        value,
        textValue: a.textValue ? String(a.textValue) : null,
        notes: a.notes ? String(a.notes) : null,
      })
    }
  } catch {
    return { status: 'error', message: 'Could not save your submission. Please try again.' }
  }

  let advanced = false
  if (projectId && input?.expectedStepN) {
    advanced = await advanceProjectStep({
      projectId,
      expectedStepN: Number(input.expectedStepN),
    })
  }

  revalidatePath(`/checklists/${slug}`)
  return { status: 'success', message: 'Checklist submitted.', advanced }
}

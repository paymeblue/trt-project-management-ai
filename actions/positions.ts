'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/db'
import { positions, users, workflowStepDefinitions } from '@/db/schema'
import { verifySessionForAction } from '@/lib/dal'
import { Roles } from '@/lib/workflow'
import { slugifyPosition } from '@/lib/position-slug'

// ── Atomic position rename (quick task 260714-bpq) ─────────────────────────
// SUPER ADMIN ONLY — Operations must not rename positions (T-bpq-01). Never
// throws to the client; always returns { ok, message } / { ok, ...counts }.

export type RenamePositionResult =
  | { ok: true; userCount: number; stepCount: number; newSlug: string; newLabel: string }
  | { ok: false; message: string }

/**
 * Auth-free core: validation + slug derivation + collision check + the
 * atomic cascade itself. Factored out so scripts/verify-position-rename.ts
 * can exercise it against the live DB without faking a session (mirrors
 * confirmDualRoleStepAs's auth-free core in actions/workflow.ts).
 *
 * The neon-http driver's `db.transaction()` THROWS ("No transactions
 * support in neon-http driver") — db.batch([...]) is a genuine
 * non-interactive Neon transaction (driver.cjs:90) and is what makes this
 * cascade atomic (T-bpq-03).
 */
export async function renamePositionCore(input: { slug: string; newLabel: string }): Promise<RenamePositionResult> {
  const oldSlug = input.slug
  const newLabel = input.newLabel.trim()
  if (!newLabel) return { ok: false, message: 'Enter a position name.' }

  const newSlug = slugifyPosition(newLabel)
  if (!newSlug) return { ok: false, message: 'That name has no usable letters or numbers.' }

  if (newSlug !== oldSlug) {
    const [collision] = await db.select({ slug: positions.slug }).from(positions).where(eq(positions.slug, newSlug)).limit(1)
    if (collision) {
      return { ok: false, message: 'A different position already uses that name — pick another.' }
    }
  }

  const [positionRows, userRows, requiredRows, receiverRows] = await db.batch([
    db.update(positions).set({ slug: newSlug, label: newLabel }).where(eq(positions.slug, oldSlug)).returning({ slug: positions.slug }),
    db.update(users).set({ position: newSlug }).where(eq(users.position, oldSlug)).returning({ id: users.id }),
    db
      .update(workflowStepDefinitions)
      .set({ requiredPosition: newSlug })
      .where(eq(workflowStepDefinitions.requiredPosition, oldSlug))
      .returning({ id: workflowStepDefinitions.id }),
    db
      .update(workflowStepDefinitions)
      .set({ receiverRequiredPosition: newSlug })
      .where(eq(workflowStepDefinitions.receiverRequiredPosition, oldSlug))
      .returning({ id: workflowStepDefinitions.id }),
  ])

  if (positionRows.length === 0) {
    return { ok: false, message: 'That position no longer exists — refresh and try again.' }
  }

  const userCount = userRows.length
  const stepIds = new Set([...requiredRows.map((r) => r.id), ...receiverRows.map((r) => r.id)])
  const stepCount = stepIds.size

  return { ok: true, userCount, stepCount, newSlug, newLabel }
}

export async function renamePositionAction(tabToken: string | null, input: { slug: string; newLabel: string }): Promise<RenamePositionResult> {
  const { role } = await verifySessionForAction(tabToken)
  if (role !== Roles.SuperAdmin) {
    return { ok: false, message: 'Only a super admin can rename positions.' }
  }
  const result = await renamePositionCore(input)
  if (result.ok) {
    revalidatePath('/admin/users')
    revalidatePath('/profile')
    revalidatePath('/admin/workflow-configurator')
  }
  return result
}

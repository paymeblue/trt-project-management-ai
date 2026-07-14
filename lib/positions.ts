import 'server-only'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { positions, users, workflowStepDefinitions } from '@/db/schema'

// ── Server-only reader for the `positions` lookup table ───────────────────
// Single source of truth for every position-picking UI (profile select,
// Configurator "Restrict to a specific title" dropdown, admin Positions
// card) post quick-260714-bpq. Renaming a position is pure DML via
// actions/positions.ts — no redeploy, no code change.

export async function getPositions(): Promise<{ slug: string; label: string }[]> {
  return db.select({ slug: positions.slug, label: positions.label }).from(positions).orderBy(asc(positions.label))
}

export async function getPositionLabelMap(): Promise<Record<string, string>> {
  const rows = await getPositions()
  return Object.fromEntries(rows.map((r) => [r.slug, r.label]))
}

export async function positionExists(slug: string): Promise<boolean> {
  const [row] = await db.select({ slug: positions.slug }).from(positions).where(eq(positions.slug, slug)).limit(1)
  return !!row
}

export type PositionWithCounts = {
  slug: string
  label: string
  userCount: number
  stepCount: number
}

// Used by the admin Positions card (app/_components/positions-manager.tsx)
// to show usage before/after a rename.
export async function getPositionsWithCounts(): Promise<PositionWithCounts[]> {
  const all = await getPositions()
  const [userRows, stepRows] = await Promise.all([
    db.select({ position: users.position }).from(users),
    db
      .select({
        requiredPosition: workflowStepDefinitions.requiredPosition,
        receiverRequiredPosition: workflowStepDefinitions.receiverRequiredPosition,
      })
      .from(workflowStepDefinitions),
  ])

  const userCounts = new Map<string, number>()
  for (const u of userRows) {
    if (!u.position) continue
    userCounts.set(u.position, (userCounts.get(u.position) ?? 0) + 1)
  }

  const stepCounts = new Map<string, number>()
  for (const s of stepRows) {
    const slugs = new Set([s.requiredPosition, s.receiverRequiredPosition].filter((v): v is string => !!v))
    for (const slug of slugs) stepCounts.set(slug, (stepCounts.get(slug) ?? 0) + 1)
  }

  return all.map((p) => ({
    ...p,
    userCount: userCounts.get(p.slug) ?? 0,
    stepCount: stepCounts.get(p.slug) ?? 0,
  }))
}

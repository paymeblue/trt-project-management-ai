'use server'

import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/dal'
import type { WorkflowRole, StepKind } from '@/lib/workflow'
import {
  verifyConfigPin,
  setConfigPin,
  createGraphStep,
  updateGraphStep,
  deleteGraphStep,
  moveGraphStep,
  moveGraphStepToIndex,
  updateGraphStepPosition,
  createGraphEdge,
  deleteGraphEdge,
} from '@/lib/workflow-graph'

// ── PIN-gate session cookie (CFG-02) ──────────────────────────────────────
// Separate from the NextAuth session: an HMAC-signed, short-lived, httpOnly
// cookie proving THIS user unlocked the configurator with the PIN. Signed
// with AUTH_SECRET (already used for NextAuth) rather than persisted server
// state, so verification needs no extra DB round trip.

const COOKIE_NAME = 'wf_cfg_unlock'
const UNLOCK_TTL_MS = 30 * 60 * 1000 // 30 minutes

function sign(userId: string, expiresAt: number): string {
  const secret = process.env.AUTH_SECRET ?? ''
  return createHmac('sha256', secret).update(`${userId}.${expiresAt}`).digest('hex')
}

async function setUnlockCookie(userId: string) {
  const expiresAt = Date.now() + UNLOCK_TTL_MS
  const sig = sign(userId, expiresAt)
  const store = await cookies()
  store.set(COOKIE_NAME, `${userId}.${expiresAt}.${sig}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: UNLOCK_TTL_MS / 1000,
    path: '/',
  })
}

/** Server-side check the configurator page uses to decide PIN-gate vs. editor. */
export async function isConfiguratorUnlocked(): Promise<boolean> {
  const { userId } = await requireAdmin()
  const store = await cookies()
  const raw = store.get(COOKIE_NAME)?.value
  if (!raw) return false
  const [cookieUserId, expiresAtStr, sig] = raw.split('.')
  const expiresAt = Number(expiresAtStr)
  if (!cookieUserId || !expiresAt || !sig) return false
  if (cookieUserId !== userId) return false
  if (Date.now() > expiresAt) return false
  const expected = sign(userId, expiresAt)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export type ConfigActionState = { status: 'idle' | 'success' | 'error'; message?: string }

export async function verifyConfigPinAction(pin: string): Promise<ConfigActionState> {
  const { userId } = await requireAdmin()
  const ok = await verifyConfigPin(pin)
  if (!ok) return { status: 'error', message: 'Incorrect PIN.' }
  await setUnlockCookie(userId)
  revalidatePath('/admin/workflow-configurator')
  return { status: 'success', message: 'Unlocked.' }
}

export async function changeConfigPinAction(newPin: string, hint: string): Promise<ConfigActionState> {
  const { userId } = await requireAdmin()
  const unlocked = await isConfiguratorUnlocked()
  if (!unlocked) return { status: 'error', message: 'Unlock the configurator first.' }
  if (!/^\d{4,8}$/.test(newPin)) {
    return { status: 'error', message: 'PIN must be 4-8 digits.' }
  }
  if (!hint.trim()) return { status: 'error', message: 'A hint is required so the PIN is never forgotten.' }
  await setConfigPin(newPin, hint.trim(), userId)
  return { status: 'success', message: 'PIN updated.' }
}

async function requireUnlockedAdmin() {
  await requireAdmin()
  const unlocked = await isConfiguratorUnlocked()
  if (!unlocked) throw new Error('configurator-locked')
}

export type AddStepInput = {
  graph: string
  stepKey: string
  label: string
  role: WorkflowRole
  fulfillmentKind: StepKind
  additionalKinds?: StepKind[]
  checklistSlug?: string
  targetRoles?: WorkflowRole[]
  requiredPosition?: string
  isOptional?: boolean
}

export async function addConfigStepAction(input: AddStepInput): Promise<ConfigActionState> {
  await requireUnlockedAdmin()
  if (!input.stepKey.trim() || !input.label.trim()) {
    return { status: 'error', message: 'Step key and label are required.' }
  }
  const res = await createGraphStep({
    graph: input.graph,
    stepKey: input.stepKey.trim(),
    label: input.label.trim(),
    role: input.role,
    fulfillmentKind: input.fulfillmentKind,
    additionalKinds: input.additionalKinds?.length ? input.additionalKinds : null,
    checklistSlug: input.checklistSlug || null,
    targetRoles: input.targetRoles?.length ? input.targetRoles : null,
    requiredPosition: input.requiredPosition?.trim() || null,
    isOptional: input.isOptional ?? false,
  })
  revalidatePath('/admin/workflow-configurator')
  revalidatePath('/about')
  return { status: res.ok ? 'success' : 'error', message: res.message }
}

export type UpdateStepInput = {
  stepId: string
  label?: string
  role?: WorkflowRole
  fulfillmentKind?: StepKind
  additionalKinds?: StepKind[] | null
  checklistSlug?: string | null
  targetRoles?: WorkflowRole[] | null
  requiredPosition?: string | null
  isOptional?: boolean
}

export async function updateConfigStepAction(input: UpdateStepInput): Promise<ConfigActionState> {
  await requireUnlockedAdmin()
  if (input.label !== undefined && !input.label.trim()) {
    return { status: 'error', message: 'Label cannot be empty.' }
  }
  const res = await updateGraphStep({
    ...input,
    targetRoles: input.targetRoles?.length ? input.targetRoles : input.targetRoles === null ? null : undefined,
    additionalKinds: input.additionalKinds?.length ? input.additionalKinds : input.additionalKinds === null ? null : undefined,
  })
  revalidatePath('/admin/workflow-configurator')
  revalidatePath('/about')
  return { status: res.ok ? 'success' : 'error', message: res.message }
}

export async function deleteConfigStepAction(stepId: string): Promise<ConfigActionState> {
  await requireUnlockedAdmin()
  const res = await deleteGraphStep({ stepId })
  revalidatePath('/admin/workflow-configurator')
  revalidatePath('/about')
  return { status: res.ok ? 'success' : 'error', message: res.message }
}

export async function moveConfigStepAction(
  graph: string,
  stepId: string,
  direction: 'up' | 'down',
): Promise<ConfigActionState> {
  await requireUnlockedAdmin()
  const res = await moveGraphStep({ graph, stepId, direction })
  revalidatePath('/admin/workflow-configurator')
  revalidatePath('/about')
  return { status: res.ok ? 'success' : 'error', message: res.message }
}

/** Drag-and-drop reorder: moves stepId to an arbitrary target index. */
export async function moveConfigStepToIndexAction(
  graph: string,
  stepId: string,
  targetIndex: number,
): Promise<ConfigActionState> {
  await requireUnlockedAdmin()
  const res = await moveGraphStepToIndex({ graph, stepId, targetIndex })
  revalidatePath('/admin/workflow-configurator')
  revalidatePath('/about')
  return { status: res.ok ? 'success' : 'error', message: res.message }
}

/** Graph view: persists a node's canvas position (cosmetic, not execution order). */
export async function updateConfigStepPositionAction(
  stepId: string,
  x: number,
  y: number,
): Promise<ConfigActionState> {
  await requireUnlockedAdmin()
  const res = await updateGraphStepPosition({ stepId, x, y })
  return { status: res.ok ? 'success' : 'error', message: res.message }
}

/** Graph view: creates a direct connection between two steps (drag between handles). */
export async function addConfigEdgeAction(
  graph: string,
  fromStepId: string,
  toStepId: string,
): Promise<ConfigActionState> {
  await requireUnlockedAdmin()
  const res = await createGraphEdge({ graph, fromStepId, toStepId })
  revalidatePath('/admin/workflow-configurator')
  revalidatePath('/about')
  return { status: res.ok ? 'success' : 'error', message: res.message }
}

/** Graph view: removes a direct connection between two steps. */
export async function removeConfigEdgeAction(
  graph: string,
  fromStepId: string,
  toStepId: string,
): Promise<ConfigActionState> {
  await requireUnlockedAdmin()
  const res = await deleteGraphEdge({ graph, fromStepId, toStepId })
  revalidatePath('/admin/workflow-configurator')
  revalidatePath('/about')
  return { status: res.ok ? 'success' : 'error', message: res.message }
}

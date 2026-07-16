import 'server-only'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/db'
import {
  projects,
  projectStepCompletions,
  workflowStepStates,
  checklists,
  checklistDefinitions,
  checklistResponses,
  checklistTemplateItems,
  readinessForms,
  users,
} from '@/db/schema'
import { getLiveWorkflowSteps, type LiveWorkflowStep } from '@/lib/workflow-graph'
import { getPositionLabelMap } from '@/lib/positions'

// ── Super-admin per-project audit view (quick task 260714-bpp) ────────────
// READ-ONLY: no mutations, no schema changes. Two exports:
//  (1) assembleAuditRows — a PURE, DB-free assembler (unit-tested directly).
//  (2) getProjectAudit — the async loader that fetches the plain data this
//      app's tables hold and hands it to assembleAuditRows.
//
// Readiness forms are now linked going forward via readiness_forms.project_id
// (added quick task 260716-hys) and surfaced on readiness-kind steps below.
// Historical rows submitted before this migration remain unlinked
// (project_id IS NULL) since the pre-existing free-text `project` column
// cannot be reliably backfilled — a known, permanent, accepted gap for old
// data, not a bug.

// ── Types ───────────────────────────────────────────────────────────────

export type AuditUser = { name: string; position: string | null }

export type AuditCompletion = {
  completedBy: string
  completedAt: Date
  notes: string | null
}

export type AuditStepState = {
  status: string
  answer: string | null
  uploadData: string | null
  uploadName: string | null
  assignedUserId: string | null
  sentBy: string | null
  receivedBy: string | null
}

export type AuditChecklistItem = {
  label: string
  value: string
  notes: string | null
}

export type AuditChecklistSubmission = {
  definitionTitle: string
  submittedBy: string | null
  submittedAt: Date | null
  items: AuditChecklistItem[]
  photos: string[]
}

export type AuditUpload = {
  dataUrl: string
  name: string | null
  isImage: boolean
}

export type AuditReadinessSubmission = {
  mode: string
  submittedBy: string | null
  submittedAt: Date
  confirmedBy: string | null
  signedDate: string | null
  signatureData: string | null
  uploadData: string | null
  uploadName: string | null
  photos: string[]
}

export type AuditRow = {
  n: number
  key: string
  label: string
  kind: LiveWorkflowStep['kind']
  status: 'completed' | 'not_started'
  officerName: string | null
  officerPosition: string
  completedAt: Date | null
  answer: string | null
  upload: AuditUpload | null
  sentByName: string | null
  receivedByName: string | null
  assignedUserName: string | null
  checklistSubmissions: AuditChecklistSubmission[]
  readinessSubmissions: AuditReadinessSubmission[]
}

export type AssembleAuditRowsInput = {
  steps: LiveWorkflowStep[]
  completions: Map<string, AuditCompletion> // keyed by stepDefId
  stepStates: Map<string, AuditStepState> // keyed by stepDefId
  checklistsBySlug: Map<string, AuditChecklistSubmission[]> // keyed by checklist_definitions.slug
  usersById: Map<string, AuditUser>
  // v2.0 (quick task 260714-bpq): positions are now renameable DB data, not
  // a static display-label map — the label map is loaded once by
  // getProjectAudit and passed in here so a rename shows the NEW label
  // instead of a stale one. assembleAuditRows stays pure/DB-free.
  positionLabels: Record<string, string>
  // quick task 260716-hys: project-linked readiness_forms rows, attached only
  // to readiness-kind steps below (currently only materials_readiness).
  readinessSubmissionsForProject: AuditReadinessSubmission[]
}

function resolvePositionLabel(positionLabels: Record<string, string>, position: string | null | undefined): string {
  if (!position) return '—'
  return positionLabels[position] ?? position
}

function resolveUserName(usersById: Map<string, AuditUser>, id: string | null | undefined): string | null {
  if (!id) return null
  return usersById.get(id)?.name ?? null
}

/**
 * PURE data transform: takes already-fetched plain data (no DB access) and
 * returns one audit row per live step, in the same graph order the steps
 * arrived in. Unit-tested directly in tests/lib/project-audit.test.ts.
 */
export function assembleAuditRows(input: AssembleAuditRowsInput): AuditRow[] {
  const { steps, completions, stepStates, checklistsBySlug, usersById, positionLabels, readinessSubmissionsForProject } =
    input

  return steps.map((step) => {
    const completion = completions.get(step.stepDefId)
    const state = stepStates.get(step.stepDefId)
    const officer = completion ? usersById.get(completion.completedBy) : undefined

    const upload =
      state?.uploadData != null
        ? {
            dataUrl: state.uploadData,
            name: state.uploadName ?? null,
            isImage: state.uploadData.startsWith('data:image/'),
          }
        : null

    return {
      n: step.n,
      key: step.key,
      label: step.label,
      kind: step.kind,
      status: completion ? 'completed' : 'not_started',
      officerName: officer?.name ?? null,
      officerPosition: officer ? resolvePositionLabel(positionLabels, officer.position) : '—',
      completedAt: completion?.completedAt ?? null,
      answer: state?.answer ?? null,
      upload,
      sentByName: resolveUserName(usersById, state?.sentBy),
      receivedByName: resolveUserName(usersById, state?.receivedBy),
      assignedUserName: resolveUserName(usersById, state?.assignedUserId),
      checklistSubmissions: step.slug ? (checklistsBySlug.get(step.slug) ?? []) : [],
      // Only one live step (materials_readiness) uses kind 'readiness' today;
      // if a future step also uses it, per-step disambiguation (e.g. keying
      // by step key/slug like checklistSubmissions) would be needed — do not
      // build that generality now.
      readinessSubmissions: step.kind === 'readiness' ? readinessSubmissionsForProject : [],
    }
  })
}

// ── Loader ──────────────────────────────────────────────────────────────

export type ProjectAuditHeader = {
  id: string
  name: string
  customerName: string | null
  location: string | null
  currentStep: number
  paymentStatus: string
  deliveryDate: Date | null
}

function checklistValueLabel(value: string | null, textValue: string | null): string {
  if (textValue) return textValue
  if (value === 'yes') return 'Yes'
  if (value === 'no') return 'No'
  if (value === 'na') return 'N/A'
  return '—'
}

export async function getProjectAudit(
  projectId: string,
): Promise<{ project: ProjectAuditHeader; rows: AuditRow[] } | null> {
  const [project] = await db
    .select({
      id: projects.id,
      name: projects.name,
      customerName: projects.customerName,
      location: projects.location,
      currentStep: projects.currentStep,
      paymentStatus: projects.paymentStatus,
      deliveryDate: projects.deliveryDate,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)
  if (!project) return null

  const steps = await getLiveWorkflowSteps()
  const positionLabels = await getPositionLabelMap()

  const [completionRows, stateRows, checklistRows, readinessRows, allUsers] = await Promise.all([
    db
      .select({
        stepDefId: projectStepCompletions.stepDefId,
        stepKey: projectStepCompletions.stepKey,
        completedBy: projectStepCompletions.completedBy,
        completedAt: projectStepCompletions.completedAt,
        notes: projectStepCompletions.notes,
      })
      .from(projectStepCompletions)
      .where(eq(projectStepCompletions.projectId, projectId)),
    db
      .select({
        stepDefId: workflowStepStates.stepDefId,
        status: workflowStepStates.status,
        answer: workflowStepStates.answer,
        uploadData: workflowStepStates.uploadData,
        uploadName: workflowStepStates.uploadName,
        assignedUserId: workflowStepStates.assignedUserId,
        sentBy: workflowStepStates.sentBy,
        receivedBy: workflowStepStates.receivedBy,
      })
      .from(workflowStepStates)
      .where(eq(workflowStepStates.projectId, projectId)),
    db
      .select({
        checklistId: checklists.id,
        submittedBy: checklists.createdBy,
        submittedAt: checklists.submittedAt,
        photoData: checklists.photoData,
        slug: checklistDefinitions.slug,
        definitionTitle: checklistDefinitions.name,
        itemLabel: checklistTemplateItems.label,
        value: checklistResponses.value,
        textValue: checklistResponses.textValue,
        notes: checklistResponses.notes,
      })
      .from(checklists)
      .innerJoin(checklistDefinitions, eq(checklists.definitionId, checklistDefinitions.id))
      .leftJoin(checklistResponses, eq(checklistResponses.checklistId, checklists.id))
      .leftJoin(checklistTemplateItems, eq(checklistResponses.templateItemId, checklistTemplateItems.id))
      .where(eq(checklists.projectId, projectId))
      .orderBy(asc(checklistTemplateItems.step), asc(checklistTemplateItems.sortOrder)),
    db
      .select({
        createdBy: readinessForms.createdBy,
        mode: readinessForms.mode,
        confirmedBy: readinessForms.confirmedBy,
        signedDate: readinessForms.signedDate,
        signatureData: readinessForms.signatureData,
        uploadData: readinessForms.uploadData,
        uploadName: readinessForms.uploadName,
        photoData: readinessForms.photoData,
        createdAt: readinessForms.createdAt,
      })
      .from(readinessForms)
      .where(eq(readinessForms.projectId, projectId))
      .orderBy(asc(readinessForms.createdAt)),
    db.select({ id: users.id, name: users.name, position: users.position }).from(users),
  ])

  // Some completion rows carry no stepDefId (e.g. the creation step's insert
  // writes stepKey/stepN only) — resolve those through the live step list by
  // key so step 1 doesn't render as "Not started" on the audit page.
  const defIdByKey = new Map(steps.map((s) => [s.key, s.stepDefId]))
  const completions = new Map<string, AuditCompletion>()
  for (const c of completionRows) {
    const defId = c.stepDefId ?? (c.stepKey ? defIdByKey.get(c.stepKey) : undefined)
    if (!defId) continue // truly unmatchable legacy row (key no longer in the live graph)
    completions.set(defId, { completedBy: c.completedBy, completedAt: c.completedAt, notes: c.notes })
  }

  const stepStates = new Map<string, AuditStepState>()
  for (const s of stateRows) {
    stepStates.set(s.stepDefId, {
      status: s.status,
      answer: s.answer,
      uploadData: s.uploadData,
      uploadName: s.uploadName,
      assignedUserId: s.assignedUserId,
      sentBy: s.sentBy,
      receivedBy: s.receivedBy,
    })
  }

  const usersById = new Map<string, AuditUser>(
    allUsers.map((u) => [u.id, { name: u.name, position: u.position }]),
  )

  const readinessSubmissionsForProject: AuditReadinessSubmission[] = readinessRows.map((r) => ({
    mode: r.mode,
    submittedBy: usersById.get(r.createdBy)?.name ?? null,
    submittedAt: r.createdAt,
    confirmedBy: r.confirmedBy,
    signedDate: r.signedDate,
    signatureData: r.signatureData,
    uploadData: r.uploadData,
    uploadName: r.uploadName,
    photos: r.photoData ?? [],
  }))

  // Group the flat (checklist x response x template-item) rows into one
  // submission per checklist, then bucket submissions by definition slug so
  // assembleAuditRows can pick up the right submissions for each step.
  type SubmissionAcc = AuditChecklistSubmission & { slug: string }
  const submissionsById = new Map<string, SubmissionAcc>()
  for (const r of checklistRows) {
    let sub = submissionsById.get(r.checklistId)
    if (!sub) {
      sub = {
        slug: r.slug,
        definitionTitle: r.definitionTitle,
        submittedBy: r.submittedBy ? (usersById.get(r.submittedBy)?.name ?? null) : null,
        submittedAt: r.submittedAt,
        items: [],
        photos: r.photoData ?? [],
      }
      submissionsById.set(r.checklistId, sub)
    }
    if (r.itemLabel) {
      sub.items.push({ label: r.itemLabel, value: checklistValueLabel(r.value, r.textValue), notes: r.notes })
    }
  }

  const checklistsBySlug = new Map<string, AuditChecklistSubmission[]>()
  for (const sub of submissionsById.values()) {
    const { slug, ...submission } = sub
    const list = checklistsBySlug.get(slug) ?? []
    list.push(submission)
    checklistsBySlug.set(slug, list)
  }

  const rows = assembleAuditRows({
    steps,
    completions,
    stepStates,
    checklistsBySlug,
    usersById,
    positionLabels,
    readinessSubmissionsForProject,
  })

  return { project, rows }
}

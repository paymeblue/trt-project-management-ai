import { describe, it, expect, vi } from 'vitest'

// lib/project-audit.ts starts with `import 'server-only'` and transitively
// imports `@/db` (via `@/lib/workflow-graph`, which connects to Neon at
// module load time) — both are mocked here purely so the module can be
// imported. assembleAuditRows itself is pure and never touches either (same
// pattern as tests/lib/workflow-graph-assignee-gate.test.ts).
vi.mock('server-only', () => ({}))
vi.mock('@/db', () => ({ db: {} }))

const { assembleAuditRows } = await import('@/lib/project-audit')
import type { AssembleAuditRowsInput, AuditUser, AuditCompletion, AuditStepState } from '@/lib/project-audit'
import type { LiveWorkflowStep } from '@/lib/workflow-graph'

function step(overrides: Partial<LiveWorkflowStep> & Pick<LiveWorkflowStep, 'n' | 'key' | 'stepDefId'>): LiveWorkflowStep {
  return {
    label: overrides.label ?? overrides.key,
    role: 'operations',
    kind: 'yes_no_upload',
    slug: undefined,
    ...overrides,
  }
}

function emptyInput(steps: LiveWorkflowStep[]): AssembleAuditRowsInput {
  return {
    steps,
    completions: new Map<string, AuditCompletion>(),
    stepStates: new Map<string, AuditStepState>(),
    checklistsBySlug: new Map(),
    usersById: new Map<string, AuditUser>(),
    positionLabels: { head_of_operations: 'Head of Operations' },
  }
}

describe('assembleAuditRows', () => {
  it('returns rows in the same graph order as the input steps, 1:1', () => {
    const steps = [
      step({ n: 1, key: 'a', stepDefId: 'def-a' }),
      step({ n: 2, key: 'b', stepDefId: 'def-b' }),
      step({ n: 3, key: 'c', stepDefId: 'def-c' }),
    ]
    const rows = assembleAuditRows(emptyInput(steps))
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.key)).toEqual(['a', 'b', 'c'])
    expect(rows.map((r) => r.n)).toEqual([1, 2, 3])
  })

  it('marks a step with a completion row as completed, carrying officer name/position/time', () => {
    const steps = [step({ n: 1, key: 'confirm', stepDefId: 'def-1' })]
    const completedAt = new Date('2026-01-01T10:00:00Z')
    const input = emptyInput(steps)
    input.usersById.set('user-1', { name: 'Ada Lovelace', position: null })
    input.completions.set('def-1', { completedBy: 'user-1', completedAt, notes: null })

    const [row] = assembleAuditRows(input)
    expect(row.status).toBe('completed')
    expect(row.officerName).toBe('Ada Lovelace')
    expect(row.completedAt).toBe(completedAt)
  })

  it('marks a step with no completion as not_started with null officer/time', () => {
    const steps = [step({ n: 1, key: 'confirm', stepDefId: 'def-1' })]
    const [row] = assembleAuditRows(emptyInput(steps))
    expect(row.status).toBe('not_started')
    expect(row.officerName).toBeNull()
    expect(row.completedAt).toBeNull()
  })

  it('resolves a machine position value through the passed-in positionLabels map', () => {
    const steps = [step({ n: 1, key: 'confirm', stepDefId: 'def-1' })]
    const input = emptyInput(steps)
    input.positionLabels = { head_of_operations: 'Head of Operations' }
    input.usersById.set('user-1', { name: 'Head O', position: 'head_of_operations' })
    input.completions.set('def-1', { completedBy: 'user-1', completedAt: new Date(), notes: null })

    const [row] = assembleAuditRows(input)
    expect(row.officerPosition).toBe('Head of Operations')
  })

  it('reflects a renamed label — the map is passed in per-call, not a static import', () => {
    const steps = [step({ n: 1, key: 'confirm', stepDefId: 'def-1' })]
    const input = emptyInput(steps)
    input.positionLabels = { head_of_operations: 'Operations admin head' }
    input.usersById.set('user-1', { name: 'Head O', position: 'head_of_operations' })
    input.completions.set('def-1', { completedBy: 'user-1', completedAt: new Date(), notes: null })

    const [row] = assembleAuditRows(input)
    expect(row.officerPosition).toBe('Operations admin head')
  })

  it('falls back to the verbatim string for a display-form position value', () => {
    const steps = [step({ n: 1, key: 'confirm', stepDefId: 'def-1' })]
    const input = emptyInput(steps)
    input.usersById.set('user-1', { name: 'Someone', position: 'Designer' })
    input.completions.set('def-1', { completedBy: 'user-1', completedAt: new Date(), notes: null })

    const [row] = assembleAuditRows(input)
    expect(row.officerPosition).toBe('Designer')
  })

  it('resolves a null position to an em dash', () => {
    const steps = [step({ n: 1, key: 'confirm', stepDefId: 'def-1' })]
    const input = emptyInput(steps)
    input.usersById.set('user-1', { name: 'No Title', position: null })
    input.completions.set('def-1', { completedBy: 'user-1', completedAt: new Date(), notes: null })

    const [row] = assembleAuditRows(input)
    expect(row.officerPosition).toBe('—')
  })

  it('classifies a data:image/ upload as an image', () => {
    const steps = [step({ n: 1, key: 'upload_step', stepDefId: 'def-1' })]
    const input = emptyInput(steps)
    input.stepStates.set('def-1', {
      status: 'complete',
      answer: 'yes',
      uploadData: 'data:image/png;base64,AAAA',
      uploadName: 'photo.png',
      assignedUserId: null,
      sentBy: null,
      receivedBy: null,
    })

    const [row] = assembleAuditRows(input)
    expect(row.upload?.isImage).toBe(true)
  })

  it('classifies a non-image upload (application/pdf) as not an image', () => {
    const steps = [step({ n: 1, key: 'upload_step', stepDefId: 'def-1' })]
    const input = emptyInput(steps)
    input.stepStates.set('def-1', {
      status: 'complete',
      answer: 'yes',
      uploadData: 'data:application/pdf;base64,AAAA',
      uploadName: 'doc.pdf',
      assignedUserId: null,
      sentBy: null,
      receivedBy: null,
    })

    const [row] = assembleAuditRows(input)
    expect(row.upload?.isImage).toBe(false)
  })

  it('classifies a plain filename (no data: prefix) as not an image', () => {
    const steps = [step({ n: 1, key: 'upload_step', stepDefId: 'def-1' })]
    const input = emptyInput(steps)
    input.stepStates.set('def-1', {
      status: 'complete',
      answer: 'yes',
      uploadData: 'report.docx',
      uploadName: 'report.docx',
      assignedUserId: null,
      sentBy: null,
      receivedBy: null,
    })

    const [row] = assembleAuditRows(input)
    expect(row.upload?.isImage).toBe(false)
  })

  it('resolves approval sentBy/receivedBy names via the users map when present', () => {
    const steps = [step({ n: 1, key: 'approval_step', stepDefId: 'def-1', kind: 'approval' })]
    const input = emptyInput(steps)
    input.usersById.set('sender-1', { name: 'Sender Sam', position: null })
    input.usersById.set('receiver-1', { name: 'Receiver Rae', position: null })
    input.stepStates.set('def-1', {
      status: 'complete',
      answer: null,
      uploadData: null,
      uploadName: null,
      assignedUserId: null,
      sentBy: 'sender-1',
      receivedBy: 'receiver-1',
    })

    const [row] = assembleAuditRows(input)
    expect(row.sentByName).toBe('Sender Sam')
    expect(row.receivedByName).toBe('Receiver Rae')
  })

  it('resolves approval parties to null when absent', () => {
    const steps = [step({ n: 1, key: 'approval_step', stepDefId: 'def-1', kind: 'approval' })]
    const [row] = assembleAuditRows(emptyInput(steps))
    expect(row.sentByName).toBeNull()
    expect(row.receivedByName).toBeNull()
  })

  it('resolves an assignment target name via the users map when present, else null', () => {
    const steps = [step({ n: 1, key: 'assign_step', stepDefId: 'def-1', kind: 'assignment' })]
    const input = emptyInput(steps)
    input.usersById.set('assignee-1', { name: 'Assignee Anna', position: null })
    input.stepStates.set('def-1', {
      status: 'complete',
      answer: null,
      uploadData: null,
      uploadName: null,
      assignedUserId: 'assignee-1',
      sentBy: null,
      receivedBy: null,
    })

    const [row] = assembleAuditRows(input)
    expect(row.assignedUserName).toBe('Assignee Anna')

    const [emptyRow] = assembleAuditRows(emptyInput(steps))
    expect(emptyRow.assignedUserName).toBeNull()
  })
})

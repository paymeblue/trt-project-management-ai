import { describe, it, expect, beforeEach, vi } from 'vitest'
import { canAmendEscalation } from '@/lib/escalation'

const { verifyMock, selectMock, insertMock, insertValuesMock, notifyUserMock } = vi.hoisted(() => ({
  verifyMock: vi.fn(),
  selectMock: vi.fn(),
  insertMock: vi.fn(),
  insertValuesMock: vi.fn(),
  notifyUserMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/dal', () => ({ verifySession: verifyMock, verifySessionForAction: verifyMock }))
vi.mock('@/lib/notifications', () => ({ notifyUser: notifyUserMock }))
vi.mock('@/db', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    insert: (...args: unknown[]) => insertMock(...args),
  },
}))

const { escalateChecklistAction } = await import('@/actions/escalation')

function projectQuery(row: { name: string } | undefined) {
  return { from: () => ({ where: () => ({ limit: () => Promise.resolve(row ? [row] : []) }) }) }
}
function usersQuery(rows: { id: string }[]) {
  return { from: () => ({ where: () => Promise.resolve(rows) }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  verifyMock.mockResolvedValue({ userId: 'user-1', role: 'site_pm' })
  insertValuesMock.mockResolvedValue(undefined)
  insertMock.mockReturnValue({ values: insertValuesMock })
})

describe('canAmendEscalation (D-01)', () => {
  it('admin (super_admin) bypasses position matching entirely', () => {
    expect(canAmendEscalation('super_admin', null, 'head_of_projects')).toBe(true)
  })

  it('admin (operations) bypasses position matching regardless of viewer position', () => {
    expect(canAmendEscalation('operations', 'anything', 'head_of_projects')).toBe(true)
  })

  it('non-admin whose fresh position matches the target is allowed', () => {
    expect(canAmendEscalation('site_pm', 'head_of_projects', 'head_of_projects')).toBe(true)
  })

  it('non-admin whose position differs from the target is rejected', () => {
    expect(canAmendEscalation('site_pm', 'head_of_design', 'head_of_projects')).toBe(false)
  })

  it('non-admin with a null position never matches', () => {
    expect(canAmendEscalation('site_pm', null, 'head_of_projects')).toBe(false)
  })
})

describe('escalateChecklistAction', () => {
  it('forwards the bound per-tab token to verifySessionForAction (D-20.1-04-A)', async () => {
    selectMock
      .mockReturnValueOnce(projectQuery({ name: 'Test Project' }))
      .mockReturnValueOnce(usersQuery([{ id: 'hop-1' }]))
    await escalateChecklistAction('tab-token-123', {
      projectId: 'proj-1',
      checklistLabel: 'Test Checklist',
    })
    expect(verifyMock).toHaveBeenCalledWith('tab-token-123')
  })

  it('rejects roles with no configured escalation target (e.g. super_admin)', async () => {
    verifyMock.mockResolvedValue({ userId: 'user-1', role: 'super_admin' })
    const res = await escalateChecklistAction(null, { projectId: 'proj-1', checklistLabel: 'Test Checklist' })
    expect(res.ok).toBe(false)
    expect(res.message).toMatch(/no escalation path/i)
    expect(notifyUserMock).not.toHaveBeenCalled()
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('notifies every user holding the target position, excluding the actor', async () => {
    selectMock
      .mockReturnValueOnce(projectQuery({ name: 'Test Project' }))
      .mockReturnValueOnce(usersQuery([{ id: 'hop-1' }, { id: 'hop-2' }]))

    const res = await escalateChecklistAction(null, {
      projectId: 'proj-1',
      checklistLabel: 'Materials / Accessories Readiness Form',
      reason: 'Missing signature',
    })

    expect(res.ok).toBe(true)
    expect(notifyUserMock).toHaveBeenCalledTimes(2)
    expect(notifyUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'hop-1',
        actorId: 'user-1',
        type: 'escalation',
        projectId: 'proj-1',
        body: 'Missing signature',
      }),
    )
  })

  it('returns an error when no one currently holds the target position', async () => {
    selectMock
      .mockReturnValueOnce(projectQuery({ name: 'Test Project' }))
      .mockReturnValueOnce(usersQuery([]))

    const res = await escalateChecklistAction(null, { projectId: 'proj-1', checklistLabel: 'Test' })

    expect(res.ok).toBe(false)
    expect(res.message).toMatch(/no one currently holds/i)
    expect(notifyUserMock).not.toHaveBeenCalled()
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('returns an error when the project does not exist', async () => {
    selectMock.mockReturnValueOnce(projectQuery(undefined))

    const res = await escalateChecklistAction(null, { projectId: 'missing', checklistLabel: 'Test' })

    expect(res.ok).toBe(false)
    expect(res.message).toMatch(/project not found/i)
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('inserts exactly one step_escalations row carrying project/step/checklist/reason/targetPosition, and still fans out one notification per recipient', async () => {
    selectMock
      .mockReturnValueOnce(projectQuery({ name: 'Test Project' }))
      .mockReturnValueOnce(usersQuery([{ id: 'hop-1' }]))

    const res = await escalateChecklistAction('tab-token', {
      projectId: 'proj-1',
      checklistLabel: 'Delivery Project Checklist',
      reason: 'Missing photos',
      checklistSlug: 'delivery_project',
      stepN: 5,
    })

    expect(res.ok).toBe(true)
    expect(insertMock).toHaveBeenCalledOnce()
    expect(insertValuesMock).toHaveBeenCalledOnce()
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj-1',
        stepN: 5,
        checklistSlug: 'delivery_project',
        checklistLabel: 'Delivery Project Checklist',
        reason: 'Missing photos',
        targetPosition: 'head_of_projects',
        createdBy: 'user-1',
      }),
    )
    expect(notifyUserMock).toHaveBeenCalledTimes(1)
  })

  it('writes no step_escalations row when no one holds the target position (unroutable escalation)', async () => {
    selectMock
      .mockReturnValueOnce(projectQuery({ name: 'Test Project' }))
      .mockReturnValueOnce(usersQuery([]))

    await escalateChecklistAction(null, {
      projectId: 'proj-1',
      checklistLabel: 'Test',
      checklistSlug: 'delivery_project',
      stepN: 5,
    })

    expect(insertMock).not.toHaveBeenCalled()
    expect(insertValuesMock).not.toHaveBeenCalled()
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { LIVE_WORKFLOW_STEPS } from '@/db/workflow-live-steps'

// Rows shaped like workflowStepDefinitions.$inferSelect, derived from the
// canonical LIVE_WORKFLOW_STEPS array — feeds getLiveWorkflowSteps()'s .orderBy()
// query (advanceProjectStep now resolves steps via the live graph, plan 17-02).
const liveStepDefRows = LIVE_WORKFLOW_STEPS.map((s) => ({
  id: `stepdef-${s.n}`,
  graph: 'live',
  stepKey: s.key,
  label: s.label,
  role: s.role,
  fulfillmentKind: s.kind,
  checklistSlug: s.slug ?? null,
  targetRole: null,
  isOptional: false,
  orderIndex: s.n,
}))

// step 17 (materials_readiness) patched with dualRoles for confirmDualRoleStepAs
// coverage — dualRoles lives on the DB row, not the static LIVE_WORKFLOW_STEPS seed.
const dualRoleStepDefRows = liveStepDefRows.map((r) =>
  r.stepKey === 'materials_readiness' ? { ...r, dualRoles: ['factory_pm', 'site_pm'] } : r,
)

const {
  dbMock,
  verifyMock,
  selectLimitMock,
  selectOrderByMock,
  insertValuesMock,
  setMock,
  updateWhereMock,
  workflowStepStatesInsertMock,
  onConflictDoUpdateMock,
  returningMock,
} = vi.hoisted(() => {
  const selectLimitMock = vi.fn()
  const selectOrderByMock = vi.fn()
  const insertValuesMock = vi.fn()
  const updateWhereMock = vi.fn()
  const setMock = vi.fn(() => ({ where: updateWhereMock }))
  const returningMock = vi.fn()
  const onConflictDoUpdateMock = vi.fn((_opts: { target: unknown[]; set: Record<string, unknown> }) => ({
    returning: returningMock,
  }))
  const workflowStepStatesInsertMock = vi.fn(() => ({ onConflictDoUpdate: onConflictDoUpdateMock }))
  const dbMock = {
    select: () => ({
      from: () => ({
        where: () => ({ limit: selectLimitMock, orderBy: selectOrderByMock }),
      }),
    }),
    // NOTE: identity comparison against the top-level `workflowStepStates`
    // import doesn't work here — vi.resetModules() (beforeEach) makes
    // '@/actions/workflow' re-import a FRESH '@/db/schema' module instance
    // each test, so the table object it passes to db.insert() is never
    // === our stale top-level binding. `confirmedRoles` is a column unique
    // to workflowStepStates among this file's insert targets, so a
    // structural check is stable across module reloads.
    insert: (table: unknown) =>
      table && typeof table === 'object' && 'confirmedRoles' in table
        ? { values: workflowStepStatesInsertMock }
        : { values: insertValuesMock },
    update: () => ({ set: setMock }),
  }
  return {
    dbMock,
    verifyMock: vi.fn(),
    selectLimitMock,
    selectOrderByMock,
    insertValuesMock,
    setMock,
    updateWhereMock,
    workflowStepStatesInsertMock,
    onConflictDoUpdateMock,
    returningMock,
  }
})

vi.mock('server-only', () => ({}))
vi.mock('@/db', () => ({ db: dbMock }))
vi.mock('@/lib/dal', () => ({ verifySession: verifyMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// Quick task 260716-h0i: partial mock — getLiveWorkflowSteps stays wired to
// the real implementation (it reads through dbMock's orderBy chain, which
// the rest of this file already depends on for its LIVE_WORKFLOW_STEPS-based
// fixtures) while assigneeGatedRole/getStepAssigneeGate are replaced with
// controllable test doubles.
const { assigneeGatedRoleMock, getStepAssigneeGateMock } = vi.hoisted(() => ({
  assigneeGatedRoleMock: vi.fn(),
  getStepAssigneeGateMock: vi.fn(),
}))
vi.mock('@/lib/workflow-graph', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/workflow-graph')>()
  return {
    ...actual,
    assigneeGatedRole: assigneeGatedRoleMock,
    getStepAssigneeGate: getStepAssigneeGateMock,
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  insertValuesMock.mockResolvedValue(undefined)
  updateWhereMock.mockResolvedValue(undefined)
  selectOrderByMock.mockResolvedValue(liveStepDefRows)
  returningMock.mockResolvedValue([{ confirmedRoles: [] }])
  // Default: no assignee gate applies (matches the existing tests' role/step
  // combos, none of which are gated).
  assigneeGatedRoleMock.mockReturnValue(null)
  getStepAssigneeGateMock.mockResolvedValue(null)
})

describe('advanceProjectStep', () => {
  it('advances when the project is at the expected step and the role can act', async () => {
    verifyMock.mockResolvedValue({ userId: 'u1', role: 'design' })
    // step 2 = assign_designer_brief (design)
    selectLimitMock.mockResolvedValue([{ id: 'p1', currentStep: 2, status: 'not_delivered' }])

    const { advanceProjectStep } = await import('@/actions/workflow')
    const ok = await advanceProjectStep({ projectId: 'p1', expectedStepN: 2 })

    expect(ok).toBe(true)
    expect(insertValuesMock).toHaveBeenCalledOnce()
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ currentStep: 3, status: 'not_delivered' }),
    )
  })

  it('is a no-op when the project is no longer at the expected step (idempotent)', async () => {
    verifyMock.mockResolvedValue({ userId: 'u1', role: 'design' })
    selectLimitMock.mockResolvedValue([{ id: 'p1', currentStep: 5, status: 'not_delivered' }])

    const { advanceProjectStep } = await import('@/actions/workflow')
    const ok = await advanceProjectStep({ projectId: 'p1', expectedStepN: 2 })

    expect(ok).toBe(false)
    expect(insertValuesMock).not.toHaveBeenCalled()
    expect(setMock).not.toHaveBeenCalled()
  })

  it('refuses when the caller role cannot act on the step', async () => {
    // step 2 (assign_designer_brief) belongs to design; a factory_pm must be refused
    verifyMock.mockResolvedValue({ userId: 'f1', role: 'factory_pm' })
    selectLimitMock.mockResolvedValue([{ id: 'p1', currentStep: 2, status: 'not_delivered' }])

    const { advanceProjectStep } = await import('@/actions/workflow')
    const ok = await advanceProjectStep({ projectId: 'p1', expectedStepN: 2 })

    expect(ok).toBe(false)
    expect(insertValuesMock).not.toHaveBeenCalled()
  })

  it('Installation Process (step 20) advances to Sign Off (21) but is NOT yet delivered', async () => {
    // step 20 = installation_process (site_pm); delivery only happens after Sign Off (REQ-G04).
    // quick task 260714-qe4: 22 -> 21 live steps — installation_readiness
    // removed, sorting+close_out merged into installation_process (20),
    // sign_off (21) is now site_pm (was super_admin) — see
    // scripts/migrate-workflow-restructure-batch2.ts.
    verifyMock.mockResolvedValue({ userId: 'u1', role: 'site_pm' })
    selectLimitMock.mockResolvedValue([{ id: 'p1', currentStep: 20, status: 'not_delivered' }])

    const { advanceProjectStep } = await import('@/actions/workflow')
    const ok = await advanceProjectStep({ projectId: 'p1', expectedStepN: 20 })

    expect(ok).toBe(true)
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ currentStep: 21, status: 'not_delivered' }),
    )
  })

  it('marks the project delivered after Sign Off (step 21) completes', async () => {
    // step 21 = sign_off (site_pm, quick task 260714-qe4 — was super_admin) — the final step
    verifyMock.mockResolvedValue({ userId: 'sp1', role: 'site_pm' })
    selectLimitMock.mockResolvedValue([{ id: 'p1', currentStep: 21, status: 'not_delivered' }])

    const { advanceProjectStep } = await import('@/actions/workflow')
    const ok = await advanceProjectStep({ projectId: 'p1', expectedStepN: 21 })

    expect(ok).toBe(true)
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ currentStep: 22, status: 'delivered' }),
    )
  })

  it('returns false when the project does not exist', async () => {
    verifyMock.mockResolvedValue({ userId: 'u1', role: 'site_pm' })
    selectLimitMock.mockResolvedValue([])

    const { advanceProjectStep } = await import('@/actions/workflow')
    const ok = await advanceProjectStep({ projectId: 'missing', expectedStepN: 2 })

    expect(ok).toBe(false)
  })

  // Quick task 260716-h0i: real server-side assignee-gate enforcement.
  describe('assignee gate (quick task 260716-h0i)', () => {
    it('allows the assigned site_pm on a gated step', async () => {
      // step 20 = installation_process (site_pm)
      verifyMock.mockResolvedValue({ userId: 's1', role: 'site_pm' })
      selectLimitMock.mockResolvedValue([{ id: 'p1', currentStep: 20, status: 'not_delivered' }])
      assigneeGatedRoleMock.mockReturnValue('site_pm')
      getStepAssigneeGateMock.mockResolvedValue('s1')

      const { advanceProjectStep } = await import('@/actions/workflow')
      const ok = await advanceProjectStep({ projectId: 'p1', expectedStepN: 20 })

      expect(ok).toBe(true)
      expect(insertValuesMock).toHaveBeenCalledOnce()
      expect(getStepAssigneeGateMock).toHaveBeenCalledWith('live', 'p1', 'installation_process')
    })

    it('rejects an unassigned site_pm on a gated step, before any DB write', async () => {
      verifyMock.mockResolvedValue({ userId: 's2', role: 'site_pm' })
      selectLimitMock.mockResolvedValue([{ id: 'p1', currentStep: 20, status: 'not_delivered' }])
      assigneeGatedRoleMock.mockReturnValue('site_pm')
      // Gate is held by a DIFFERENT user ('s1') than the caller ('s2').
      getStepAssigneeGateMock.mockResolvedValue('s1')

      const { advanceProjectStep } = await import('@/actions/workflow')
      const ok = await advanceProjectStep({ projectId: 'p1', expectedStepN: 20 })

      expect(ok).toBe(false)
      expect(insertValuesMock).not.toHaveBeenCalled()
    })
  })
})

describe('confirmDualRoleStepAs', () => {
  // step 17 = materials_readiness (factory_pm primary, dualRoles [factory_pm, site_pm])
  beforeEach(() => {
    selectOrderByMock.mockResolvedValue(dualRoleStepDefRows)
    selectLimitMock.mockResolvedValue([{ id: 'p1', currentStep: 17, status: 'not_delivered' }])
  })

  it('records the first confirmation atomically without advancing', async () => {
    returningMock.mockResolvedValue([{ confirmedRoles: ['factory_pm'] }])

    const { confirmDualRoleStepAs } = await import('@/actions/workflow')
    const res = await confirmDualRoleStepAs({
      projectId: 'p1',
      expectedStepN: 17,
      userId: 'f1',
      role: 'factory_pm',
    })

    expect(res).toEqual({
      ok: true,
      advanced: false,
      message: 'Your confirmation was recorded — waiting on the other role.',
    })
    expect(workflowStepStatesInsertMock).toHaveBeenCalledOnce()
    expect(onConflictDoUpdateMock).toHaveBeenCalledOnce()
    const { set } = onConflictDoUpdateMock.mock.calls[0][0]
    // The set.confirmedRoles must be a Drizzle SQL fragment (array_append CASE
    // expression), not a plain JS array — that's the atomicity guarantee.
    expect(Array.isArray(set.confirmedRoles)).toBe(false)
    expect(set.confirmedRoles).toHaveProperty('queryChunks')
    expect(setMock).not.toHaveBeenCalled()
  })

  it('advances the project on the second (completing) confirmation', async () => {
    returningMock.mockResolvedValue([{ confirmedRoles: ['factory_pm', 'site_pm'] }])

    const { confirmDualRoleStepAs } = await import('@/actions/workflow')
    const res = await confirmDualRoleStepAs({
      projectId: 'p1',
      expectedStepN: 17,
      userId: 's1',
      role: 'site_pm',
    })

    expect(res.ok).toBe(true)
    expect(res.advanced).toBe(true)
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ currentStep: 18, status: 'not_delivered' }),
    )
  })

  it('rejects a role not in the step dualRoles before any write', async () => {
    const { confirmDualRoleStepAs } = await import('@/actions/workflow')
    const res = await confirmDualRoleStepAs({
      projectId: 'p1',
      expectedStepN: 17,
      userId: 'd1',
      role: 'design',
    })

    expect(res).toEqual({ ok: false, advanced: false, message: 'Not your step.' })
    expect(workflowStepStatesInsertMock).not.toHaveBeenCalled()
    expect(insertValuesMock).not.toHaveBeenCalled()
  })

  // Quick task 260716-h0i: real server-side assignee-gate enforcement on the
  // dual-role materials_readiness step's site_pm party.
  describe('assignee gate (quick task 260716-h0i)', () => {
    it('allows the assigned site_pm to confirm their half of materials_readiness', async () => {
      returningMock.mockResolvedValue([{ confirmedRoles: ['site_pm'] }])
      assigneeGatedRoleMock.mockReturnValue('site_pm')
      getStepAssigneeGateMock.mockResolvedValue('s1')

      const { confirmDualRoleStepAs } = await import('@/actions/workflow')
      const res = await confirmDualRoleStepAs({
        projectId: 'p1',
        expectedStepN: 17,
        userId: 's1',
        role: 'site_pm',
      })

      expect(res.ok).toBe(true)
      expect(workflowStepStatesInsertMock).toHaveBeenCalledOnce()
      expect(getStepAssigneeGateMock).toHaveBeenCalledWith('live', 'p1', 'materials_readiness')
    })

    it('rejects an unassigned site_pm on materials_readiness, before any write', async () => {
      assigneeGatedRoleMock.mockReturnValue('site_pm')
      // Gate is held by a DIFFERENT user ('s1') than the caller ('s2').
      getStepAssigneeGateMock.mockResolvedValue('s1')

      const { confirmDualRoleStepAs } = await import('@/actions/workflow')
      const res = await confirmDualRoleStepAs({
        projectId: 'p1',
        expectedStepN: 17,
        userId: 's2',
        role: 'site_pm',
      })

      expect(res).toEqual({
        ok: false,
        advanced: false,
        message: 'This step is assigned to a specific Site PM for this project.',
      })
      expect(workflowStepStatesInsertMock).not.toHaveBeenCalled()
      expect(insertValuesMock).not.toHaveBeenCalled()
    })

    it('DUAL-ROLE SAFETY: a factory_pm confirming their own half of materials_readiness is unaffected by the site_pm gate', async () => {
      returningMock.mockResolvedValue([{ confirmedRoles: ['factory_pm'] }])
      // The step IS site_pm-gated, but the caller's role ('factory_pm')
      // never matches assigneeGatedRole('materials_readiness') ('site_pm'),
      // so confirmDualRoleStepAs must never even consult the gate — even
      // though, if it did, getStepAssigneeGateMock would resolve a userId
      // that differs from the caller and would otherwise reject them.
      assigneeGatedRoleMock.mockReturnValue('site_pm')
      getStepAssigneeGateMock.mockResolvedValue('some-other-site-pm-id')

      const { confirmDualRoleStepAs } = await import('@/actions/workflow')
      const res = await confirmDualRoleStepAs({
        projectId: 'p1',
        expectedStepN: 17,
        userId: 'f1',
        role: 'factory_pm',
      })

      expect(res.ok).toBe(true)
      expect(workflowStepStatesInsertMock).toHaveBeenCalledOnce()
      expect(getStepAssigneeGateMock).not.toHaveBeenCalled()
    })
  })
})

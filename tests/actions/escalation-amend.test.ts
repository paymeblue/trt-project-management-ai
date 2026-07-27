import { describe, it, expect, beforeEach, vi } from 'vitest'

// Query-result stub: chainable no matter how many .from()/.where()/.orderBy()/
// .limit() calls the action code makes, and awaitable (thenable) to resolve
// to `rows` at the end of the chain — lets this one helper stand in for every
// shape of select the action performs (mirrors tests/actions/readiness.test.ts's
// hoisted-mock pattern, extended for select-heavy code).
function rowsQuery(rows: unknown[]) {
  const query: {
    from: () => typeof query
    where: () => typeof query
    orderBy: () => typeof query
    limit: () => typeof query
    then: (resolve: (v: unknown[]) => void) => void
  } = {
    from: () => query,
    where: () => query,
    orderBy: () => query,
    limit: () => query,
    then: (resolve) => resolve(rows),
  }
  return query
}

const {
  verifyMock,
  selectMock,
  insertMock,
  insertValuesMock,
  insertReturningMock,
  updateMock,
  updateSetMock,
  updateWhereMock,
} = vi.hoisted(() => {
  const insertReturningMock = vi.fn()
  const insertValuesMock = vi.fn()
  const insertMock = vi.fn()
  const updateWhereMock = vi.fn()
  const updateSetMock = vi.fn()
  const updateMock = vi.fn()
  return {
    verifyMock: vi.fn(),
    selectMock: vi.fn(),
    insertMock,
    insertValuesMock,
    insertReturningMock,
    updateMock,
    updateSetMock,
    updateWhereMock,
  }
})

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/dal', () => ({ verifySession: verifyMock, verifySessionForAction: verifyMock }))
vi.mock('@/lib/notifications', () => ({ notifyUser: vi.fn() }))
vi.mock('@/db', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    insert: (...args: unknown[]) => insertMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
  },
}))

const { amendEscalatedChecklistAction, loadEscalationPanelData } = await import('@/actions/escalation')

const ESCALATION = {
  id: 'esc-1',
  projectId: 'proj-1',
  stepN: 5,
  checklistSlug: 'delivery_project',
  checklistLabel: 'Delivery Project Checklist',
  reason: 'Missing photos',
  targetPosition: 'head_of_projects',
  createdBy: 'officer-1',
  createdAt: new Date('2026-01-01'),
}

const DEFINITION = { id: 'def-1', slug: 'delivery_project', name: 'Delivery Project Checklist', targetRole: 'site_pm', isActive: true }

const ITEMS = [
  { id: 'item-1', definitionId: 'def-1', step: 1, sectionTitle: null, sortOrder: 0, label: 'Boxes counted', itemType: 'radio', responseOptions: 'yes_no', isPhotoAllowed: true, isPhotoRequired: false, helpText: null, isActive: true },
  { id: 'item-2', definitionId: 'def-1', step: 1, sectionTitle: null, sortOrder: 1, label: 'Signature obtained', itemType: 'radio', responseOptions: 'yes_no', isPhotoAllowed: true, isPhotoRequired: false, helpText: null, isActive: true },
]

const EXISTING_CHECKLIST = {
  id: 'checklist-1',
  definitionId: 'def-1',
  projectId: 'proj-1',
  createdBy: 'officer-1',
  status: 'submitted',
  submittedAt: new Date('2026-01-01'),
  photoData: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  amendedBy: null,
  amendedAt: null,
}

// Quick task 260727-ibr: variant carrying existing evidence photos, for the
// append-only photo-persistence test block below.
const EXISTING_CHECKLIST_WITH_PHOTOS = {
  ...EXISTING_CHECKLIST,
  photoData: ['data:image/jpeg;base64,OLD'],
}

const EXISTING_RESPONSES = [
  { id: 'resp-1', checklistId: 'checklist-1', templateItemId: 'item-1', value: 'yes', textValue: null, notes: null, createdAt: new Date(), updatedAt: new Date() },
]

function insertResultWithReturning(rows: unknown[]) {
  return { returning: insertReturningMock.mockReturnValue(Promise.resolve(rows)) }
}

beforeEach(() => {
  vi.clearAllMocks()
  verifyMock.mockResolvedValue({ userId: 'officer-1', role: 'site_pm', position: 'head_of_projects' })
  insertMock.mockReturnValue({ values: insertValuesMock })
  insertValuesMock.mockReturnValue(Promise.resolve(undefined))
  updateMock.mockReturnValue({ set: updateSetMock })
  updateSetMock.mockImplementation((fields: unknown) => ({
    where: (...args: unknown[]) => updateWhereMock(fields, ...args),
  }))
  updateWhereMock.mockReturnValue(Promise.resolve(undefined))
})

describe('amendEscalatedChecklistAction — authorization', () => {
  it('allows an admin caller (super_admin) with a mismatched/absent position', async () => {
    verifyMock.mockResolvedValue({ userId: 'admin-1', role: 'super_admin' })
    selectMock
      .mockReturnValueOnce(rowsQuery([ESCALATION])) // step_escalations lookup
      .mockReturnValueOnce(rowsQuery([{ position: null }])) // fresh users.position
      .mockReturnValueOnce(rowsQuery([DEFINITION])) // checklistDefinitions
      .mockReturnValueOnce(rowsQuery(ITEMS)) // active template items
      .mockReturnValueOnce(rowsQuery([])) // no prior submission -> create path
    insertMock.mockReturnValueOnce({ values: () => insertResultWithReturning([{ id: 'new-checklist-1' }]) })

    const res = await amendEscalatedChecklistAction(null, {
      escalationId: 'esc-1',
      answers: { 'item-1': { value: 'yes' } },
    })
    expect(res.ok).toBe(true)
  })

  it('allows a non-admin caller whose FRESH users.position equals the escalation targetPosition', async () => {
    verifyMock.mockResolvedValue({ userId: 'site-pm-1', role: 'site_pm' })
    selectMock
      .mockReturnValueOnce(rowsQuery([ESCALATION]))
      .mockReturnValueOnce(rowsQuery([{ position: 'head_of_projects' }]))
      .mockReturnValueOnce(rowsQuery([DEFINITION]))
      .mockReturnValueOnce(rowsQuery(ITEMS))
      .mockReturnValueOnce(rowsQuery([]))
    insertMock.mockReturnValueOnce({ values: () => insertResultWithReturning([{ id: 'new-checklist-2' }]) })

    const res = await amendEscalatedChecklistAction(null, {
      escalationId: 'esc-1',
      answers: {},
    })
    expect(res.ok).toBe(true)
  })

  it('rejects a non-admin caller with a different position, performs zero writes', async () => {
    verifyMock.mockResolvedValue({ userId: 'someone-else', role: 'design' })
    selectMock
      .mockReturnValueOnce(rowsQuery([ESCALATION]))
      .mockReturnValueOnce(rowsQuery([{ position: 'head_of_design' }]))

    const res = await amendEscalatedChecklistAction(null, {
      escalationId: 'esc-1',
      answers: { 'item-1': { value: 'no' } },
    })

    expect(res.ok).toBe(false)
    expect(insertMock).not.toHaveBeenCalled()
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('reads position from the db, not from the session, even when the session carries a position-like field', async () => {
    // The session mock resolves with a `position` field ('head_of_projects')
    // that would pass authorization if trusted — but the fresh DB read below
    // returns a DIFFERENT position, and that must be what's actually used.
    verifyMock.mockResolvedValue({ userId: 'someone-else', role: 'design', position: 'head_of_projects' })
    selectMock
      .mockReturnValueOnce(rowsQuery([ESCALATION]))
      .mockReturnValueOnce(rowsQuery([{ position: 'head_of_design' }]))

    const res = await amendEscalatedChecklistAction(null, {
      escalationId: 'esc-1',
      answers: {},
    })

    expect(res.ok).toBe(false)
    // Asserts the users lookup (2nd select call) actually happened.
    expect(selectMock).toHaveBeenCalledTimes(2)
    expect(insertMock).not.toHaveBeenCalled()
    expect(updateMock).not.toHaveBeenCalled()
  })
})

describe('amendEscalatedChecklistAction — upsert paths', () => {
  it('amend path: updates existing responses in place (no new checklists row), and marks amendedBy/amendedAt', async () => {
    selectMock
      .mockReturnValueOnce(rowsQuery([ESCALATION]))
      .mockReturnValueOnce(rowsQuery([{ position: 'head_of_projects' }]))
      .mockReturnValueOnce(rowsQuery([DEFINITION]))
      .mockReturnValueOnce(rowsQuery(ITEMS))
      .mockReturnValueOnce(rowsQuery([EXISTING_CHECKLIST])) // prior submission found
      .mockReturnValueOnce(rowsQuery(EXISTING_RESPONSES)) // existing responses

    const res = await amendEscalatedChecklistAction('tab-token', {
      escalationId: 'esc-1',
      answers: {
        'item-1': { value: 'no', notes: 'corrected' }, // existing response -> UPDATE
        'item-2': { value: 'yes' }, // no existing response -> INSERT
      },
    })

    expect(res.ok).toBe(true)
    // item-1 had a prior response -> UPDATEd, not re-inserted. item-2 had no
    // prior response row -> exactly one checklistResponses INSERT (the only
    // insert in the amend path — no new `checklists` row is ever inserted).
    expect(insertMock).toHaveBeenCalledOnce()
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ checklistId: 'checklist-1', templateItemId: 'item-2' }),
    )
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ amendedBy: 'officer-1', amendedAt: expect.any(Date) }),
    )
  })

  it('create-from-blank path: no prior submission inserts one checklists row + one response per active item', async () => {
    selectMock
      .mockReturnValueOnce(rowsQuery([ESCALATION]))
      .mockReturnValueOnce(rowsQuery([{ position: 'head_of_projects' }]))
      .mockReturnValueOnce(rowsQuery([DEFINITION]))
      .mockReturnValueOnce(rowsQuery(ITEMS))
      .mockReturnValueOnce(rowsQuery([])) // no prior submission
    insertMock.mockReturnValueOnce({
      values: (fields: unknown) => {
        insertValuesMock(fields)
        return insertResultWithReturning([{ id: 'new-checklist-3' }])
      },
    })

    const res = await amendEscalatedChecklistAction(null, {
      escalationId: 'esc-1',
      answers: {
        'item-1': { value: 'yes' },
        'item-2': { value: 'no' },
        'unknown-item-id': { value: 'yes' }, // must be discarded (T-gow-03)
      },
    })

    expect(res.ok).toBe(true)
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        definitionId: 'def-1',
        projectId: 'proj-1',
        createdBy: 'officer-1',
        status: 'submitted',
        amendedBy: 'officer-1',
        amendedAt: expect.any(Date),
      }),
    )
    // 2 active items -> 2 checklistResponses inserts (unknown-item-id discarded).
    expect(insertMock).toHaveBeenCalledTimes(1 + ITEMS.length)
  })

  it('returns an error for an unknown escalation id, performs zero writes', async () => {
    selectMock.mockReturnValueOnce(rowsQuery([])) // step_escalations lookup: not found

    const res = await amendEscalatedChecklistAction(null, {
      escalationId: 'does-not-exist',
      answers: {},
    })

    expect(res.ok).toBe(false)
    expect(insertMock).not.toHaveBeenCalled()
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('returns a "nothing to edit" error for an escalation with a null checklistSlug', async () => {
    selectMock
      .mockReturnValueOnce(rowsQuery([{ ...ESCALATION, checklistSlug: null }]))
      .mockReturnValueOnce(rowsQuery([{ position: 'head_of_projects' }]))

    const res = await amendEscalatedChecklistAction(null, {
      escalationId: 'esc-1',
      answers: {},
    })

    expect(res.ok).toBe(false)
    expect(res.message).toMatch(/no editable checklist content/i)
    expect(insertMock).not.toHaveBeenCalled()
    expect(updateMock).not.toHaveBeenCalled()
  })
})

describe('amendEscalatedChecklistAction — append-only photo persistence (260727-ibr)', () => {
  it('amend path with existing photos + newPhotos: appends, existing entries stay first, length + 1', async () => {
    selectMock
      .mockReturnValueOnce(rowsQuery([ESCALATION]))
      .mockReturnValueOnce(rowsQuery([{ position: 'head_of_projects' }]))
      .mockReturnValueOnce(rowsQuery([DEFINITION]))
      .mockReturnValueOnce(rowsQuery(ITEMS))
      .mockReturnValueOnce(rowsQuery([EXISTING_CHECKLIST_WITH_PHOTOS]))
      .mockReturnValueOnce(rowsQuery(EXISTING_RESPONSES))

    const res = await amendEscalatedChecklistAction(null, {
      escalationId: 'esc-1',
      answers: {},
      newPhotos: ['data:image/jpeg;base64,NEW'],
    })

    expect(res.ok).toBe(true)
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        photoData: ['data:image/jpeg;base64,OLD', 'data:image/jpeg;base64,NEW'],
      }),
    )
    const call = updateSetMock.mock.calls.find((c) => 'photoData' in (c[0] as object))
    expect((call?.[0] as { photoData: string[] }).photoData).toHaveLength(2)
    expect((call?.[0] as { photoData: string[] }).photoData[0]).toBe('data:image/jpeg;base64,OLD')
  })

  it('amend path with newPhotos omitted: update payload has no photoData key at all', async () => {
    selectMock
      .mockReturnValueOnce(rowsQuery([ESCALATION]))
      .mockReturnValueOnce(rowsQuery([{ position: 'head_of_projects' }]))
      .mockReturnValueOnce(rowsQuery([DEFINITION]))
      .mockReturnValueOnce(rowsQuery(ITEMS))
      .mockReturnValueOnce(rowsQuery([EXISTING_CHECKLIST_WITH_PHOTOS]))
      .mockReturnValueOnce(rowsQuery(EXISTING_RESPONSES))

    const res = await amendEscalatedChecklistAction(null, {
      escalationId: 'esc-1',
      answers: {},
    })

    expect(res.ok).toBe(true)
    const checklistUpdateCall = updateSetMock.mock.calls.find((c) =>
      Object.prototype.hasOwnProperty.call(c[0] as object, 'amendedBy'),
    )
    expect(checklistUpdateCall?.[0]).not.toHaveProperty('photoData')
  })

  it('amend path with newPhotos: [] (explicit empty array) also omits the photoData key', async () => {
    selectMock
      .mockReturnValueOnce(rowsQuery([ESCALATION]))
      .mockReturnValueOnce(rowsQuery([{ position: 'head_of_projects' }]))
      .mockReturnValueOnce(rowsQuery([DEFINITION]))
      .mockReturnValueOnce(rowsQuery(ITEMS))
      .mockReturnValueOnce(rowsQuery([EXISTING_CHECKLIST_WITH_PHOTOS]))
      .mockReturnValueOnce(rowsQuery(EXISTING_RESPONSES))

    const res = await amendEscalatedChecklistAction(null, {
      escalationId: 'esc-1',
      answers: {},
      newPhotos: [],
    })

    expect(res.ok).toBe(true)
    const checklistUpdateCall = updateSetMock.mock.calls.find((c) =>
      Object.prototype.hasOwnProperty.call(c[0] as object, 'amendedBy'),
    )
    expect(checklistUpdateCall?.[0]).not.toHaveProperty('photoData')
  })

  it('amend path where existing.photoData is null and one new photo is supplied: becomes a one-element array', async () => {
    selectMock
      .mockReturnValueOnce(rowsQuery([ESCALATION]))
      .mockReturnValueOnce(rowsQuery([{ position: 'head_of_projects' }]))
      .mockReturnValueOnce(rowsQuery([DEFINITION]))
      .mockReturnValueOnce(rowsQuery(ITEMS))
      .mockReturnValueOnce(rowsQuery([EXISTING_CHECKLIST])) // photoData: null
      .mockReturnValueOnce(rowsQuery(EXISTING_RESPONSES))

    const res = await amendEscalatedChecklistAction(null, {
      escalationId: 'esc-1',
      answers: {},
      newPhotos: ['data:image/jpeg;base64,FIRST'],
    })

    expect(res.ok).toBe(true)
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ photoData: ['data:image/jpeg;base64,FIRST'] }),
    )
  })

  it('create-from-blank path with new photos: inserted checklists row carries photoData = the new photos', async () => {
    selectMock
      .mockReturnValueOnce(rowsQuery([ESCALATION]))
      .mockReturnValueOnce(rowsQuery([{ position: 'head_of_projects' }]))
      .mockReturnValueOnce(rowsQuery([DEFINITION]))
      .mockReturnValueOnce(rowsQuery(ITEMS))
      .mockReturnValueOnce(rowsQuery([])) // no prior submission
    insertMock.mockReturnValueOnce({
      values: (fields: unknown) => {
        insertValuesMock(fields)
        return insertResultWithReturning([{ id: 'new-checklist-photo-1' }])
      },
    })

    const res = await amendEscalatedChecklistAction(null, {
      escalationId: 'esc-1',
      answers: {},
      newPhotos: ['data:image/jpeg;base64,BLANK1'],
    })

    expect(res.ok).toBe(true)
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ photoData: ['data:image/jpeg;base64,BLANK1'] }),
    )
  })

  it('create-from-blank path with no new photos: photoData stays null', async () => {
    selectMock
      .mockReturnValueOnce(rowsQuery([ESCALATION]))
      .mockReturnValueOnce(rowsQuery([{ position: 'head_of_projects' }]))
      .mockReturnValueOnce(rowsQuery([DEFINITION]))
      .mockReturnValueOnce(rowsQuery(ITEMS))
      .mockReturnValueOnce(rowsQuery([]))
    insertMock.mockReturnValueOnce({
      values: (fields: unknown) => {
        insertValuesMock(fields)
        return insertResultWithReturning([{ id: 'new-checklist-photo-2' }])
      },
    })

    const res = await amendEscalatedChecklistAction(null, {
      escalationId: 'esc-1',
      answers: {},
    })

    expect(res.ok).toBe(true)
    expect(insertValuesMock).toHaveBeenCalledWith(expect.objectContaining({ photoData: null }))
  })

  it('rejects a new photo exceeding MAX_PHOTO_DATA with zero writes', async () => {
    selectMock
      .mockReturnValueOnce(rowsQuery([ESCALATION]))
      .mockReturnValueOnce(rowsQuery([{ position: 'head_of_projects' }]))
      .mockReturnValueOnce(rowsQuery([DEFINITION]))
      .mockReturnValueOnce(rowsQuery(ITEMS))

    const oversized = `data:image/jpeg;base64,${'A'.repeat(1_500_001)}`
    const res = await amendEscalatedChecklistAction(null, {
      escalationId: 'esc-1',
      answers: {},
      newPhotos: [oversized],
    })

    expect(res.ok).toBe(false)
    expect(res.message).toMatch(/too large/i)
    expect(insertMock).not.toHaveBeenCalled()
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('rejects more than MAX_AMEND_PHOTOS (6) new photos in one save with zero writes', async () => {
    selectMock
      .mockReturnValueOnce(rowsQuery([ESCALATION]))
      .mockReturnValueOnce(rowsQuery([{ position: 'head_of_projects' }]))
      .mockReturnValueOnce(rowsQuery([DEFINITION]))
      .mockReturnValueOnce(rowsQuery(ITEMS))

    const sevenPhotos = Array.from({ length: 7 }, (_, i) => `data:image/jpeg;base64,P${i}`)
    const res = await amendEscalatedChecklistAction(null, {
      escalationId: 'esc-1',
      answers: {},
      newPhotos: sevenPhotos,
    })

    expect(res.ok).toBe(false)
    expect(res.message).toMatch(/up to 6/i)
    expect(insertMock).not.toHaveBeenCalled()
    expect(updateMock).not.toHaveBeenCalled()
  })
})

describe('module boundary (D-02) — no workflow/step-completion coupling', () => {
  it('does not import completeGraphStep / advanceOrConfirmDualRole', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../../actions/escalation.ts', import.meta.url), 'utf8'),
    )
    expect(source).not.toMatch(/completeGraphStep|advanceOrConfirmDualRole/)
  })
})

describe('loadEscalationPanelData', () => {
  it('returns per-escalation viewer canAmend + template items + prefilled answers', async () => {
    selectMock
      .mockReturnValueOnce(rowsQuery([ESCALATION])) // stepEscalations for project
      .mockReturnValueOnce(rowsQuery([{ position: 'head_of_projects' }])) // viewer position, read once
      .mockReturnValueOnce(rowsQuery([DEFINITION]))
      .mockReturnValueOnce(rowsQuery(ITEMS))
      .mockReturnValueOnce(rowsQuery([EXISTING_CHECKLIST]))
      .mockReturnValueOnce(rowsQuery(EXISTING_RESPONSES))

    const rows = await loadEscalationPanelData('proj-1', 'viewer-1', 'site_pm')
    expect(rows).toHaveLength(1)
    expect(rows[0].canAmend).toBe(true)
    expect(rows[0].definitionName).toBe('Delivery Project Checklist')
    expect(rows[0].items).toHaveLength(2)
    expect(rows[0].hasSubmission).toBe(true)
    expect(rows[0].initialAnswers['item-1']).toEqual(
      expect.objectContaining({ value: 'yes' }),
    )
  })

  it('returns an empty array with no extra reads when the project has no escalations', async () => {
    selectMock.mockReturnValueOnce(rowsQuery([]))
    const rows = await loadEscalationPanelData('proj-1', 'viewer-1', 'site_pm')
    expect(rows).toEqual([])
    expect(selectMock).toHaveBeenCalledTimes(1)
  })
})

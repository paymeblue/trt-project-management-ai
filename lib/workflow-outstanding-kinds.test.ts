import { describe, it, expect } from 'vitest'
import { outstandingRequiredKinds, STATE_GATED_KINDS } from './workflow'

describe('outstandingRequiredKinds', () => {
  it('returns every state-gated required kind when nothing is fulfilled yet', () => {
    expect(
      outstandingRequiredKinds({ kind: 'yes_no_upload', additionalKinds: ['ack', 'readiness'] }, []),
    ).toEqual(['yes_no_upload', 'ack', 'readiness'])
  })

  it('drops kinds already present in fulfilledKinds', () => {
    expect(
      outstandingRequiredKinds(
        { kind: 'yes_no_upload', additionalKinds: ['ack', 'readiness'] },
        ['yes_no_upload'],
      ),
    ).toEqual(['ack', 'readiness'])
  })

  it('returns an empty array once every required kind is fulfilled', () => {
    expect(
      outstandingRequiredKinds(
        { kind: 'yes_no_upload', additionalKinds: ['ack', 'readiness'] },
        ['yes_no_upload', 'ack', 'readiness'],
      ),
    ).toEqual([])
  })

  it('treats null additionalKinds/fulfilledKinds as empty', () => {
    expect(outstandingRequiredKinds({ kind: 'yes_no_upload', additionalKinds: null }, null)).toEqual([
      'yes_no_upload',
    ])
  })

  it('excludes non-state-gated kinds (e.g. timeline_setting) from the result', () => {
    expect(
      outstandingRequiredKinds({ kind: 'timeline_setting', additionalKinds: ['yes_no_upload'] }, []),
    ).toEqual(['yes_no_upload'])
  })

  it('excludes payment_confirmation (not state-gated) once its sibling kind is fulfilled', () => {
    expect(
      outstandingRequiredKinds(
        { kind: 'yes_no_upload', additionalKinds: ['payment_confirmation'] },
        ['yes_no_upload'],
      ),
    ).toEqual([])
  })

  it('STATE_GATED_KINDS matches the engine gate exactly (guards against silent drift)', () => {
    expect(STATE_GATED_KINDS).toEqual(['yes_no_upload', 'approval', 'assignment', 'ack', 'readiness', 'checklist'])
  })
})

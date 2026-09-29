import { describe, expect, it } from 'vitest'
import { newRequest } from '../types'
import { createInitialSyncPayload } from './syncPayload'

describe('initial synchronization payload guardrail', () => {
  it('allows collection metadata without variable values or credentials', () => {
    const collection = { id: 'c1', schemaVersion: 1 as const, name: 'Safe', description: '', createdAt: 1 }
    expect(createInitialSyncPayload(collection)).toEqual(collection)
  })

  it('syncs request structure while stripping active authorization credentials', () => {
    const request = {
      ...newRequest(), auth: { type: 'bearer' as const, token: 'secret-token' },
      headers: [{ id: 'h1', key: 'Authorization', value: 'Basic hidden', enabled: true }, { id: 'h2', key: 'Accept', value: 'application/json', enabled: true }],
    }
    const payload = createInitialSyncPayload(request) as typeof request
    expect(payload.auth.token).toBe('')
    expect(payload.headers[0].value).toBe('')
    expect(payload.headers[1].value).toBe('application/json')
  })
})

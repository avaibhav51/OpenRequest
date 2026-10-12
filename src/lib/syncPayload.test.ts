import { describe, expect, it } from 'vitest'
import { newRequest } from '../types'
import { createInitialSyncPayload, mergeSyncedRequest, portableCredential } from './syncPayload'

describe('portable references and local secret retention', () => {
  it('keeps only placeholder configuration, never mixed literal secrets', () => {
    expect(portableCredential('{{accessToken}}')).toBe('{{accessToken}}')
    expect(portableCredential('Bearer {{accessToken}}')).toBe('Bearer {{accessToken}}')
    expect(portableCredential('{{prefix}}literal-secret')).toBe('')
    expect(portableCredential('secret')).toBe('')
  })
  it('merges matching local credentials without mutating either request', () => {
    const local = { ...newRequest(), auth: { type: 'bearer' as const, token: 'local-secret' }, headers: [{ id: 'h', key: 'X-API-Key', value: 'header-secret', enabled: true }] }
    const remote = createInitialSyncPayload(local) as typeof local
    expect(mergeSyncedRequest(remote, local)).toMatchObject({ auth: { token: 'local-secret' }, headers: [{ value: 'header-secret' }] })
    expect(remote.auth.token).toBe('')
    expect(mergeSyncedRequest({ ...remote, auth: { type: 'bearer', token: '{{newToken}}' } }, local).auth).toEqual({ type: 'bearer', token: '{{newToken}}' })
    expect(mergeSyncedRequest(remote).auth).toEqual({ type: 'bearer', token: '' })
  })
  it('does not reuse a password or API key for changed authorization identities', () => {
    const local = { ...newRequest(), auth: { type: 'basic' as const, username: 'a', password: 'secret' } }
    expect(mergeSyncedRequest({ ...local, auth: { type: 'basic', username: 'b', password: '' } }, local).auth).toEqual({ type: 'basic', username: 'b', password: '' })
    const api = { ...newRequest(), auth: { type: 'api-key' as const, key: 'old', location: 'header' as const, value: 'secret' } }
    expect(mergeSyncedRequest({ ...api, auth: { ...api.auth, key: 'new', value: '' } }, api).auth).toMatchObject({ value: '' })
  })
  it('does not attach a local literal token to a changed remote server origin', () => {
    const local = { ...newRequest(), url: 'https://original.example/path', auth: { type: 'bearer' as const, token: 'private' } }
    expect(mergeSyncedRequest({ ...local, url: 'https://another.example/path', auth: { type: 'bearer', token: '' } }, local).auth).toMatchObject({ token: '' })
    expect(mergeSyncedRequest({ ...local, url: 'https://original.example/new', auth: { type: 'bearer', token: '' } }, local).auth).toMatchObject({ token: 'private' })
  })
})

describe('initial synchronization payload guardrail', () => {
  it('allows collection metadata without variable values or credentials', () => {
    const collection = { id: 'c1', schemaVersion: 1 as const, name: 'Safe', description: '', createdAt: 1 }
    expect(createInitialSyncPayload(collection)).toEqual(collection)
  })

  it('syncs request structure while stripping active authorization credentials', () => {
    const request = {
      ...newRequest(), timeoutMs: 5000, auth: { type: 'bearer' as const, token: 'secret-token' },
      headers: [{ id: 'h1', key: 'Authorization', value: 'Basic hidden', enabled: true }, { id: 'h2', key: 'Accept', value: 'application/json', enabled: true }],
    }
    const payload = createInitialSyncPayload(request) as typeof request
    expect(payload.auth.token).toBe('')
    expect(payload.headers[0].value).toBe('')
    expect(payload.headers[1].value).toBe('application/json')
    expect(payload.timeoutMs).toBe(5000)
  })
})

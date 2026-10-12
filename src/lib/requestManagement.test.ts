import { describe, expect, it } from 'vitest'
import { newRequest } from '../types'
import { applySavedMetadata, detachDeletedRequest, duplicateSavedRequest, matchesRequest } from './requestManagement'

describe('saved request management', () => {
  it('searches names, URL, methods and collection names case-insensitively, not credentials/body', () => {
    const r = { ...newRequest(), name: 'Profile', url: 'https://api.test/users', method: 'POST' as const, body: 'do-not-search', auth: { type: 'bearer' as const, token: 'secret-token' } }
    for (const q of ['PROFILE', 'api.test', 'post', 'production', ' ']) expect(matchesRequest(r, q, 'Production')).toBe(true)
    expect(matchesRequest(r, 'secret-token')).toBe(false)
    expect(matchesRequest(r, 'do-not-search')).toBe(false)
  })
  it('duplicates the saved structure with independent identities and copy names', () => {
    const r = { ...newRequest(), name: 'Profile', timeoutMs: 5000, body: '{"original":true}' }
    const a = duplicateSavedRequest(r, [r], 10)
    const b = duplicateSavedRequest(r, [r, a], 11)
    expect(a.id).not.toBe(r.id)
    expect(a).toMatchObject({ name: 'Profile (copy)', body: r.body, timeoutMs: 5000, updatedAt: 10 })
    expect(b.name).toBe('Profile (copy 2)')
    a.headers[0].key = 'different'
    expect(r.headers[0].key).toBe('')
  })
  it('updates saved metadata without replacing live edits or independently edited metadata', () => {
    const r = { ...newRequest(), name: 'Saved', collectionId: 'one' }
    const next = { ...r, name: 'Renamed', collectionId: 'two', folderPath: [], updatedAt: 99 }
    expect(applySavedMetadata({ ...r, body: 'unsaved' }, r, next)).toMatchObject({ name: 'Renamed', collectionId: 'two', body: 'unsaved' })
    expect(applySavedMetadata({ ...r, name: 'Draft name', collectionId: undefined }, r, next)).toMatchObject({ name: 'Draft name', collectionId: undefined })
  })
  it('detaches deleted drafts with new IDs, keeps edits and removes missing collections', () => {
    const r = { ...newRequest(), name: 'Local edits', collectionId: 'missing', folderPath: ['folder'], url: 'https://test/edited' }
    const detached = detachDeletedRequest(r, [], 100)
    expect(detached.id).not.toBe(r.id)
    expect(detached).toMatchObject({ name: 'Local edits', url: r.url, collectionId: undefined, folderPath: [], updatedAt: 100 })
    expect(r.collectionId).toBe('missing')
  })
})

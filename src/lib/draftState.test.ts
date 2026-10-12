import { describe, expect, it } from 'vitest'
import { emptyPair, newRequest } from '../types'
import { isDraftDirty } from './draftState'

describe('draft change indicators', () => {
  it('ignores timestamps, row identities and empty placeholder rows', () => {
    const saved = newRequest()
    expect(isDraftDirty(saved)).toBe(false)
    expect(isDraftDirty({ ...saved, updatedAt: saved.updatedAt + 10, headers: [emptyPair(), emptyPair()] }, saved)).toBe(false)
  })
  it('recognizes all editable fields, including disabled rows and credentials', () => {
    const saved = newRequest()
    const changes = [
      { name: 'Edited' }, { method: 'POST' as const }, { url: 'https://example.com' },
      { headers: [{ ...emptyPair(), key: 'Accept', enabled: false }] },
      { params: [{ ...emptyPair(), value: 'retained' }] }, { body: '{}' },
      { bodyType: 'json' as const }, { bodyFields: [{ ...emptyPair(), key: 'file' }] },
      { auth: { type: 'bearer' as const, token: 'secret' } },
      { preRequestScript: 'variable x = 1' }, { postResponseScript: 'assert status == 200' },
      { collectionId: 'collection' }, { folderPath: ['folder'] }, { timeoutMs: 5000 }
    ]
    for (const patch of changes) expect(isDraftDirty({ ...saved, ...patch }, saved)).toBe(true)
  })
  it('does not mark hydrated legacy URL parameters as edits', () => {
    const saved = { ...newRequest(), url: 'https://example.com?x=1' }
    const edited = { ...saved, params: [{ ...emptyPair(), key: 'x', value: '1' }] }
    expect(isDraftDirty(edited, saved)).toBe(false)
    expect(isDraftDirty({ ...edited, url: '' }, saved)).toBe(true)
  })
  it('treats legacy requests as using the default timeout', () => {
    const saved = newRequest()
    expect(isDraftDirty({ ...saved, timeoutMs: 30000 }, saved)).toBe(false)
    expect(isDraftDirty({ ...saved, timeoutMs: 0 }, saved)).toBe(true)
  })
})

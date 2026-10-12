import { describe, expect, it } from 'vitest'
import { newRequest } from '../types'
import { MAX_IMPORT_BYTES, parseCollectionBackup, planCollectionImport, workspaceBackup } from './collectionImport'
import defaultCollection from '../data/default-collection.json'

const collection = { id: 'c', schemaVersion: 1 as const, name: 'Example', description: '', createdAt: 1 }
const request = { ...newRequest(), id: 'r', collectionId: 'c', url: 'https://example.com?x=1', timeoutMs: 5000, folderPath: ['group'] }
const file = () => workspaceBackup([collection], [request])
describe('OpenRequest backup validation and restoration', () => {
  it('round-trips collection and workspace exports including unfiled requests and disabled pairs', () => {
    const r = { ...request, params: [{ id: 'p', key: 'x', value: '1', enabled: false }], auth: { type: 'basic' as const, username: 'user', password: 'secret' }, preRequestScript: 'sleep 3000' }
    const parsed = parseCollectionBackup(JSON.stringify(workspaceBackup([collection], [r, { ...r, id: 'unfiled', collectionId: undefined }])))
    expect(parsed.requests[0]).toMatchObject(r)
    expect(parsed.requests[1].collectionId).toBeUndefined()
    expect(parseCollectionBackup(JSON.stringify({ format: 'openrequest.collection', version: 1, collection, requests: [r] })).requests[0]).toMatchObject(r)
    expect(parseCollectionBackup(JSON.stringify(defaultCollection)).requests).toHaveLength(12)
  })
  it('migrates omitted version-1 fields and hydrates URL params', () => {
    const legacy = { format: 'openrequest.collection', collection: { id: 'c', name: 'Old' }, requests: [{ id: 'r', name: 'Old request', method: 'GET', url: 'https://example.com?x=1' }] }
    const parsed = parseCollectionBackup('\uFEFF' + JSON.stringify(legacy))
    expect(parsed.requests[0]).toMatchObject({ schemaVersion: 1, timeoutMs: 30000, collectionId: 'c', preRequestScript: '', auth: { type: 'none' } })
    expect(parsed.requests[0].params[0]).toMatchObject({ key: 'x', value: '1' })
  })
  it.each([
    ['bad JSON', '{'], ['foreign format', JSON.stringify({ ...file(), format: 'postman' })],
    ['future file version', JSON.stringify({ ...file(), version: 2 })],
    ['future entity version', JSON.stringify({ ...file(), requests: [{ ...request, schemaVersion: 2 }] })],
    ['duplicate IDs', JSON.stringify({ ...file(), requests: [request, request] })],
    ['orphan collection', JSON.stringify({ ...file(), requests: [{ ...request, collectionId: 'missing' }] })],
    ['bad method', JSON.stringify({ ...file(), requests: [{ ...request, method: 'BREW' }] })],
    ['bad timeout', JSON.stringify({ ...file(), requests: [{ ...request, timeoutMs: -1 }] })],
    ['bad row type', JSON.stringify({ ...file(), requests: [{ ...request, headers: [{ key: 'x', value: 10 }] }] })],
    ['null row array', JSON.stringify({ ...file(), requests: [{ ...request, headers: null }] })],
    ['duplicate row IDs', JSON.stringify({ ...file(), requests: [{ ...request, headers: [{ id: 'h', key: 'x', value: '1' }, { id: 'h', key: 'y', value: '2' }] }] })],
    ['bad auth', JSON.stringify({ ...file(), requests: [{ ...request, auth: { type: 'digest' } }] })],
    ['oversize', ' '.repeat(MAX_IMPORT_BYTES + 1)],
  ])('rejects %s before creating an import plan', (_name, text) => expect(() => parseCollectionBackup(text)).toThrow())
  it('ignores unknown properties instead of persisting unchecked values', () => {
    const parsed = parseCollectionBackup(JSON.stringify({ ...file(), requests: [{ ...request, unexpected: { dangerous: true } }] }))
    expect(parsed.requests[0]).not.toHaveProperty('unexpected')
  })
  it('rejects excessive array sizes before processing their entities', () => {
    expect(() => parseCollectionBackup(JSON.stringify(workspaceBackup(Array(5001).fill(collection), [])))).toThrow('5000-item limit')
  })
  it('copies with new IDs and remaps references without changing source or existing data', () => {
    const backup = parseCollectionBackup(JSON.stringify(file()))
    const plan = planCollectionImport(backup, backup, 'copy')
    expect(plan.collections[0].id).not.toBe('c')
    expect(plan.collections[0].name).toBe('Example (imported)')
    expect(plan.requests[0].id).not.toBe('r')
    expect(plan.requests[0].collectionId).toBe(plan.collections[0].id)
    expect(backup.requests[0].id).toBe('r')
  })
  it('skips IDs but restores missing children into an existing collection without replacing metadata', () => {
    const backup = parseCollectionBackup(JSON.stringify(file()))
    expect(planCollectionImport(backup, backup, 'skip')).toEqual({ collections: [], requests: [], skipped: 2 })
    const plan = planCollectionImport(backup, { collections: [collection], requests: [] }, 'skip')
    expect(plan.requests[0]).toMatchObject({ id: 'r', collectionId: 'c' })
    expect(plan.collections).toEqual([])
    expect(planCollectionImport(backup, { collections: [], requests: [] }, 'skip').requests[0].id).toBe('r')
  })
})

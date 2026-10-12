import { describe, expect, it } from 'vitest'
import { newRequest } from '../types'
import { childFolderPath, collectionFolders, folderBackup, inFolder, sameFolder, validateFolderPath } from './folders'
import { parseCollectionBackup } from './collectionImport'

const collection = { id: 'c', schemaVersion: 1 as const, name: 'APIs', description: '', createdAt: 0, folders: [['Empty'], ['Auth', 'Tokens'], ['Auth', 'Other']] }
const request = (path: string[], id: string) => ({ ...newRequest(), id, collectionId: 'c', folderPath: path })
describe('folder hierarchy and portability', () => {
  it('materializes parents and legacy request paths, including empty folders', () => {
    const folders = collectionFolders(collection, [request(['Legacy', 'Deep'], 'legacy')])
    expect(folders).toContainEqual(['Auth'])
    expect(folders).toContainEqual(['Empty'])
    expect(folders).toContainEqual(['Legacy'])
    expect(folders).toContainEqual(['Legacy', 'Deep'])
    expect(new Set(folders.map((path) => JSON.stringify(path))).size).toBe(folders.length)
  })
  it('matches exact segments rather than string prefixes', () => {
    expect(inFolder(['Auth', 'Tokens', 'Refresh'], ['Auth', 'Tokens'])).toBe(true)
    expect(inFolder(['Auth', 'TokensOther'], ['Auth', 'Tokens'])).toBe(false)
    expect(sameFolder(undefined, [])).toBe(true)
    expect(sameFolder(['one'], ['One'])).toBe(false)
  })
  it('validates single names and depth boundaries', () => {
    expect(childFolderPath(['Auth'], ' Tokens ')).toEqual(['Auth', 'Tokens'])
    for (const name of ['', ' ', 'one/two', 'one\\two', 'a'.repeat(101)]) expect(() => childFolderPath([], name)).toThrow()
    expect(() => validateFolderPath(Array(13).fill('level'))).toThrow()
    expect(validateFolderPath(Array(12).fill('level'))).toHaveLength(12)
  })
  it('exports a subtree plus its ancestors, not siblings or root requests', () => {
    const requests = [request(['Auth', 'Tokens'], 'token'), request(['Auth', 'Tokens', 'Refresh'], 'refresh'), request(['Auth', 'Other'], 'other'), request([], 'root')]
    const exported = folderBackup(collection, requests, ['Auth', 'Tokens'])
    expect(exported.requests.map((r) => r.id)).toEqual(['token', 'refresh'])
    expect(exported.collection.folders).not.toContainEqual(['Auth', 'Other'])
    expect(exported.collection.folders).toContainEqual(['Auth'])
    const restored = parseCollectionBackup(JSON.stringify(exported))
    expect(restored.requests[0].folderPath).toEqual(['Auth', 'Tokens'])
    expect(restored.collections[0].folders).toContainEqual(['Auth', 'Tokens', 'Refresh'])
  })
  it('round-trips empty folder metadata and rejects malformed folder paths', () => {
    const exported = { format: 'openrequest.collection', version: 1, collection, requests: [] }
    expect(parseCollectionBackup(JSON.stringify(exported)).collections[0].folders).toContainEqual(['Empty'])
    for (const folders of [[[]], [['Auth'], ['Auth']], [['']], Array(1).fill(Array(13).fill('level'))]) {
      expect(() => parseCollectionBackup(JSON.stringify({ ...exported, collection: { ...collection, folders } }))).toThrow()
    }
  })
})

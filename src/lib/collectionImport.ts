import { uid, type Collection, type KeyValue, type RequestAuth, type RequestDraft } from '../types'
import { hydrateLegacyQueryParams } from './queryParams'
import { collectionFolders, folderKey, validateFolderPath } from './folders'

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024
export interface CollectionBackup { collections: Collection[]; requests: RequestDraft[] }
export type DuplicatePolicy = 'copy' | 'skip'
const object = (value: unknown, path: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object.`)
  return value as Record<string, unknown>
}
const str = (value: unknown, path: string, fallback?: string): string => {
  if (value === undefined && fallback !== undefined) return fallback
  if (typeof value !== 'string') throw new Error(`${path} must be text.`)
  return value
}
const id = (value: unknown, path: string) => {
  const result = str(value, path)
  if (!result.trim() || result.length > 200) throw new Error(`${path} must be a non-empty ID of at most 200 characters.`)
  return result
}
const number = (value: unknown, path: string, fallback: number) => {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error(`${path} must be a non-negative whole number.`)
  return value
}
const version = (value: unknown, path: string) => {
  if (value !== undefined && value !== 1) throw new Error(`${path}: unsupported version. This app supports version 1.`)
}
const array = (value: unknown, path: string): unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array.`)
  if (value.length > 5000) throw new Error(`${path} exceeds the 5000-item limit.`)
  return value
}
const pairs = (value: unknown, path: string): KeyValue[] => {
  const result = array(value === undefined ? [] : value, path).map((item, i) => {
    const row = object(item, `${path}[${i}]`)
    if (row.enabled !== undefined && typeof row.enabled !== 'boolean') throw new Error(`${path}[${i}].enabled must be boolean.`)
    return { id: row.id === undefined ? uid() : id(row.id, `${path}[${i}].id`), key: str(row.key, `${path}[${i}].key`), value: str(row.value, `${path}[${i}].value`), enabled: row.enabled !== false, ...(row.source === 'generated' ? { source: 'generated' as const } : {}) }
  })
  if (new Set(result.map((row) => row.id)).size !== result.length) throw new Error(`Duplicate row IDs inside ${path}.`)
  return result
}
const auth = (value: unknown): RequestAuth => {
  if (value === undefined) return { type: 'none' }
  const a = object(value, 'auth')
  if (a.type === 'none') return { type: 'none' }
  if (a.type === 'bearer') return { type: 'bearer', token: str(a.token, 'auth.token') }
  if (a.type === 'basic') return { type: 'basic', username: str(a.username, 'auth.username'), password: str(a.password, 'auth.password') }
  if (a.type === 'api-key' && (a.location === 'header' || a.location === 'query')) return { type: 'api-key', location: a.location, key: str(a.key, 'auth.key'), value: str(a.value, 'auth.value') }
  throw new Error('Unsupported authorization type or location.')
}

export function parseCollectionBackup(text: string): CollectionBackup {
  if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) throw new Error('Backup exceeds the 5 MiB limit.')
  let parsed: unknown
  try { parsed = JSON.parse(text.replace(/^\uFEFF/, '')) } catch { throw new Error('Invalid JSON. Choose an OpenRequest JSON export.') }
  const root = object(parsed, 'Backup')
  if (!['openrequest.collection', 'openrequest.workspace'].includes(String(root.format))) throw new Error('Unsupported format. Choose an OpenRequest collection or workspace backup.')
  version(root.version, 'Backup')
  const collections = (root.format === 'openrequest.collection' ? [root.collection] : array(root.collections, 'collections')).map((value, i): Collection => {
    const c = object(value, `collections[${i}]`); version(c.schemaVersion, 'Collection')
    const folders = c.folders === undefined ? [] : array(c.folders, 'collection.folders').map(validateFolderPath)
    if (folders.some((path) => !path.length) || new Set(folders.map(folderKey)).size !== folders.length) throw new Error('Collection folders contain an empty or duplicate path.')
    return { id: id(c.id, 'collection.id'), schemaVersion: 1, name: str(c.name, 'collection.name'), description: str(c.description, 'collection.description', ''), createdAt: number(c.createdAt, 'collection.createdAt', 0), folders }
  })
  const requests = array(root.requests, 'requests').map((value, i): RequestDraft => {
    const r = object(value, `requests[${i}]`); version(r.schemaVersion, 'Request')
    const method = str(r.method, 'request.method')
    const bodyType = str(r.bodyType, 'request.bodyType', 'none')
    if (!['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].includes(method)) throw new Error(`requests[${i}]: unsupported HTTP method.`)
    if (!['none','json','text','form','multipart'].includes(bodyType)) throw new Error(`requests[${i}]: unsupported body type.`)
    const timeoutMs = number(r.timeoutMs, 'request.timeoutMs', 30000)
    if (timeoutMs > 300000) throw new Error('request.timeoutMs must be at most 300000.')
    return hydrateLegacyQueryParams({
      id: id(r.id, 'request.id'), schemaVersion: 1, name: str(r.name, 'request.name'), method: method as RequestDraft['method'], url: str(r.url, 'request.url'),
      headers: pairs(r.headers, 'headers'), params: pairs(r.params, 'params'), body: str(r.body, 'request.body', ''), bodyType: bodyType as RequestDraft['bodyType'], bodyFields: pairs(r.bodyFields, 'bodyFields'), auth: auth(r.auth),
      preRequestScript: str(r.preRequestScript, 'preRequestScript', ''), postResponseScript: str(r.postResponseScript, 'postResponseScript', ''), updatedAt: number(r.updatedAt, 'updatedAt', 0), timeoutMs,
      ...(r.collectionId === undefined ? (root.format === 'openrequest.collection' ? { collectionId: collections[0].id } : {}) : { collectionId: id(r.collectionId, 'collectionId') }),
      folderPath: r.folderPath === undefined ? [] : validateFolderPath(r.folderPath),
    })
  })
  for (const [label, entities] of [['collections', collections], ['requests', requests]] as const) {
    if (new Set(entities.map((entity) => entity.id)).size !== entities.length) throw new Error(`Duplicate IDs inside ${label}; nothing imported.`)
  }
  const collectionIds = new Set(collections.map((c) => c.id))
  if (requests.some((r) => r.collectionId && !collectionIds.has(r.collectionId))) throw new Error('A request references a collection missing from this backup.')
  return { collections: collections.map((c) => ({ ...c, folders: collectionFolders(c, requests) })), requests }
}

export function planCollectionImport(backup: CollectionBackup, existing: CollectionBackup, policy: DuplicatePolicy) {
  const existingCollections = new Map(existing.collections.map((c) => [c.id, c]))
  const existingRequests = new Set(existing.requests.map((r) => r.id))
  const mapping = new Map<string, string>()
  let skipped = 0
  const collections = backup.collections.flatMap((c) => {
    if (policy === 'skip' && existingCollections.has(c.id)) { mapping.set(c.id, c.id); skipped++; return [] }
    const nextId = policy === 'copy' ? uid() : c.id
    mapping.set(c.id, nextId)
    return [{ ...c, id: nextId, name: policy === 'copy' && existingCollections.has(c.id) ? `${c.name} (imported)` : c.name }]
  })
  const requests = backup.requests.flatMap((r) => {
    if (policy === 'skip' && existingRequests.has(r.id)) { skipped++; return [] }
    return [{ ...r, id: policy === 'copy' ? uid() : r.id, collectionId: r.collectionId ? mapping.get(r.collectionId) : undefined }]
  })
  return { collections, requests, skipped }
}

export const workspaceBackup = (collections: Collection[], requests: RequestDraft[]) => ({ format: 'openrequest.workspace', version: 1, collections, requests })

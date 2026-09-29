import type { User } from '@supabase/supabase-js'
import { authClient } from './auth'
import { db } from '../db'
import type { Collection, Environment, RequestDraft } from '../types'
import { assertSyncWorkspaceOwner, createSyncWorkspaceBinding } from './syncBinding'
import { decryptSyncPayload, encryptSyncPayload, exportWorkspaceKey, fromBase64, generateWorkspaceKey, importWorkspaceKey, toBase64, type EncryptedSyncEnvelope, type SyncEncryptionContext } from './syncCrypto'
import { createSyncPayload } from './syncPayload'
import { unwrapWorkspaceKey, wrapWorkspaceKey, type WrappedWorkspaceKey } from './syncRecovery'
import { createSyncOutboxEntry, syncOutboxId, type SyncEntityType, type SyncOperation, type SyncOutboxEntry } from './syncOutbox'

interface RemoteWorkspace {
  id: string
  owner_id: string
  wrapped_key: string | null
  key_nonce: string | null
  key_salt: string | null
  key_iterations: number | null
}

interface RemoteRevision {
  id: string
  workspace_id: string
  object_type: SyncEntityType
  object_id: string
  operation: SyncOperation
  envelope_version: 1
  ciphertext: string
  nonce: string
  algorithm: 'AES-GCM-256-v1'
  created_at: string
  server_sequence: number
}

export type SyncRunResult = { pushed: number; pulled: number; pending: number }

const requireClient = () => {
  if (!authClient) throw new Error('Supabase is not configured for this build.')
  return authClient
}

const localWorkspaceId = () => {
  const existing = localStorage.getItem('openrequest-local-workspace-id')
  if (existing) return existing
  const created = crypto.randomUUID()
  localStorage.setItem('openrequest-local-workspace-id', created)
  return created
}

const bytesToPostgres = (encoded: string) => `\\x${Array.from(fromBase64(encoded), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
const postgresToBase64 = (value: string) => {
  const hex = value.startsWith('\\x') ? value.slice(2) : value
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2) throw new Error('The sync service returned invalid encrypted bytes.')
  return toBase64(Uint8Array.from(hex.match(/.{2}/g) ?? [], (pair) => Number.parseInt(pair, 16)))
}

const wrappedFromWorkspace = (workspace: RemoteWorkspace): WrappedWorkspaceKey => {
  if (!workspace.wrapped_key || !workspace.key_nonce || !workspace.key_salt || !workspace.key_iterations) {
    throw new Error('This remote workspace does not contain a recoverable encrypted key.')
  }
  return { wrappedKey: workspace.wrapped_key, keyNonce: workspace.key_nonce, keySalt: workspace.key_salt, keyIterations: workspace.key_iterations }
}

const queueBootstrap = async () => {
  const requests = await db.requests.toArray()
  const referencedCollections = new Set(requests.map((request) => request.collectionId).filter(Boolean) as string[])
  const now = Date.now()
  await db.transaction('rw', db.syncOutbox, async () => {
    for (const collectionId of referencedCollections) {
      await db.syncOutbox.put(createSyncOutboxEntry('collection', collectionId, 'upsert', now))
    }
    for (const request of requests) await db.syncOutbox.put(createSyncOutboxEntry('request', request.id, 'upsert', now))
  })
}

export async function getSyncStatus(ownerId?: string) {
  const binding = await db.syncBindings.get('primary')
  const secret = await db.syncSecrets.get('primary')
  return {
    enabled: Boolean(binding && secret && (!ownerId || binding.ownerId === ownerId)),
    boundToDifferentAccount: Boolean(binding && ownerId && binding.ownerId !== ownerId),
    pending: await db.syncOutbox.count(),
    remoteWorkspaceId: binding?.remoteWorkspaceId,
  }
}

export async function enableEncryptedSync(user: User, passphrase: string) {
  const client = requireClient()
  const currentBinding = await db.syncBindings.get('primary')
  if (currentBinding) assertSyncWorkspaceOwner(currentBinding, user.id)

  const { data: existing, error: readError } = await client.from('sync_workspaces')
    .select('id, owner_id, wrapped_key, key_nonce, key_salt, key_iterations')
    .eq('owner_id', user.id).maybeSingle()
  if (readError) throw readError

  let workspace = existing as RemoteWorkspace | null
  let key: CryptoKey
  let created = false
  if (workspace) {
    key = await unwrapWorkspaceKey(workspace.id, wrappedFromWorkspace(workspace), passphrase)
  } else {
    const id = crypto.randomUUID()
    key = await generateWorkspaceKey()
    const wrapped = await wrapWorkspaceKey(id, key, passphrase)
    const { data, error } = await client.from('sync_workspaces').insert({
      id, owner_id: user.id, wrapped_key: wrapped.wrappedKey, key_nonce: wrapped.keyNonce,
      key_salt: wrapped.keySalt, key_iterations: wrapped.keyIterations,
    }).select('id, owner_id, wrapped_key, key_nonce, key_salt, key_iterations').single()
    if (error) throw error
    workspace = data as RemoteWorkspace
    created = true
  }

  const now = Date.now()
  await db.transaction('rw', db.syncBindings, db.syncSecrets, async () => {
    await db.syncBindings.put(createSyncWorkspaceBinding(localWorkspaceId(), user.id, workspace!.id, now))
    await db.syncSecrets.put({ id: 'primary', encodedWorkspaceKey: await exportWorkspaceKey(key), updatedAt: now })
  })
  if (created) await queueBootstrap()
  return syncNow(user.id)
}

const readEntity = async (entry: SyncOutboxEntry): Promise<Collection | RequestDraft | Environment | { id: string }> => {
  if (entry.operation === 'delete') return { id: entry.entityId }
  const entity = entry.entityType === 'collection' ? await db.collections.get(entry.entityId)
    : entry.entityType === 'request' ? await db.requests.get(entry.entityId)
      : await db.environments.get(entry.entityId)
  if (!entity) return { id: entry.entityId }
  return createSyncPayload(entity)
}

async function pushPending(ownerId: string, workspaceId: string, key: CryptoKey) {
  const client = requireClient()
  const entries = (await db.syncOutbox.toArray()).sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id))
  let pushed = 0
  for (const entry of entries) {
    const current = await db.syncOutbox.get(entry.id)
    if (!current || current.updatedAt !== entry.updatedAt) continue
    const revisionId = entry.revisionId || crypto.randomUUID()
    const idempotencyKey = entry.idempotencyKey || crypto.randomUUID()
    if (!entry.revisionId || !entry.idempotencyKey) await db.syncOutbox.update(entry.id, { revisionId, idempotencyKey })
    const context: SyncEncryptionContext = {
      workspaceId, revisionId, objectType: entry.entityType, objectId: entry.entityId,
      operation: entry.operation, envelopeVersion: 1,
    }
    const envelope = await encryptSyncPayload(key, context, await readEntity(entry))
    const { error } = await client.from('sync_revisions').insert({
      id: revisionId, workspace_id: workspaceId, object_type: entry.entityType, object_id: entry.entityId,
      operation: entry.operation, client_sequence: entry.updatedAt, idempotency_key: idempotencyKey,
      envelope_version: envelope.envelopeVersion, ciphertext: bytesToPostgres(envelope.ciphertext),
      nonce: bytesToPostgres(envelope.nonce), algorithm: envelope.algorithm,
    })
    if (error && error.code !== '23505') throw error
    await db.transaction('rw', db.syncOutbox, async () => {
      const latest = await db.syncOutbox.get(entry.id)
      if (latest?.updatedAt === entry.updatedAt) await db.syncOutbox.delete(entry.id)
    })
    await db.syncedEntities.put({ id: entry.id, entityType: entry.entityType, entityId: entry.entityId, syncedAt: Date.now() })
    pushed += 1
  }
  assertSyncWorkspaceOwner(await db.syncBindings.get('primary'), ownerId)
  return pushed
}

async function pullLatest(workspaceId: string, key: CryptoKey) {
  const client = requireClient()
  const data: RemoteRevision[] = []
  const pageSize = 500
  for (let offset = 0; ; offset += pageSize) {
    const { data: page, error } = await client.from('sync_revisions')
      .select('id, workspace_id, object_type, object_id, operation, envelope_version, ciphertext, nonce, algorithm, created_at, server_sequence')
      .eq('workspace_id', workspaceId).order('server_sequence', { ascending: true }).range(offset, offset + pageSize - 1)
    if (error) throw error
    data.push(...page as RemoteRevision[])
    if ((page?.length ?? 0) < pageSize) break
  }
  const latest = new Map<string, RemoteRevision>()
  for (const row of data) latest.set(`${row.object_type}:${row.object_id}`, row)
  let pulled = 0
  for (const row of latest.values()) {
    if (await db.syncOutbox.get(syncOutboxId(row.object_type, row.object_id))) continue
    const context: SyncEncryptionContext = {
      workspaceId, revisionId: row.id, objectType: row.object_type, objectId: row.object_id,
      operation: row.operation, envelopeVersion: row.envelope_version,
    }
    const envelope: EncryptedSyncEnvelope = {
      envelopeVersion: row.envelope_version, algorithm: row.algorithm,
      ciphertext: postgresToBase64(row.ciphertext), nonce: postgresToBase64(row.nonce),
    }
    const payload = await decryptSyncPayload<Collection | RequestDraft | Environment | { id: string }>(key, context, envelope)
    if (row.object_type === 'collection') {
      if (row.operation === 'delete') await db.collections.delete(row.object_id)
      else await db.collections.put(payload as Collection)
    } else if (row.object_type === 'request') {
      if (row.operation === 'delete') await db.requests.delete(row.object_id)
      else await db.requests.put(payload as RequestDraft)
    } else {
      if (row.operation === 'delete') await db.environments.delete(row.object_id)
      else await db.environments.put(payload as Environment)
    }
    await db.syncedEntities.put({ id: syncOutboxId(row.object_type, row.object_id), entityType: row.object_type, entityId: row.object_id, syncedAt: Date.now() })
    pulled += 1
  }
  return pulled
}

let activeRun: Promise<SyncRunResult> | null = null
export function syncNow(ownerId: string): Promise<SyncRunResult> {
  if (activeRun) return activeRun
  const run = async () => {
    const binding = assertSyncWorkspaceOwner(await db.syncBindings.get('primary'), ownerId)
    const secret = await db.syncSecrets.get('primary')
    if (!secret) throw new Error('Unlock this synchronized workspace on this browser first.')
    const key = await importWorkspaceKey(secret.encodedWorkspaceKey)
    const pushed = await pushPending(ownerId, binding.remoteWorkspaceId, key)
    const pulled = await pullLatest(binding.remoteWorkspaceId, key)
    return { pushed, pulled, pending: await db.syncOutbox.count() }
  }
  const queued = (navigator.locks
    ? navigator.locks.request<SyncRunResult>('openrequest-encrypted-sync', { mode: 'exclusive' }, run as unknown as LockGrantedCallback<SyncRunResult>)
    : run()
  ) as Promise<SyncRunResult>
  const tracked = queued.finally(() => { activeRun = null })
  activeRun = tracked
  return tracked
}

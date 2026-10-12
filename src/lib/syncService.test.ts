import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { newRequest } from '../types'
import { encryptSyncPayload, exportWorkspaceKey, generateWorkspaceKey, fromBase64 } from './syncCrypto'
import { createSyncOutboxEntry } from './syncOutbox'
import { syncNow } from './syncService'

// Mock transport/storage only; encryption and the production push/pull processor run.
const fixture = vi.hoisted(() => {
  const table = () => {
    const rows = new Map<string, any>()
    return { rows, get: async (id: string) => rows.get(id), put: async (row: any) => { rows.set(row.id, structuredClone(row)) },
      toArray: async () => [...rows.values()].map((r) => structuredClone(r)), delete: async (id: string) => { rows.delete(id) },
      update: async (id: string, patch: any) => { rows.set(id, { ...rows.get(id), ...patch }) }, count: async () => rows.size }
  }
  const db = { collections: table(), requests: table(), environments: table(), syncOutbox: table(), syncedEntities: table(), syncBindings: table(), syncSecrets: table(),
    transaction: async (...args: any[]) => args.at(-1)() }
  const state = { db, remote: [] as any[], hook: undefined as (() => Promise<void>) | undefined, failOnce: false, protocol: 2 }
  const client = { rpc: async () => ({ data: state.protocol, error: null }), from: () => ({
    insert: async (row: any) => {
      if (state.hook) { const hook = state.hook; state.hook = undefined; await hook() }
      if (state.failOnce) { state.failOnce = false; return { error: { code: 'network', message: 'Simulated transport failure' } } }
      if (state.remote.some((r) => r.id === row.id || r.idempotency_key === row.idempotency_key)) return { error: { code: '23505' } }
      state.remote.push({ ...structuredClone(row), server_sequence: state.remote.length + 1 })
      return { error: null }
    },
    select: () => {
      let cursor = 0
      const query = { eq: () => query, gt: (_field: string, value: number) => { cursor = value; return query }, order: () => query, range: async (start: number, end: number) => ({ data: state.remote.filter((r) => r.server_sequence > cursor).slice(start, end + 1), error: null }) }
      return query
    },
  }) }
  return { ...state, client, state }
})
vi.mock('../db', () => ({ db: fixture.db }))
vi.mock('./auth', () => ({ authClient: fixture.client }))

let key: CryptoKey
beforeEach(async () => {
  for (const table of Object.values(fixture.db)) if (typeof table === 'object') table.rows.clear()
  fixture.state.remote = []; fixture.state.hook = undefined; fixture.state.failOnce = false; fixture.state.protocol = 2
  vi.stubGlobal('navigator', {})
  key = await generateWorkspaceKey()
  await fixture.db.syncBindings.put({ id: 'primary', ownerId: 'owner', remoteWorkspaceId: 'workspace' })
  await fixture.db.syncSecrets.put({ id: 'primary', encodedWorkspaceKey: await exportWorkspaceKey(key) })
})
afterEach(() => vi.unstubAllGlobals())
const seed = async () => {
  const request = { ...newRequest(), id: 'r', url: 'https://example.test/old', auth: { type: 'bearer' as const, token: 'private-token' } }
  await fixture.db.requests.put(request)
  const entry = createSyncOutboxEntry('request', 'r', 'upsert', 100)
  await fixture.db.syncOutbox.put(entry)
  return entry
}
const bytea = (value: string) => '\\x' + [...fromBase64(value)].map((b) => b.toString(16).padStart(2, '0')).join('')

describe('encrypted request deletion and upload race guardrails', () => {
  it('refuses unsafe cursor transport before the required migration', async () => {
    await seed(); fixture.state.protocol = 1
    await expect(syncNow('owner')).rejects.toThrow('20261012000100')
    expect(fixture.state.remote).toEqual([])
    expect(await fixture.db.syncOutbox.count()).toBe(1)
  })
  it('does not share an in-flight synchronization across different accounts', async () => {
    await seed()
    let release!: () => void, started!: () => void
    const entered = new Promise<void>((resolve) => { started = resolve })
    const waiting = new Promise<void>((resolve) => { release = resolve })
    fixture.state.hook = async () => { started(); await waiting }
    const run = syncNow('owner')
    await entered
    expect(syncNow('owner')).toBe(run)
    await expect(syncNow('other-owner')).rejects.toThrow('different account')
    release(); await run
  })
  it('retains local secrets after pushing and pulling its own sanitized revision', async () => {
    await seed()
    await syncNow('owner')
    expect((await fixture.db.requests.get('r')).auth.token).toBe('private-token')
    expect((await fixture.db.syncSecrets.get('primary')).lastServerSequence).toBe(1)
    expect((await syncNow('owner')).pulled).toBe(0)
  })
  it('does not acknowledge away a same-millisecond deletion during an in-flight upsert', async () => {
    const entry = await seed()
    fixture.state.hook = async () => {
      await fixture.db.requests.delete('r')
      await fixture.db.syncOutbox.put(createSyncOutboxEntry('request', 'r', 'delete', 100, entry))
    }
    expect((await syncNow('owner')).pending).toBe(1)
    expect((await fixture.db.syncSecrets.get('primary')).lastServerSequence).toBeUndefined()
    expect((await fixture.db.syncOutbox.get('request:r')).operation).toBe('delete')
    expect((await syncNow('owner')).pending).toBe(0)
    expect(fixture.state.remote.map((r) => r.operation)).toEqual(['upsert', 'delete'])
    expect(fixture.state.remote[0].idempotency_key).not.toBe(fixture.state.remote[1].idempotency_key)
    expect(await fixture.db.requests.get('r')).toBeUndefined()
    expect((await fixture.db.syncedEntities.get('request:r')).deleted).toBe(true)
    expect(JSON.stringify(fixture.state.remote)).not.toContain('private-token')
    expect(JSON.stringify(fixture.state.remote)).not.toContain('https://example.test/old')
  })
  it('keeps a newer save pending when the previous upload finishes', async () => {
    const entry = await seed()
    fixture.state.hook = async () => {
      await fixture.db.requests.put({ ...await fixture.db.requests.get('r'), url: 'https://example.test/new' })
      await fixture.db.syncOutbox.put(createSyncOutboxEntry('request', 'r', 'upsert', 100, entry))
    }
    expect((await syncNow('owner')).pending).toBe(1)
    await syncNow('owner')
    expect(fixture.state.remote).toHaveLength(2)
    expect((await fixture.db.requests.get('r')).url).toBe('https://example.test/new')
  })
  it('retains the same identity for retries of an unchanged failed upload', async () => {
    const entry = await seed()
    fixture.state.failOnce = true
    await expect(syncNow('owner')).rejects.toMatchObject({ code: 'network' })
    expect((await fixture.db.syncOutbox.get(entry.id)).revisionId).toBe(entry.revisionId)
    await syncNow('owner')
    expect(fixture.state.remote[0].id).toBe(entry.revisionId)
    expect(fixture.state.remote[0].idempotency_key).toBe(entry.idempotencyKey)
  })
  it('applies an authenticated encrypted remote tombstone and retains its deletion marker', async () => {
    await fixture.db.requests.put({ ...newRequest(), id: 'r' })
    const context = { workspaceId: 'workspace', revisionId: 'delete-revision', objectType: 'request' as const, objectId: 'r', operation: 'delete' as const, envelopeVersion: 1 as const }
    const encrypted = await encryptSyncPayload(key, context, { id: 'r' })
    fixture.state.remote.push({ id: context.revisionId, workspace_id: 'workspace', object_type: 'request', object_id: 'r', operation: 'delete', envelope_version: 1,
      algorithm: encrypted.algorithm, ciphertext: bytea(encrypted.ciphertext), nonce: bytea(encrypted.nonce), server_sequence: 1 })
    await syncNow('owner')
    expect(await fixture.db.requests.get('r')).toBeUndefined()
    expect((await fixture.db.syncedEntities.get('request:r')).deleted).toBe(true)
    await syncNow('owner')
    expect(await fixture.db.requests.get('r')).toBeUndefined()
  })
  it('does not upload a malformed upsert when its saved entity disappeared', async () => {
    await seed(); await fixture.db.requests.delete('r')
    expect((await syncNow('owner')).pending).toBe(1)
    expect(fixture.state.remote).toEqual([])
  })
})

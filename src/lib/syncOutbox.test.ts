import { describe, expect, it } from 'vitest'
import { createSyncOutboxEntry, syncOutboxId } from './syncOutbox'

describe('sync outbox', () => {
  it('uses a stable key so repeated changes coalesce per object', () => {
    expect(syncOutboxId('request', 'request-1')).toBe('request:request-1')
    const first = createSyncOutboxEntry('request', 'request-1', 'upsert', 100)
    const second = createSyncOutboxEntry('request', 'request-1', 'upsert', 200, first)
    expect(second).toMatchObject({ id: first.id, createdAt: 100, updatedAt: 200, attempts: 0 })
    expect(second.revisionId).toBe(first.revisionId)
    expect(second.idempotencyKey).toBe(first.idempotencyKey)
  })

  it('replaces a pending edit with a deletion tombstone', () => {
    const edit = createSyncOutboxEntry('collection', 'collection-1', 'upsert', 100)
    const deletion = createSyncOutboxEntry('collection', 'collection-1', 'delete', 300, edit)
    expect(deletion).toMatchObject({ operation: 'delete', createdAt: 100, updatedAt: 300, schemaVersion: 1 })
    expect(deletion).not.toHaveProperty('payload')
  })
})
